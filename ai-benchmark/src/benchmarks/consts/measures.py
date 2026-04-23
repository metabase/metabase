"""Measure metadata constants."""

from typing import Literal

from src.benchmarks.consts.tables import AssetMetadata


class MeasureMetadata(AssetMetadata):
    name: str
    type: Literal["measure"] = "measure"


AVERAGE_ORDER_VALUE_MEASURE = MeasureMetadata(name="Average Order Value", id=1)
TOTAL_NET_REVENUE_MEASURE = MeasureMetadata(name="Total Net Revenue", id=2)
AVERAGE_CUSTOMER_LIFETIME_VALUE_MEASURE = MeasureMetadata(name="Average Customer Lifetime Value", id=3)
TOTAL_MONTHLY_RECURRING_REVENUE_MEASURE = MeasureMetadata(name="Total Monthly Recurring Revenue", id=4)
AVERAGE_RETURN_ON_AD_SPEND_MEASURE = MeasureMetadata(name="Average Return on Ad Spend", id=5)
