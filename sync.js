// sync.js — Radar de Parcerias Paraéllo
// Cloud sync: last-write-wins, no password, poll every 6s, in-place DOM update

(function () {
  const API = '/api/state';
  const POLL_MS = 6000;
  const DEBOUNCE_MS = 1000;
  let lastKnown = null;
  let saveTimer = null;
  let hydrated = false;

  // ── helpers ──────────────────────────────────────────────────────────────
  function serialize() {
    try { return JSON.stringify(window.S || {}); } catch { return null; }
  }

  function applyState(newS) {
    try {
      if (JSON.stringify(window.S) === JSON.stringify(newS)) return; // no change
      Object.assign(window.S, newS);
      if (typeof window.renderAll === 'function') window.renderAll();
      else {
        if (typeof window.fillFacFilter === 'function') window.fillFacFilter();
        if (typeof window.renderPainel  === 'function') window.renderPainel();
        if (typeof window.renderTabela  === 'function') window.renderTabela();
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
  localStorage.setItem = function (k, v) {
    _setItem(k, v);
    scheduleSave();
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
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        Object.assign(window.S, parsed);
        lastKnown = typeof value === 'string' ? value : JSON.stringify(value);
      } else {
        // cloud empty — seed from current S (already in localStorage)
        scheduleSave();
      }
    } catch (e) { console.warn('[sync] hydrate error', e); }
    hydrated = true;
    bootFn();
    setInterval(poll, POLL_MS);
  };
})();