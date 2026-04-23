"""
Salesforce model factories for generating realistic test data.

These factories use Faker to generate realistic data that follows
Salesforce conventions.
"""

import random
from datetime import timedelta

import factory
from factory.declarations import LazyAttribute, LazyFunction, Sequence
from factory.faker import Faker
from faker import Faker as FakerGen

from ..db import Session
from ..models.salesforce import (
    Account,
    Campaign,
    Case,
    Contact,
    Event,
    Lead,
    Opportunity,
    OpportunityHistory,
    Task,
    User,
)
from ._shared_constants import (
    DATA_END_DATE,
    get_created_datetime,
    get_date_relative_to,
    get_past_date,
    get_past_datetime,
    get_random_datetime_within_range,
)

fake = FakerGen()


def generate_sf_id(prefix: str, n: int) -> str:
    """Generate a Salesforce-style 18-character ID."""
    return f"{prefix}{str(n).zfill(15)}"


class SalesforceUserFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Salesforce users."""

    class Meta:
        model = User
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_sf_id("005", n))
    username = Faker("user_name")
    email = Faker("company_email")
    first_name = Faker("first_name")
    last_name = Faker("last_name")
    is_active = True
    user_role_id = None
    profile_id = None
    created_date = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    last_modified_date = LazyAttribute(lambda obj: obj.created_date + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class SalesforceAccountFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Salesforce accounts (companies)."""

    class Meta:
        model = Account
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_sf_id("001", n))
    name = Faker("company")
    type = Faker("random_element", elements=["Customer", "Prospect", "Partner", "Vendor"])
    industry = Faker(
        "random_element",
        elements=[
            "Technology",
            "Financial Services",
            "Healthcare",
            "Manufacturing",
            "Retail",
            "Education",
            "Telecommunications",
            "Media",
            "Energy",
            "Consulting",
        ],
    )
    annual_revenue = LazyFunction(lambda: fake.random_int(min=100000, max=100000000))
    number_of_employees = LazyFunction(lambda: fake.random_int(min=10, max=10000))
    owner_id = LazyAttribute(lambda obj: SalesforceUserFactory().id)
    created_date = LazyFunction(lambda: get_past_datetime(days_ago_min=90, days_ago_max=730))
    last_modified_date = LazyAttribute(lambda obj: obj.created_date + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    is_deleted = False
    _fivetran_deleted = False


class SalesforceContactFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Salesforce contacts (people)."""

    class Meta:
        model = Contact
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_sf_id("003", n))
    account_id = LazyAttribute(lambda obj: SalesforceAccountFactory().id)
    first_name = Faker("first_name")
    last_name = Faker("last_name")
    email = Faker("company_email")
    phone = Faker("phone_number")
    title = Faker("job")
    owner_id = LazyAttribute(lambda obj: SalesforceUserFactory().id)
    created_date = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    last_modified_date = LazyAttribute(lambda obj: obj.created_date + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    is_deleted = False
    _fivetran_deleted = False


class SalesforceLeadFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Salesforce leads."""

    class Meta:
        model = Lead
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_sf_id("00Q", n))
    first_name = Faker("first_name")
    last_name = Faker("last_name")
    email = Faker("company_email")
    company = Faker("company")
    status = Faker(
        "random_element",
        elements=["Open - Not Contacted", "Working - Contacted", "Nurturing", "Qualified", "Unqualified", "Converted"],
    )
    source = Faker(
        "random_element",
        elements=[
            "Web",
            "Phone Inquiry",
            "Partner Referral",
            "Purchased List",
            "Other",
            "Employee Referral",
            "External Referral",
            "Trade Show",
            "Web Download",
            "Web Research",
        ],
    )
    rating = Faker("random_element", elements=["Hot", "Warm", "Cold"])
    is_converted = LazyFunction(lambda: fake.boolean(chance_of_getting_true=25))
    converted_date = LazyAttribute(
        lambda obj: get_date_relative_to(obj.created_date.date(), days_offset_min=0, days_offset_max=60)
        if obj.is_converted
        else None
    )
    converted_account_id = LazyAttribute(lambda obj: SalesforceAccountFactory().id if obj.is_converted else None)
    converted_contact_id = LazyAttribute(lambda obj: SalesforceContactFactory().id if obj.is_converted else None)
    converted_opportunity_id = LazyAttribute(
        lambda obj: generate_sf_id("006", random.randint(100000, 999999)) if obj.is_converted else None
    )
    owner_id = LazyAttribute(lambda obj: SalesforceUserFactory().id)
    created_date = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=180))
    last_modified_date = LazyAttribute(lambda obj: obj.created_date + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class SalesforceOpportunityFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Salesforce opportunities (deals)."""

    class Meta:
        model = Opportunity
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_sf_id("006", n))
    account_id = LazyAttribute(lambda obj: SalesforceAccountFactory().id)
    name = LazyAttribute(lambda obj: f"{fake.company()} - {fake.random_element(['New Business', 'Upsell', 'Renewal'])}")
    stage_name = Faker(
        "random_element",
        elements=[
            "Prospecting",
            "Qualification",
            "Needs Analysis",
            "Value Proposition",
            "Proposal/Price Quote",
            "Negotiation/Review",
            "Closed Won",
            "Closed Lost",
        ],
    )
    amount = LazyFunction(lambda: fake.random_int(min=5000, max=500000))
    probability = LazyAttribute(
        lambda obj: {
            "Prospecting": 10,
            "Qualification": 20,
            "Needs Analysis": 40,
            "Value Proposition": 60,
            "Proposal/Price Quote": 75,
            "Negotiation/Review": 90,
            "Closed Won": 100,
            "Closed Lost": 0,
        }.get(obj.stage_name, 50)
    )
    created_date = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=180))
    close_date = LazyAttribute(
        lambda obj: get_date_relative_to(obj.created_date.date(), days_offset_min=-30, days_offset_max=90)
    )
    type = Faker(
        "random_element",
        elements=[
            "New Business",
            "Existing Customer - Upgrade",
            "Existing Customer - Replacement",
            "Existing Customer - Downgrade",
        ],
    )
    lead_source = Faker(
        "random_element",
        elements=[
            "Web",
            "Phone Inquiry",
            "Partner Referral",
            "Purchased List",
            "Other",
            "Employee Referral",
            "External Referral",
            "Trade Show",
            "Web Download",
            "Web Research",
        ],
    )
    is_closed = LazyAttribute(lambda obj: obj.stage_name in ["Closed Won", "Closed Lost"])
    is_won = LazyAttribute(lambda obj: obj.stage_name == "Closed Won")
    owner_id = LazyAttribute(lambda obj: SalesforceUserFactory().id)
    last_modified_date = LazyAttribute(lambda obj: obj.created_date + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class SalesforceCaseFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Salesforce cases (support tickets)."""

    class Meta:
        model = Case
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_sf_id("500", n))
    account_id = LazyAttribute(lambda obj: SalesforceAccountFactory().id)
    contact_id = LazyAttribute(lambda obj: SalesforceContactFactory().id)
    subject = Faker("sentence", nb_words=6)
    status = Faker("random_element", elements=["New", "Working", "Escalated", "Closed"])
    priority = Faker("random_element", elements=["Low", "Medium", "High", "Critical"])
    origin = Faker("random_element", elements=["Web", "Email", "Phone", "Chat"])
    type = Faker("random_element", elements=["Question", "Problem", "Feature Request", "Bug"])
    is_closed = LazyAttribute(lambda obj: obj.status == "Closed")
    closed_date = LazyAttribute(lambda obj: get_created_datetime() if obj.is_closed else None)
    owner_id = LazyAttribute(lambda obj: SalesforceUserFactory().id)
    created_date = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class SalesforceCampaignFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Salesforce marketing campaigns."""

    class Meta:
        model = Campaign
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_sf_id("701", n))
    name = LazyFunction(
        lambda: f"{fake.random_element(['Q1', 'Q2', 'Q3', 'Q4'])} {fake.year()} - {fake.catch_phrase()}"
    )
    type = Faker(
        "random_element", elements=["Email", "Webinar", "Conference", "Trade Show", "Content Marketing", "Partner"]
    )
    status = Faker("random_element", elements=["Planned", "In Progress", "Completed", "Aborted"])
    start_date = LazyFunction(lambda: get_past_date(days_ago_min=0, days_ago_max=180))
    end_date = LazyAttribute(lambda obj: obj.start_date + timedelta(days=random.randint(7, 90)))
    budgeted_cost = LazyFunction(lambda: fake.random_int(min=5000, max=100000))
    actual_cost = LazyAttribute(
        lambda obj: obj.budgeted_cost * random.uniform(0.7, 1.2) if obj.status == "Completed" else None
    )
    expected_revenue = LazyFunction(lambda: fake.random_int(min=50000, max=500000))
    owner_id = LazyAttribute(lambda obj: SalesforceUserFactory().id)
    created_date = LazyFunction(lambda: get_past_datetime(days_ago_min=90, days_ago_max=365))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class SalesforceTaskFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Salesforce tasks."""

    class Meta:
        model = Task
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_sf_id("00T", n))
    who_id = LazyAttribute(lambda obj: SalesforceContactFactory().id)
    what_id = LazyAttribute(
        lambda obj: random.choice([SalesforceAccountFactory().id, SalesforceOpportunityFactory().id])
    )
    subject = Faker("sentence", nb_words=5)
    status = Faker("random_element", elements=["Not Started", "In Progress", "Completed", "Deferred"])
    priority = Faker("random_element", elements=["Low", "Normal", "High"])
    activity_date = LazyFunction(lambda: get_date_relative_to(DATA_END_DATE, days_offset_min=-7, days_offset_max=14))
    is_closed = LazyAttribute(lambda obj: obj.status in ["Completed", "Deferred"])
    owner_id = LazyAttribute(lambda obj: SalesforceUserFactory().id)
    created_date = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=30))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class SalesforceEventFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Salesforce events (meetings/calls)."""

    class Meta:
        model = Event
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_sf_id("00U", n))
    who_id = LazyAttribute(lambda obj: SalesforceContactFactory().id)
    what_id = LazyAttribute(
        lambda obj: random.choice([SalesforceAccountFactory().id, SalesforceOpportunityFactory().id])
    )
    subject = Faker("random_element", elements=["Call", "Meeting", "Demo", "Follow-up", "Presentation"])
    start_date_time = LazyFunction(lambda: get_random_datetime_within_range())
    end_date_time = LazyAttribute(lambda obj: obj.start_date_time + timedelta(minutes=random.choice([15, 30, 60, 90])))
    duration_in_minutes = LazyAttribute(
        lambda obj: int((obj.end_date_time - obj.start_date_time).total_seconds() / 60) if obj.end_date_time else None
    )
    owner_id = LazyAttribute(lambda obj: SalesforceUserFactory().id)
    created_date = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=30))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class SalesforceOpportunityHistoryFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Salesforce opportunity history (stage changes)."""

    class Meta:
        model = OpportunityHistory
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_sf_id("008", n))
    opportunity_id = LazyAttribute(lambda obj: SalesforceOpportunityFactory().id)
    stage_name = Faker(
        "random_element",
        elements=[
            "Prospecting",
            "Qualification",
            "Needs Analysis",
            "Value Proposition",
            "Proposal/Price Quote",
            "Negotiation/Review",
            "Closed Won",
            "Closed Lost",
        ],
    )
    amount = LazyFunction(lambda: fake.random_int(min=5000, max=500000))
    probability = LazyAttribute(
        lambda obj: {
            "Prospecting": 10,
            "Qualification": 20,
            "Needs Analysis": 40,
            "Value Proposition": 60,
            "Proposal/Price Quote": 75,
            "Negotiation/Review": 90,
            "Closed Won": 100,
            "Closed Lost": 0,
        }.get(obj.stage_name, 50)
    )
    created_date = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False
