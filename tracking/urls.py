from django.urls import path
from .views import collect_event, tracking_rules

urlpatterns = [
    path('collect/', collect_event),
    path("tracking_rules/", tracking_rules),
]
