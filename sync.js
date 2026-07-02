// sync.js — Radar de Parcerias Paraéllo
// Cloud sync: last-write-wins, no password, poll every 6s, in-place DOM update

(function () {
  const API = '/api/state';
  const STATE_KEY = 'radar-parcerias-paraello-v2';
  const POLL_MS = 6000;
  const DEBOUNCE_MS = 1000;
  let lastKnown = null;
  let saveTimer = null;
  let latestPayload = null;

  // ── helpers ──────────────────────────────────────────────────────────────
  function serialize() {
    try {
      if (latestPayload && latestPayload !== '{}') return latestPayload;
      const raw = _getItem.call(localStorage, STATE_KEY);
      if (raw && raw !== 'null' && raw !== '{}') return raw;
      // Last resort: serialize window.S
      const s = JSON.stringify(window.S || {});
      return s === '{}' ? null : s;
    } catch { return null; }
  }

  function applyState(newS) {
    try {
      const newStr = typeof newS === 'string' ? newS : JSON.stringify(newS);
      const current = _getItem.call(localStorage, STATE_KEY);
      if (current === newStr) return;
      _setItem.call(localStorage, STATE_KEY, newStr);
      if (window.S && typeof newS === 'object') Object.assign(window.S, newS);
      if (typeof window.renderAll === 'function') window.renderAll();
      else {
        if (typeof window.fillSelects    === 'function') window.fillSelects();
        if (typeof window.fillFacFilter  === 'function') window.fillFacFilter();
        if (typeof window.renderPainel   === 'function') window.renderPainel();
        if (typeof window.renderTabela   === 'function') window.renderTabela();
        if (typeof window.renderEventos  === 'function') window.renderEventos();
        if (typeof window.renderCalendario==='function') window.renderCalendario();
      }
    } catch (e) { console.warn('[sync] applyState error', e); }
  }

  // ── save (debounced) ──────────────────────────────────────────────────────
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const payload = serialize();
      if (!payload) return;
      lastKnown = payload;
      try {
        await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
      } catch (e) { console.warn('[sync] save error', e); }
    }, DEBOUNCE_MS);
  }

  // ── intercept localStorage writes ────────────────────────────────────────
  const _setItem = localStorage.setItem.bind(localStorage);
  const _getItem = localStorage.getItem.bind(localStorage);
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
      const { value } = await r.json();
      if (!value) return;
      const payload = typeof value === 'string' ? value : JSON.stringify(value);
      if (payload === lastKnown) return;
      lastKnown = payload;
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      applyState(parsed);
    } catch (e) { console.warn('[sync] poll error', e); }
  }

  // ── hydrate then boot ─────────────────────────────────────────────────────
  window.__cloudHydrate = async function (bootFn) {
    try {
      const r = await fetch(API + '?t=' + Date.now());
      const { value } = await r.json();
      if (value) {
        const payload = typeof value === 'string' ? value : JSON.stringify(value);
        lastKnown = payload;
        _setItem.call(localStorage, STATE_KEY, payload);
      }
    } catch (e) { console.warn('[sync] hydrate error', e); }
    
    // Boot the app
    bootFn();
    
    // After boot: if cloud was empty, seed it from the app's state
    // The app's save() function writes to localStorage, triggering our interceptor
    if (!lastKnown) {
      setTimeout(() => {
        // Try calling the app's built-in save function
        if (typeof window.save === 'function') {
          window.save();
        } else {
          // Fallback: manually serialize and save
          scheduleSave();
        }
      }, 500);
    }
    
    setInterval(poll, POLL_MS);
  };
})();