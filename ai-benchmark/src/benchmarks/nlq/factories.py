"""Unified factory functions for NLQ test cases."""

from typing import Literal

from src.benchmarks.context import (
    add_entity_mention,
    viewing_metric_context,
    viewing_table_context,
)
from src.benchmarks.consts import MetricMetadata, TableMetadata
from src.benchmarks.metric_presets import nlq_metric_metrics, nlq_table_metrics
from src.core.test_case import DEFAULT_GLOBAL_CONTEXT_E2E, E2EAgentTestCase
from src.metabase import MetabaseCapabilities
from src.metrics import (
    QueryUsesMeasures,
    QueryUsesSegments,
    ResponseCorrectnessE2E,
)


def create_nlq_test_cases(
    cases: list[dict],
    entity_type: Literal["table", "metric"],
    mention_entity: bool = False,
    user_is_viewing: bool = False,
) -> list[E2EAgentTestCase]:
    """Unified factory for NLQ test cases.

    Args:
        cases: List of test case dictionaries. Each must contain:
            - 'table' or 'metric': The entity metadata
            - 'question': The user's question
            - 'expected_query': Description of expected query
            - Optional: 'current_user_time', 'measure_ids', 'segment_ids', 'response_expectation'
        entity_type: Whether test cases use tables or metrics
        mention_entity: Whether to append entity reference to question
        user_is_viewing: Whether to simulate user viewing the entity
    """
    entity_key = entity_type  # 'table' or 'metric'
    test_cases = []

    for case in cases:
        entity = case[entity_key]
        question = case["question"]
        query_description = case["expected_query"]
        user_time = case.get("current_user_time")

        context = DEFAULT_GLOBAL_CONTEXT_E2E.copy()
        context["capabilities"] = [
            MetabaseCapabilities.FRONTEND_NAVIGATE_USER_V1,
            MetabaseCapabilities.PERMISSION_SAVE_QUESTIONS,
        ]

        if user_time:
            context["current_time_with_timezone"] = user_time

        if user_is_viewing:
            if entity_type == "table":
                context["user_is_viewing"] = [viewing_table_context(entity)]
            else:
                context["user_is_viewing"] = [viewing_metric_context(entity)]

        if mention_entity:
            question = add_entity_mention(question, entity)

        if entity_type == "table":
            metrics = nlq_table_metrics(entity, query_description)
            if case.get("measure_ids"):
                metrics.append(QueryUsesMeasures(measure_ids=case["measure_ids"]))
            if case.get("segment_ids"):
                metrics.append(QueryUsesSegments(segment_ids=case["segment_ids"]))
        else:
            metrics = nlq_metric_metrics(entity, query_description)

        if case.get("response_expectation"):
            metrics.append(ResponseCorrectnessE2E(expectation=case["response_expectation"]))

        test_case = E2EAgentTestCase(
            context=context,
            message=question,
            metrics=metrics,
        )
        test_cases.append(test_case)

    return test_cases
