// sync.js — Radar de Parcerias Paraéllo
// Cloud sync: last-write-wins, no password, poll every 6s, in-place DOM update
// API format: GET -> {v,data}  POST {body} -> {ok,v}

(function () {
  const API = '/api/state';
  const STATE_KEY = 'radar-parcerias-paraello-v2';
  const POLL_MS = 6000;
  const DEBOUNCE_MS = 1000;
  let lastV = 0;       // track Upstash version
  let saveTimer = null;
  let latestPayload = null;

  // ── helpers ──────────────────────────────────────────────────────────────
  const _setItem = localStorage.setItem.bind(localStorage);
  const _getItem = localStorage.getItem.bind(localStorage);

  function getCloudData(response) {
    // Handle {v, data} format or legacy {value} format
    if (response && response.data !== undefined) return response.data;
    if (response && response.value !== undefined) return response.value;
    return null;
  }

  function applyState(cloudData) {
    try {
      if (!cloudData) return;
      const newStr = typeof cloudData === 'string' ? cloudData : JSON.stringify(cloudData);
      const current = _getItem.call(localStorage, STATE_KEY);
      if (current === newStr) return;
      _setItem.call(localStorage, STATE_KEY, newStr);
      if (window.S && typeof cloudData === 'object') Object.assign(window.S, cloudData);
      // Re-render
      if (typeof window.renderAll === 'function') window.renderAll();
      else {
        if (typeof window.fillSelects      === 'function') window.fillSelects();
        if (typeof window.fillFacFilter    === 'function') window.fillFacFilter();
        if (typeof window.renderPainel     === 'function') window.renderPainel();
        if (typeof window.renderTabela     === 'function') window.renderTabela();
        if (typeof window.renderEventos    === 'function') window.renderEventos();
        if (typeof window.renderCalendario === 'function') window.renderCalendario();
      }
    } catch (e) { console.warn('[sync] applyState error', e); }
  }

  // ── save (debounced) ──────────────────────────────────────────────────────
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      // Prefer intercepted value, fallback to localStorage
      const payload = latestPayload || _getItem.call(localStorage, STATE_KEY);
      if (!payload || payload === '{}' || payload === 'null') return;
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
        const d = await res.json();
        if (d.v) lastV = d.v;
        latestPayload = null; // consumed
      } catch (e) { console.warn('[sync] save error', e); }
    }, DEBOUNCE_MS);
  }

  // ── intercept localStorage writes ────────────────────────────────────────
  localStorage.setItem = function (k, v) {
    _setItem(k, v);
    if (k === STATE_KEY && v && v !== '{}' && v !== 'null') {
      latestPayload = v;
      scheduleSave();
    }
  };

  // ── poll ──────────────────────────────────────────────────────────────────
  async function poll() {
    try {
      const r = await fetch(API + '?t=' + Date.now());
      const response = await r.json();
      const v = response.v || 0;
      if (v === lastV) return; // no change
      lastV = v;
      const cloudData = getCloudData(response);
      if (cloudData) applyState(cloudData);
    } catch (e) { console.warn('[sync] poll error', e); }
  }

  // ── hydrate then boot ─────────────────────────────────────────────────────
  window.__cloudHydrate = async function (bootFn) {
    let cloudIsEmpty = true;
    try {
      const r = await fetch(API + '?t=' + Date.now());
      const response = await r.json();
      const v = response.v || 0;
      const cloudData = getCloudData(response);
      if (cloudData && Object.keys(cloudData).length > 0) {
        cloudIsEmpty = false;
        lastV = v;
        const payload = typeof cloudData === 'string' ? cloudData : JSON.stringify(cloudData);
        _setItem.call(localStorage, STATE_KEY, payload);
      }
    } catch (e) { console.warn('[sync] hydrate error', e); }
    
    // Boot the app
    bootFn();
    
    // If cloud was empty, seed from app's current state
    if (cloudIsEmpty) {
      setTimeout(() => {
        if (typeof window.save === 'function') {
          window.save(); // app's own save writes to localStorage, triggering our interceptor
        } else {
          scheduleSave();
        }
      }, 500);
    }
    
    setInterval(poll, POLL_MS);
  };
})();