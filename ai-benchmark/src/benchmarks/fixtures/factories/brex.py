"""
Brex model factories for generating realistic corporate card and expense test data.
"""

import random
from datetime import datetime, timedelta
from decimal import Decimal

import factory
from factory.declarations import LazyAttribute, LazyFunction, Sequence
from factory.faker import Faker
from faker import Faker as FakerGen

from ..db import Session
from ..models.brex import (
    Account,
    Card,
    Department,
    Expense,
    Receipt,
    Statement,
    Transaction,
    Transfer,
    User,
)
from ._shared_constants import (
    get_created_datetime,
    get_past_datetime,
)

fake = FakerGen()


class BrexAccountFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Brex accounts."""

    class Meta:
        model = Account
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: f"acct_{n:08d}")
    name = Faker("company")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=365, days_ago_max=1095))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    status = Faker("random_element", elements=["active", "inactive", "suspended"])
    current_balance = LazyFunction(lambda: Decimal(str(random.uniform(1000, 100000))).quantize(Decimal("0.01")))
    available_balance = LazyFunction(lambda: Decimal(str(random.uniform(1000, 100000))).quantize(Decimal("0.01")))
    currency = "USD"
    _fivetran_deleted = False


class BrexDepartmentFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Brex departments."""

    class Meta:
        model = Department
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: f"dept_{n:08d}")
    name = Faker(
        "random_element",
        elements=[
            "Engineering",
            "Sales",
            "Marketing",
            "Operations",
            "Finance",
            "HR",
            "Product",
            "Customer Success",
            "Legal",
            "IT",
        ],
    )
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=365, days_ago_max=1095))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    description = Faker("sentence")
    _fivetran_deleted = False


class BrexUserFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Brex users."""

    class Meta:
        model = User
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: f"usr_{n:08d}")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=180, days_ago_max=730))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    first_name = Faker("first_name")
    last_name = Faker("last_name")
    email = Faker("company_email")
    status = Faker("random_element", elements=["active", "inactive", "suspended"])
    _fivetran_deleted = False


class BrexCardFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Brex cards."""

    class Meta:
        model = Card
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: f"card_{n:08d}")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    owner_user_id = LazyAttribute(lambda obj: BrexUserFactory().id)
    last_four = Faker("numerify", text="####")
    card_name = Faker("word")
    status = Faker("random_element", elements=["active", "inactive", "frozen", "cancelled"])
    card_type = Faker("random_element", elements=["physical", "virtual"])
    limit_amount = LazyFunction(lambda: Decimal(str(random.choice([1000, 2500, 5000, 10000, 25000]))))
    currency = "USD"
    _fivetran_deleted = False


class BrexStatementFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Brex statements."""

    class Meta:
        model = Statement
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: f"stmt_{n:08d}")
    account_id = LazyAttribute(lambda obj: BrexAccountFactory().id)
    start_date = LazyFunction(lambda: (datetime.now().replace(day=1) - timedelta(days=random.randint(0, 365))).date())
    end_date = LazyAttribute(lambda obj: obj.start_date + timedelta(days=30))
    _fivetran_synced = LazyFunction(get_created_datetime)
    period = LazyAttribute(lambda obj: f"{obj.start_date.strftime('%Y-%m')}")
    total_amount = LazyFunction(lambda: Decimal(str(random.uniform(5000, 50000))).quantize(Decimal("0.01")))
    currency = "USD"
    _fivetran_deleted = False


class BrexTransactionFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Brex transactions."""

    class Meta:
        model = Transaction
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: f"txn_{n:08d}")
    amount = LazyFunction(lambda: Decimal(str(random.uniform(10, 5000))).quantize(Decimal("0.01")))
    posted_at_time = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    card_id = LazyAttribute(lambda obj: BrexCardFactory().id)
    merchant_name = Faker("company")
    currency = "USD"
    description = Faker("sentence")
    posted_at_date = LazyAttribute(lambda obj: obj.posted_at_time.date())
    category = Faker(
        "random_element",
        elements=[
            "Advertising",
            "Software",
            "Travel",
            "Meals",
            "Office Supplies",
            "Professional Services",
            "Shipping",
            "Utilities",
        ],
    )
    memo = Faker("text", max_nb_chars=100)
    _fivetran_deleted = False


class BrexTransferFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Brex transfers."""

    class Meta:
        model = Transfer
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: f"xfer_{n:08d}")
    amount = LazyFunction(lambda: Decimal(str(random.uniform(1000, 50000))).quantize(Decimal("0.01")))
    initiated_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=60))
    _fivetran_synced = LazyFunction(get_created_datetime)
    from_account_id = LazyAttribute(lambda obj: BrexAccountFactory().id)
    to_account_id = LazyAttribute(lambda obj: BrexAccountFactory().id)
    currency = "USD"
    status = Faker("random_element", elements=["pending", "completed", "failed", "cancelled"])
    completed_at = LazyAttribute(
        lambda obj: obj.initiated_at + timedelta(days=random.randint(0, 3)) if obj.status == "completed" else None
    )
    _fivetran_deleted = False


class BrexExpenseFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Brex expenses."""

    class Meta:
        model = Expense
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: f"exp_{n:08d}")
    amount = LazyFunction(lambda: Decimal(str(random.uniform(10, 5000))).quantize(Decimal("0.01")))
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    transaction_id = LazyAttribute(lambda obj: BrexTransactionFactory().id)
    user_id = LazyAttribute(lambda obj: BrexUserFactory().id)
    department_id = LazyAttribute(lambda obj: BrexDepartmentFactory().id)
    currency = "USD"
    memo = Faker("sentence")
    submitted_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 5)))
    approved_at = LazyAttribute(
        lambda obj: obj.submitted_at + timedelta(days=random.randint(0, 3)) if obj.status == "approved" else None
    )
    status = Faker("random_element", elements=["submitted", "approved", "rejected", "reimbursed"])
    _fivetran_deleted = False


class BrexReceiptFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Brex receipts."""

    class Meta:
        model = Receipt
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: f"rcpt_{n:08d}")
    transaction_id = LazyAttribute(lambda obj: BrexTransactionFactory().id)
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    _fivetran_synced = LazyFunction(get_created_datetime)
    download_url = Faker("url")
    _fivetran_deleted = False
