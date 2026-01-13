
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Event, TrackingRule, GA4Rule
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import requests
from django.conf import settings
import uuid

def send_event_to_ga4(event_name, client_id, params=None):
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

@api_view(['POST'])
def collect_event(request):
    data = request.data or {}

    event_name = data.get("event")
    path = data.get("path") or data.get("page_location")
    aid = data.get("aid") or data.get("client_id") or str(uuid.uuid4())
    print("Inicia el collect_event")
    if not event_name:
        return Response({"error": "missing event"}, status=400)

    # 1️⃣ Guardar evento crudo (SEGURO)
    event = Event.objects.create(
        aid=aid or "anonymous",
        event=event_name,
        path=path or "/",
        user_agent=request.META.get("HTTP_USER_AGENT", "")
    )

    # 2️⃣ Buscar reglas GA4
    ga4_rules = GA4Rule.objects.filter(
        listen_event=event.event,
        active=True
    )

    for rule in ga4_rules:

        if rule.url_contains and rule.url_contains not in event.path:
            continue

        # 3️⃣ Params map seguro
        params = {}

        params_map = rule.params_map or {}
        if isinstance(params_map, str):
            try:
                params_map = json.loads(params_map)
            except Exception:
                params_map = {}

        for ga4_param, source_key in params_map.items():
            value = data.get(source_key)
            if value is not None:
                params[ga4_param] = value

        # 4️⃣ Campos mínimos GA4
        
        params.update({
            "page_location": event.path,
            "engagement_time_msec": 1,
        })

        # 5️⃣ Enviar a GA4 SOLO si hay config
        if hasattr(settings, "GA4_MEASUREMENT_ID") and hasattr(settings, "GA4_API_SECRET"):
            send_event_to_ga4(
                event_name=rule.fire_event,
                client_id=event.aid,
                params=params
            )

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






