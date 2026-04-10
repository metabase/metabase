"""Segment metadata constants."""

from typing import Literal

from src.benchmarks.consts.tables import AssetMetadata


class SegmentMetadata(AssetMetadata):
    name: str
    type: Literal["segment"] = "segment"


NEW_CUSTOMERS_SEGMENT = SegmentMetadata(name="New Customers", id=1)
Q4_ORDERS_SEGMENT = SegmentMetadata(name="Q4 Orders", id=2)
ACTIVE_SUBSCRIBERS_SEGMENT = SegmentMetadata(name="Active Subscribers", id=3)
HIGH_PERFORMING_AD_CAMPAIGNS_SEGMENT = SegmentMetadata(name="High-Performing Ad Campaigns", id=4)
LOW_COST_CONVERSION_AD_CAMPAIGNS_SEGMENT = SegmentMetadata(name="Low-Cost Conversion Ad Campaigns", id=5)
