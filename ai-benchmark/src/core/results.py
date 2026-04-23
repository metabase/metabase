"""Structured result models for benchmarks.

This module provides Pydantic models for benchmark results. The key benefits:

1. No token/cost duplication - test case metadata stored once, not per metric
2. Type safety - full Pydantic validation and IDE autocomplete
3. Clear hierarchy - Benchmark → TestCase → Metric
4. Explicit aggregations - all calculations are typed and testable

Architecture:
- MetricResult: Result of a single metric evaluation
- TestCaseResult[T]: Generic result with common fields + type-specific execution metadata
- BenchmarkResult: Aggregates test cases with computed statistics
- EvalResults: Aggregates multiple benchmarks
"""

import json
from pathlib import Path
from typing import Any, TypeVar

import pandas as pd
from pydantic import BaseModel, computed_field


class MetricResult(BaseModel):
    """Result of a single metric evaluation."""

    metric_name: str
    score: float
    reason: str
    failures: list[dict] | None = None

    # Metric-specific configuration parameters
    config: dict = {}
    # Runtime evaluation artifacts
    runtime_data: dict = {}

    # Action metrics
    is_action_hallucination: int = 0
    is_hesitation: int = 0
    is_action_needed: int = 0
    evaluated_actions: int = 0
    category: str | None = None


class AgentTestCaseMetadata(BaseModel):
    """Agent-specific execution metadata."""

    tool_calls: list[dict] | None = None
    message_history: list[dict] | None = None
    agent_step_messages: list[str] | None = None
    response: str
    conversation_id: str | None = None


class E2EAgentTestCaseMetadata(BaseModel):
    """E2E agent-specific execution metadata."""

    tool_calls: list[dict]
    agent_step_messages: list[dict[str, Any]]
    response: str
    message_history: list[dict]
    conversation_id: str | None = None
    response_state: dict | None = None


class StructuredCompletionExecutionMetadata(BaseModel):
    """Structured completion execution metadata."""

    args: str
    kwargs: str
    response: str | None
    error: str | None = None


class ErrorExecutionMetadata(BaseModel):
    """Error execution metadata for failed test cases."""

    error_message: str
    error_type: str
    traceback: str


TTestCaseMetadata = TypeVar("TTestCaseMetadata", bound=BaseModel)


class TestCaseResult[TTestCaseMetadata: BaseModel](BaseModel):
    """Generic test case result with composable execution metadata."""

    test_case_id: str
    description: str | None = None
    token_usage: int
    estimated_costs: float
    response_duration: float
    difficulty: str | None = None
    metadata: TTestCaseMetadata
    metrics: list[MetricResult]

    model_config = {"arbitrary_types_allowed": True}

    @computed_field
    @property
    def overall_score(self) -> float:
        if not self.metrics:
            return 0.0
        return sum(m.score for m in self.metrics) / len(self.metrics)

    @computed_field
    @property
    def passed(self) -> bool:
        return all(m.score == 1.0 for m in self.metrics)

    @computed_field
    @property
    def total_action_hallucinations(self) -> int:
        return sum(m.is_action_hallucination for m in self.metrics)

    @computed_field
    @property
    def total_hesitations(self) -> int:
        return sum(m.is_hesitation for m in self.metrics)

    @computed_field
    @property
    def total_evaluated_actions(self) -> int:
        return sum(m.evaluated_actions for m in self.metrics)

    @computed_field
    @property
    def actions_needed(self) -> int:
        return sum(m.is_action_needed for m in self.metrics)


class BenchmarkResult(BaseModel):
    """Aggregated results for a single benchmark."""

    benchmark_name: str
    test_case_results: list[TestCaseResult[Any]]

    @computed_field
    @property
    def total_test_cases(self) -> int:
        return len(self.test_case_results)

    @computed_field
    @property
    def passed_test_cases(self) -> int:
        return sum(1 for tc in self.test_case_results if tc.passed)

    @computed_field
    @property
    def passing_rate(self) -> float:
        if not self.test_case_results:
            return 0.0
        return self.passed_test_cases / self.total_test_cases

    @computed_field
    @property
    def total_token_usage(self) -> int:
        return sum(tc.token_usage for tc in self.test_case_results)

    @computed_field
    @property
    def total_costs(self) -> float:
        return sum(tc.estimated_costs for tc in self.test_case_results)

    @computed_field
    @property
    def avg_duration(self) -> float:
        if not self.test_case_results:
            return 0.0
        return sum(tc.response_duration for tc in self.test_case_results) / len(self.test_case_results)

    @computed_field
    @property
    def total_metrics(self) -> int:
        return sum(len(tc.metrics) for tc in self.test_case_results)

    @computed_field
    @property
    def total_score_abs(self) -> float:
        return sum(m.score for tc in self.test_case_results for m in tc.metrics)

    @computed_field
    @property
    def score_percent(self) -> float:
        if self.total_metrics == 0:
            return 0.0
        return (self.total_score_abs / self.total_metrics) * 100

    @computed_field
    @property
    def total_hallucinations(self) -> int:
        return sum(tc.total_action_hallucinations for tc in self.test_case_results)

    @computed_field
    @property
    def total_hesitations(self) -> int:
        return sum(tc.total_hesitations for tc in self.test_case_results)

    @computed_field
    @property
    def total_evaluated_actions(self) -> int:
        return sum(tc.total_evaluated_actions for tc in self.test_case_results)

    @computed_field
    @property
    def total_actions_needed(self) -> int:
        return sum(tc.actions_needed for tc in self.test_case_results)

    @computed_field
    @property
    def hallucination_rate(self) -> float:
        if self.total_evaluated_actions == 0:
            return 0.0
        return (self.total_hallucinations / self.total_evaluated_actions) * 100

    @computed_field
    @property
    def hesitation_rate(self) -> float:
        if self.total_actions_needed == 0:
            return 0.0
        return (self.total_hesitations / self.total_actions_needed) * 100

    def to_summary_dict(self) -> dict:
        return {
            "benchmark": self.benchmark_name,
            "score": f"{self.score_percent:.0f}% ({int(self.total_score_abs)}/{self.total_metrics})",
            "score_percent": self.score_percent,
            "passing_rate": f"{self.passing_rate * 100:.0f}% ({self.passed_test_cases}/{self.total_test_cases})",
            "hallucination_rate": f"{self.hallucination_rate:.0f}% ({self.total_hallucinations}/{self.total_evaluated_actions})",
            "hesitation_rate": f"{self.hesitation_rate:.0f}% ({self.total_hesitations}/{self.total_actions_needed})",
            "token_usage": self.total_token_usage,
            "costs": round(self.total_costs, 3),
            "avg_duration": round(self.avg_duration, 2),
        }

    def to_detailed_dataframe(self) -> pd.DataFrame:
        rows = []
        for tc in self.test_case_results:
            row = {
                "benchmark": self.benchmark_name,
                "test_case": tc.test_case_id,
                "description": tc.description,
                "token_usage": tc.token_usage,
                "estimated_costs": tc.estimated_costs,
                "response_duration": tc.response_duration,
                "score": tc.overall_score,
            }

            if isinstance(tc.metadata, AgentTestCaseMetadata):
                row.update(
                    {
                        "tool_calls": tc.metadata.tool_calls,
                        "message_history": tc.metadata.message_history,
                        "agent_step_messages": tc.metadata.agent_step_messages,
                        "response": tc.metadata.response,
                        "conversation_id": tc.metadata.conversation_id,
                    }
                )
            elif isinstance(tc.metadata, E2EAgentTestCaseMetadata):
                row.update(
                    {
                        "tool_calls": tc.metadata.tool_calls,
                        "message_history": tc.metadata.message_history,
                        "agent_step_messages": tc.metadata.agent_step_messages,
                        "response": tc.metadata.response,
                        "conversation_id": tc.metadata.conversation_id,
                        "response_state": tc.metadata.response_state,
                    }
                )
            elif isinstance(tc.metadata, ErrorExecutionMetadata):
                row.update(
                    {
                        "error_message": tc.metadata.error_message,
                        "error_type": tc.metadata.error_type,
                        "traceback": tc.metadata.traceback,
                        "tool_calls": None,
                        "message_history": None,
                        "response": None,
                    }
                )

            row["metrics"] = [
                {
                    "metric": metric.metric_name,
                    "score": metric.score,
                    "reason": metric.reason,
                    "failures": metric.failures,
                    "config": metric.config,
                    "runtime_data": metric.runtime_data,
                    "category": getattr(metric, "category", None),
                    "is_action_hallucination": metric.is_action_hallucination,
                    "is_hesitation": metric.is_hesitation,
                    "is_action_needed": metric.is_action_needed,
                    "evaluated_actions": metric.evaluated_actions,
                }
                for metric in tc.metrics
            ]
            rows.append(row)

        return pd.DataFrame(rows)


class EvalResults(BaseModel):
    """Container for results from multiple benchmarks."""

    profile_id: str
    benchmark_results: list[BenchmarkResult]

    @computed_field
    @property
    def total_token_usage(self) -> int:
        return sum(b.total_token_usage for b in self.benchmark_results)

    @computed_field
    @property
    def total_costs(self) -> float:
        return sum(b.total_costs for b in self.benchmark_results)

    @computed_field
    @property
    def total_score_abs(self) -> float:
        return sum(b.total_score_abs for b in self.benchmark_results)

    @computed_field
    @property
    def total_metrics(self) -> int:
        return sum(b.total_metrics for b in self.benchmark_results)

    @computed_field
    @property
    def overall_score_percent(self) -> float:
        if self.total_metrics == 0:
            return 0.0
        return (self.total_score_abs / self.total_metrics) * 100

    @computed_field
    @property
    def overall_passing_rate(self) -> float:
        total_passed = sum(b.passed_test_cases for b in self.benchmark_results)
        total_cases = sum(b.total_test_cases for b in self.benchmark_results)
        if total_cases == 0:
            return 0.0
        return total_passed / total_cases

    @computed_field
    @property
    def total_hallucinations(self) -> int:
        return sum(b.total_hallucinations for b in self.benchmark_results)

    @computed_field
    @property
    def total_hesitations(self) -> int:
        return sum(b.total_hesitations for b in self.benchmark_results)

    @computed_field
    @property
    def total_evaluated_actions(self) -> int:
        return sum(b.total_evaluated_actions for b in self.benchmark_results)

    @computed_field
    @property
    def total_actions_needed(self) -> int:
        return sum(b.total_actions_needed for b in self.benchmark_results)

    @computed_field
    @property
    def overall_hallucination_rate(self) -> float:
        if self.total_evaluated_actions == 0:
            return 0.0
        return (self.total_hallucinations / self.total_evaluated_actions) * 100

    @computed_field
    @property
    def overall_hesitation_rate(self) -> float:
        if self.total_actions_needed == 0:
            return 0.0
        return (self.total_hesitations / self.total_actions_needed) * 100

    def to_summary_dataframe(self) -> pd.DataFrame:
        return pd.DataFrame([b.to_summary_dict() for b in self.benchmark_results])

    def to_detailed_dataframe(self) -> pd.DataFrame:
        if not self.benchmark_results:
            return pd.DataFrame()
        return pd.concat([b.to_detailed_dataframe() for b in self.benchmark_results], ignore_index=True)

    def export_summary_csv(self, file_path: str):
        df = self.to_summary_dataframe()
        df.to_csv(file_path, index=False)

    def export_csvs(
        self,
        run_dir: str | Path,
        run_id: str,
        benchmark_suite: str | None = None,
        ai_service_version: str | None = None,
        metabase_version: str | None = None,
        sample: float | None = None,
        seed: int | None = None,
        duration: float | None = None,
        ran_at: str | None = None,
    ) -> None:
        run_dir = Path(run_dir)
        run_dir.mkdir(parents=True, exist_ok=True)

        benchmark_run_row = {
            "run_id": run_id,
            "profile_id": self.profile_id,
            "benchmark_suite": benchmark_suite,
            "ai_service_version": ai_service_version,
            "metabase_version": metabase_version,
            "sample_size": sample,
            "seed": seed,
            "ran_at": ran_at,
            "duration_in_seconds": duration,
            "total_score": self.overall_score_percent,
            "passing_rate": self.overall_passing_rate,
            "hallucination_rate_percentage": self.overall_hallucination_rate,
            "total_token_usage": self.total_token_usage,
            "estimated_costs": self.total_costs,
            "average_response_duration": (
                sum(b.avg_duration * b.total_test_cases for b in self.benchmark_results)
                / max(1, sum(b.total_test_cases for b in self.benchmark_results))
            ),
        }

        pd.DataFrame([benchmark_run_row]).to_csv(str(run_dir / "benchmark_run.csv"), index=False)

        test_case_rows: list[dict] = []
        metric_rows: list[dict] = []
        for bench in self.benchmark_results:
            for tc in bench.test_case_results:
                tc_id = tc.test_case_id
                test_case_run_id = f"{run_id}__{tc_id}"
                test_case_rows.append(
                    {
                        "test_case_run_id": test_case_run_id,
                        "test_case_id": tc_id,
                        "description": tc.description,
                        "run_id": run_id,
                        "benchmark_name": bench.benchmark_name,
                        "test_case_difficulty": getattr(tc, "difficulty", None),
                        "has_passed": tc.passed,
                        "score": tc.overall_score,
                        "token_usage": tc.token_usage,
                        "estimated_costs": tc.estimated_costs,
                        "response_duration": tc.response_duration,
                    }
                )

                for m in tc.metrics:
                    metric_rows.append(
                        {
                            "run_id": run_id,
                            "test_case_run_id": test_case_run_id,
                            "test_case_difficulty": getattr(tc, "difficulty", None),
                            "metric_name": m.metric_name,
                            "metric_category": getattr(m, "category", None),
                            "metric_score": m.score,
                            "metric_reason": m.reason,
                            "metric_failures": json.dumps(m.failures) if m.failures else None,
                            "is_action_needed": int(m.is_action_needed),
                            "is_action_hallucination": int(m.is_action_hallucination),
                            "is_hesitation": int(m.is_hesitation),
                            "is_action_evaluated": int(m.evaluated_actions > 0),
                        }
                    )

        pd.DataFrame(test_case_rows).to_csv(str(run_dir / "test_case_results.csv"), index=False)
        pd.DataFrame(metric_rows).to_csv(str(run_dir / "metric_results.csv"), index=False)


def export_combined_json(
    file_path: str | Path,
    runs: list[tuple["EvalResults", dict]],
) -> None:
    """Write a combined multi-profile results.json.

    Each entry is {"metadata": {...}, "results": [...]} where results is the
    flat test-case record array from EvalResults.to_detailed_dataframe().
    """
    payload = []
    for results, metadata in runs:
        df = results.to_detailed_dataframe()
        detail_json = df.to_json(orient="records")
        payload.append({"metadata": metadata, "results": json.loads(detail_json) if detail_json else []})
    with open(file_path, "w") as f:
        json.dump(payload, f, indent=2, default=str)
