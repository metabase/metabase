"""Modular evaluators for query result comparison."""

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from src.metrics.base import MetricFailureType
from src.validation.fingerprinter import ColumnSubsetMatchComparator, MultisetRowHashComparator


@dataclass
class EvaluatorResult:
    """Result from a single evaluator."""

    passed: bool
    message: str
    details: dict
    failure_type: MetricFailureType | None = None


class QueryResultEvaluator(ABC):
    """Base class for all result evaluators."""

    @abstractmethod
    def evaluate(self, agent_rows: Sequence[Sequence[Any]], ref_rows: Sequence[Sequence[Any]]) -> EvaluatorResult:
        """Compare agent results to reference results."""
        pass


class SimpleEvaluator(QueryResultEvaluator):
    """Basic structural checks without deep comparison."""

    def __init__(self, row_counts: bool = True, col_counts: bool = True):
        self.row_counts = row_counts
        self.col_counts = col_counts

    def evaluate(self, agent_rows: Sequence[Sequence[Any]], ref_rows: Sequence[Sequence[Any]]) -> EvaluatorResult:
        if self.row_counts and len(agent_rows) != len(ref_rows):
            return EvaluatorResult(
                passed=False,
                message=f"Row count mismatch: {len(agent_rows)} vs {len(ref_rows)}",
                details={"agent_count": len(agent_rows), "ref_count": len(ref_rows)},
                failure_type=MetricFailureType.QUERY_ROW_COUNT_MISMATCH,
            )

        if self.col_counts:
            agent_cols = len(agent_rows[0]) if agent_rows else 0
            ref_cols = len(ref_rows[0]) if ref_rows else 0
            if agent_cols != ref_cols:
                return EvaluatorResult(
                    passed=False,
                    message=f"Column count mismatch: {agent_cols} vs {ref_cols}",
                    details={"agent_count": agent_cols, "ref_count": ref_cols},
                    failure_type=MetricFailureType.QUERY_COLUMN_COUNT_MISMATCH,
                )

        return EvaluatorResult(passed=True, message="Basic checks passed", details={})


class ExactEvaluator(QueryResultEvaluator):
    """Exact result set comparison (no extra columns allowed)."""

    def __init__(
        self,
        ignore_row_order: bool = True,
        float_precision: int | None = 6,
        coerce_types: bool = False,
    ):
        self.comparator = MultisetRowHashComparator(
            float_precision=float_precision,
            coerce_types=coerce_types,
        )
        self.ignore_row_order = ignore_row_order

    def evaluate(self, agent_rows: Sequence[Sequence[Any]], ref_rows: Sequence[Sequence[Any]]) -> EvaluatorResult:
        if not self.ignore_row_order:
            if len(agent_rows) != len(ref_rows):
                diff = self.comparator.diff(agent_rows, ref_rows)
                return EvaluatorResult(
                    passed=False,
                    message=f"Row count mismatch: {len(agent_rows)} vs {len(ref_rows)}",
                    details={"diff": diff},
                    failure_type=MetricFailureType.QUERY_RESULT_SET_DIFFERS,
                )

            for i, (agent_row, ref_row) in enumerate(zip(agent_rows, ref_rows, strict=False)):
                agent_normalized = self.comparator.normalize_row(agent_row)
                ref_normalized = self.comparator.normalize_row(ref_row)
                if agent_normalized != ref_normalized:
                    diff = self.comparator.diff(agent_rows, ref_rows)
                    return EvaluatorResult(
                        passed=False,
                        message=f"Row {i} differs",
                        details={"diff": diff, "row_index": i},
                        failure_type=MetricFailureType.QUERY_RESULT_SET_DIFFERS,
                    )

            return EvaluatorResult(passed=True, message="Result sets match exactly (ordered)", details={})
        else:
            passed = self.comparator.compare(agent_rows, ref_rows)

            if not passed:
                diff = self.comparator.diff(agent_rows, ref_rows)
                return EvaluatorResult(
                    passed=False,
                    message="Result sets differ",
                    details={"diff": diff},
                    failure_type=MetricFailureType.QUERY_RESULT_SET_DIFFERS,
                )

            return EvaluatorResult(passed=True, message="Result sets match exactly", details={})


class SubsetEvaluator(QueryResultEvaluator):
    """Allow agent to have extra columns."""

    def __init__(
        self,
        float_precision: int | None = 6,
        coerce_types: bool = False,
        max_candidates: int = 1000,
    ):
        self.comparator = ColumnSubsetMatchComparator(
            float_precision=float_precision,
            coerce_types=coerce_types,
        )
        self.max_candidates = max_candidates

    def evaluate(self, agent_rows: Sequence[Sequence[Any]], ref_rows: Sequence[Sequence[Any]]) -> EvaluatorResult:
        result = self.comparator.find_column_subset_match(agent_rows, ref_rows, max_candidates=self.max_candidates)

        if not result["match"]:
            reason = result.get("reason", "no_matching_column_subset")
            return EvaluatorResult(
                passed=False,
                message=f"No column subset matches reference: {reason}",
                details=result,
                failure_type=MetricFailureType.QUERY_NO_COLUMN_SUBSET_MATCH,
            )

        return EvaluatorResult(
            passed=True,
            message=f"Columns {result['column_mapping']} match reference",
            details=result,
        )
