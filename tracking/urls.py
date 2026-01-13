from django.urls import path
from .views import collect_event, tracking_rules, clarotrack_static_proxy

urlpatterns = [
    path('collect/', collect_event),
    path("tracking_rules/", tracking_rules),
    path('static/tracking/clarotrack.js', clarotrack_static_proxy),
]
