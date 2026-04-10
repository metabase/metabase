"""Metabase capabilities enumeration."""

from enum import Enum


class MetabaseCapabilities(str, Enum):
    """Capabilities available from Metabase that tools can use."""

    FEATURE_TRANSFORMS = "feature:transforms"
    FEATURE_TRANSFORMS_PYTHON = "feature:transforms-python"
    PERMISSION_WRITE_SQL_QUERY = "permission:write_sql_queries"
    PERMISSION_WRITE_TRANSFORMS = "permission:write_transforms"
    PERMISSION_SAVE_QUESTIONS = "permission:save_questions"
    FRONTEND_NAVIGATE_USER_V1 = "frontend:navigate_user_v1"
    BACKEND_QUERY_MODEL_V1 = "backend:/api/ee/metabot-tools/query-model"
    BACKEND_QUERY_DATASOURCE_V1 = "backend:/api/ee/metabot-tools/query-datasource"
    BACKEND_QUERY_METRIC_V1 = "backend:/api/ee/metabot-tools/query-metric"
    BACKEND_DASHBOARD_DETAILS_V1 = "backend:/api/ee/metabot-tools/get-dashboard-details"
    BACKEND_METRIC_DETAILS_V1 = "backend:/api/ee/metabot-tools/get-metric-details"
    BACKEND_REPORT_DETAILS_V1 = "backend:/api/ee/metabot-tools/get-report-details"
    BACKEND_TABLE_DETAILS_V1 = "backend:/api/ee/metabot-tools/get-table-details"
    BACKEND_GET_TABLES_V1 = "backend:/api/ee/metabot-tools/get-tables"
    BACKEND_QUERY_DETAILS_V1 = "backend:/api/ee/metabot-tools/get-query-details"
    BACKEND_ANSWER_SOURCES_V1 = "backend:/api/ee/metabot-tools/answer-sources"
    BACKEND_FIELD_VALUES_V1 = "backend:/api/ee/metabot-tools/field-values"
    BACKEND_GENERATE_INSIGHTS_V1 = "backend:/api/ee/metabot-tools/generate-insights"
    BACKEND_GET_TRANSFORM_DETAILS_V1 = "backend:/api/ee/metabot-tools/get-transform-details"
    BACKEND_GET_TRANSFORM_PYTHON_LIBRARY_DETAILS_V1 = (
        "backend:/api/ee/metabot-tools/get-transform-python-library-details"
    )
    BACKEND_SEARCH_V1 = "backend:/api/ee/metabot-tools/search"
    BACKEND_SEARCH_V2 = "backend:/api/ee/metabot-tools/search_v2"
    BACKEND_CHECK_TRANFORM_DEPENDENCIES_V1 = "backend:/api/ee/metabot-tools/check-transform-dependencies"
    BACKEND_CREATE_DASHBOARD_SUBSCRIPTION_V1 = "backend:/api/ee/metabot-tools/create-dashboard-subscription"
    BACKEND_CREATE_ALERT_V1 = "backend:/api/ee/metabot-tools/create-alert"


# Legacy capabilities for backward compatibility
legacy_capabilities = {
    MetabaseCapabilities.PERMISSION_WRITE_SQL_QUERY,
    MetabaseCapabilities.PERMISSION_SAVE_QUESTIONS,
    MetabaseCapabilities.FRONTEND_NAVIGATE_USER_V1,
    MetabaseCapabilities.BACKEND_QUERY_MODEL_V1,
    MetabaseCapabilities.BACKEND_QUERY_METRIC_V1,
    MetabaseCapabilities.BACKEND_DASHBOARD_DETAILS_V1,
    MetabaseCapabilities.BACKEND_METRIC_DETAILS_V1,
    MetabaseCapabilities.BACKEND_REPORT_DETAILS_V1,
    MetabaseCapabilities.BACKEND_TABLE_DETAILS_V1,
    MetabaseCapabilities.BACKEND_GET_TABLES_V1,
    MetabaseCapabilities.BACKEND_QUERY_DETAILS_V1,
    MetabaseCapabilities.BACKEND_ANSWER_SOURCES_V1,
    MetabaseCapabilities.BACKEND_FIELD_VALUES_V1,
    MetabaseCapabilities.BACKEND_GENERATE_INSIGHTS_V1,
    MetabaseCapabilities.BACKEND_SEARCH_V1,
}


def capability_to_feature(capability: MetabaseCapabilities) -> str | None:
    """Map a MetabaseCapabilities enum value to a Metabase feature name."""
    if capability.value.startswith("feature:"):
        return capability.value[len("feature:") :]
    return None
