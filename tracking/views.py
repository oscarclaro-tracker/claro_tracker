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
    """
    Envía eventos a GA4 con la estructura correcta.
    IMPORTANTE: items debe estar fuera de params para eventos ecommerce.
    """
    url = "https://www.google-analytics.com/mp/collect"
    
    # Asegurar que client_id sea string válido
    if not client_id or client_id == "anonymous":
        client_id = str(uuid.uuid4())

    # Extraer items si existe (debe ir fuera de params)
    items = None
    if params and "items" in params:
        items = params.pop("items")
        logger.warning(f"📦 Items extraídos: {items}")

    # Construir evento base
    event_data = {
        "name": event_name,
        "params": params or {}
    }

    # Si hay items, validar y agregar correctamente
    if items:
        # Asegurar que items sea una lista
        if not isinstance(items, list):
            logger.error(f"❌ items debe ser una lista, recibido: {type(items)}")
            items = [items] if items else []
        
        # Validar estructura de items
        validated_items = []
        for item in items:
            if isinstance(item, dict):
                # Campos obligatorios para GA4
                validated_item = {
                    "item_id": item.get("item_id", ""),
                    "item_name": item.get("item_name", ""),
                }
                # Campos opcionales comunes
                optional_fields = [
                    "affiliation", "coupon", "currency", "discount", 
                    "index", "item_brand", "item_category", "item_category2",
                    "item_category3", "item_category4", "item_category5",
                    "item_list_id", "item_list_name", "item_variant",
                    "location_id", "price", "quantity"
                ]
                for field in optional_fields:
                    if field in item:
                        validated_item[field] = item[field]
                
                validated_items.append(validated_item)
        
        # Agregar items validados al evento
        event_data["params"]["items"] = validated_items
        logger.warning(f"✅ Items validados agregados: {len(validated_items)} items")

    # Construir payload completo
    payload = {
        "client_id": str(client_id),
        "events": [event_data]
    }

    # Agregar traffic source si existe
    if traffic_source:
        payload["traffic_source"] = {
            "source": traffic_source.get("source", "(direct)"),
            "medium": traffic_source.get("medium", "(none)"),
            "name": traffic_source.get("campaign", "")
        }

    # Validación final de campos numéricos críticos
    numeric_fields = ["value", "tax", "shipping"]
    for field in numeric_fields:
        if field in event_data["params"]:
            try:
                event_data["params"][field] = float(event_data["params"][field])
            except (ValueError, TypeError):
                logger.warning(f"⚠️ Campo {field} no es numérico, eliminando")
                del event_data["params"][field]

    print("\n" + "="*60)
    print("➡️ ENVIANDO A GA4:")
    print("="*60)
    print(f"   URL: {url}")
    print(f"   Measurement ID: {settings.GA4_MEASUREMENT_ID}")
    print(f"   Event: {event_name}")
    print(f"   Client ID: {client_id}")
    print(f"\n📋 PAYLOAD COMPLETO:")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    print("="*60 + "\n")

    try:
        response = requests.post(
            url,
            params={
                "measurement_id": settings.GA4_MEASUREMENT_ID,
                "api_secret": settings.GA4_API_SECRET,
            },
            json=payload,
            timeout=10
        )

        print(f"⬅️ GA4 Response Status: {response.status_code}")
        print(f"⬅️ GA4 Response Headers: {dict(response.headers)}")
        print(f"⬅️ GA4 Response Body: {response.text or '(vacío - normal para 204)'}")
        
        # GA4 devuelve 204 si todo está OK (sin body)
        if response.status_code == 204:
            print("✅ Evento enviado exitosamente a GA4")
        elif response.status_code == 200:
            print("✅ Evento aceptado por GA4")
        else:
            print(f"⚠️ Status code inesperado: {response.status_code}")
            print(f"   Esto puede indicar un problema con el formato del evento")
            
        return response.status_code
        
    except requests.exceptions.Timeout:
        print("❌ Timeout al conectar con GA4")
        return 504
    except requests.exceptions.ConnectionError as e:
        print(f"❌ Error de conexión con GA4: {str(e)}")
        return 503
    except Exception as e:
        print(f"❌ Error inesperado enviando a GA4: {str(e)}")
        import traceback
        traceback.print_exc()
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
    logger.warning("\n" + "🔥"*30)
    logger.warning("🔥 collect_event EJECUTADO")
    logger.warning(f"🔥 METHOD: {request.method}")
    logger.warning(f"🔥 DATA RAW: {request.body.decode('utf-8')}")
    logger.warning("🔥"*30 + "\n")
    
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
        logger.warning(f"\n🎯 Procesando regla ID: {rule.id}")
        logger.warning(f"   Listen: {rule.listen_event} → Fire: {rule.fire_event}")

        if rule.url_contains and rule.url_contains not in event.path:
            logger.warning(f"⏭️ Saltando (URL '{event.path}' no contiene '{rule.url_contains}')")
            continue

        # 3️⃣ Params map
        params = {}
        params_map = rule.params_map or {}
        if isinstance(params_map, str):
            try:
                params_map = json.loads(params_map)
            except Exception as e:
                logger.error(f"❌ Error parseando params_map: {e}")
                params_map = {}

        logger.warning(f"📝 Params map: {params_map}")

        event_params = data.get("params", data)
        logger.warning(f"📦 Event params recibidos: {json.dumps(event_params, indent=2, ensure_ascii=False)[:500]}")
        
        # 🧲 EXTRAER TRAFFIC SOURCE DEL FRONTEND
        traffic_source = None
        if isinstance(event_params, dict) and "traffic_source" in event_params:
            traffic_source = event_params.pop("traffic_source")
            logger.warning(f"📡 Traffic source recibido: {traffic_source}")

        # Mapear parámetros
        for ga4_param, source_path in params_map.items():
            # 1️⃣ VALOR CONSTANTE
            if isinstance(source_path, str) and source_path.startswith("$const:"):
                params[ga4_param] = source_path.replace("$const:", "")
                logger.warning(f"   ✓ {ga4_param} = {params[ga4_param]} (constante)")
                continue

            # 2️⃣ VALOR DINÁMICO (dot-notation)
            value = get_value_by_path(event_params, source_path)
            if value is not None:
                params[ga4_param] = value
                logger.warning(f"   ✓ {ga4_param} = {value} (desde {source_path})")
            else:
                logger.warning(f"   ✗ {ga4_param}: no encontrado en {source_path}")

        # 4️⃣ Campos mínimos GA4
        params.update({
            "page_location": event.path or "https://example.com/",
            "engagement_time_msec": 100,
        })

        logger.warning(f"\n📤 Parámetros finales a enviar:")
        logger.warning(json.dumps(params, indent=2, ensure_ascii=False))

        # 5️⃣ Enviar a GA4
        if hasattr(settings, "GA4_MEASUREMENT_ID") and hasattr(settings, "GA4_API_SECRET"):
            logger.warning(f"\n🚀 Enviando a GA4...")
            logger.warning(f"   Measurement ID: {settings.GA4_MEASUREMENT_ID}")
            logger.warning(f"   API Secret: {'*' * len(settings.GA4_API_SECRET)}")
            
            status = send_event_to_ga4(
                event_name=rule.fire_event,
                client_id=event.aid,
                params=params.copy(),  # Usar copia para no modificar el original
                traffic_source=traffic_source
            )
            
            logger.warning(f"✅ Respuesta GA4: {status}")
        else:
            logger.error("❌ Credenciales GA4 NO configuradas en settings")
            logger.error(f"   GA4_MEASUREMENT_ID presente: {hasattr(settings, 'GA4_MEASUREMENT_ID')}")
            logger.error(f"   GA4_API_SECRET presente: {hasattr(settings, 'GA4_API_SECRET')}")

    return Response({"status": "ok", "events_processed": ga4_rules.count()})

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