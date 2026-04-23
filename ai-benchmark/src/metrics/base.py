"""Base metric and test case classes for benchmarks."""

import asyncio
import json
import logging
import traceback
from abc import ABC, abstractmethod
from collections.abc import Sequence
from enum import Enum
from hashlib import sha256
from typing import Any, ClassVar

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field, computed_field

from src.core.results import (
    BenchmarkResult,
    ErrorExecutionMetadata,
    MetricResult,
    TestCaseResult,
)

logger = logging.getLogger(__name__)


class MetricFailureType(str, Enum):
    """Categorized failure types for metrics."""

    NO_QUERIES_FOUND = "no_queries_found"
    SQL_REPRESENTATION_FAILED = "sql_representation_failed"
    UNEXPECTED_ERROR = "unexpected_error"
    AGENT_QUERY_EXECUTION_FAILED = "agent_query_execution_failed"
    AGENT_QUERY_ERROR = "agent_query_error"
    REFERENCE_QUERY_EXECUTION_FAILED = "reference_query_execution_failed"
    REFERENCE_QUERY_ERROR = "reference_query_error"
    QUERY_ROW_COUNT_MISMATCH = "row_count_mismatch"
    QUERY_COLUMN_COUNT_MISMATCH = "column_count_mismatch"
    QUERY_RESULT_SET_DIFFERS = "result_set_differs"
    QUERY_NO_COLUMN_SUBSET_MATCH = "no_column_subset_match"


class MetricFailure(BaseModel):
    """Structured failure information for a metric."""

    message: str
    error: str | None = None
    failure_type: MetricFailureType


class ActionResult(BaseModel):
    """Tracks action quality for a single evaluation."""

    is_action_hallucination: bool = False
    is_hesitation: bool = False
    is_action_needed: bool = False


class MetricCategories(str, Enum):
    """Enum representing different categories of E2E metrics."""

    DATA_SOURCE_SELECTION = "Data Source Selection"
    QUERY_VALIDITY = "Query Validity"
    QUERY_LOGICAL_CORRECTNESS = "Query Logical Correctness"
    FINAL_RESPONSE_QUALITY = "Final Response Quality"
    TOOL_USAGE_CORRECTNESS = "Tool Usage Correctness"
    UNASSIGNED = "Unassigned"


class BaseMetric(BaseModel):
    """Base class for all benchmark metrics."""

    score: float = Field(init=False, default=0)
    reason: str = Field(init=False, default="Not provided", description="Reason for the score.")
    failures: list[MetricFailure] | None = Field(init=False, default=None)
    action_result: ActionResult | None = Field(
        default=None,
        description="Action metrics when the metric is evaluating action quality",
    )
    metadata: dict = Field(default_factory=dict, description="Additional metadata for the metric.")
    category: ClassVar[MetricCategories] = MetricCategories.UNASSIGNED

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    async def measure(self, test_case: "BaseTestCase"):
        """Measure the metric for a test case. Must be overridden."""
        raise NotImplementedError

    async def evaluate_action(self, test_case: "BaseTestCase") -> ActionResult | None:
        """Override to provide action metrics for the test case."""
        return None

    @computed_field
    def action_metrics(self) -> dict:
        if not self.action_result:
            return {}
        return {
            "is_action_hallucination": int(self.action_result.is_action_hallucination),
            "is_hesitation": int(self.action_result.is_hesitation),
            "is_action_needed": int(self.action_result.is_action_needed),
            "evaluated_actions": 1,
        }

    @property
    def runtime_data(self) -> dict:
        """Runtime evaluation artifacts specific to this metric."""
        return {}


def _get_metric_config(metric: BaseMetric) -> dict:
    """Extract configuration parameters from a metric instance."""
    all_fields = metric.model_dump(exclude={"action_metrics"})
    base_fields = {"score", "reason", "action_result", "metadata", "consider", "failures"}
    return {k: v for k, v in all_fields.items() if k not in base_fields}


def _get_metric_runtime_data(metric: BaseMetric) -> dict:
    """Extract runtime evaluation artifacts from a metric instance."""
    return metric.runtime_data


class Difficulty(str, Enum):
    """Test case difficulty classification."""

    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    UNLABELED = "unlabeled"


class BaseTestCase(BaseModel, ABC):
    """Base class for all test cases."""

    metrics: Sequence[BaseMetric] = Field(default_factory=list)
    difficulty: Difficulty = Difficulty.UNLABELED

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    async def run(self, *args, **kwargs):
        """Run all metrics for this test case."""
        for metric in self.metrics:
            try:
                await metric.measure(self)
            except Exception as e:
                logger.error("Error measuring metric %s for test case %s: %s", metric.__class__.__name__, self.id, e)
                metric.score = 0
                metric.reason = f"Error measuring metric: {e}"

    @computed_field
    def id(self) -> str:
        """Generate deterministic ID from input fields only."""
        input_data = self._get_id_fields()
        content_str = json.dumps(input_data, sort_keys=True, default=str)
        hash_digest = sha256(content_str.encode()).hexdigest()
        return f"{self.__class__.__name__}_{hash_digest[:12]}"

    @abstractmethod
    def _get_id_fields(self) -> dict:
        """Subclasses must implement this to return a dict of fields that define the test case."""
        pass

    @computed_field
    def metric_scores(self) -> pd.DataFrame:
        """Should be implemented in subclasses to return a DataFrame with the metric scores."""
        raise NotImplementedError

    @abstractmethod
    def _get_result_impl(self) -> TestCaseResult[Any]:
        """Subclasses must implement this to return their specific result type."""
        pass

    def get_result(self) -> TestCaseResult[Any]:
        """Safely collect test results, handling errors gracefully."""
        try:
            return self._get_result_impl()
        except Exception as e:
            logger.error(
                "Failed to collect results for test case %s: %s",
                getattr(self, "id", "unknown"),
                e,
                exc_info=True,
            )
            return TestCaseResult(
                test_case_id=getattr(self, "id", "error-unknown"),
                description=f"Error collecting results: {e}",
                difficulty=(
                    getattr(self, "difficulty", None).value
                    if hasattr(getattr(self, "difficulty", None), "value")
                    else getattr(self, "difficulty", None)
                ),
                token_usage=0,
                estimated_costs=0.0,
                response_duration=0.0,
                metadata=ErrorExecutionMetadata(
                    error_message=str(e),
                    error_type=type(e).__name__,
                    traceback=traceback.format_exc(),
                ),
                metrics=[
                    MetricResult(
                        metric_name=m.__class__.__name__,
                        score=0.0,
                        reason=f"Failed to collect results: {e}",
                        failures=[f.model_dump() for f in m.failures] if m.failures else None,
                        config=_get_metric_config(m),
                        runtime_data=_get_metric_runtime_data(m),
                        category=(
                            getattr(m.__class__, "category", None).value
                            if hasattr(getattr(m.__class__, "category", None), "value")
                            else getattr(m.__class__, "category", None)
                        ),
                    )
                    for m in self.metrics
                ],
            )


class Benchmark(BaseModel):
    """Base class for benchmark definitions."""

    name: str
    test_cases: Sequence[BaseTestCase]
    batch_size: int = 100

    async def setup_hook(self, **kwargs):
        """Called once before running any test cases."""
        pass

    async def teardown_hook(self, **kwargs):
        """Called once after all test cases complete."""
        pass

    async def pre_test_case_hook(self, **kwargs):
        """Called before each individual test case runs.

        NOTE: Only called when batch_size=1 (sequential execution)!
        """
        pass

    async def run(self, test_case_kwargs: dict = None):
        """Run all test cases in the benchmark."""
        if test_case_kwargs is None:
            test_case_kwargs = {}

        await self.setup_hook()

        for i in range(0, len(self.test_cases), self.batch_size):
            logger.info("Running batch %d of %d", i // self.batch_size + 1, len(self.test_cases) // self.batch_size + 1)
            batch = self.test_cases[i : i + self.batch_size]

            if self.batch_size == 1:
                for case in batch:
                    await self.pre_test_case_hook()
                    await case.run(**test_case_kwargs)
            else:
                await asyncio.gather(*[case.run(**test_case_kwargs) for case in batch])

        await self.teardown_hook()

    def get_result(self) -> BenchmarkResult:
        """Return structured result."""
        return BenchmarkResult(benchmark_name=self.name, test_case_results=[tc.get_result() for tc in self.test_cases])
