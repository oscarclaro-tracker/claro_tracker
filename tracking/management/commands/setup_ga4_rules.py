from django.core.management.base import BaseCommand
from tracking.models import GA4Rule, TrackingRule

class Command(BaseCommand):
    help = 'Crea reglas GA4 básicas'

    def handle(self, *args, **kwargs):
        rules = [
            {
                "listen_event": "view_item",
                "fire_event": "view_item",
                "active": True,
                "url_contains": "",
                "params_map": {

                    "fuente_track": "$const:claro_track"
                }
            },
            {
                "listen_event": "view_item",
                "fire_event": "view_item_claro_track_constante",
                "active": True,
                "url_contains": "",
                "params_map": {

                    "fuente_track": "$const:claro_track"
                }
            },
            {
                "listen_event": "purchase",
                "fire_event": "purchase",
                "active": True,
                "url_contains": "",
                "params_map": {

                    # 🔹 MÍNIMO VITAL
                    "transaction_id": "ecommerce.transaction_id",
                    "business_unit": "business_unit",

                    # 🔹 (opcional pero útil para QA)
                    "currency": "ecommerce.currency",
                    "value": "ecommerce.value",

                    # 🔹 Constante para trazabilidad interna
                    "fuente_track": "$const:claro_track"
                }
            },
            
        ]

        for rule_data in rules:
            rule, created = GA4Rule.objects.get_or_create(
                listen_event=rule_data["listen_event"],
                fire_event=rule_data["fire_event"],
                defaults=rule_data
            )
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Regla creada: {rule.listen_event} → {rule.fire_event}')
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f'⚠️ Regla ya existe: {rule.listen_event}')
                )