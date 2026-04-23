"""Metric metadata constants."""

from typing import Literal

from src.benchmarks.consts.tables import AssetMetadata


class MetricMetadata(AssetMetadata):
    name: str
    type: Literal["metric"] = "metric"


SCHEDULED_EVENTS_METRIC = MetricMetadata(name="Scheduled events", id=101)
BOUNCE_COUNT_METRIC = MetricMetadata(name="Bounce count", id=109)
USER_ACTIVITY_LEVEL_DISTRIBUTION_METRIC = MetricMetadata(name="User activity level distribution", id=82)
WEEKLY_SCHEDULING_CAPACITY_TREND_METRIC = MetricMetadata(name="Weekly scheduling capacity trend", id=97)
MULTI_OPEN_RATE_METRIC = MetricMetadata(name="Multi open rate", id=105)
CARD_UTILIZATION_RATE_METRIC = MetricMetadata(name="Card Utilization Rate", id=76)
CATEGORY_SPENDING_CONCENTRATION_METRIC = MetricMetadata(name="Category spending concentration", id=78)
USER_MONTHLY_SPENDING_TREND_METRIC = MetricMetadata(name="User monthly spending trend", id=77)
DEPARTMENT_BUDGET_PERFORMANCE_METRIC = MetricMetadata(name="Department budget performance", id=79)
EXPENSE_APPROVAL_CYCLE_TIME_METRIC = MetricMetadata(name="Expense approval cycle time", id=80)
CANCELLATION_RATE_VARIANCE_METRIC = MetricMetadata(name="Cancellation rate variance", id=96)
DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC = MetricMetadata(name="Department expense approval rate", id=83)
TRANSACTION_SIZE_DISTRIBUTION_METRIC = MetricMetadata(name="Transaction size distribution", id=81)
MULTI_EVENT_USER_PERCENTAGE_METRIC = MetricMetadata(name="Multi event user percentage", id=99)
INVITEE_CANCELLATION_PROPENSITY_SCORE_METRIC = MetricMetadata(name="Invitee cancellation propensity score", id=104)
TRANSFER_COMPLETION_RATE_METRIC = MetricMetadata(name="Transfer completion rate", id=84)
AVERAGE_TRANSACTION_VALUE_BY_CATEGORY_METRIC = MetricMetadata(name="Average transaction value by category", id=85)
USER_CARDS_PER_TRANSACTION_RATIO_METRIC = MetricMetadata(name="User cards per transaction ratio", id=87)
QUARTERLY_TRANSACTION_VOLUME_METRIC = MetricMetadata(name="Quarterly transaction volume", id=86)
MULTI_CLICK_RATE_METRIC = MetricMetadata(name="Multi click rate", id=106)
SAME_DAY_BOOKING_CONVERSION_RATE_METRIC = MetricMetadata(name="Same day booking conversion rate", id=100)
INVITEE_BOOKING_FREQUENCY_DISTRIBUTION_METRIC = MetricMetadata(name="Invitee booking frequency distribution", id=98)
ROUTING_FORM_SUBMISSION_FUNNEL_DROP_RATE_METRIC = MetricMetadata(
    name="Routing form submission funnel drop rate", id=102
)
CATEGORY_MERCHANT_DIVERSITY_METRIC = MetricMetadata(name="Category merchant diversity", id=88)
HIGH_DEMAND_EVENT_SUBSTITUTION_RATE_METRIC = MetricMetadata(name="High demand event substitution rate", id=103)
ACCOUNT_NET_TRANSFER_BALANCE_METRIC = MetricMetadata(name="Account net transfer balance", id=90)
DEPARTMENT_USER_SPENDING_INTENSITY_METRIC = MetricMetadata(name="Department user spending intensity", id=89)
EXPENSE_SUBMISSION_EFFICIENCY_METRIC = MetricMetadata(name="Expense submission efficiency", id=91)
CARD_TRANSACTION_VOLUME_PER_CARD_METRIC = MetricMetadata(name="Card transaction volume per card", id=92)
TRANSFER_PROCESSING_SPEED_METRIC = MetricMetadata(name="Transfer processing speed", id=94)
USER_EXPENSE_REPORTING_RATE_METRIC = MetricMetadata(name="User expense reporting rate", id=93)
CATEGORY_USER_ADOPTION_RATE_METRIC = MetricMetadata(name="Category user adoption rate", id=95)
NEWSLETTER_SUBSCRIBERS_METRIC = MetricMetadata(name="Newsletter subscribers", id=114)
BOUNCE_RATE_METRIC = MetricMetadata(name="Bounce rate", id=119)
OPEN_RATE_METRIC = MetricMetadata(name="Open Rate", id=117)
CUSTOMER_CHURN_RATE_METRIC = MetricMetadata(name="Customer churn rate", id=118)
OPEN_TO_CLICK_CONVERSION_RATE_METRIC = MetricMetadata(name="Open to click conversion rate", id=116)
UNSUBSCRIBE_COUNT_METRIC = MetricMetadata(name="Unsubscribe count", id=115)
CLICK_COUNT_METRIC = MetricMetadata(name="Click count", id=113)
INACTIVE_CUSTOMER_PERCENTAGE_METRIC = MetricMetadata(name="Inactive customer percentage", id=112)
AVERAGE_HOURS_TO_FIRST_CLICK_METRIC = MetricMetadata(name="Average hours to first click", id=111)
AVERAGE_HOURS_TO_FIRST_OPEN_METRIC = MetricMetadata(name="Average hours to first open", id=110)
AVERAGE_CLICKS_PER_EMAIL_METRIC = MetricMetadata(name="Average clicks per email", id=108)
AVERAGE_OPENS_PER_EMAIL_METRIC = MetricMetadata(name="Average opens per email", id=107)
Q4_AOV_METRIC = MetricMetadata(name="Q4 AOV", id=138)
AVERAGE_RETURN_LOW_COST_CAMPAIGNS_METRIC = MetricMetadata(
    name="Average Return from Low-cost Conversion Campaigns", id=139
)
