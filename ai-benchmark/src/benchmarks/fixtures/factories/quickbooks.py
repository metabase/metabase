"""
QuickBooks model factories for generating realistic accounting test data.
"""

import random
from datetime import timedelta
from decimal import Decimal

import factory
from factory.declarations import LazyAttribute, LazyFunction, Sequence
from factory.faker import Faker
from faker import Faker as FakerGen

from ..db import Session
from ..models.quickbooks import (
    Account,
    Bill,
    Customer,
    Invoice,
    InvoiceLine,
    Item,
    JournalEntry,
    Payment,
    Purchase,
    Vendor,
)
from ._shared_constants import (
    get_created_datetime,
    get_past_datetime,
)

fake = FakerGen()


def generate_qb_id(n: int) -> str:
    """Generate a QuickBooks-style numeric ID."""
    return str(100000 + n)


class QuickBooksAccountFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for QuickBooks accounts (chart of accounts)."""

    class Meta:
        model = Account
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_qb_id(n))
    name = Faker(
        "random_element",
        elements=[
            "Cash",
            "Accounts Receivable",
            "Inventory",
            "Equipment",
            "Accounts Payable",
            "Sales Revenue",
            "Cost of Goods Sold",
            "Rent Expense",
        ],
    )
    account_type = Faker("random_element", elements=["Asset", "Liability", "Equity", "Revenue", "Expense"])
    account_sub_type = Faker(
        "random_element", elements=["Cash", "AccountsReceivable", "AccountsPayable", "Income", "CostOfGoodsSold"]
    )
    classification = Faker("random_element", elements=["Asset", "Liability", "Equity", "Revenue", "Expense"])
    current_balance = LazyFunction(lambda: Decimal(random.randint(0, 1000000)) / 100)
    currency_ref_value = "USD"
    fully_qualified_name = LazyAttribute(lambda obj: obj.name)
    active = True
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=365, days_ago_max=1825))
    last_updated_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class QuickBooksCustomerFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for QuickBooks customers."""

    class Meta:
        model = Customer
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_qb_id(n))
    display_name = Faker("company")
    given_name = Faker("first_name")
    family_name = Faker("last_name")
    company_name = Faker("company")
    email = Faker("company_email")
    phone = Faker("phone_number")
    balance = LazyFunction(lambda: Decimal(random.randint(0, 100000)) / 100)
    balance_with_jobs = LazyFunction(lambda: Decimal(random.randint(0, 100000)) / 100)
    currency_ref_value = "USD"
    fully_qualified_name = LazyAttribute(lambda obj: obj.display_name)
    active = True
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=730))
    last_updated_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class QuickBooksVendorFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for QuickBooks vendors."""

    class Meta:
        model = Vendor
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_qb_id(n))
    display_name = Faker("company")
    company_name = Faker("company")
    given_name = Faker("first_name")
    family_name = Faker("last_name")
    email = Faker("company_email")
    phone = Faker("phone_number")
    balance = LazyFunction(lambda: Decimal(random.randint(0, 50000)) / 100)
    currency_ref_value = "USD"
    active = True
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=90, days_ago_max=730))
    last_updated_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class QuickBooksItemFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for QuickBooks items (products/services)."""

    class Meta:
        model = Item
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_qb_id(n))
    name = Faker("catch_phrase")
    type = Faker("random_element", elements=["Service", "Inventory", "NonInventory"])
    description = Faker("sentence")
    unit_price = LazyFunction(lambda: Decimal(random.randint(1000, 50000)) / 100)
    income_account_ref_value = Sequence(lambda n: generate_qb_id(n))
    expense_account_ref_value = Sequence(lambda n: generate_qb_id(n))
    active = True
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=180, days_ago_max=1095))
    last_updated_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class QuickBooksInvoiceFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for QuickBooks invoices."""

    class Meta:
        model = Invoice
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_qb_id(n))
    customer_ref_value = LazyAttribute(lambda obj: QuickBooksCustomerFactory().id)
    doc_number = Sequence(lambda n: f"INV-{n:05d}")
    txn_date = LazyFunction(lambda: (get_past_datetime(days_ago_min=0, days_ago_max=180)).date())
    due_date = LazyAttribute(lambda obj: obj.txn_date + timedelta(days=30))
    total_amt = LazyFunction(lambda: Decimal(random.randint(5000, 100000)) / 100)
    balance = LazyAttribute(lambda obj: obj.total_amt if random.random() > 0.7 else Decimal(0))
    home_balance = LazyAttribute(lambda obj: obj.balance)
    currency_ref_value = "USD"
    email_status = Faker("random_element", elements=["NotSent", "NeedToSend", "EmailSent"])
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=180))
    last_updated_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class QuickBooksInvoiceLineFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for QuickBooks invoice line items."""

    class Meta:
        model = InvoiceLine
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    invoice_id = LazyAttribute(lambda obj: QuickBooksInvoiceFactory().id)
    index = Sequence(lambda n: n)
    id = Sequence(lambda n: generate_qb_id(n))
    line_num = Sequence(lambda n: n)
    description = Faker("sentence")
    detail_type = "SalesItemLineDetail"
    sales_item_item_ref_value = LazyAttribute(lambda obj: QuickBooksItemFactory().id)
    sales_item_quantity = LazyFunction(lambda: Decimal(random.randint(1, 20)))
    sales_item_unit_price = LazyFunction(lambda: Decimal(random.randint(1000, 10000)) / 100)
    amount = LazyAttribute(lambda obj: obj.sales_item_quantity * obj.sales_item_unit_price)
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class QuickBooksPaymentFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for QuickBooks payments."""

    class Meta:
        model = Payment
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_qb_id(n))
    customer_ref_value = LazyAttribute(lambda obj: QuickBooksCustomerFactory().id)
    txn_date = LazyFunction(lambda: (get_past_datetime(days_ago_min=0, days_ago_max=90)).date())
    total_amt = LazyFunction(lambda: Decimal(random.randint(5000, 50000)) / 100)
    unapplied_amt = LazyFunction(lambda: Decimal(random.randint(0, 1000)) / 100)
    currency_ref_value = "USD"
    payment_method_ref_value = Faker("random_element", elements=["1", "2", "3", "4"])
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    last_updated_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 7)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class QuickBooksBillFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for QuickBooks bills."""

    class Meta:
        model = Bill
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_qb_id(n))
    vendor_ref_value = LazyAttribute(lambda obj: QuickBooksVendorFactory().id)
    doc_number = Sequence(lambda n: f"BILL-{n:05d}")
    txn_date = LazyFunction(lambda: (get_past_datetime(days_ago_min=0, days_ago_max=180)).date())
    due_date = LazyAttribute(lambda obj: obj.txn_date + timedelta(days=30))
    total_amt = LazyFunction(lambda: Decimal(random.randint(5000, 50000)) / 100)
    balance = LazyAttribute(lambda obj: obj.total_amt if random.random() > 0.6 else Decimal(0))
    currency_ref_value = "USD"
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=180))
    last_updated_time = LazyAttribute(lambda obj: obj.created_time + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class QuickBooksPurchaseFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for QuickBooks purchases."""

    class Meta:
        model = Purchase
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_qb_id(n))
    txn_date = LazyFunction(lambda: (get_past_datetime(days_ago_min=0, days_ago_max=90)).date())
    total_amt = LazyFunction(lambda: Decimal(random.randint(1000, 20000)) / 100)
    account_ref_value = Sequence(lambda n: generate_qb_id(n))
    payment_type = Faker("random_element", elements=["Cash", "Check", "CreditCard"])
    entity_ref_value = Sequence(lambda n: generate_qb_id(n))
    currency_ref_value = "USD"
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    last_updated_time = LazyFunction(get_created_datetime)
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class QuickBooksJournalEntryFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for QuickBooks journal entries."""

    class Meta:
        model = JournalEntry
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_qb_id(n))
    doc_number = Sequence(lambda n: f"JE-{n:05d}")
    txn_date = LazyFunction(lambda: (get_past_datetime(days_ago_min=0, days_ago_max=365)).date())
    total_amt = LazyFunction(lambda: Decimal(random.randint(1000, 50000)) / 100)
    currency_ref_value = "USD"
    created_time = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=365))
    last_updated_time = LazyFunction(get_created_datetime)
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False
