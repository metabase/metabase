"""
Shopify model factories for generating realistic e-commerce test data.

These factories generate realistic e-commerce data including products,
orders, customers, and fulfillments.
"""

import random
from datetime import timedelta
from decimal import Decimal

import factory
from factory.declarations import LazyAttribute, LazyFunction, Sequence
from factory.faker import Faker
from faker import Faker as FakerGen

from ..db import Session
from ..models.shopify import (
    Customer,
    DiscountCode,
    Fulfillment,
    InventoryItem,
    Order,
    OrderLine,
    Product,
    ProductVariant,
    Refund,
    Transaction,
)
from ._shared_constants import (
    get_created_datetime,
    get_past_datetime,
)

fake = FakerGen()


def generate_shopify_id(n: int) -> int:
    """Generate a Shopify-style numeric ID."""
    return 1000000000000 + n


class ShopifyCustomerFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Shopify customers."""

    class Meta:
        model = Customer
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_shopify_id(n))
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=730))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    email = Faker("email")
    first_name = Faker("first_name")
    last_name = Faker("last_name")
    orders_count = LazyFunction(lambda: random.randint(0, 25))
    total_spent = LazyFunction(lambda: Decimal(random.randint(0, 50000)) / 100)
    state = Faker("random_element", elements=["enabled", "disabled", "invited"])
    accepts_marketing = Faker("boolean", chance_of_getting_true=40)
    _fivetran_deleted = False


class ShopifyProductFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Shopify products."""

    class Meta:
        model = Product
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_shopify_id(n))
    title = Faker(
        "random_element",
        elements=[
            "Premium Cotton T-Shirt",
            "Wireless Bluetooth Headphones",
            "Leather Messenger Bag",
            "Stainless Steel Water Bottle",
            "Organic Coffee Beans",
            "Yoga Mat Pro",
            "Smart Watch Series 5",
            "Mechanical Keyboard",
            "Canvas Backpack",
        ],
    )
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=180, days_ago_max=1095))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    vendor = Faker("company")
    product_type = Faker(
        "random_element", elements=["Apparel", "Electronics", "Accessories", "Home & Garden", "Sports & Outdoors"]
    )
    published_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 7)))
    status = Faker("random_element", elements=["active", "archived", "draft"])
    _fivetran_deleted = False


class ShopifyProductVariantFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Shopify product variants."""

    class Meta:
        model = ProductVariant
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_shopify_id(n))
    product_id = LazyAttribute(lambda obj: ShopifyProductFactory().id)
    price = LazyFunction(lambda: Decimal(random.randint(999, 29999)) / 100)
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=180, days_ago_max=1095))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    title = Faker(
        "random_element", elements=["Small / Black", "Medium / Blue", "Large / Red", "XL / White", "Default Title"]
    )
    sku = Sequence(lambda n: f"SKU-{n:06d}")
    inventory_quantity = LazyFunction(lambda: random.randint(0, 500))
    weight = LazyFunction(lambda: Decimal(random.randint(100, 5000)) / 100)
    weight_unit = "kg"
    _fivetran_deleted = False


class ShopifyInventoryItemFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Shopify inventory items."""

    class Meta:
        model = InventoryItem
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_shopify_id(n))
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=180, days_ago_max=1095))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    sku = Sequence(lambda n: f"INV-SKU-{n:06d}")
    cost = LazyFunction(lambda: Decimal(random.randint(500, 15000)) / 100)
    country_code_of_origin = Faker("random_element", elements=["US", "CN", "DE", "JP", None])
    tracked = LazyFunction(lambda: random.random() > 0.2)
    _fivetran_deleted = False


class ShopifyDiscountCodeFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Shopify discount codes."""

    class Meta:
        model = DiscountCode
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_shopify_id(n))
    code = Sequence(lambda n: f"SAVE{random.randint(10, 50)}-{n}")
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=30, days_ago_max=365))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    value_type = Faker("random_element", elements=["percentage", "fixed_amount", "free_shipping"])
    value = LazyFunction(lambda: Decimal(random.choice([5, 10, 15, 20, 25]) * 100) / 100)
    usage_limit = LazyFunction(lambda: random.randint(10, 1000) if random.random() < 0.7 else None)
    _fivetran_deleted = False


class ShopifyOrderFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Shopify orders."""

    class Meta:
        model = Order
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_shopify_id(n))
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=180))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 30)))
    total_price = LazyFunction(lambda: Decimal(random.randint(2000, 50000)) / 100)
    _fivetran_synced = LazyFunction(get_created_datetime)
    customer_id = LazyAttribute(lambda obj: ShopifyCustomerFactory().id)
    processed_at = LazyAttribute(lambda obj: obj.created_at)
    cancelled_at = LazyAttribute(
        lambda obj: obj.created_at + timedelta(days=random.randint(0, 14)) if random.random() < 0.15 else None
    )
    total_discounts = LazyAttribute(
        lambda obj: (
            obj.total_price * random.choice([Decimal("0"), Decimal("0.05"), Decimal("0.10"), Decimal("0.15")])
        ).quantize(Decimal("0.01"))
    )
    total_tax = LazyAttribute(lambda obj: (obj.total_price * Decimal("0.08")).quantize(Decimal("0.01")))
    subtotal_price = LazyAttribute(
        lambda obj: (obj.total_price - obj.total_tax + obj.total_discounts).quantize(Decimal("0.01"))
    )
    closed_at = LazyAttribute(
        lambda obj: obj.created_at + timedelta(days=random.randint(1, 21))
        if obj.cancelled_at is None and random.random() < 0.4
        else None
    )
    currency = "USD"
    financial_status = LazyAttribute(
        lambda obj: random.choice(["pending", "authorized", "partially_paid", "paid"])
        if obj.cancelled_at is None
        else random.choice(["partially_refunded", "refunded", "voided"])
    )
    fulfillment_status = LazyAttribute(
        lambda obj: random.choice(["unfulfilled", "partial", "fulfilled"]) if obj.cancelled_at is None else "restocked"
    )
    order_number = Sequence(lambda n: 1000 + n)
    _fivetran_deleted = False


class ShopifyOrderLineFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Shopify order line items."""

    class Meta:
        model = OrderLine
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_shopify_id(n))
    order_id = LazyAttribute(lambda obj: ShopifyOrderFactory().id)
    quantity = LazyFunction(lambda: random.randint(1, 5))
    price = LazyFunction(lambda: Decimal(random.randint(1000, 20000)) / 100)
    _fivetran_synced = LazyFunction(get_created_datetime)
    product_id = LazyAttribute(lambda obj: ShopifyProductFactory().id)
    variant_id = LazyAttribute(lambda obj: ShopifyProductVariantFactory().id)
    name = Faker("catch_phrase")
    total_discount = LazyFunction(lambda: Decimal(random.randint(0, 1000)) / 100)
    sku = Sequence(lambda n: f"LINE-SKU-{n:06d}")
    _fivetran_deleted = False


class ShopifyFulfillmentFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Shopify fulfillments."""

    class Meta:
        model = Fulfillment
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_shopify_id(n))
    order_id = LazyAttribute(lambda obj: ShopifyOrderFactory().id)
    status = Faker("random_element", elements=["pending", "success", "cancelled", "error"])
    tracking_company = Faker("random_element", elements=["UPS", "FedEx", "USPS", "DHL", None])
    tracking_number = LazyFunction(
        lambda: f"1Z{fake.random_int(min=100000000000, max=999999999999)}" if random.random() > 0.3 else None
    )
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    updated_at = LazyAttribute(lambda obj: obj.created_at + timedelta(days=random.randint(0, 7)))
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class ShopifyTransactionFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Shopify transactions."""

    class Meta:
        model = Transaction
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_shopify_id(n))
    order_id = LazyAttribute(lambda obj: ShopifyOrderFactory().id)
    amount = LazyFunction(lambda: Decimal(random.randint(1000, 50000)) / 100)
    kind = Faker("random_element", elements=["sale", "capture", "authorization", "refund"])
    gateway = Faker("random_element", elements=["stripe", "paypal", "shopify_payments"])
    status = Faker("random_element", elements=["success", "pending", "failure"])
    currency = "USD"
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=180))
    processed_at = LazyAttribute(lambda obj: obj.created_at)
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False


class ShopifyRefundFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Factory for Shopify refunds."""

    class Meta:
        model = Refund
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"

    id = Sequence(lambda n: generate_shopify_id(n))
    order_id = LazyAttribute(lambda obj: ShopifyOrderFactory().id)
    created_at = LazyFunction(lambda: get_past_datetime(days_ago_min=0, days_ago_max=90))
    processed_at = LazyAttribute(lambda obj: obj.created_at)
    note = Faker(
        "random_element",
        elements=["Customer changed mind", "Item damaged", "Wrong item shipped", "Defective product", None],
    )
    _fivetran_synced = LazyFunction(get_created_datetime)
    _fivetran_deleted = False
