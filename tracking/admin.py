from django.contrib import admin
from django.db import models
from django.forms import Textarea
from .models import Event, TrackingRule, GA4Rule


# =====================
# EVENTOS CRUDOS
# =====================
@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("event", "path", "aid", "created_at")
    readonly_fields = ("aid", "event", "path", "created_at", "user_agent")
    ordering = ("-created_at",)
    search_fields = ("event", "path", "aid")


# =====================
# REGLAS DE TRACKING
# =====================
@admin.register(TrackingRule)
class TrackingRuleAdmin(admin.ModelAdmin):
    list_display = (
        "listen_event",
        "fire_event",
        "selector",
        "url_contains",
        "has_custom_js",
        "active",
    )

    list_filter = ("listen_event", "active")
    search_fields = ("fire_event", "selector", "url_contains")

    fieldsets = (
        ("🎯 Disparador", {
            "fields": ("listen_event", "url_contains", "selector")
        }),
        ("🧠 Regla", {
            "fields": ("fire_event", "params_map")
        }),
        ("⚙️ Comportamiento", {
            "fields": ("custom_js", "active")
        }),
    )

    formfield_overrides = {
        models.JSONField: {
            "widget": Textarea(attrs={"rows": 4, "style": "font-family: monospace"})
        },
        models.TextField: {
            "widget": Textarea(attrs={"rows": 6, "style": "font-family: monospace"})
        },
    }

    def has_custom_js(self, obj):
        return bool(obj.custom_js)

    has_custom_js.boolean = True
    has_custom_js.short_description = "JS"


# =====================
# REGLAS GA4
# =====================
@admin.register(GA4Rule)
class GA4RuleAdmin(admin.ModelAdmin):
    list_display = ("listen_event", "fire_event", "url_contains", "active")
    list_filter = ("listen_event", "active")
    search_fields = ("fire_event_toggle",)

    formfield_overrides = {
        models.JSONField: {
            "widget": Textarea(attrs={"rows": 4, "style": "font-family: monospace"})
        }
    }
