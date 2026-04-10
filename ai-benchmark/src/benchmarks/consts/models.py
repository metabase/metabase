"""Model metadata constants."""

from typing import Literal

from src.benchmarks.consts.tables import AssetMetadata


class ModelMetadata(AssetMetadata):
    name: str
    type: Literal["model"] = "model"


SHOPIFY_ORDER_LINE_FACTS_MODEL = ModelMetadata(name="Shopify Order Line Facts", id=125)
SHOPIFY_REFUND_FACTS_MODEL = ModelMetadata(name="Shopify Refund Facts", id=135)
