"""
LinkedIn Ads model factories for generating realistic B2B advertising test data.
"""

import random
from datetime import date, timedelta
from decimal import Decimal

import factory
from factory.declarations import LazyAttribute, LazyFunction, Sequence
from factory.faker import Faker
from faker import Faker as FakerGen

from ..db import Session
from ..models.linkedin_ads import (
    Account,
    AccountUser,
    AdAnalyticsByCampaign,
    AdAnalyticsByCreative,
    Campaign,
    CampaignDemographics,
    CampaignGroup,
    Conversion,
    Creative,
)
from ._shared_constants import (
    get_created_datetime,
    get_future_date,
    get_past_datetime,
)

fake = FakerGen()


class LinkedInAdsAccountFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for LinkedIn Ads accounts."""

    class Meta:
        model = Account
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 500000000)
    name = Faker("company")
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=365, days_ago_max=1095))
    last_modified_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    type = Faker("random_element", elements=["BUSINESS", "ENTERPRISE"])
    status = Faker("random_element", elements=["ACTIVE", "DRAFT", "CANCELED"])
    currency = "USD"
    _fivetran_deleted = False


class LinkedInAdsAccountUserFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for LinkedIn Ads account users."""

    class Meta:
        model = AccountUser
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    account_id = LazyAttribute(lambda obj: LinkedInAdsAccountFactory().id)
    user_person_id = Sequence(lambda n: f"person_{n + 1000000}")
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=180, days_ago_max=730))
    _fivetran_synced = LazyFunction(get_created_datetime)
    role = Faker("random_element", elements=["ACCOUNT_MANAGER", "CAMPAIGN_MANAGER", "CREATIVE_MANAGER", "VIEWER"])
    _fivetran_deleted = False


class LinkedInAdsCampaignGroupFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for LinkedIn Ads campaign groups."""

    class Meta:
        model = CampaignGroup
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 100000000)
    account_id = LazyAttribute(lambda obj: LinkedInAdsAccountFactory().id)
    name = Faker(
        "random_element",
        elements=[
            "Q1 Lead Gen",
            "Brand Awareness",
            "Product Launch",
            "Webinar Promotion",
            "Retargeting",
            "Thought Leadership",
        ],
    )
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=90, days_ago_max=365))
    last_modified_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    status = Faker("random_element", elements=["ACTIVE", "PAUSED", "ARCHIVED"])
    run_schedule_start = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=180))
    run_schedule_end = LazyFunction(lambda: get_future_date(days_ahead_min=30, days_ahead_max=180))
    total_budget_amount = LazyFunction(lambda: Decimal(str(random.randint(5000, 50000))))
    total_budget_currency = "USD"
    _fivetran_deleted = False


class LinkedInAdsConversionFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for LinkedIn Ads conversions."""

    class Meta:
        model = Conversion
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 700000000)
    account_id = LazyAttribute(lambda obj: LinkedInAdsAccountFactory().id)
    name = Faker(
        "random_element",
        elements=[
            "Form Submission",
            "Download Whitepaper",
            "Request Demo",
            "Newsletter Signup",
            "Webinar Registration",
            "Contact Sales",
        ],
    )
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=180, days_ago_max=730))
    last_modified_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    type = Faker("random_element", elements=["LEAD_GENERATION", "DOWNLOAD", "PURCHASE", "SIGNUP"])
    _fivetran_deleted = False


class LinkedInAdsCampaignFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for LinkedIn Ads campaigns."""

    class Meta:
        model = Campaign
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 200000000)
    campaign_group_id = LazyAttribute(lambda obj: LinkedInAdsCampaignGroupFactory().id)
    name = Faker("catch_phrase")
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    last_modified_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    type = Faker("random_element", elements=["SPONSORED_UPDATES", "TEXT_ADS", "SPONSORED_INMAILS"])
    status = Faker("random_element", elements=["ACTIVE", "PAUSED", "ARCHIVED", "COMPLETED"])
    cost_type = Faker("random_element", elements=["CPM", "CPC"])
    daily_budget_amount = LazyFunction(lambda: Decimal(str(random.randint(50, 500))))
    daily_budget_currency = "USD"
    unit_cost_amount = LazyFunction(lambda: Decimal(str(random.uniform(2.0, 15.0))).quantize(Decimal("0.01")))
    objective_type = Faker(
        "random_element", elements=["BRAND_AWARENESS", "WEBSITE_VISITS", "ENGAGEMENT", "VIDEO_VIEWS", "LEAD_GENERATION"]
    )
    _fivetran_deleted = False


class LinkedInAdsAdAnalyticsByCampaignFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for LinkedIn ad analytics by campaign."""

    class Meta:
        model = AdAnalyticsByCampaign
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    campaign_id = LazyAttribute(lambda obj: LinkedInAdsCampaignFactory().id)
    day = LazyFunction(lambda: date.today() - timedelta(days=random.randint(0, 90)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    impressions = Faker("random_int", min=500, max=20000)
    clicks = LazyAttribute(lambda obj: int(obj.impressions * random.uniform(0.008, 0.06)))
    cost_in_local_currency = LazyAttribute(
        lambda obj: Decimal(str(obj.clicks * random.uniform(2.0, 8.0))).quantize(Decimal("0.01"))
    )
    external_website_conversions = LazyAttribute(lambda obj: int(obj.clicks * random.uniform(0, 0.12)))
    external_website_post_click_conversions = LazyAttribute(
        lambda obj: int(obj.external_website_conversions * random.uniform(0.6, 0.8))
    )
    external_website_post_view_conversions = LazyAttribute(
        lambda obj: int(obj.external_website_conversions * random.uniform(0.2, 0.4))
    )
    video_views = LazyAttribute(lambda obj: int(obj.impressions * random.uniform(0.05, 0.20)))
    leads = LazyAttribute(lambda obj: int(obj.clicks * random.uniform(0, 0.15)))
    _fivetran_deleted = False


class LinkedInAdsCampaignDemographicsFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for LinkedIn campaign demographics."""

    class Meta:
        model = CampaignDemographics
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    campaign_id = LazyAttribute(lambda obj: LinkedInAdsCampaignFactory().id)
    day = LazyFunction(lambda: date.today() - timedelta(days=random.randint(0, 90)))
    country = Faker("random_element", elements=["US", "CA", "GB", "DE", "FR", "IN", "AU", "JP"])
    seniority = Faker("random_element", elements=["ENTRY", "SENIOR", "MANAGER", "DIRECTOR", "VP", "CXO"])
    job_function = Faker(
        "random_element", elements=["ENGINEERING", "MARKETING", "SALES", "OPERATIONS", "FINANCE", "HR", "IT"]
    )
    _fivetran_synced = LazyFunction(get_created_datetime)
    impressions = Faker("random_int", min=50, max=2000)
    clicks = LazyAttribute(lambda obj: int(obj.impressions * random.uniform(0.008, 0.06)))
    cost_in_local_currency = LazyAttribute(
        lambda obj: Decimal(str(obj.clicks * random.uniform(2.0, 8.0))).quantize(Decimal("0.01"))
    )
    _fivetran_deleted = False


class LinkedInAdsCreativeFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for LinkedIn Ads creatives."""

    class Meta:
        model = Creative
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 300000000)
    campaign_id = LazyAttribute(lambda obj: LinkedInAdsCampaignFactory().id)
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    last_modified_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    status = Faker("random_element", elements=["ACTIVE", "PAUSED", "ARCHIVED"])
    _fivetran_deleted = False


class LinkedInAdsAdAnalyticsByCreativeFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for LinkedIn ad analytics by creative."""

    class Meta:
        model = AdAnalyticsByCreative
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    creative_id = LazyAttribute(lambda obj: LinkedInAdsCreativeFactory().id)
    day = LazyFunction(lambda: date.today() - timedelta(days=random.randint(0, 90)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    impressions = Faker("random_int", min=150, max=7000)
    clicks = LazyAttribute(lambda obj: int(obj.impressions * random.uniform(0.005, 0.05)))
    cost_in_local_currency = LazyAttribute(
        lambda obj: Decimal(str(obj.clicks * random.uniform(2.0, 8.0))).quantize(Decimal("0.01"))
    )
    external_website_conversions = LazyAttribute(lambda obj: int(obj.clicks * random.uniform(0, 0.10)))
    video_views = LazyAttribute(lambda obj: int(obj.impressions * random.uniform(0.05, 0.20)))
    leads = LazyAttribute(lambda obj: int(obj.clicks * random.uniform(0, 0.12)))
    _fivetran_deleted = False
