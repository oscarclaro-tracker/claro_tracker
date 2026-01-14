console.log('🚀 [ClaroTrack] Script cargado');

(async function () {
  console.log('✅ [ClaroTrack] Iniciando detección...');

  const hasGTM = !!window.google_tag_manager;
  
  console.log('🔍 [ClaroTrack] GTM detectado:', hasGTM);

  if (!hasGTM) {
    console.log('✅ [ClaroTrack] No hay GTM → iniciando ClaroTrack');
    initClaroTrack();
    return;
  }

  // Si hay GTM, esperar 3 segundos para ver si envía eventos a GA4
  console.log('⏳ [ClaroTrack] GTM detectado, esperando 3s para verificar GA4...');
  
  let ga4RequestDetected = false;

  // Interceptar fetch para detectar peticiones a GA4
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    if (typeof url === 'string' && 
        (url.includes('/g/collect') || 
         url.includes('/mp/collect') ||
         url.includes('google-analytics.com') ||
         url.includes('analytics.google.com'))) {
      ga4RequestDetected = true;
      console.log('🔍 [ClaroTrack] Request a GA4 detectado:', url);
    }
    return originalFetch.apply(this, args);
  };

  // Interceptar sendBeacon también
  const originalBeacon = navigator.sendBeacon;
  navigator.sendBeacon = function(url, ...args) {
    if (typeof url === 'string' && 
        (url.includes('/g/collect') || 
         url.includes('/mp/collect') ||
         url.includes('google-analytics.com'))) {
      ga4RequestDetected = true;
      console.log('🔍 [ClaroTrack] Beacon a GA4 detectado:', url);
    }
    return originalBeacon.call(this, url, ...args);
  };

  setTimeout(() => {
    // Restaurar funciones originales
    window.fetch = originalFetch;
    navigator.sendBeacon = originalBeacon;

    console.log('🔍 [ClaroTrack] ¿GA4 envió eventos?:', ga4RequestDetected);

    if (ga4RequestDetected) {
      console.warn('⛔ [ClaroTrack] GTM + GA4 funcionando → ClaroTrack deshabilitado');
    } else {
      console.log('✅ [ClaroTrack] GA4 bloqueado o inactivo → ClaroTrack toma control');
      initClaroTrack();
    }
  }, 3000);


  async function initClaroTrack() {
    console.log('🚀 [ClaroTrack] Inicializando sistema de tracking...');

  const ga4Works = await isGA4ReallyWorking();

  console.log('🔍 [ClaroTrack] GA4 realmente funcional:', ga4Works);

  if (ga4Works) {
    console.warn('⛔ [ClaroTrack] GA4 operativo → ClaroTrack NO dispara');
    return;
  }

  console.log('✅ [ClaroTrack] GA4 BLOQUEADO → ClaroTrack toma control');

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

 function extractParams(data) {
  const source = data.params ?? data;

  const params = {};
  for (const key in source) {
    if (key !== 'event') {
      params[key] = source[key];
    }
  }
  return params;
}


    // =========================
    // Enviar evento
    // =========================
    function send(eventName, params = {}) {
  fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aid: getAid(),
      event: eventName,
      params,               // 👈 limpio
      path: location.pathname,
      ts: Date.now()
    })
  }).catch(() => {});
}


    // =========================
    // 0️⃣ Reglas dinámicas (DECLARADAS PRIMERO)
    // =========================
    let dynamicRules = [];

    function applyRules(eventName, eventData) {
      dynamicRules.forEach(rule => {
        if (rule.listen_event !== eventName) return;
        if (rule.url_contains && !location.pathname.includes(rule.url_contains)) return;

        window.dataLayer.push({
          event: rule.fire_event
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
    // 1️⃣ Procesar eventos existentes
    // =========================
    window.dataLayer.forEach(item => {
      if (item && item.event) {
        send(item.event, extractParams(item));
        applyRules(item.event, item);
      }
    });

    // =========================
    // 2️⃣ Interceptar dataLayer.push
    // =========================
    const originalPush = window.dataLayer.push.bind(window.dataLayer);

    window.dataLayer.push = function (...args) {
      args.forEach(item => {
        if (item && item.event) {
          send(item.event, item);
          applyRules(item.event, item);
        }
      });
      return originalPush(...args);
    };

    // =========================
    // Helper
    // =========================
    function pushEvent(event, params = {}) {
      window.dataLayer.push({ event, ...params });
    }

    // =========================
    // 3️⃣ Page events
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
    // 4️⃣ Click & Interaction
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
    // 5️⃣ Scroll
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
    // 6️⃣ Element visibility
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
    // 7️⃣ Keyboard
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
          pushEvent(ev, {
            id: el.id || null,
            src: el.currentSrc
          });
        }
      })
    );

    // =========================
    // 9️⃣ Touch
    // =========================
    ['touchstart', 'touchend', 'touchmove'].forEach(ev =>
      document.addEventListener(ev, e =>
        pushEvent(ev, { touches: e.touches.length })
      )
    );

    // =========================
    // 🔟 Network / errors
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
