from django.core.management.base import BaseCommand
from tracking.models import GA4Rule

class Command(BaseCommand):
    help = 'Crea reglas GA4 básicas'

    def handle(self, *args, **kwargs):
        rules = [
            {
                "listen_event": "page_view",
                "fire_event": "Brave_page_view_prueba_tienda",
                "active": True,
                "url_contains": "",
                "params_map": {}
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