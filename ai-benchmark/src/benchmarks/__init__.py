"""Benchmark module for AI evaluation.

This module provides the benchmark infrastructure for evaluating
AI agents against a running Metabase instance.
"""

from src.benchmarks.config import BenchmarkConfig
from src.core.base import BenchmarkE2E
from src.core.test_case import (
    DEFAULT_GLOBAL_CONTEXT_E2E,
    E2EAgentTestCase,
)

__all__ = [
    "BenchmarkConfig",
    "BenchmarkE2E",
    "DEFAULT_GLOBAL_CONTEXT_E2E",
    "E2EAgentTestCase",
]
