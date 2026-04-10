"""Helper functions and configuration for benchmarks."""

import re
import subprocess

from src.benchmarks.config import BenchmarkConfig
from src.benchmarks.consts import (
    ACCOUNT_NET_TRANSFER_BALANCE_METRIC,
    ACTIVE_SUBSCRIBERS_SEGMENT,
    AVERAGE_CLICKS_PER_EMAIL_METRIC,
    AVERAGE_CUSTOMER_LIFETIME_VALUE_MEASURE,
    AVERAGE_HOURS_TO_FIRST_CLICK_METRIC,
    AVERAGE_HOURS_TO_FIRST_OPEN_METRIC,
    AVERAGE_OPENS_PER_EMAIL_METRIC,
    AVERAGE_ORDER_VALUE_MEASURE,
    AVERAGE_RETURN_LOW_COST_CAMPAIGNS_METRIC,
    AVERAGE_RETURN_ON_AD_SPEND_MEASURE,
    AVERAGE_TRANSACTION_VALUE_BY_CATEGORY_METRIC,
    BENCHMARK_TABLES,
    BOUNCE_COUNT_METRIC,
    BOUNCE_RATE_METRIC,
    CANCELLATION_RATE_VARIANCE_METRIC,
    CARD_TRANSACTION_VOLUME_PER_CARD_METRIC,
    CARD_UTILIZATION_RATE_METRIC,
    CATEGORY_MERCHANT_DIVERSITY_METRIC,
    CATEGORY_SPENDING_CONCENTRATION_METRIC,
    CATEGORY_USER_ADOPTION_RATE_METRIC,
    CLICK_COUNT_METRIC,
    CUSTOMER_CHURN_RATE_METRIC,
    DEPARTMENT_BUDGET_PERFORMANCE_METRIC,
    DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
    DEPARTMENT_USER_SPENDING_INTENSITY_METRIC,
    EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
    EXPENSE_SUBMISSION_EFFICIENCY_METRIC,
    HIGH_DEMAND_EVENT_SUBSTITUTION_RATE_METRIC,
    HIGH_PERFORMING_AD_CAMPAIGNS_SEGMENT,
    INACTIVE_CUSTOMER_PERCENTAGE_METRIC,
    INVITEE_BOOKING_FREQUENCY_DISTRIBUTION_METRIC,
    INVITEE_CANCELLATION_PROPENSITY_SCORE_METRIC,
    LOW_COST_CONVERSION_AD_CAMPAIGNS_SEGMENT,
    MULTI_CLICK_RATE_METRIC,
    MULTI_EVENT_USER_PERCENTAGE_METRIC,
    MULTI_OPEN_RATE_METRIC,
    NEW_CUSTOMERS_SEGMENT,
    NEWSLETTER_SUBSCRIBERS_METRIC,
    OPEN_RATE_METRIC,
    OPEN_TO_CLICK_CONVERSION_RATE_METRIC,
    Q4_AOV_METRIC,
    Q4_ORDERS_SEGMENT,
    QUARTERLY_TRANSACTION_VOLUME_METRIC,
    ROUTING_FORM_SUBMISSION_FUNNEL_DROP_RATE_METRIC,
    SAME_DAY_BOOKING_CONVERSION_RATE_METRIC,
    SCHEDULED_EVENTS_METRIC,
    SHOPIFY_ORDER_LINE_FACTS_MODEL,
    SHOPIFY_REFUND_FACTS_MODEL,
    TOTAL_MONTHLY_RECURRING_REVENUE_MEASURE,
    TOTAL_NET_REVENUE_MEASURE,
    TRANSACTION_SIZE_DISTRIBUTION_METRIC,
    TRANSFER_COMPLETION_RATE_METRIC,
    TRANSFER_PROCESSING_SPEED_METRIC,
    UNSUBSCRIBE_COUNT_METRIC,
    USER_ACTIVITY_LEVEL_DISTRIBUTION_METRIC,
    USER_CARDS_PER_TRANSACTION_RATIO_METRIC,
    USER_EXPENSE_REPORTING_RATE_METRIC,
    USER_MONTHLY_SPENDING_TREND_METRIC,
    WEEKLY_SCHEDULING_CAPACITY_TREND_METRIC,
    AssetMetadata,
    MeasureMetadata,
    MetricMetadata,
    ModelMetadata,
    SegmentMetadata,
    TableMetadata,
    default_user_config,
    full_access_user_config,
    get_benchmark_table,
    sql_gen_models_user_config,
    sql_user_config,
    sqlgen_raw_user_config,
)
from src.benchmarks.context import viewing_table_context as user_is_viewing_table_context
from src.metabase.client import BenchmarkMetabaseClient

# Re-export all constants for backward compatibility
__all__ = [
    # Functions
    "find_markdown_links",
    "get_ai_service_version",
    "get_metabase_version",
    "get_benchmark_table",
    "user_is_viewing_table_context",
    # Metadata classes
    "AssetMetadata",
    "TableMetadata",
    "MetricMetadata",
    "ModelMetadata",
    "MeasureMetadata",
    "SegmentMetadata",
    # Tables
    "BENCHMARK_TABLES",
    # Metrics
    "SCHEDULED_EVENTS_METRIC",
    "BOUNCE_COUNT_METRIC",
    "USER_ACTIVITY_LEVEL_DISTRIBUTION_METRIC",
    "WEEKLY_SCHEDULING_CAPACITY_TREND_METRIC",
    "MULTI_OPEN_RATE_METRIC",
    "CARD_UTILIZATION_RATE_METRIC",
    "CATEGORY_SPENDING_CONCENTRATION_METRIC",
    "USER_MONTHLY_SPENDING_TREND_METRIC",
    "DEPARTMENT_BUDGET_PERFORMANCE_METRIC",
    "EXPENSE_APPROVAL_CYCLE_TIME_METRIC",
    "CANCELLATION_RATE_VARIANCE_METRIC",
    "DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC",
    "TRANSACTION_SIZE_DISTRIBUTION_METRIC",
    "MULTI_EVENT_USER_PERCENTAGE_METRIC",
    "INVITEE_CANCELLATION_PROPENSITY_SCORE_METRIC",
    "TRANSFER_COMPLETION_RATE_METRIC",
    "AVERAGE_TRANSACTION_VALUE_BY_CATEGORY_METRIC",
    "USER_CARDS_PER_TRANSACTION_RATIO_METRIC",
    "QUARTERLY_TRANSACTION_VOLUME_METRIC",
    "MULTI_CLICK_RATE_METRIC",
    "SAME_DAY_BOOKING_CONVERSION_RATE_METRIC",
    "INVITEE_BOOKING_FREQUENCY_DISTRIBUTION_METRIC",
    "ROUTING_FORM_SUBMISSION_FUNNEL_DROP_RATE_METRIC",
    "CATEGORY_MERCHANT_DIVERSITY_METRIC",
    "HIGH_DEMAND_EVENT_SUBSTITUTION_RATE_METRIC",
    "ACCOUNT_NET_TRANSFER_BALANCE_METRIC",
    "DEPARTMENT_USER_SPENDING_INTENSITY_METRIC",
    "EXPENSE_SUBMISSION_EFFICIENCY_METRIC",
    "CARD_TRANSACTION_VOLUME_PER_CARD_METRIC",
    "TRANSFER_PROCESSING_SPEED_METRIC",
    "USER_EXPENSE_REPORTING_RATE_METRIC",
    "CATEGORY_USER_ADOPTION_RATE_METRIC",
    "NEWSLETTER_SUBSCRIBERS_METRIC",
    "BOUNCE_RATE_METRIC",
    "OPEN_RATE_METRIC",
    "CUSTOMER_CHURN_RATE_METRIC",
    "OPEN_TO_CLICK_CONVERSION_RATE_METRIC",
    "UNSUBSCRIBE_COUNT_METRIC",
    "CLICK_COUNT_METRIC",
    "INACTIVE_CUSTOMER_PERCENTAGE_METRIC",
    "AVERAGE_HOURS_TO_FIRST_CLICK_METRIC",
    "AVERAGE_HOURS_TO_FIRST_OPEN_METRIC",
    "AVERAGE_CLICKS_PER_EMAIL_METRIC",
    "AVERAGE_OPENS_PER_EMAIL_METRIC",
    "Q4_AOV_METRIC",
    "AVERAGE_RETURN_LOW_COST_CAMPAIGNS_METRIC",
    # Measures
    "AVERAGE_ORDER_VALUE_MEASURE",
    "TOTAL_NET_REVENUE_MEASURE",
    "AVERAGE_CUSTOMER_LIFETIME_VALUE_MEASURE",
    "TOTAL_MONTHLY_RECURRING_REVENUE_MEASURE",
    "AVERAGE_RETURN_ON_AD_SPEND_MEASURE",
    # Segments
    "NEW_CUSTOMERS_SEGMENT",
    "Q4_ORDERS_SEGMENT",
    "ACTIVE_SUBSCRIBERS_SEGMENT",
    "HIGH_PERFORMING_AD_CAMPAIGNS_SEGMENT",
    "LOW_COST_CONVERSION_AD_CAMPAIGNS_SEGMENT",
    # Models
    "SHOPIFY_ORDER_LINE_FACTS_MODEL",
    "SHOPIFY_REFUND_FACTS_MODEL",
    # Configs
    "default_user_config",
    "sql_user_config",
    "full_access_user_config",
    "sqlgen_raw_user_config",
    "sql_gen_models_user_config",
]


def find_markdown_links(text: str) -> list[str]:
    """Helper to find all markdown links in a given text. Returns a list of unique links."""
    return list(set(re.findall(r"\[.*?\]\((.*?)\)", text)))


def get_git_branch() -> str | None:
    try:
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"], stderr=subprocess.DEVNULL
        ).decode().strip()
        return branch or None
    except Exception:
        return None


def get_git_commit_sha() -> str | None:
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL
        ).decode().strip()
        return sha or None
    except Exception:
        return None


def get_ai_service_version():
    try:
        branch_name = subprocess.check_output(["git", "rev-parse", "--abbrev-ref", "HEAD"]).decode().strip()
        commit_hash = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"]).decode().strip()
        # Check whether files changed (new un-committed files are ignored)
        has_modifications = subprocess.check_output(["git", "diff", "--name-only"]).decode().strip() != ""
        if has_modifications:
            commit_hash += "-modified"
    except Exception:
        return "unknown"
    return f"{branch_name}__{commit_hash}"


async def get_metabase_version():
    version = "unknown"
    try:
        config = BenchmarkConfig()
        async with BenchmarkMetabaseClient(
            host=config.metabase_host,
            username=config.mb_tester_username,
            password=config.mb_tester_password,
        ) as client:
            session_info = await client.get_session_info()
            if version_info := session_info.get("version"):
                version = f"{version_info['tag']}__{version_info['date']}__{version_info['hash']}"
    except Exception as e:
        print(f"Error getting Metabase version: {e}")
    return version
