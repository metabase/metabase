"""
Stripe model factories for generating realistic test data.

These factories generate realistic payment and subscription data
following Stripe's data conventions.
"""

import random
from datetime import timedelta

import factory
from factory.declarations import LazyAttribute, LazyFunction, Sequence
from factory.faker import Faker
from faker import Faker as FakerGen

from ..db import Session
from ..models.stripe import (
    Charge,
    Customer,
    Invoice,
    PaymentIntent,
    PaymentMethod,
    Plan,
    Product,
    Refund,
    Subscription,
    SubscriptionItem,
)
from ._shared_constants import (
    get_created_datetime,
    get_old_datetime,
    get_past_datetime,
)

fake = FakerGen()


def generate_stripe_id(prefix: str, n: int) -> str:
    """Generate a Stripe-style ID (e.g., cus_xxxxx, sub_xxxxx)."""
    import hashlib

    hash_part = hashlib.md5(str(n).encode()).hexdigest()[:24]
    return f"{prefix}_{hash_part}"


class StripeCustomerFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Stripe customers."""

    class Meta:
        model = Customer
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_stripe_id("cus", n))
    email = Faker("company_email")
    name = Faker("name")
    description = LazyAttribute(lambda obj: f"Customer for {obj.email}")
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=730))
    balance = LazyFunction(lambda: random.choice([0, 0, 0, -random.randint(1000, 50000)]))  # Usually 0
    currency = Faker("random_element", elements=["usd", "eur", "gbp", "cad", "aud"])
    delinquent = LazyAttribute(lambda obj: obj.balance < 0)
    default_source = LazyFunction(
        lambda: generate_stripe_id("pm", random.randint(0, 999999)) if random.random() < 0.6 else None
    )
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class StripeProductFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Stripe products."""

    class Meta:
        model = Product
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_stripe_id("prod", n))
    name = Faker(
        "random_element",
        elements=[
            "Starter Plan",
            "Professional Plan",
            "Enterprise Plan",
            "Basic Subscription",
            "Premium Subscription",
            "Monthly Membership",
            "Annual Membership",
        ],
    )
    description = LazyAttribute(lambda obj: f"{obj.name} - {fake.catch_phrase()}")
    active = Faker("random_element", elements=[True, True, True, False])  # Mostly active
    created = LazyFunction(lambda: get_old_datetime())
    updated = LazyAttribute(lambda obj: obj.created + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class StripePlanFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Stripe plans (pricing tiers)."""

    class Meta:
        model = Plan
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_stripe_id("plan", n))
    product_id = LazyAttribute(lambda obj: StripeProductFactory().id)
    amount = Faker(
        "random_element",
        elements=[
            999,
            1999,
            2999,
            4999,
            9999,
            19999,
            29999,
            49999,  # Common SaaS prices in cents
        ],
    )
    currency = Faker("random_element", elements=["usd", "eur", "gbp", "cad", "aud"])
    interval = Faker("random_element", elements=["day", "week", "month", "year"])
    interval_count = LazyAttribute(lambda obj: 1 if obj.interval != "month" else random.choice([1, 1, 1, 3, 6, 12]))
    nickname = LazyAttribute(lambda obj: f"{obj.interval.title()} Plan")
    active = True
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=180, days_ago_max=730))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class StripeSubscriptionFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Stripe subscriptions."""

    class Meta:
        model = Subscription
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_stripe_id("sub", n))
    customer_id = LazyAttribute(lambda obj: StripeCustomerFactory().id)
    status = Faker(
        "random_element",
        elements=["active", "active", "active", "trialing", "past_due", "canceled"],
    )
    current_period_start = LazyFunction(lambda: get_past_datetime(days_ago_min=1, days_ago_max=30))
    current_period_end = LazyAttribute(lambda obj: obj.current_period_start + timedelta(days=30))
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    cancel_at_period_end = LazyAttribute(
        lambda obj: obj.status in ["canceled", "active"] and random.choice([True, False, False, False])
    )
    canceled_at = LazyAttribute(
        lambda obj: get_past_datetime(days_ago_min=1, days_ago_max=30) if obj.status == "canceled" else None
    )
    ended_at = LazyAttribute(
        lambda obj: obj.canceled_at + timedelta(days=random.randint(1, 30))
        if obj.status == "canceled" and obj.canceled_at
        else None
    )
    billing_cycle_anchor = LazyAttribute(lambda obj: obj.created)
    trial_start = LazyAttribute(lambda obj: obj.created if obj.status == "trialing" else None)
    trial_end = LazyAttribute(lambda obj: obj.created + timedelta(days=14) if obj.trial_start else None)
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class StripeSubscriptionItemFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Stripe subscription items."""

    class Meta:
        model = SubscriptionItem
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_stripe_id("si", n))
    subscription_id = LazyAttribute(lambda obj: StripeSubscriptionFactory().id)
    plan_id = LazyAttribute(lambda obj: StripePlanFactory().id)
    quantity = Faker("random_element", elements=[1, 1, 1, 5, 10, 25, 50, 100])
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class StripeInvoiceFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Stripe invoices."""

    class Meta:
        model = Invoice
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_stripe_id("in", n))
    customer_id = LazyAttribute(lambda obj: StripeCustomerFactory().id)
    subscription_id = LazyAttribute(lambda obj: StripeSubscriptionFactory().id)
    status = Faker(
        "random_element",
        elements=["paid", "paid", "paid", "open", "void", "uncollectible"],
    )
    amount_due = LazyFunction(lambda: random.randint(999, 49999))
    amount_paid = LazyAttribute(lambda obj: obj.amount_due if obj.status == "paid" else 0)
    amount_remaining = LazyAttribute(lambda obj: 0 if obj.status == "paid" else obj.amount_due - obj.amount_paid)
    currency = Faker("random_element", elements=["usd", "eur", "gbp", "cad", "aud"])
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=365))
    due_date = LazyAttribute(lambda obj: obj.created + timedelta(days=7))
    paid = LazyAttribute(lambda obj: obj.status == "paid")
    attempted = LazyAttribute(lambda obj: obj.status != "open")
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class StripePaymentIntentFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Stripe payment intents."""

    class Meta:
        model = PaymentIntent
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_stripe_id("pi", n))
    customer_id = LazyAttribute(lambda obj: StripeCustomerFactory().id)
    amount = LazyFunction(lambda: random.randint(999, 99999))
    currency = Faker("random_element", elements=["usd", "eur", "gbp", "cad", "aud"])
    status = Faker(
        "random_element",
        elements=["succeeded", "succeeded", "succeeded", "pending", "failed", "canceled", "requires_action"],
    )
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=180))
    canceled_at = LazyAttribute(
        lambda obj: get_past_datetime(days_ago_min=1, days_ago_max=30) if obj.status == "canceled" else None
    )
    cancellation_reason = LazyAttribute(
        lambda obj: random.choice(["duplicate", "fraudulent", "requested_by_customer", "abandoned"])
        if obj.status == "canceled"
        else None
    )
    description = LazyAttribute(lambda obj: f"Payment for {obj.customer_id}")
    receipt_email = Faker("company_email")
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class StripeChargeFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Stripe charges."""

    class Meta:
        model = Charge
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_stripe_id("ch", n))
    customer_id = LazyAttribute(lambda obj: StripeCustomerFactory().id)
    amount = LazyFunction(lambda: random.randint(999, 99999))
    currency = Faker("random_element", elements=["usd", "eur", "gbp", "cad", "aud"])
    status = Faker(
        "random_element",
        elements=["succeeded", "succeeded", "succeeded", "failed"],
    )
    amount_refunded = LazyAttribute(
        lambda obj: random.randint(100, 10000) if obj.status == "succeeded" and random.random() < 0.25 else 0
    )
    paid = LazyAttribute(lambda obj: obj.status == "succeeded")
    refunded = LazyAttribute(lambda obj: obj.amount_refunded > 0)
    captured = LazyAttribute(lambda obj: obj.status == "succeeded")
    description = LazyAttribute(lambda obj: f"Charge for {obj.customer_id}")
    receipt_email = Faker("company_email")
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=180))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class StripePaymentMethodFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Stripe payment methods."""

    class Meta:
        model = PaymentMethod
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_stripe_id("pm", n))
    customer_id = LazyAttribute(lambda obj: StripeCustomerFactory().id)
    type = Faker("random_element", elements=["card", "us_bank_account", "sepa_debit"])
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=730))
    card_brand = LazyAttribute(
        lambda obj: random.choice(["visa", "mastercard", "amex", "discover"]) if obj.type == "card" else None
    )
    card_last4 = LazyAttribute(lambda obj: str(random.randint(1000, 9999)) if obj.type == "card" else None)
    card_exp_month = LazyAttribute(lambda obj: random.randint(1, 12) if obj.type == "card" else None)
    card_exp_year = LazyAttribute(lambda obj: random.randint(2024, 2030) if obj.type == "card" else None)
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class StripeRefundFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Stripe refunds."""

    class Meta:
        model = Refund
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_stripe_id("re", n))
    charge_id = LazyAttribute(lambda obj: StripeChargeFactory().id)
    amount = LazyFunction(lambda: random.randint(500, 50000))
    currency = Faker("random_element", elements=["usd", "eur", "gbp", "cad", "aud"])
    status = "succeeded"
    reason = Faker("random_element", elements=["requested_by_customer", "duplicate", "fraudulent", None, None])
    created = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False
