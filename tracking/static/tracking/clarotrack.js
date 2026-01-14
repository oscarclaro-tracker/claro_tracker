console.log('🚀 [ClaroTrack] Script cargado');

(function () {

  // =========================
  // Detectar si GA4 REALMENTE funciona
  // =========================
  async function isGA4ReallyWorking() {
    if (typeof fetch !== 'function') return false;

    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 1500);

      await fetch('https://www.google-analytics.com/g/collect', {
        method: 'POST',
        mode: 'no-cors',
        body: 'v=2&tid=G-TEST&cid=555&t=pageview',
        signal: controller.signal
      });

      return true; // no bloqueado
    } catch (e) {
      return false; // bloqueado / abort / adblock
    }
  }

  async function initClaroTrack() {
    console.log('🚀 [ClaroTrack] Inicializando sistema de tracking...');

    const hasGTM = !!window.google_tag_manager;
    const ga4Works = await isGA4ReallyWorking();

    console.log('[ClaroTrack] GTM:', hasGTM, 'GA4:', ga4Works);

    // 👉 Si GTM + GA4 funcionan, NO interceptar
    if (hasGTM && ga4Works) {
      console.warn('[ClaroTrack] GTM + GA4 OK → no intercepta');
      return;
    }

    console.log('[ClaroTrack] Fallback server activo');

    const API = 'https://claro-tracker.onrender.com/api/collect/';

    // =========================
    // ID anónimo
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
    // Limpiar params
    // =========================
    function extractParams(data) {
      const source = data.params ?? data;
      const params = {};

      for (const key in source) {
        if (key !== 'event' && key !== '__ct_internal') {
          params[key] = source[key];
        }
      }
      return params;
    }

    // =========================
    // Enviar evento al backend
    // =========================
    function send(eventName, params = {}) {
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aid: getAid(),
          event: eventName,
          params,
          path: location.pathname,
          ts: Date.now()
        })
      }).catch(() => {});
    }

    // =========================
    // Reglas dinámicas
    // =========================
    let dynamicRules = [];

    function applyRules(eventName, eventData) {
      dynamicRules.forEach(rule => {
        if (rule.listen_event !== eventName) return;
        if (rule.url_contains && !location.pathname.includes(rule.url_contains)) return;

        // ⚠️ evento interno para evitar loop
        window.dataLayer.push({
          event: rule.fire_event,
          __ct_internal: true
        });

        if (rule.custom_js) {
          try {
            new Function(rule.custom_js)();
          } catch (e) {
            console.error('[ClaroTrack] custom_js error', e);
          }
        }
      });
    }

    async function loadRules() {
      try {
        const res = await fetch(
          'https://claro-tracker.onrender.com/api/tracking_rules/'
        );
        dynamicRules = await res.json();
        console.log('📜 [ClaroTrack] Reglas cargadas:', dynamicRules.length);
      } catch (e) {
        console.error('[ClaroTrack] Error cargando reglas', e);
      }
    }

    loadRules();

    // =========================
    // Asegurar dataLayer
    // =========================
    window.dataLayer = window.dataLayer || [];

    // =========================
    // Procesar eventos existentes
    // =========================
    window.dataLayer.forEach(item => {
      if (item && item.event && !item.__ct_internal) {
        send(item.event, extractParams(item));
        applyRules(item.event, item);
      }
    });

    // =========================
    // Interceptar dataLayer.push
    // =========================
    const originalPush = window.dataLayer.push.bind(window.dataLayer);

    window.dataLayer.push = function (...args) {
      args.forEach(item => {
        if (item && item.event && !item.__ct_internal) {
          send(item.event, extractParams(item));
          applyRules(item.event, item);
        }
      });
      return originalPush(...args);
    };

    // =========================
    // Helper interno
    // =========================
    function pushEvent(event, params = {}) {
      window.dataLayer.push({
        event,
        __ct_internal: true,
        ...params
      });
    }

    // =========================
    // Page events
    // =========================
    function firePageView() {
      pushEvent('page_view');
    }

    if (document.readyState === 'complete') {
      firePageView();
    } else {
      window.addEventListener('load', firePageView);
    }

    window.addEventListener('beforeunload', () => pushEvent('page_unload'));

    document.addEventListener('visibilitychange', () =>
      pushEvent('visibility_change', { state: document.visibilityState })
    );

    window.addEventListener('hashchange', () =>
      pushEvent('hash_change', { hash: location.hash })
    );

    window.addEventListener('popstate', () =>
      pushEvent('popstate', { path: location.pathname })
    );

    // =========================
    // Click & Interaction
    // =========================
    ['click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup'].forEach(ev =>
      document.addEventListener(ev, e => {
        const el = e.target;
        pushEvent(ev, {
          tag: el.tagName?.toLowerCase(),
          id: el.id || null,
          classes: el.className || null,
          text: el.innerText?.trim().slice(0, 50) || null
        });
      })
    );

    ['input', 'change', 'submit', 'focus', 'blur'].forEach(ev =>
      document.addEventListener(ev, e => {
        const el = e.target;
        pushEvent(ev, {
          tag: el.tagName?.toLowerCase(),
          id: el.id || null,
          name: el.name || null,
          value: el.value || null
        });
      })
    );

    // =========================
    // Scroll
    // =========================
    let firedScroll = {};

    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
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
    // Element visibility
    // =========================
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          pushEvent('element_visible', {
            id: el.id || null,
            classes: el.className || null
          });
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('[data-ct-view]').forEach(el =>
      observer.observe(el)
    );

    // =========================
    // Keyboard
    // =========================
    ['keydown', 'keyup', 'keypress'].forEach(ev =>
      document.addEventListener(ev, e =>
        pushEvent(ev, { key: e.key, code: e.code })
      )
    );

    // =========================
    // Media
    // =========================
    ['play', 'pause', 'ended', 'volumechange'].forEach(ev =>
      document.addEventListener(ev, e => {
        const el = e.target;
        if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
          pushEvent(ev, {
            id: el.id || null,
            src: el.currentSrc
          });
        }
      })
    );

    // =========================
    // Touch
    // =========================
    ['touchstart', 'touchend', 'touchmove'].forEach(ev =>
      document.addEventListener(ev, e =>
        pushEvent(ev, { touches: e.touches.length })
      )
    );

    // =========================
    // Network / errors
    // =========================
    window.addEventListener('online', () => pushEvent('online'));
    window.addEventListener('offline', () => pushEvent('offline'));

    window.addEventListener('error', e =>
      pushEvent('error', {
        message: e.message,
        source: e.filename
      })
    );

    // =========================
    // API pública
    // =========================
    window.ClaroTrack = {
      track: (event, data = {}) => pushEvent(event, data)
    };

    console.log('✅ [ClaroTrack] Sistema activo');
  }

  initClaroTrack();

})();

console.log('🏁 [ClaroTrack] Script finalizado');
