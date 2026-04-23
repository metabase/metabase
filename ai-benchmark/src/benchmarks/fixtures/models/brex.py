import datetime
import decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
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
        Index("idx_account_status", "status"),
        {"schema": "brex_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str | None] = mapped_column(String(50))
    current_balance: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    available_balance: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    currency: Mapped[str | None] = mapped_column(String(3))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    statement: Mapped[list["Statement"]] = relationship("Statement", back_populates="account")
    transfer: Mapped[list["Transfer"]] = relationship(
        "Transfer", foreign_keys="[Transfer.from_account_id]", back_populates="from_account"
    )
    transfer_: Mapped[list["Transfer"]] = relationship(
        "Transfer", foreign_keys="[Transfer.to_account_id]", back_populates="to_account"
    )


class Card(Base):
    __tablename__ = "card"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="card_pkey"),
        Index("idx_card_owner", "owner_user_id"),
        Index("idx_card_status", "status"),
        {"schema": "brex_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    owner_user_id: Mapped[str | None] = mapped_column(String(50))
    last_four: Mapped[str | None] = mapped_column(String(4))
    card_name: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str | None] = mapped_column(String(50))
    card_type: Mapped[str | None] = mapped_column(String(50))
    limit_amount: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    transaction: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="card")


class Department(Base):
    __tablename__ = "department"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="department_pkey"),
        Index("idx_department_name", "name"),
        {"schema": "brex_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    expense: Mapped[list["Expense"]] = relationship("Expense", back_populates="department")


class User(Base):
    __tablename__ = "user"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="user_pkey"),
        Index("idx_user_email", "email"),
        Index("idx_user_status", "status"),
        {"schema": "brex_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    expense: Mapped[list["Expense"]] = relationship("Expense", back_populates="user")


class Statement(Base):
    __tablename__ = "statement"
    __table_args__ = (
        ForeignKeyConstraint(["account_id"], ["brex_data.account.id"], name="statement_account_id_fkey"),
        PrimaryKeyConstraint("id", name="statement_pkey"),
        Index("idx_statement_account", "account_id"),
        Index("idx_statement_period", "start_date", "end_date"),
        {"schema": "brex_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(50), nullable=False)
    start_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    end_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    period: Mapped[str | None] = mapped_column(String(50))
    total_amount: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    account: Mapped["Account"] = relationship("Account", back_populates="statement")


class Transaction(Base):
    __tablename__ = "transaction"
    __table_args__ = (
        ForeignKeyConstraint(["card_id"], ["brex_data.card.id"], name="transaction_card_id_fkey"),
        PrimaryKeyConstraint("id", name="transaction_pkey"),
        Index("idx_transaction_card", "card_id"),
        Index("idx_transaction_category", "category"),
        Index("idx_transaction_merchant", "merchant_name"),
        Index("idx_transaction_posted", "posted_at_date"),
        {"schema": "brex_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    amount: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    posted_at_time: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    card_id: Mapped[str | None] = mapped_column(String(50))
    merchant_name: Mapped[str | None] = mapped_column(String(255))
    currency: Mapped[str | None] = mapped_column(String(3))
    description: Mapped[str | None] = mapped_column(Text)
    posted_at_date: Mapped[datetime.date | None] = mapped_column(Date)
    category: Mapped[str | None] = mapped_column(String(100))
    memo: Mapped[str | None] = mapped_column(Text)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    card: Mapped[Optional["Card"]] = relationship("Card", back_populates="transaction")
    expense: Mapped[list["Expense"]] = relationship("Expense", back_populates="transaction")
    receipt: Mapped[list["Receipt"]] = relationship("Receipt", back_populates="transaction")


class Transfer(Base):
    __tablename__ = "transfer"
    __table_args__ = (
        ForeignKeyConstraint(["from_account_id"], ["brex_data.account.id"], name="transfer_from_account_id_fkey"),
        ForeignKeyConstraint(["to_account_id"], ["brex_data.account.id"], name="transfer_to_account_id_fkey"),
        PrimaryKeyConstraint("id", name="transfer_pkey"),
        Index("idx_transfer_from", "from_account_id"),
        Index("idx_transfer_initiated", "initiated_at"),
        Index("idx_transfer_status", "status"),
        Index("idx_transfer_to", "to_account_id"),
        {"schema": "brex_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    amount: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    initiated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    from_account_id: Mapped[str | None] = mapped_column(String(50))
    to_account_id: Mapped[str | None] = mapped_column(String(50))
    currency: Mapped[str | None] = mapped_column(String(3))
    status: Mapped[str | None] = mapped_column(String(50))
    completed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    from_account: Mapped[Optional["Account"]] = relationship(
        "Account", foreign_keys=[from_account_id], back_populates="transfer"
    )
    to_account: Mapped[Optional["Account"]] = relationship(
        "Account", foreign_keys=[to_account_id], back_populates="transfer_"
    )


class Expense(Base):
    __tablename__ = "expense"
    __table_args__ = (
        ForeignKeyConstraint(["department_id"], ["brex_data.department.id"], name="expense_department_id_fkey"),
        ForeignKeyConstraint(["transaction_id"], ["brex_data.transaction.id"], name="expense_transaction_id_fkey"),
        ForeignKeyConstraint(["user_id"], ["brex_data.user.id"], name="expense_user_id_fkey"),
        PrimaryKeyConstraint("id", name="expense_pkey"),
        Index("idx_expense_department", "department_id"),
        Index("idx_expense_status", "status"),
        Index("idx_expense_transaction", "transaction_id"),
        Index("idx_expense_user", "user_id"),
        {"schema": "brex_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    amount: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    transaction_id: Mapped[str | None] = mapped_column(String(50))
    user_id: Mapped[str | None] = mapped_column(String(50))
    department_id: Mapped[str | None] = mapped_column(String(50))
    currency: Mapped[str | None] = mapped_column(String(3))
    memo: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    approved_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    status: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    department: Mapped[Optional["Department"]] = relationship("Department", back_populates="expense")
    transaction: Mapped[Optional["Transaction"]] = relationship("Transaction", back_populates="expense")
    user: Mapped[Optional["User"]] = relationship("User", back_populates="expense")


class Receipt(Base):
    __tablename__ = "receipt"
    __table_args__ = (
        ForeignKeyConstraint(["transaction_id"], ["brex_data.transaction.id"], name="receipt_transaction_id_fkey"),
        PrimaryKeyConstraint("id", name="receipt_pkey"),
        Index("idx_receipt_transaction", "transaction_id"),
        {"schema": "brex_data"},
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    transaction_id: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    download_url: Mapped[str | None] = mapped_column(Text)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    transaction: Mapped["Transaction"] = relationship("Transaction", back_populates="receipt")
