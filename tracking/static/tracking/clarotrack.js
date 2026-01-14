console.log('🚀 [ClaroTrack] Script cargado');

(function () {
  console.log('✅ [ClaroTrack] IIFE iniciando...');

  const hasGTM =
    window.google_tag_manager ||
    document.querySelector('script[src*="googletagmanager.com/gtm.js"]');

  console.log('🔍 [ClaroTrack] hasGTM =', hasGTM);

  if (hasGTM) {
    console.warn('[ClaroTrack] GTM detectado, verificando si GA4 está funcionando...');
    
    // Esperar 3 segundos para ver si GA4 realmente funciona
    setTimeout(() => {
      // Verificar si existe gtag (Google Analytics)
      const gtagExists = typeof window.gtag === 'function';
      
      // Verificar si hay scripts de GA4/Google Analytics
      const hasGAScript = 
        document.querySelector('script[src*="googletagmanager.com/gtag/js"]') ||
        document.querySelector('script[src*="google-analytics.com/analytics.js"]') ||
        document.querySelector('script[src*="analytics.google.com"]');
      
      // Si gtag existe O hay scripts de GA, consideramos que GA funciona
      const gaWorking = gtagExists || hasGAScript;
      
      console.log('🔍 [ClaroTrack] gtag existe:', gtagExists);
      console.log('🔍 [ClaroTrack] Scripts GA encontrados:', hasGAScript);
      console.log('🔍 [ClaroTrack] GA4 funcionando:', gaWorking);
      
      if (gaWorking) {
        console.warn('[ClaroTrack] GA4 activo → ClaroTrack deshabilitado');
        return;
      } else {
        console.log('✅ [ClaroTrack] GA4 bloqueado → ClaroTrack tomará el control');
        initClaroTrack();
      }
    }, 3000); // 3 segundos para dar tiempo a que GA se cargue
    
    return;
  }

  console.log('✅ [ClaroTrack] GTM no detectado → tracking activo');
  initClaroTrack();

  // =========================
  // Función principal de inicialización
  // =========================
  function initClaroTrack() {
  console.log('🚀 [ClaroTrack] Inicializando sistema de tracking...');

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
        path: location.pathname,
        dataLayer: payload,
        ts: Date.now()
      })
    }).catch(err =>
      console.warn('[ClaroTrack] error enviando evento', err)
    );
  }

  // =========================
  // Asegurar dataLayer
  // =========================
  window.dataLayer = window.dataLayer || [];

  // =========================
  // 🔥 1️⃣ Procesar eventos YA existentes
  // =========================
  window.dataLayer.forEach(item => {
    if (item && item.event) {
      console.log('📦 [ClaroTrack] Evento previo:', item.event);
      send(item.event, item);
      applyRules(item.event, item);
    }
  });

  // =========================
  // 🔥 2️⃣ Interceptar pushes futuros
  // =========================
  const originalPush = window.dataLayer.push.bind(window.dataLayer);

  window.dataLayer.push = function (...args) {
    args.forEach(item => {
      if (item && item.event) {
        console.log('📥 [ClaroTrack] dataLayer.push:', item.event);
        send(item.event, item);
        applyRules(item.event, item);
      }
    });
    return originalPush(...args);
  };

  // =========================
  // Push helper
  // =========================
  function pushEvent(event, params = {}) {
    window.dataLayer.push({ event, ...params });
  }

  // =========================
  // 0️⃣ Reglas dinámicas
  // =========================
  let dynamicRules = [];

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
  // Aplicar reglas
  // =========================
  function applyRules(eventName, eventData) {
    dynamicRules.forEach(rule => {
      if (rule.listen_event !== eventName) return;
      if (rule.url_contains && !location.pathname.includes(rule.url_contains)) return;

      const params = {};

      if (rule.params_map) {
        for (const key in rule.params_map) {
          params[key] = eventData[rule.params_map[key]] || null;
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
          console.error('[ClaroTrack] Error en custom_js', e);
        }
      }
    });
  }

  // =========================
  // Page lifecycle
  // =========================
  window.addEventListener('load', () => pushEvent('page_view'));
  window.addEventListener('beforeunload', () => pushEvent('page_unload'));
  document.addEventListener('visibilitychange', () =>
    pushEvent('visibility_change', { state: document.visibilityState })
  );

  // =========================
  // Clicks & forms
  // =========================
  document.addEventListener('click', e => {
    const el = e.target.closest('*');
    if (!el) return;

    pushEvent('click', {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: el.className || null,
      text: el.innerText?.trim().slice(0, 50) || null
    });
  });

  document.addEventListener('submit', e => {
    pushEvent('form_submit', {
      id: e.target.id || null,
      action: e.target.action || null
    });
  });

  // =========================
  // Scroll depth
  // =========================
  let fired = {};
  window.addEventListener('scroll', () => {
    const h =
      document.documentElement.scrollHeight - window.innerHeight;
    const p = Math.round((window.scrollY / h) * 100);

    [25, 50, 75, 100].forEach(v => {
      if (p >= v && !fired[v]) {
        fired[v] = true;
        pushEvent('scroll_depth', { percent: v });
      }
    });
  });

  // =========================
  // API pública
  // =========================
  window.ClaroTrack = {
    track: (event, data = {}) => pushEvent(event, data)
  };

  console.log('✅ [ClaroTrack] Sistema activo');
}


})();

console.log('🏁 [ClaroTrack] Script finalizado');