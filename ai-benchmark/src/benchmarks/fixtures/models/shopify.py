import datetime
import decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
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


class Customer(Base):
    __tablename__ = "customer"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="customer_pkey"),
        Index("idx_customer_created", "created_at"),
        Index("idx_customer_email", "email"),
        {"schema": "shopify_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    orders_count: Mapped[int | None] = mapped_column(Integer, server_default=text("0"))
    total_spent: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    state: Mapped[str | None] = mapped_column(String(50))
    accepts_marketing: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    order: Mapped[list["Order"]] = relationship("Order", back_populates="customer")


class DiscountCode(Base):
    __tablename__ = "discount_code"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="discount_code_pkey"),
        Index("idx_discount_code", "code"),
        {"schema": "shopify_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    value_type: Mapped[str | None] = mapped_column(String(50))
    value: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    usage_limit: Mapped[int | None] = mapped_column(Integer)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class InventoryItem(Base):
    __tablename__ = "inventory_item"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="inventory_item_pkey"),
        Index("idx_inventory_sku", "sku"),
        {"schema": "shopify_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    sku: Mapped[str | None] = mapped_column(String(100))
    cost: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    country_code_of_origin: Mapped[str | None] = mapped_column(String(2))
    tracked: Mapped[bool | None] = mapped_column(Boolean, server_default=text("true"))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))


class Product(Base):
    __tablename__ = "product"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="product_pkey"),
        Index("idx_product_status", "status"),
        Index("idx_product_title", "title"),
        Index("idx_product_type", "product_type"),
        {"schema": "shopify_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    vendor: Mapped[str | None] = mapped_column(String(255))
    product_type: Mapped[str | None] = mapped_column(String(255))
    published_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    status: Mapped[str | None] = mapped_column(String(50))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    product_variant: Mapped[list["ProductVariant"]] = relationship("ProductVariant", back_populates="product")


class Order(Base):
    __tablename__ = "order"
    __table_args__ = (
        ForeignKeyConstraint(["customer_id"], ["shopify_data.customer.id"], name="order_customer_id_fkey"),
        PrimaryKeyConstraint("id", name="order_pkey"),
        Index("idx_order_created", "created_at"),
        Index("idx_order_customer", "customer_id"),
        Index("idx_order_financial_status", "financial_status"),
        {"schema": "shopify_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    total_price: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    customer_id: Mapped[int | None] = mapped_column(BigInteger)
    processed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    cancelled_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    closed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    subtotal_price: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2))
    total_tax: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    total_discounts: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    currency: Mapped[str | None] = mapped_column(String(3))
    financial_status: Mapped[str | None] = mapped_column(String(50))
    fulfillment_status: Mapped[str | None] = mapped_column(String(50))
    order_number: Mapped[int | None] = mapped_column(Integer)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    customer: Mapped[Optional["Customer"]] = relationship("Customer", back_populates="order")
    fulfillment: Mapped[list["Fulfillment"]] = relationship("Fulfillment", back_populates="order")
    order_line: Mapped[list["OrderLine"]] = relationship("OrderLine", back_populates="order")
    refund: Mapped[list["Refund"]] = relationship("Refund", back_populates="order")
    transaction: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="order")


class ProductVariant(Base):
    __tablename__ = "product_variant"
    __table_args__ = (
        ForeignKeyConstraint(["product_id"], ["shopify_data.product.id"], name="product_variant_product_id_fkey"),
        PrimaryKeyConstraint("id", name="product_variant_pkey"),
        Index("idx_variant_product", "product_id"),
        Index("idx_variant_sku", "sku"),
        {"schema": "shopify_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    product_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    price: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255))
    sku: Mapped[str | None] = mapped_column(String(100))
    inventory_quantity: Mapped[int | None] = mapped_column(Integer, server_default=text("0"))
    weight: Mapped[decimal.Decimal | None] = mapped_column(Numeric(10, 2))
    weight_unit: Mapped[str | None] = mapped_column(String(10))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    product: Mapped["Product"] = relationship("Product", back_populates="product_variant")


class Fulfillment(Base):
    __tablename__ = "fulfillment"
    __table_args__ = (
        ForeignKeyConstraint(["order_id"], ["shopify_data.order.id"], name="fulfillment_order_id_fkey"),
        PrimaryKeyConstraint("id", name="fulfillment_pkey"),
        Index("idx_fulfillment_order", "order_id"),
        Index("idx_fulfillment_status", "status"),
        {"schema": "shopify_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str | None] = mapped_column(String(50))
    tracking_company: Mapped[str | None] = mapped_column(String(100))
    tracking_number: Mapped[str | None] = mapped_column(String(100))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    order: Mapped["Order"] = relationship("Order", back_populates="fulfillment")


class OrderLine(Base):
    __tablename__ = "order_line"
    __table_args__ = (
        ForeignKeyConstraint(["order_id"], ["shopify_data.order.id"], name="order_line_order_id_fkey"),
        PrimaryKeyConstraint("id", name="order_line_pkey"),
        Index("idx_order_line_order", "order_id"),
        Index("idx_order_line_product", "product_id"),
        Index("idx_order_line_variant", "variant_id"),
        {"schema": "shopify_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    product_id: Mapped[int | None] = mapped_column(BigInteger)
    variant_id: Mapped[int | None] = mapped_column(BigInteger)
    name: Mapped[str | None] = mapped_column(String(255))
    total_discount: Mapped[decimal.Decimal | None] = mapped_column(Numeric(18, 2), server_default=text("0"))
    sku: Mapped[str | None] = mapped_column(String(100))
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    order: Mapped["Order"] = relationship("Order", back_populates="order_line")


class Refund(Base):
    __tablename__ = "refund"
    __table_args__ = (
        ForeignKeyConstraint(["order_id"], ["shopify_data.order.id"], name="refund_order_id_fkey"),
        PrimaryKeyConstraint("id", name="refund_pkey"),
        Index("idx_refund_created", "created_at"),
        Index("idx_refund_order", "order_id"),
        {"schema": "shopify_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    processed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    note: Mapped[str | None] = mapped_column(Text)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    order: Mapped["Order"] = relationship("Order", back_populates="refund")


class Transaction(Base):
    __tablename__ = "transaction"
    __table_args__ = (
        ForeignKeyConstraint(["order_id"], ["shopify_data.order.id"], name="transaction_order_id_fkey"),
        PrimaryKeyConstraint("id", name="transaction_pkey"),
        Index("idx_transaction_kind", "kind"),
        Index("idx_transaction_order", "order_id"),
        Index("idx_transaction_status", "status"),
        {"schema": "shopify_data"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    amount: Mapped[decimal.Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    _fivetran_synced: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    currency: Mapped[str | None] = mapped_column(String(3))
    kind: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str | None] = mapped_column(String(50))
    gateway: Mapped[str | None] = mapped_column(String(100))
    processed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    _fivetran_deleted: Mapped[bool | None] = mapped_column(Boolean, server_default=text("false"))

    order: Mapped["Order"] = relationship("Order", back_populates="transaction")
