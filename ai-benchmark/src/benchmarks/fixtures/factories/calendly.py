"""
Calendly model factories for generating realistic scheduling and calendar test data.
"""

import random
from datetime import datetime, timedelta

import factory
from factory.declarations import LazyAttribute, LazyFunction, Sequence
from factory.faker import Faker
from faker import Faker as FakerGen

from ..db import Session
from ..models.calendly import (
    Event,
    EventMembership,
    EventType,
    Invitee,
    InviteeQuestionAnswer,
    Organization,
    RoutingForm,
    RoutingFormSubmission,
    User,
    WebhookSubscription,
)
from ._shared_constants import (
    get_created_datetime,
    get_future_date,
    get_past_datetime,
)

fake = FakerGen()


def generate_calendly_uuid() -> str:
    """Generate a Calendly-style UUID."""
    import uuid

    return str(uuid.uuid4())


class CalendlyOrganizationFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Calendly organizations."""

    class Meta:
        model = Organization
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    uri = Sequence(lambda n: f"https://api.calendly.com/organizations/{generate_calendly_uuid()}")
    name = Faker("company")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=365, days_ago_max=1095))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class CalendlyUserFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Calendly users."""

    class Meta:
        model = User
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    uri = Sequence(lambda n: f"https://api.calendly.com/users/{generate_calendly_uuid()}")
    name = Faker("name")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=180, days_ago_max=730))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    email = Faker("email")
    slug = Faker("slug")
    scheduling_url = Faker("url")
    timezone = Faker("timezone")
    _fivetran_deleted = False


class CalendlyEventTypeFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Calendly event types."""

    class Meta:
        model = EventType
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    uri = Sequence(lambda n: f"https://api.calendly.com/event_types/{generate_calendly_uuid()}")
    name = Faker(
        "random_element",
        elements=[
            "15 Minute Meeting",
            "30 Minute Meeting",
            "Discovery Call",
            "Demo",
            "Consultation",
            "Interview",
            "Follow-up",
        ],
    )
    duration = Faker("random_element", elements=[15, 30, 45, 60])
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=90, days_ago_max=365))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    slug = Faker("slug")
    kind = Faker("random_element", elements=["solo", "group", "collective", "round_robin"])
    active = Faker("boolean", chance_of_getting_true=80)
    scheduling_url = Faker("url")
    description_plain = Faker("text", max_nb_chars=200)
    color = Faker("hex_color")
    _fivetran_deleted = False


class CalendlyEventFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Calendly events."""

    class Meta:
        model = Event
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    uri = Sequence(lambda n: f"https://api.calendly.com/scheduled_events/{generate_calendly_uuid()}")
    name = Faker("sentence", nb_words=3)
    start_time = LazyFunction(lambda: get_future_date(days_ahead_min=-30, days_ahead_max=30))
    end_time = LazyAttribute(lambda obj: obj.start_time + timedelta(minutes=30))
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=60))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 7)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    status = Faker("random_element", elements=["active", "canceled"])
    event_type_uri = LazyAttribute(lambda obj: CalendlyEventTypeFactory().uri)
    location_type = Faker("random_element", elements=["zoom", "google_meet", "phone_call", "physical", "custom"])
    location_value = LazyAttribute(
        lambda obj: Faker("url").evaluate(None, None, {"locale": None})
        if obj.location_type in ["zoom", "google_meet"]
        else Faker("address").evaluate(None, None, {"locale": None})
        if obj.location_type == "physical"
        else Faker("phone_number").evaluate(None, None, {"locale": None})
    )
    canceled_at = LazyAttribute(
        lambda obj: datetime.now() - timedelta(hours=random.randint(1, 48)) if obj.status == "canceled" else None
    )
    cancellation_reason = LazyAttribute(
        lambda obj: Faker("sentence").evaluate(None, None, {"locale": None}) if obj.status == "canceled" else None
    )
    _fivetran_deleted = False


class CalendlyEventInviteeFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Calendly event invitees."""

    class Meta:
        model = Invitee
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    uri = Sequence(
        lambda n: f"https://api.calendly.com/scheduled_events/{generate_calendly_uuid()}/invitees/{generate_calendly_uuid()}"
    )
    event_uri = LazyAttribute(lambda obj: CalendlyEventFactory().uri)
    name = Faker("name")
    email = Faker("email")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=60))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 7)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    status = Faker("random_element", elements=["active", "canceled"])
    timezone = Faker("timezone")
    canceled = Faker("boolean", chance_of_getting_true=10)
    cancellation_reason = LazyAttribute(
        lambda obj: Faker("sentence").evaluate(None, None, {"locale": None}) if obj.canceled else None
    )
    _fivetran_deleted = False


class CalendlyInviteeQuestionAnswerFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Calendly invitee question answers."""

    class Meta:
        model = InviteeQuestionAnswer
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    invitee_uri = LazyAttribute(lambda obj: CalendlyEventInviteeFactory().uri)
    question = Faker(
        "random_element",
        elements=[
            "What is the purpose of this meeting?",
            "How did you hear about us?",
            "What is your company name?",
            "What is your phone number?",
        ],
    )
    _fivetran_synced = LazyFunction(get_created_datetime)
    answer = Faker("sentence")
    _fivetran_deleted = False


class CalendlyEventMembershipFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Calendly event memberships."""

    class Meta:
        model = EventMembership
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    event_uri = LazyAttribute(lambda obj: CalendlyEventFactory().uri)
    user_uri = LazyAttribute(lambda obj: CalendlyUserFactory().uri)
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class CalendlyRoutingFormFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Calendly routing forms."""

    class Meta:
        model = RoutingForm
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    uri = Sequence(lambda n: f"https://api.calendly.com/routing_forms/{generate_calendly_uuid()}")
    name = Faker("sentence", nb_words=3)
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    updated_at = LazyFunction(get_created_datetime)
    _fivetran_synced = LazyFunction(get_created_datetime)
    status = Faker("random_element", elements=["active", "inactive", "archived"])
    _fivetran_deleted = False


class CalendlyRoutingFormSubmissionFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Calendly routing form submissions."""

    class Meta:
        model = RoutingFormSubmission
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    uri = Sequence(lambda n: f"https://api.calendly.com/routing_form_submissions/{generate_calendly_uuid()}")
    routing_form_uri = LazyAttribute(lambda obj: CalendlyRoutingFormFactory().uri)
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    submitter_email = Faker("email")
    result_event_type_uri = LazyAttribute(lambda obj: CalendlyEventTypeFactory().uri)
    _fivetran_deleted = False


class CalendlyWebhookSubscriptionFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Calendly webhook subscriptions."""

    class Meta:
        model = WebhookSubscription
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    uri = Sequence(lambda n: f"https://api.calendly.com/webhook_subscriptions/{generate_calendly_uuid()}")
    callback_url = Faker("url")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    updated_at = LazyFunction(get_created_datetime)
    _fivetran_synced = LazyFunction(get_created_datetime)
    state = Faker("random_element", elements=["active", "disabled"])
    scope = Faker("random_element", elements=["user", "organization"])
    signing_key = Faker("sha256")
    _fivetran_deleted = False
