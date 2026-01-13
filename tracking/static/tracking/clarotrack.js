console.log('🚀 [ClaroTrack] Script cargado');

(function () {
  console.log('✅ [ClaroTrack] IIFE iniciando...');

  const hasGTM =
    window.google_tag_manager ||
    document.querySelector('script[src*="googletagmanager.com/gtm.js"]');

  console.log('🔍 [ClaroTrack] hasGTM =', hasGTM);

  if (hasGTM) {
    console.warn('[ClaroTrack] GTM detectado → tracking deshabilitado');
    return;
  }

  console.log('[ClaroTrack] GTM no detectado → tracking activo');

  const API = 'https://claro-tracker.onrender.com/api/collect/';

  // =========================
  // ID anónimo del visitante
  // =========================
  function getAid() {
    let aid = localStorage.getItem('ct_aid');
    if (!aid) {
      aid = crypto.randomUUID();
      localStorage.setItem('ct_aid', aid);
    }
    return aid;
  }

  // =========================
  // Enviar evento al backend
  // =========================
  function send(eventName, payload = {}) {
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aid: getAid(),
        event: eventName,
        path: window.location.pathname,
        dataLayer: payload
      })
    }).catch(err => console.warn('[ClaroTrack] error enviando evento', err));
  }

  // =========================
  // Asegurar dataLayer
  // =========================
  window.dataLayer = window.dataLayer || [];

  // =========================
  // Interceptor para enviar cualquier push automáticamente
  // =========================
  const originalPush = window.dataLayer.push;
  window.dataLayer.push = function () {
    const item = arguments[0];

    if (item && item.event) {
      send(item.event, item);
      applyRules(item.event, item);
    }

    return originalPush.apply(this, arguments);
  };

  // =========================
  // Función para push automático
  // =========================
  function pushEvent(eventName, params = {}) {
    window.dataLayer.push({ event: eventName, ...params });
  }

  // =========================
  // 0️⃣ Traer reglas dinámicas del backend
  // =========================
  let dynamicRules = [];
  async function loadRules() {
    try {
      const res = await fetch('https://claro-tracker.onrender.com/api/tracking_rules/');
      dynamicRules = await res.json();
    } catch (e) {
      console.error('[ClaroTrack] Error cargando reglas', e);
    }
  }

  // =========================
  // 1️⃣ Función para aplicar reglas dinámicas
  // =========================
  function applyRules(eventName, eventData) {
    dynamicRules.forEach(rule => {
      if (rule.listen_event !== eventName) return;
      if (rule.url_contains && !location.pathname.includes(rule.url_contains)) return;

      if (rule.selector) {
        const el = document.querySelector(rule.selector);
        if (!el) return;
        if (
          (rule.match_id && el.id !== eventData.id) ||
          (rule.match_text && !el.innerText.includes(eventData.text))
        ) return;
      }

      const params = {};
      if (rule.params_map) {
        for (const key in rule.params_map) {
          const prop = rule.params_map[key];
          params[key] = eventData[prop] || null;
        }
      }

      window.dataLayer.push({
        event: rule.fire_event,
        ...params
      });

      if (rule.custom_js) {
        try {
          new Function(rule.custom_js)();
        } catch (e) {
          console.error('[ClaroTrack] Error ejecutando custom_js', e);
        }
      }
    });
  }

  // =========================
  // 3️⃣ Page events
  // =========================
  window.addEventListener('load', () => pushEvent('page_view'));
  window.addEventListener('beforeunload', () => pushEvent('page_unload'));
  document.addEventListener('visibilitychange', () =>
    pushEvent('visibility_change', { state: document.visibilityState })
  );
  window.addEventListener('hashchange', () => pushEvent('hash_change', { hash: location.hash }));
  window.addEventListener('popstate', () => pushEvent('popstate', { path: location.pathname }));

  // =========================
  // 4️⃣ Click & Interaction
  // =========================
  ['click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup'].forEach(ev =>
    document.addEventListener(ev, e => {
      const el = e.target;
      pushEvent(ev, {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: el.className || null,
        text: el.innerText?.trim().slice(0, 50) || null,
      });
    })
  );

  ['input', 'change', 'submit', 'focus', 'blur'].forEach(ev =>
    document.addEventListener(ev, e => {
      const el = e.target;
      pushEvent(ev, {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        name: el.name || null,
        value: el.value || null,
      });
    })
  );

  // =========================
  // 5️⃣ Scroll
  // =========================
  let firedScroll = {};
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const percent = Math.round((scrollTop / docHeight) * 100);

    pushEvent('scroll', { scroll_percent: percent });

    [25, 50, 75, 100].forEach(p => {
      if (percent >= p && !firedScroll[p]) {
        firedScroll[p] = true;
        pushEvent('scroll_depth', { percent: p });
      }
    });
  });

  // =========================
  // 6️⃣ Element visibility
  // =========================
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        pushEvent('element_visible', {
          id: el.id || null,
          classes: el.className || null,
        });
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-ct-view]').forEach(el => observer.observe(el));

  // =========================
  // 7️⃣ Keyboard events
  // =========================
  ['keydown', 'keyup', 'keypress'].forEach(ev =>
    document.addEventListener(ev, e =>
      pushEvent(ev, { key: e.key, code: e.code })
    )
  );

  // =========================
  // 8️⃣ Media
  // =========================
  ['play', 'pause', 'ended', 'volumechange'].forEach(ev =>
    document.addEventListener(ev, e => {
      const el = e.target;
      if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
        pushEvent(ev, { id: el.id || null, src: el.currentSrc });
      }
    })
  );

  // =========================
  // 9️⃣ Touch events
  // =========================
  ['touchstart', 'touchend', 'touchmove'].forEach(ev =>
    document.addEventListener(ev, e => pushEvent(ev, { touches: e.touches.length }))
  );

  // =========================
  // 10️⃣ Network / errors
  // =========================
  window.addEventListener('online', () => pushEvent('online'));
  window.addEventListener('offline', () => pushEvent('offline'));
  window.addEventListener('error', e => pushEvent('error', { message: e.message, source: e.filename }));

  // =========================
  // 11️⃣ API pública para custom events
  // =========================
  window.ClaroTrack = {
    track: (eventName, data = {}) => pushEvent(eventName, data)
  };

})();

console.log('🏁 [ClaroTrack] Script finalizado');