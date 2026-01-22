from django.core.management.base import BaseCommand
from tracking.models import GA4Rule, TrackingRule
import json

class Command(BaseCommand):
    help = 'Crea reglas GA4 básicas'

    def handle(self, *args, **kwargs):
        rules = [
            {
                "listen_event": "purchase",
                "fire_event": "purchase",
                "active": True,
                "url_contains": "",
                "params_map": json.dumps({

                    # 🔹 Ecommerce GA4 estándar
                    "transaction_id": "ecommerce.transaction_id",
                    "currency": "ecommerce.currency",
                    "value": "ecommerce.value",
                    "tax": "ecommerce.tax",
                    "shipping": "ecommerce.shipping",
                    "coupon": "ecommerce.coupon",
                    "items": "ecommerce.items",

                    # 🔹 Campos custom útiles de negocio
                    "payment_method": "ecommerce.payment_method",
                    "status": "ecommerce.status",

                    "business_unit": "business_unit",
                    "business_unit2": "business_unit2",

                    # 🔹 Constante para trazabilidad interna
                    "fuente_track": "$const:claro_track"
                })
            },
            {
                "listen_event": "view_item",
                "fire_event": "view_item_track_claro",
                "active": True,
                "url_contains": "",
                "params_map": json.dumps({
                    "business_unit": "business_unit",
                    "business_unit2": "business_unit2",

                    # 🔹 Constante para trazabilidad interna
                    "fuente_track": "$const:claro_track"
                })
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