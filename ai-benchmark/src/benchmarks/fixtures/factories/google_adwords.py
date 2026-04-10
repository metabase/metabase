"""
Google Ads (AdWords) model factories for generating realistic advertising test data.
"""

import random
from datetime import timedelta
from decimal import Decimal

import factory
from factory.declarations import LazyAttribute, LazyFunction, Sequence
from factory.faker import Faker
from faker import Faker as FakerGen

from ..db import Session
from ..models.google_adwords import (
    Account,
    Ad,
    AdGroup,
    AdGroupStats,
    Budget,
    Campaign,
    CampaignStats,
    GeographicStats,
    Keyword,
    KeywordStats,
)
from ._shared_constants import (
    get_created_datetime,
    get_past_datetime,
)

fake = FakerGen()


class GoogleAdsAccountFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Google Ads accounts."""

    class Meta:
        model = Account
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: 1000000000 + n)
    _fivetran_synced = LazyFunction(get_created_datetime)
    name = Faker("company")
    currency_code = "USD"
    time_zone = Faker("timezone")
    auto_tagging_enabled = Faker("boolean", chance_of_getting_true=80)
    _fivetran_deleted = False


class GoogleAdsBudgetFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Google Ads budgets."""

    class Meta:
        model = Budget
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 1)
    _fivetran_synced = LazyFunction(get_created_datetime)
    name = Faker("sentence", nb_words=3)
    amount_micros = LazyFunction(lambda: random.randint(10000000, 500000000))  # $10 to $500
    delivery_method = Faker("random_element", elements=["STANDARD", "ACCELERATED"])
    period = Faker("random_element", elements=["DAILY", "MONTHLY", "ANNUAL"])
    _fivetran_deleted = False


class GoogleAdsCampaignFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Google Ads campaigns."""

    class Meta:
        model = Campaign
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 1)
    account_id = LazyAttribute(lambda obj: GoogleAdsAccountFactory().id)
    name = Faker(
        "random_element",
        elements=[
            "Brand Campaign",
            "Product Launch",
            "Seasonal Promotion",
            "Lead Generation",
            "Remarketing",
            "Competitor",
        ],
    )
    _fivetran_synced = LazyFunction(get_created_datetime)
    status = Faker("random_element", elements=["ENABLED", "PAUSED", "REMOVED"])
    serving_status = Faker("random_element", elements=["SERVING", "NOT_SERVING", "ENDED"])
    start_date = LazyFunction(lambda: (get_past_datetime(days_ago_min=30, days_ago_max=365)).date())
    end_date = LazyAttribute(
        lambda obj: obj.start_date + timedelta(days=random.randint(30, 180)) if random.random() > 0.7 else None
    )
    advertising_channel_type = Faker("random_element", elements=["SEARCH", "DISPLAY", "VIDEO", "SHOPPING"])
    budget_id = LazyAttribute(lambda obj: GoogleAdsBudgetFactory().id)
    _fivetran_deleted = False


class GoogleAdsAdGroupFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Google Ads ad groups."""

    class Meta:
        model = AdGroup
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 1)
    campaign_id = LazyAttribute(lambda obj: GoogleAdsCampaignFactory().id)
    name = Faker("catch_phrase")
    _fivetran_synced = LazyFunction(get_created_datetime)
    status = Faker("random_element", elements=["ENABLED", "PAUSED", "REMOVED"])
    type = Faker("random_element", elements=["STANDARD", "DISPLAY", "SEARCH_DYNAMIC_ADS"])
    cpc_bid_micros = LazyFunction(lambda: random.randint(500000, 5000000))  # $0.50 to $5.00
    _fivetran_deleted = False


class GoogleAdsCampaignStatsFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Google Ads campaign stats."""

    class Meta:
        model = CampaignStats
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    campaign_id = LazyAttribute(lambda obj: GoogleAdsCampaignFactory().id)
    date = LazyFunction(lambda: (get_past_datetime(days_ago_min=0, days_ago_max=90)).date())
    _fivetran_synced = LazyFunction(get_created_datetime)
    impressions = Faker("random_int", min=1000, max=50000)
    clicks = LazyAttribute(lambda obj: int(obj.impressions * random.uniform(0.02, 0.10)))
    cost_micros = LazyAttribute(lambda obj: obj.clicks * random.randint(500000, 3000000))
    conversions = LazyAttribute(
        lambda obj: Decimal(str(obj.clicks * random.uniform(0, 0.15))).quantize(Decimal("0.01"))
    )
    conversions_value = LazyAttribute(
        lambda obj: obj.conversions * Decimal(str(random.uniform(10, 100))).quantize(Decimal("0.01"))
    )
    views = Faker("random_int", min=0, max=5000)
    interactions = LazyAttribute(lambda obj: obj.clicks + random.randint(0, 100))
    _fivetran_deleted = False


class GoogleAdsGeographicStatsFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Google Ads geographic stats."""

    class Meta:
        model = GeographicStats
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    campaign_id = LazyAttribute(lambda obj: GoogleAdsCampaignFactory().id)
    date = LazyFunction(lambda: (get_past_datetime(days_ago_min=0, days_ago_max=90)).date())
    country_code = Faker("country_code")
    region_name = Faker("state")
    _fivetran_synced = LazyFunction(get_created_datetime)
    impressions = Faker("random_int", min=100, max=10000)
    clicks = LazyAttribute(lambda obj: int(obj.impressions * random.uniform(0.01, 0.08)))
    cost_micros = LazyAttribute(lambda obj: obj.clicks * random.randint(500000, 3000000))
    conversions = LazyAttribute(
        lambda obj: Decimal(str(obj.clicks * random.uniform(0, 0.12))).quantize(Decimal("0.01"))
    )
    _fivetran_deleted = False


class GoogleAdsAdFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Google Ads ads."""

    class Meta:
        model = Ad
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 1)
    ad_group_id = LazyAttribute(lambda obj: GoogleAdsAdGroupFactory().id)
    _fivetran_synced = LazyFunction(get_created_datetime)
    type = Faker("random_element", elements=["EXPANDED_TEXT_AD", "RESPONSIVE_SEARCH_AD", "IMAGE_AD"])
    status = Faker("random_element", elements=["ENABLED", "PAUSED", "REMOVED"])
    final_urls = LazyFunction(lambda: [fake.url() for _ in range(random.randint(1, 3))])
    _fivetran_deleted = False


class GoogleAdsAdGroupStatsFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Google Ads ad group stats."""

    class Meta:
        model = AdGroupStats
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    ad_group_id = LazyAttribute(lambda obj: GoogleAdsAdGroupFactory().id)
    date = LazyFunction(lambda: (get_past_datetime(days_ago_min=0, days_ago_max=90)).date())
    _fivetran_synced = LazyFunction(get_created_datetime)
    impressions = Faker("random_int", min=500, max=25000)
    clicks = LazyAttribute(lambda obj: int(obj.impressions * random.uniform(0.02, 0.10)))
    cost_micros = LazyAttribute(lambda obj: obj.clicks * random.randint(500000, 3000000))
    conversions = LazyAttribute(
        lambda obj: Decimal(str(obj.clicks * random.uniform(0, 0.15))).quantize(Decimal("0.01"))
    )
    conversions_value = LazyAttribute(
        lambda obj: obj.conversions * Decimal(str(random.uniform(10, 100))).quantize(Decimal("0.01"))
    )
    _fivetran_deleted = False


class GoogleAdsKeywordFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Google Ads keywords."""

    class Meta:
        model = Keyword
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: n + 1)
    ad_group_id = LazyAttribute(lambda obj: GoogleAdsAdGroupFactory().id)
    _fivetran_synced = LazyFunction(get_created_datetime)
    text_ = Faker("catch_phrase")
    match_type = Faker("random_element", elements=["EXACT", "PHRASE", "BROAD"])
    status = Faker("random_element", elements=["ENABLED", "PAUSED", "REMOVED"])
    cpc_bid_micros = LazyFunction(lambda: random.randint(500000, 5000000))
    _fivetran_deleted = False


class GoogleAdsKeywordStatsFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Google Ads keyword stats."""

    class Meta:
        model = KeywordStats
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    keyword_id = LazyAttribute(lambda obj: GoogleAdsKeywordFactory().id)
    date = LazyFunction(lambda: (get_past_datetime(days_ago_min=0, days_ago_max=90)).date())
    _fivetran_synced = LazyFunction(get_created_datetime)
    impressions = Faker("random_int", min=100, max=10000)
    clicks = LazyAttribute(lambda obj: int(obj.impressions * random.uniform(0.01, 0.10)))
    cost_micros = LazyAttribute(lambda obj: obj.clicks * random.randint(500000, 3000000))
    conversions = LazyAttribute(
        lambda obj: Decimal(str(obj.clicks * random.uniform(0, 0.15))).quantize(Decimal("0.01"))
    )
    _fivetran_deleted = False
