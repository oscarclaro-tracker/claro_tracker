from django.db import models

class Event(models.Model):
    aid = models.CharField(max_length=64)
    event = models.CharField(max_length=100)
    path = models.CharField(max_length=255)

    user_agent = models.TextField(null=True, blank=True)

    utm_source = models.CharField(max_length=100, null=True, blank=True)
    utm_medium = models.CharField(max_length=100, null=True, blank=True)
    utm_campaign = models.CharField(max_length=100, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.event} | {self.path}"
    
class TrackingRule(models.Model):
    EVENT_CHOICES = [
        ('click', 'Click'),
        ('dblclick', 'Double Click'),
        ('page_view', 'Page View'),
        ('scroll', 'Scroll'),
        ('form_submit', 'Form Submit'),
        # agregar otros eventos según necesidad
    ]

    listen_event = models.CharField(max_length=50, choices=EVENT_CHOICES)
    selector = models.CharField(max_length=255, blank=True, null=True,
                                help_text="CSS selector del elemento")
    url_contains = models.CharField(max_length=255, blank=True, null=True)
    fire_event = models.CharField(max_length=100)
    params_map = models.JSONField(blank=True, null=True, default=dict)
    custom_js = models.TextField(blank=True, null=True, help_text="JS a ejecutar al cumplirse la regla")
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.listen_event} → {self.fire_event}"


# tracking/models.py
class GA4Rule(models.Model):
    listen_event = models.CharField(max_length=100)
    fire_event = models.CharField(max_length=100)
    url_contains = models.CharField(max_length=255, blank=True, null=True)
    params_map = models.JSONField(default=dict)
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.listen_event} → GA4:{self.fire_event}"


  