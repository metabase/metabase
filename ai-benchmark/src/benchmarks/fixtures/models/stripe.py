import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Text, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Customer(Base):
    __tablename__ = "customer"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="customer_pkey"),
        Index("idx_customer_created", "created"),
        Index("idx_customer_email", "email"),
        {"schema": "stripe_data"},
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    balance: Mapped[int | None] = mapped_column(Integer, server_default=text("0"))
    currency: Mapped[str | None] = mapped_column(String(3))
    delinquent: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    default_source: Mapped[str | None] = mapped_column(String(255))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    charge: Mapped[list["Charge"]] = relationship("Charge", back_populates="customer")
    payment_intent: Mapped[list["PaymentIntent"]] = relationship("PaymentIntent", back_populates="customer")
    payment_method: Mapped[list["PaymentMethod"]] = relationship("PaymentMethod", back_populates="customer")
    subscription: Mapped[list["Subscription"]] = relationship("Subscription", back_populates="customer")
    invoice: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="customer")


class Plan(Base):
    __tablename__ = "plan"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="plan_pkey"),
        Index("idx_plan_active", "active"),
        Index("idx_plan_product", "product_id"),
        {"schema": "stripe_data"},
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    active: Mapped[bool | None] = mapped_column(Boolean, server_default=text("true"))
    amount: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str | None] = mapped_column(String(3))
    interval: Mapped[str | None] = mapped_column(String(20))
    interval_count: Mapped[int | None] = mapped_column(Integer, server_default=text("1"))
    product_id: Mapped[str | None] = mapped_column(String(255))
    nickname: Mapped[str | None] = mapped_column(String(255))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Product(Base):
    __tablename__ = "product"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="product_pkey"),
        Index("idx_product_active", "active"),
        Index("idx_product_name", "name"),
        {"schema": "stripe_data"},
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool | None] = mapped_column(Boolean, server_default=text("true"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Charge(Base):
    __tablename__ = "charge"
    __table_args__ = (
        ForeignKeyConstraint(["customer_id"], ["stripe_data.customer.id"], name="charge_customer_id_fkey"),
        PrimaryKeyConstraint("id", name="charge_pkey"),
        Index("idx_charge_created", "created"),
        Index("idx_charge_customer", "customer_id"),
        Index("idx_charge_status", "status"),
        {"schema": "stripe_data"},
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    customer_id: Mapped[str | None] = mapped_column(String(255))
    amount_refunded: Mapped[int | None] = mapped_column(Integer, server_default=text("0"))
    status: Mapped[str | None] = mapped_column(String(50))
    paid: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    refunded: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    captured: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    description: Mapped[str | None] = mapped_column(Text)
    receipt_email: Mapped[str | None] = mapped_column(String(255))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    customer: Mapped[Optional["Customer"]] = relationship("Customer", back_populates="charge")
    refund: Mapped[list["Refund"]] = relationship("Refund", back_populates="charge")


class PaymentIntent(Base):
    __tablename__ = "payment_intent"
    __table_args__ = (
        ForeignKeyConstraint(["customer_id"], ["stripe_data.customer.id"], name="payment_intent_customer_id_fkey"),
        PrimaryKeyConstraint("id", name="payment_intent_pkey"),
        Index("idx_payment_intent_created", "created"),
        Index("idx_payment_intent_customer", "customer_id"),
        Index("idx_payment_intent_status", "status"),
        {"schema": "stripe_data"},
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    customer_id: Mapped[str | None] = mapped_column(String(255))
    canceled_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    cancellation_reason: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    receipt_email: Mapped[str | None] = mapped_column(String(255))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    customer: Mapped[Optional["Customer"]] = relationship("Customer", back_populates="payment_intent")


class PaymentMethod(Base):
    __tablename__ = "payment_method"
    __table_args__ = (
        ForeignKeyConstraint(["customer_id"], ["stripe_data.customer.id"], name="payment_method_customer_id_fkey"),
        PrimaryKeyConstraint("id", name="payment_method_pkey"),
        Index("idx_payment_method_customer", "customer_id"),
        Index("idx_payment_method_type", "type"),
        {"schema": "stripe_data"},
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    customer_id: Mapped[str | None] = mapped_column(String(255))
    card_brand: Mapped[str | None] = mapped_column(String(50))
    card_last4: Mapped[str | None] = mapped_column(String(4))
    card_exp_month: Mapped[int | None] = mapped_column(Integer)
    card_exp_year: Mapped[int | None] = mapped_column(Integer)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    customer: Mapped[Optional["Customer"]] = relationship("Customer", back_populates="payment_method")


class Subscription(Base):
    __tablename__ = "subscription"
    __table_args__ = (
        ForeignKeyConstraint(["customer_id"], ["stripe_data.customer.id"], name="subscription_customer_id_fkey"),
        PrimaryKeyConstraint("id", name="subscription_pkey"),
        Index("idx_subscription_customer", "customer_id"),
        Index("idx_subscription_period_start", "current_period_start"),
        Index("idx_subscription_status", "status"),
        {"schema": "stripe_data"},
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    current_period_start: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    current_period_end: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    cancel_at_period_end: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    canceled_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    ended_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    billing_cycle_anchor: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    trial_start: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    trial_end: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    customer: Mapped["Customer"] = relationship("Customer", back_populates="subscription")
    invoice: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="subscription")
    subscription_item: Mapped[list["SubscriptionItem"]] = relationship(
        "SubscriptionItem", back_populates="subscription"
    )


class Invoice(Base):
    __tablename__ = "invoice"
    __table_args__ = (
        ForeignKeyConstraint(["customer_id"], ["stripe_data.customer.id"], name="invoice_customer_id_fkey"),
        ForeignKeyConstraint(["subscription_id"], ["stripe_data.subscription.id"], name="invoice_subscription_id_fkey"),
        PrimaryKeyConstraint("id", name="invoice_pkey"),
        Index("idx_invoice_customer", "customer_id"),
        Index("idx_invoice_status", "status"),
        Index("idx_invoice_subscription", "subscription_id"),
        {"schema": "stripe_data"},
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    amount_due: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    customer_id: Mapped[str | None] = mapped_column(String(255))
    subscription_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str | None] = mapped_column(String(50))
    amount_paid: Mapped[int | None] = mapped_column(Integer, server_default=text("0"))
    amount_remaining: Mapped[int | None] = mapped_column(Integer, server_default=text("0"))
    due_date: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    paid: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    attempted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    customer: Mapped[Optional["Customer"]] = relationship("Customer", back_populates="invoice")
    subscription: Mapped[Optional["Subscription"]] = relationship("Subscription", back_populates="invoice")


class Refund(Base):
    __tablename__ = "refund"
    __table_args__ = (
        ForeignKeyConstraint(["charge_id"], ["stripe_data.charge.id"], name="refund_charge_id_fkey"),
        PrimaryKeyConstraint("id", name="refund_pkey"),
        Index("idx_refund_charge", "charge_id"),
        Index("idx_refund_created", "created"),
        {"schema": "stripe_data"},
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    charge_id: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str | None] = mapped_column(String(50))
    reason: Mapped[str | None] = mapped_column(String(100))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    charge: Mapped["Charge"] = relationship("Charge", back_populates="refund")


class SubscriptionItem(Base):
    __tablename__ = "subscription_item"
    __table_args__ = (
        ForeignKeyConstraint(
            ["subscription_id"], ["stripe_data.subscription.id"], name="subscription_item_subscription_id_fkey"
        ),
        PrimaryKeyConstraint("id", name="subscription_item_pkey"),
        Index("idx_subscription_item_subscription", "subscription_id"),
        {"schema": "stripe_data"},
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    subscription_id: Mapped[str] = mapped_column(String(255), nullable=False)
    created: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    plan_id: Mapped[str | None] = mapped_column(String(255))
    quantity: Mapped[int | None] = mapped_column(Integer, server_default=text("1"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    subscription: Mapped["Subscription"] = relationship("Subscription", back_populates="subscription_item")
