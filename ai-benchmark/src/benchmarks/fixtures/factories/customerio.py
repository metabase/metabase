"""
Customer.io model factories for generating realistic marketing automation and customer messaging test data.
"""

import random
from datetime import timedelta

import factory
from factory.declarations import LazyAttribute, LazyFunction, Sequence
from factory.faker import Faker
from faker import Faker as FakerGen

from ..db import Session
from ..models.customerio import (
    Bounces,
    Campaign,
    CampaignAction,
    Clicks,
    Customer,
    Deliveries,
    Newsletter,
    Opens,
    SpamComplaints,
    Unsubscribes,
)
from ._shared_constants import (
    get_created_datetime,
    get_past_datetime,
)

fake = FakerGen()


class CustomerioCustomerFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Customer.io customers."""

    class Meta:
        model = Customer
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: f"cust_{n:08d}")
    email = Faker("email")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=730))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    unsubscribed = Faker("boolean", chance_of_getting_true=10)
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class CustomerioCampaignFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Customer.io campaigns."""

    class Meta:
        model = Campaign
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 1)
    name = Faker(
        "random_element",
        elements=[
            "Welcome Series",
            "Onboarding",
            "Re-engagement",
            "Upgrade Nudge",
            "Trial Expiration",
            "Feature Announcement",
        ],
    )
    type = Faker("random_element", elements=["email", "webhook", "push"])
    state = Faker("random_element", elements=["active", "draft", "paused", "archived"])
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    updated = LazyAttribute(lambda obj: obj.created + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class CustomerioCampaignActionFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Customer.io campaign actions."""

    class Meta:
        model = CampaignAction
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 1)
    campaign_id = LazyAttribute(lambda obj: CustomerioCampaignFactory().id)
    name = Faker("sentence", nb_words=3)
    type = Faker("random_element", elements=["email", "webhook", "push", "sms"])
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    updated = LazyAttribute(lambda obj: obj.created + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class CustomerioNewsletterFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Customer.io newsletters."""

    class Meta:
        model = Newsletter
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 1)
    name = Faker(
        "random_element",
        elements=["Weekly Digest", "Product Updates", "Monthly Newsletter", "Feature Announcements", "Company News"],
    )
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    updated = LazyAttribute(lambda obj: obj.created + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class CustomerioDeliveriesFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Customer.io deliveries."""

    class Meta:
        model = Deliveries
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    delivery_id = Sequence(lambda n: f"del_{n:08d}")
    customer_id = LazyAttribute(lambda obj: CustomerioCustomerFactory().id)
    campaign_id = LazyAttribute(lambda obj: CustomerioCampaignFactory().id)
    action_id = LazyAttribute(lambda obj: CustomerioCampaignActionFactory().id)
    newsletter_id = LazyAttribute(lambda obj: CustomerioNewsletterFactory().id if random.random() > 0.5 else None)
    subject = Faker("sentence")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class CustomerioBouncesFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Customer.io bounces."""

    class Meta:
        model = Bounces
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    delivery_id = LazyAttribute(lambda obj: CustomerioDeliveriesFactory().delivery_id)
    timestamp = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    bounce_type = Faker("random_element", elements=["hard", "soft", "technical"])
    reason = Faker("sentence")
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class CustomerioClicksFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Customer.io clicks."""

    class Meta:
        model = Clicks
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    delivery_id = LazyAttribute(lambda obj: CustomerioDeliveriesFactory().delivery_id)
    timestamp = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    link_url = Faker("url")
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class CustomerioOpensFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Customer.io opens."""

    class Meta:
        model = Opens
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    delivery_id = LazyAttribute(lambda obj: CustomerioDeliveriesFactory().delivery_id)
    timestamp = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class CustomerioSpamComplaintsFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Customer.io spam complaints."""

    class Meta:
        model = SpamComplaints
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    delivery_id = LazyAttribute(lambda obj: CustomerioDeliveriesFactory().delivery_id)
    timestamp = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class CustomerioUnsubscribesFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Customer.io unsubscribes."""

    class Meta:
        model = Unsubscribes
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    delivery_id = LazyAttribute(lambda obj: CustomerioDeliveriesFactory().delivery_id)
    customer_id = LazyAttribute(lambda obj: CustomerioCustomerFactory().id)
    timestamp = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False
