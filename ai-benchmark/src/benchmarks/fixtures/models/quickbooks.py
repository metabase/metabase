import datetime
import decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    String,
    Text,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "account"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="account_pkey"),
        Index("idx_account_active", "active"),
        Index("idx_account_type", "account_type"),
        {"schema": "quickbooks_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_type: Mapped[str] = mapped_column(String(50), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_updated_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    fully_qualified_name: Mapped[str | None] = mapped_column(String(255))
    account_sub_type: Mapped[str | None] = mapped_column(String(50))
    classification: Mapped[str | None] = mapped_column(String(50))
    current_balance: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    currency_ref_value: Mapped[str | None] = mapped_column(String(3))
    active: Mapped[bool | None] = mapped_column(Boolean, server_default=text("true"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Customer(Base):
    __tablename__ = "customer"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="customer_pkey"),
        Index("idx_customer_active", "active"),
        Index("idx_customer_email", "email"),
        {"schema": "quickbooks_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_updated_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    fully_qualified_name: Mapped[str | None] = mapped_column(String(255))
    company_name: Mapped[str | None] = mapped_column(String(255))
    given_name: Mapped[str | None] = mapped_column(String(100))
    family_name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(40))
    balance: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    balance_with_jobs: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    currency_ref_value: Mapped[str | None] = mapped_column(String(3))
    active: Mapped[bool | None] = mapped_column(Boolean, server_default=text("true"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    invoice: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="customer")
    payment: Mapped[list["Payment"]] = relationship("Payment", back_populates="customer")


class Item(Base):
    __tablename__ = "item"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="item_pkey"),
        Index("idx_item_active", "active"),
        Index("idx_item_type", "type"),
        {"schema": "quickbooks_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_updated_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    unit_price: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    income_account_ref_value: Mapped[str | None] = mapped_column(String(50))
    expense_account_ref_value: Mapped[str | None] = mapped_column(String(50))
    active: Mapped[bool | None] = mapped_column(Boolean, server_default=text("true"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class JournalEntry(Base):
    __tablename__ = "journal_entry"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="journal_entry_pkey"),
        Index("idx_journal_entry_txn_date", "txn_date"),
        {"schema": "quickbooks_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    txn_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    total_amt: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_updated_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    doc_number: Mapped[str | None] = mapped_column(String(50))
    currency_ref_value: Mapped[str | None] = mapped_column(String(3))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Purchase(Base):
    __tablename__ = "purchase"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="purchase_pkey"),
        Index("idx_purchase_entity", "entity_ref_value"),
        Index("idx_purchase_txn_date", "txn_date"),
        {"schema": "quickbooks_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    txn_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    total_amt: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_updated_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    account_ref_value: Mapped[str | None] = mapped_column(String(50))
    payment_type: Mapped[str | None] = mapped_column(String(50))
    entity_ref_value: Mapped[str | None] = mapped_column(String(50))
    currency_ref_value: Mapped[str | None] = mapped_column(String(3))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Vendor(Base):
    __tablename__ = "vendor"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="vendor_pkey"),
        Index("idx_vendor_active", "active"),
        {"schema": "quickbooks_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_updated_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(255))
    given_name: Mapped[str | None] = mapped_column(String(100))
    family_name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(40))
    balance: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    currency_ref_value: Mapped[str | None] = mapped_column(String(3))
    active: Mapped[bool | None] = mapped_column(Boolean, server_default=text("true"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    bill: Mapped[list["Bill"]] = relationship("Bill", back_populates="vendor")


class Bill(Base):
    __tablename__ = "bill"
    __table_args__ = (
        ForeignKeyConstraint(["vendor_ref_value"], ["quickbooks_data.vendor.id"], name="bill_vendor_ref_value_fkey"),
        PrimaryKeyConstraint("id", name="bill_pkey"),
        Index("idx_bill_txn_date", "txn_date"),
        Index("idx_bill_vendor", "vendor_ref_value"),
        {"schema": "quickbooks_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    vendor_ref_value: Mapped[str] = mapped_column(String(50), nullable=False)
    txn_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    total_amt: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_updated_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    doc_number: Mapped[str | None] = mapped_column(String(50))
    due_date: Mapped[datetime.date | None] = mapped_column(Date)
    balance: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    currency_ref_value: Mapped[str | None] = mapped_column(String(3))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="bill")


class Invoice(Base):
    __tablename__ = "invoice"
    __table_args__ = (
        ForeignKeyConstraint(
            ["customer_ref_value"], ["quickbooks_data.customer.id"], name="invoice_customer_ref_value_fkey"
        ),
        PrimaryKeyConstraint("id", name="invoice_pkey"),
        Index("idx_invoice_customer", "customer_ref_value"),
        Index("idx_invoice_due_date", "due_date"),
        Index("idx_invoice_txn_date", "txn_date"),
        {"schema": "quickbooks_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    customer_ref_value: Mapped[str] = mapped_column(String(50), nullable=False)
    txn_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    total_amt: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_updated_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    doc_number: Mapped[str | None] = mapped_column(String(50))
    due_date: Mapped[datetime.date | None] = mapped_column(Date)
    balance: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    home_balance: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    currency_ref_value: Mapped[str | None] = mapped_column(String(3))
    email_status: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    customer: Mapped["Customer"] = relationship("Customer", back_populates="invoice")
    invoice_line: Mapped[list["InvoiceLine"]] = relationship("InvoiceLine", back_populates="invoice")


class Payment(Base):
    __tablename__ = "payment"
    __table_args__ = (
        ForeignKeyConstraint(
            ["customer_ref_value"], ["quickbooks_data.customer.id"], name="payment_customer_ref_value_fkey"
        ),
        PrimaryKeyConstraint("id", name="payment_pkey"),
        Index("idx_payment_customer", "customer_ref_value"),
        Index("idx_payment_txn_date", "txn_date"),
        {"schema": "quickbooks_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    customer_ref_value: Mapped[str] = mapped_column(String(50), nullable=False)
    txn_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    total_amt: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    last_updated_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    unapplied_amt: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    currency_ref_value: Mapped[str | None] = mapped_column(String(3))
    payment_method_ref_value: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    customer: Mapped["Customer"] = relationship("Customer", back_populates="payment")


class InvoiceLine(Base):
    __tablename__ = "invoice_line"
    __table_args__ = (
        ForeignKeyConstraint(["invoice_id"], ["quickbooks_data.invoice.id"], name="invoice_line_invoice_id_fkey"),
        PrimaryKeyConstraint("invoice_id", "index", name="invoice_line_pkey"),
        Index("idx_invoice_line_item", "sales_item_item_ref_value"),
        {"schema": "quickbooks_data"},
    )

    invoice_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    index: Mapped[int] = mapped_column(Integer, primary_key=True)
    amount: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    id: Mapped[str | None] = mapped_column(String(50))
    line_num: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(Text)
    detail_type: Mapped[str | None] = mapped_column(String(50))
    sales_item_item_ref_value: Mapped[str | None] = mapped_column(String(50))
    sales_item_quantity: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 4))
    sales_item_unit_price: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="invoice_line")
