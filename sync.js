// sync.js — Radar de Parcerias Paraéllo
// Cloud sync: last-write-wins, no password, poll every 6s, in-place DOM update

(function () {
  const API = '/api/state';
  const STATE_KEY = 'radar-parcerias-paraello-v2';
  const POLL_MS = 6000;
  const DEBOUNCE_MS = 1000;
  let lastKnown = null;
  let saveTimer = null;
  let latestPayload = null; // captures value from last localStorage.setItem

  // ── helpers ──────────────────────────────────────────────────────────────
  function serialize() {
    try {
      // Prefer the value captured from the app's last localStorage.setItem
      if (latestPayload) return latestPayload;
      // Fallback: read directly from storage using original getItem
      const raw = _getItem.call(localStorage, STATE_KEY);
      if (raw && raw !== 'null') return raw;
      return JSON.stringify(window.S || {});
    } catch { return null; }
  }

  function applyState(newS) {
    try {
      const current = _getItem.call(localStorage, STATE_KEY);
      const newStr = typeof newS === 'string' ? newS : JSON.stringify(newS);
      if (current === newStr) return; // no change
      // Update localStorage without triggering our interceptor
      _setItem.call(localStorage, STATE_KEY, newStr);
      // Update window.S if it exists
      if (window.S && typeof newS === 'object') {
        Object.assign(window.S, newS);
      }
      // Re-render
      if (typeof window.renderAll === 'function') window.renderAll();
      else {
        if (typeof window.fillFacFilter  === 'function') window.fillFacFilter();
        if (typeof window.renderPainel   === 'function') window.renderPainel();
        if (typeof window.renderTabela   === 'function') window.renderTabela();
        if (typeof window.renderEventos  === 'function') window.renderEventos();
        if (typeof window.renderCalendario==='function') window.renderCalendario();
        if (typeof window.fillSelects    === 'function') window.fillSelects();
      }
    } catch (e) { console.warn('[sync] applyState error', e); }
  }

  // ── save (debounced) ──────────────────────────────────────────────────────
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const payload = serialize();
      if (!payload || payload === '{}') return;
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
    if (k === STATE_KEY) {
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
      if (payload === lastKnown) return; // no change
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
        // Pre-seed localStorage so the app boots with cloud data
        _setItem.call(localStorage, STATE_KEY, payload);
      } else {
        // Cloud empty — seed from current localStorage value
        const localVal = _getItem.call(localStorage, STATE_KEY);
        if (localVal && localVal !== 'null') {
          latestPayload = localVal;
          scheduleSave();
        }
      }
    } catch (e) { console.warn('[sync] hydrate error', e); }
    bootFn();
    setInterval(poll, POLL_MS);
  };
})();