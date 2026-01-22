
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Event, TrackingRule, GA4Rule
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import requests
from django.conf import settings
import uuid
import logging
from django.views.decorators.cache import never_cache
from django.http import HttpResponse
import os

logger = logging.getLogger(__name__)

@never_cache
def clarotrack_static_proxy(request):
    file_path = os.path.join(
        settings.BASE_DIR,
        'tracking',
        'static',
        'tracking',
        'clarotrack.js'
    )

    with open(file_path, 'r', encoding='utf-8') as f:
        response = HttpResponse(
            f.read(),
            content_type='application/javascript'
        )

    # 🔥 Headers ANTI Cloudflare
    response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'

    return response

def send_event_to_ga4(event_name, client_id, params=None, traffic_source=None):
    url = "https://www.google-analytics.com/mp/collect"
    
    # Asegurar que client_id sea string válido
    if not client_id or client_id == "anonymous":
        client_id = str(uuid.uuid4())

    payload = {
        "client_id": str(client_id),  # Forzar string
        "events": [
            {
                "name": event_name,
                "params": params or {}
            }
        ]
    }
    if traffic_source:
        payload["traffic_source"] = {
            "source": traffic_source.get("source"),
            "medium": traffic_source.get("medium"),
            "name": traffic_source.get("campaign")  # GA4 usa "name" para campaign
        }

    print("➡️ Enviando a GA4:")
    print("   URL:", url)
    print("   Measurement ID:", settings.GA4_MEASUREMENT_ID)
    print("   Event:", event_name)
    print("   Client ID:", client_id)
    print("   Params:", params)
    print("   Payload completo:", json.dumps(payload, indent=2))

    try:
        response = requests.post(
            url,
            params={
                "measurement_id": settings.GA4_MEASUREMENT_ID,
                "api_secret": settings.GA4_API_SECRET,
            },
            json=payload,
            timeout=5
        )

        print("⬅️ GA4 response status:", response.status_code)
        print("⬅️ GA4 response body:", response.text)
        
        # GA4 devuelve 204 si todo está OK (sin body)
        if response.status_code == 204:
            print("✅ Evento enviado exitosamente")
        else:
            print("⚠️ Status code inesperado")
            
        return response.status_code
        
    except Exception as e:
        print("❌ Error enviando a GA4:", str(e))
        return 500

def get_value_by_path(data, path):
    """
    Lee valores anidados usando dot-notation
    Ej: ecommerce.items
    """
    value = data
    for key in path.split('.'):
        if isinstance(value, dict):
            value = value.get(key)
        else:
            return None
    return value


@api_view(['POST'])
def collect_event(request):
    logger.warning("🔥 collect_event EJECUTADO")
    logger.warning(f"🔥 METHOD: {request.method}")
    logger.warning(f"🔥 DATA RAW: {request.body}")
    data = request.data or {}

    event_name = data.get("event")
    path = data.get("path") or data.get("page_location")
    aid = data.get("aid") or data.get("client_id") or str(uuid.uuid4())
    
    logger.warning(f"📋 Event name: {event_name}")
    logger.warning(f"📋 Path: {path}")
    logger.warning(f"📋 AID: {aid}")
    
    if not event_name:
        return Response({"error": "missing event"}, status=400)

    # 1️⃣ Guardar evento
    event = Event.objects.create(
        aid=aid or "anonymous",
        event=event_name,
        path=path or "/",
        user_agent=request.META.get("HTTP_USER_AGENT", "")
    )
    logger.warning(f"✅ Evento guardado ID: {event.id}")

    # 2️⃣ Buscar reglas GA4
    ga4_rules = GA4Rule.objects.filter(
        listen_event=event.event,
        active=True
    )
    
    logger.warning(f"🔍 Reglas encontradas para '{event.event}': {ga4_rules.count()}")
    
    # 👀 Mostrar TODAS las reglas disponibles
    all_rules = GA4Rule.objects.all()
    logger.warning(f"📚 Total reglas en DB: {all_rules.count()}")
    for r in all_rules:
        logger.warning(f"   - ID:{r.id} | listen='{r.listen_event}' | fire='{r.fire_event}' | active={r.active}")

    for rule in ga4_rules:
        logger.warning(f"🎯 Procesando regla ID: {rule.id}")

        if rule.url_contains and rule.url_contains not in event.path:
            logger.warning(f"⏭️ Saltando (URL '{event.path}' no contiene '{rule.url_contains}')")
            continue

        # 3️⃣ Params map
        params = {}
        params_map = rule.params_map or {}
        if isinstance(params_map, str):
            try:
                params_map = json.loads(params_map)
            except Exception:
                params_map = {}

        event_params = data.get("params", data)
        # 🧲 EXTRAER TRAFFIC SOURCE DEL FRONTEND
        traffic_source = None
        if isinstance(event_params, dict) and "traffic_source" in event_params:
            traffic_source = event_params.pop("traffic_source")
            logger.warning(f"📡 Traffic source recibido: {traffic_source}")


        for ga4_param, source_path in params_map.items():

            # 1️⃣ VALOR CONSTANTE
            if isinstance(source_path, str) and source_path.startswith("$const:"):
                params[ga4_param] = source_path.replace("$const:", "")
                continue

            # 2️⃣ VALOR DINÁMICO (dot-notation)
            value = get_value_by_path(event_params, source_path)
            if value is not None:
                params[ga4_param] = value


        # 4️⃣ Campos mínimos GA4
        params.update({
            "page_location": event.path,
            "engagement_time_msec": 1,
            #"debug_mode": True
        })

        # 5️⃣ Enviar a GA4
        logger.warning(f"🚀 LLAMANDO send_event_to_ga4...")
        logger.warning(f"   GA4_MEASUREMENT_ID existe: {hasattr(settings, 'GA4_MEASUREMENT_ID')}")
        logger.warning(f"   GA4_API_SECRET existe: {hasattr(settings, 'GA4_API_SECRET')}")
        
        if hasattr(settings, "GA4_MEASUREMENT_ID") and hasattr(settings, "GA4_API_SECRET"):
            logger.warning(f"   Measurement ID: {settings.GA4_MEASUREMENT_ID}")
            send_event_to_ga4(
                event_name=rule.fire_event,
                client_id=event.aid,
                params=params,
                traffic_source=traffic_source
            )
        else:
            logger.error("❌ Credenciales GA4 NO configuradas")

    return Response({"status": "ok"})

@api_view(['GET'])
def tracking_rules(request):
    rules = TrackingRule.objects.filter(active=True)
    data = []
    for r in rules:
        data.append({
            "listen_event": r.listen_event,
            "selector": r.selector,
            "url_contains": r.url_contains,
            "fire_event": r.fire_event,
            "params_map": r.params_map,
            "custom_js": r.custom_js
        })
    return Response(data)






