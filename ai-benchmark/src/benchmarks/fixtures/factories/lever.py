"""
Lever model factories for generating realistic recruiting/ATS test data.
"""

import random
from datetime import datetime, timedelta

import factory
from factory.declarations import LazyAttribute, LazyFunction, Sequence
from factory.faker import Faker
from faker import Faker as FakerGen

from ..db import Session
from ..models.lever import (
    Application,
    ArchiveReason,
    Feedback,
    Interview,
    Offer,
    Opportunity,
    Posting,
    Referral,
    Stage,
    User,
)
from ._shared_constants import (
    get_created_datetime,
    get_future_date,
    get_past_datetime,
)

fake = FakerGen()


def generate_lever_id(prefix: str, n: int) -> str:
    """Generate a Lever-style UUID-like ID."""
    import hashlib

    hash_part = hashlib.md5(f"{prefix}{n}".encode()).hexdigest()
    return f"{hash_part[:8]}-{hash_part[8:12]}-{hash_part[12:16]}-{hash_part[16:20]}-{hash_part[20:32]}"


class LeverUserFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Lever users (recruiters/hiring managers)."""

    class Meta:
        model = User
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_lever_id("usr", n))
    name = Faker("name")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=180, days_ago_max=730))
    _fivetran_synced = LazyFunction(get_created_datetime)
    email = Faker("company_email")
    deactivated_at = LazyFunction(
        lambda: get_past_datetime(days_ago_min=1, days_ago_max=30) if random.random() < 0.1 else None
    )
    _fivetran_deleted = False


class LeverStageFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Lever interview stages."""

    class Meta:
        model = Stage
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_lever_id("stg", n))
    text_ = Faker(
        "random_element",
        elements=["Applied", "Phone Screen", "Technical Interview", "Onsite", "Offer", "Hired", "Rejected"],
    )
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class LeverPostingFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Lever job postings."""

    class Meta:
        model = Posting
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_lever_id("post", n))
    text_ = Faker("job")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    state = Faker("random_element", elements=["published", "internal", "closed", "draft"])
    distribution_channels = LazyFunction(lambda: [fake.word() for _ in range(random.randint(1, 3))])
    location = Faker("city")
    categories_commitment = Faker("random_element", elements=["Full-time", "Part-time", "Contract", "Intern"])
    categories_department = Faker("random_element", elements=["Engineering", "Sales", "Marketing", "Operations"])
    categories_level = Faker("random_element", elements=["Junior", "Mid", "Senior", "Staff", "Principal"])
    categories_team = Faker("random_element", elements=["Frontend", "Backend", "Infrastructure", "Data"])
    _fivetran_deleted = False


class LeverOpportunityFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Lever opportunities (candidates)."""

    class Meta:
        model = Opportunity
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_lever_id("opp", n))
    name = Faker("name")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=180))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    headline = Faker("job")
    contact = Faker("name")
    emails = LazyFunction(lambda: [fake.email() for _ in range(random.randint(1, 2))])
    phones = LazyFunction(lambda: [fake.phone_number() for _ in range(random.randint(1, 2))])
    location = Faker("city")
    origin = Faker("random_element", elements=["referral", "agency", "sourced", "applied"])
    owner_id = LazyAttribute(lambda obj: LeverUserFactory().id)
    stage_id = LazyAttribute(lambda obj: LeverStageFactory().id)
    archived_at = LazyFunction(
        lambda: get_past_datetime(days_ago_min=1, days_ago_max=30) if random.random() < 0.2 else None
    )
    _fivetran_deleted = False


class LeverApplicationFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Lever applications."""

    class Meta:
        model = Application
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_lever_id("app", n))
    opportunity_id = LazyAttribute(lambda obj: LeverOpportunityFactory().id)
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=180))
    _fivetran_synced = LazyFunction(get_created_datetime)
    posting_id = LazyAttribute(lambda obj: LeverPostingFactory().id)
    type = Faker("random_element", elements=["referral", "posting", "sourced", "internal"])
    archived_at = LazyFunction(
        lambda: get_past_datetime(days_ago_min=1, days_ago_max=30) if random.random() < 0.15 else None
    )
    _fivetran_deleted = False


class LeverArchiveReasonFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Lever archive reasons."""

    class Meta:
        model = ArchiveReason
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_lever_id("arch", n))
    text_ = Faker("random_element", elements=["hired", "rejected", "withdrew", "duplicate"])
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class LeverInterviewFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Lever interviews."""

    class Meta:
        model = Interview
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_lever_id("int", n))
    opportunity_id = LazyAttribute(lambda obj: LeverOpportunityFactory().id)
    date = LazyFunction(lambda: get_future_date(days_ahead_min=-30, days_ahead_max=30))
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    posting_id = LazyAttribute(lambda obj: LeverPostingFactory().id if random.random() > 0.3 else None)
    stage_id = LazyAttribute(lambda obj: LeverStageFactory().id)
    subject = Faker(
        "random_element", elements=["Technical Screen", "Behavioral Interview", "System Design", "Onsite Interview"]
    )
    note = Faker("paragraph")
    timezone = Faker("timezone")
    duration = Faker("random_int", min=30, max=120)
    location = Faker("city")
    canceled_at = LazyFunction(
        lambda: datetime.now() - timedelta(hours=random.randint(1, 48)) if random.random() < 0.1 else None
    )
    _fivetran_deleted = False


class LeverOfferFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Lever offers."""

    class Meta:
        model = Offer
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_lever_id("off", n))
    opportunity_id = LazyAttribute(lambda obj: LeverOpportunityFactory().id)
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=60))
    _fivetran_synced = LazyFunction(get_created_datetime)
    posting_id = LazyAttribute(lambda obj: LeverPostingFactory().id if random.random() > 0.2 else None)
    creator_id = LazyAttribute(lambda obj: LeverUserFactory().id)
    status = Faker("random_element", elements=["pending", "approved", "sent", "accepted", "declined"])
    sent_at = LazyAttribute(
        lambda obj: obj.created_at + timedelta(days=random.randint(1, 5))
        if obj.status in ["sent", "accepted", "declined"]
        else None
    )
    approved_at = LazyAttribute(
        lambda obj: obj.created_at + timedelta(hours=random.randint(1, 24))
        if obj.status in ["approved", "sent", "accepted", "declined"]
        else None
    )
    signed_at = LazyAttribute(
        lambda obj: obj.sent_at + timedelta(days=random.randint(1, 7))
        if obj.status == "accepted" and obj.sent_at
        else None
    )
    _fivetran_deleted = False


class LeverReferralFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Lever referrals."""

    class Meta:
        model = Referral
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_lever_id("ref", n))
    opportunity_id = LazyAttribute(lambda obj: LeverOpportunityFactory().id)
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=180))
    _fivetran_synced = LazyFunction(get_created_datetime)
    referrer_user_id = LazyAttribute(lambda obj: LeverUserFactory().id)
    type = Faker("random_element", elements=["internal", "external", "agency"])
    _fivetran_deleted = False


class LeverFeedbackFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Lever feedback."""

    class Meta:
        model = Feedback
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_lever_id("fb", n))
    opportunity_id = LazyAttribute(lambda obj: LeverOpportunityFactory().id)
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    interview_id = LazyAttribute(lambda obj: LeverInterviewFactory().id if random.random() > 0.2 else None)
    author_id = LazyAttribute(lambda obj: LeverUserFactory().id)
    text_ = Faker("paragraph")
    completed_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=5))
    deleted_at = LazyFunction(
        lambda: get_past_datetime(days_ago_min=1, days_ago_max=10) if random.random() < 0.05 else None
    )
    _fivetran_deleted = False
