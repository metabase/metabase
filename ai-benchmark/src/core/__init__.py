"""Core module for benchmark infrastructure.

This module provides the foundational classes and utilities for running
AI agent benchmarks against a live Metabase instance.

Re-exports:
- BenchmarkE2E: E2E benchmark runner class
- E2EAgentTestCase: Test case class for E2E benchmarks
- Result models: BenchmarkResult, TestCaseResult, MetricResult, etc.
- run_benchmark: Main entry point for running benchmarks
- upload_benchmark_results: Upload results to database
"""

from src.core.base import BenchmarkE2E
from src.core.results import (
    BenchmarkResult,
    E2EAgentTestCaseMetadata,
    ErrorExecutionMetadata,
    EvalResults,
    MetricResult,
    TestCaseResult,
)
from src.core.test_case import DEFAULT_GLOBAL_CONTEXT_E2E, E2EAgentTestCase


def __getattr__(name: str):
    """Lazy import for run_benchmark and upload_benchmark_results to avoid circular imports."""
    if name == "run_benchmark":
        from src.core.executor import run_benchmark

        return run_benchmark
    if name == "upload_benchmark_results":
        from src.core.db_upload import upload_benchmark_results

        return upload_benchmark_results
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "BenchmarkE2E",
    "BenchmarkResult",
    "DEFAULT_GLOBAL_CONTEXT_E2E",
    "E2EAgentTestCase",
    "E2EAgentTestCaseMetadata",
    "ErrorExecutionMetadata",
    "EvalResults",
    "MetricResult",
    "run_benchmark",
    "TestCaseResult",
    "upload_benchmark_results",
]
