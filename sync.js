// sync.js — Radar de Parcerias Paraéllo — v2 (sync robusto, in-place)
// MODELO "última gravação vence": toda alteração de qualquer usuário é salva
// automaticamente na nuvem (Upstash), sem senha, sem botão e sem F5.
// - Hidrata da nuvem ANTES de renderizar (a nuvem é a fonte da verdade).
// - Intercepta gravações no localStorage e envia (debounce ~1s).
// - Poll a cada 6s: se outra pessoa salvou, aplica IN-PLACE (recarrega o estado
//   e re-renderiza) SEM recarregar a página. Se o usuário estiver editando
//   (modal aberto / campo de texto focado), mostra aviso em vez de sobrescrever.
// - FLUSH ao trocar de aba / fechar: envia na hora o que estiver pendente,
//   pra nunca perder a última edição.
// API: GET -> {v,data}   POST {corpo do estado} -> {ok,v}
(function () {
  const API = '/api/state';
  const STATE_KEY = 'radar-parcerias-paraello-v2';
  const POLL_MS = 6000;
  const DEBOUNCE_MS = 1000;

  let _ver = 0;               // última versão conhecida da nuvem
  let ready = false;          // só envia depois de hidratar
  let pushTimer = null, pushing = false, pendingPush = false;
  let checking = false, applying = false;

  const _set = localStorage.setItem.bind(localStorage);
  const _get = localStorage.getItem.bind(localStorage);

  function cloudData(j) {
    if (j && j.data !== undefined) return j.data;
    if (j && j.value !== undefined) return j.value;
    return null;
  }
  const asStr = d => (typeof d === 'string' ? d : JSON.stringify(d));
  function hasData(d) {
    if (!d) return false;
    if (typeof d === 'string') return d.length > 2 && d !== 'null' && d !== '{}';
    return typeof d === 'object' && Object.keys(d).length > 0;
  }

  // Recarrega o estado do app a partir do localStorage e re-renderiza.
  // O gancho window.__radarReload é definido dentro do index.html (mesmo escopo
  // do `let S`), então consegue reatribuir o S — que o sync, de fora, não pode.
  function applyToApp() {
    try { if (typeof window.__radarReload === 'function') window.__radarReload(); }
    catch (e) { console.warn('[sync] reload', e); }
  }

  // ── não sobrescrever quem está editando ────────────────────────────────────
  function isEditing() {
    try {
      const ae = document.activeElement;
      if (ae) {
        if (ae.tagName === 'TEXTAREA' || ae.isContentEditable) return true;
        if (ae.tagName === 'INPUT') {
          const t = (ae.getAttribute('type') || 'text').toLowerCase();
          if (t !== 'checkbox' && t !== 'radio' && t !== 'button' && t !== 'submit' && t !== 'reset') return true;
        }
      }
      if (document.querySelector('.modal-bg.open')) return true;
    } catch (e) {}
    return false;
  }

  // ── salvar (debounce) ───────────────────────────────────────────────────────
  function doPush() {
    if (!ready) return;
    if (pushing) { pendingPush = true; return; }
    const payload = _get.call(localStorage, STATE_KEY);
    if (!payload || payload === '{}' || payload === 'null') return;
    pushing = true;
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j && typeof j.v === 'number') _ver = j.v; })
      .catch(() => { /* offline: tenta no próximo save */ })
      .finally(() => { pushing = false; if (pendingPush) { pendingPush = false; schedulePush(); } });
  }
  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = null; doPush(); }, DEBOUNCE_MS);
  }
  function hasPending() { return ready && (!!pushTimer || pushing || pendingPush); }
  function flushNow() { if (!ready) return; if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; } doPush(); }

  // ── intercepta gravações do app ─────────────────────────────────────────────
  localStorage.setItem = function (k, v) {
    _set(k, v);
    if (ready && k === STATE_KEY && v && v !== '{}' && v !== 'null') schedulePush();
  };

  // ── aplicar mudança remota IN-PLACE (sem reload) ────────────────────────────
  function applyRemote() {
    if (applying) return;
    applying = true;
    fetch(API + '?t=' + Date.now())
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const d = j ? cloudData(j) : null;
        if (!hasData(d)) return;
        if (j && typeof j.v === 'number') _ver = j.v;
        _set.call(localStorage, STATE_KEY, asStr(d));
        applyToApp();
        const b = document.getElementById('__cloudUpdate'); if (b) b.remove();
      })
      .catch(() => {})
      .finally(() => { applying = false; });
  }

  // Aviso não-bloqueante quando há versão nova mas o usuário está editando
  function showUpdateBanner() {
    if (document.getElementById('__cloudUpdate')) return;
    const d = document.createElement('div');
    d.id = '__cloudUpdate';
    d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;' +
      'background:#c9622a;color:#fff;padding:13px 18px;border-radius:10px;font-family:sans-serif;font-size:14px;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.45);max-width:92vw;line-height:1.4';
    d.innerHTML = '🔄 Outra pessoa salvou alterações. Termine sua edição e ' +
      '<button id="__cloudUpdateBtn" style="margin-left:6px;background:#fff;color:#c9622a;border:0;' +
      'border-radius:6px;padding:7px 14px;font-weight:700;cursor:pointer">Atualizar</button>';
    (document.body || document.documentElement).appendChild(d);
    const btn = document.getElementById('__cloudUpdateBtn');
    if (btn) btn.onclick = applyRemote;
  }

  // ── poll: detecta mudanças de outros usuários ───────────────────────────────
  function checkRemote() {
    if (!ready || checking) return;
    if (hasPending() || pushing) return; // há envio local em andamento: espera
    checking = true;
    fetch(API + '?t=' + Date.now())
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const v = (j && typeof j.v === 'number') ? j.v : 0;
        if (v <= _ver) return; // sem novidade
        if (isEditing()) { _ver = v; showUpdateBanner(); }
        else applyRemote();
      })
      .catch(() => {})
      .finally(() => { checking = false; });
  }

  // ── hidratar e então bootar ─────────────────────────────────────────────────
  window.__cloudHydrate = function (bootFn) {
    let empty = true;
    fetch(API + '?t=' + Date.now())
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const d = j ? cloudData(j) : null;
        if (hasData(d)) {
          empty = false;
          if (j && typeof j.v === 'number') _ver = j.v;
          _set.call(localStorage, STATE_KEY, asStr(d));
        }
      })
      .catch(() => { /* offline: usa o que houver localmente */ })
      .finally(() => {
        ready = true;
        if (!empty) {
          // a nuvem tinha dados: recarrega o S do localStorage recém-hidratado
          applyToApp();
          if (typeof bootFn === 'function') { try { bootFn(); } catch (e) { console.error(e); } }
        } else {
          // nuvem vazia (primeiro uso): renderiza o seed local e sobe pra nuvem
          if (typeof bootFn === 'function') { try { bootFn(); } catch (e) { console.error(e); } }
          schedulePush();
        }
        setInterval(checkRemote, POLL_MS);
      });
  };

  // ── flush ao sair/minimizar: nunca perde a última edição ───────────────────
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushNow();
    else checkRemote();
  });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', function (e) {
    if (hasPending()) { flushNow(); e.preventDefault(); e.returnValue = ''; }
  });
})();
