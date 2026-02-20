"""Benchmarking utilities for chart statistics computation.

Usage:
    # Quick benchmark
    python analyze_chart_bench.py

    # Benchmark with saved artifacts
    python analyze_chart_bench.py --save

    # Interactive usage
    from analyze_chart_bench import generate_chart_config, quick_bench, analyze_chart_output

    cfg = generate_chart_config(n_series=3, n_points=100)
    quick_bench(n_points=1000, n_series=5)
    print(analyze_chart_output(cfg, deep=True))
"""

import json
import math
import random
import time
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path

from ai_service.features.types import (
    ChartConfigSchema,
    ColumnInfo,
    ColumnType,
    SeriesConfig,
)
from ai_service.stats.chart_stats import compute_chart_stats


# ------------------------------------------------ Data Generation --------------------------------------------------

SERIES_NAMES = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa"]


class ValuePattern(str, Enum):
    RANDOM = "random"
    LINEAR = "linear"
    VOLATILE = "volatile"
    SEASONAL = "seasonal"


def generate_timestamps(n: int) -> list[str]:
    """Generate a sequence of ISO datetime strings.

    Uses adaptive intervals based on point count to stay within datetime limits:
    - Monthly intervals for n <= 90,000 (covers ~7,500 years from 2022)
    - Daily intervals for n <= 2,500,000
    - Minute intervals for larger datasets
    """
    start = datetime(2022, 1, 1, 0, 0, 0)
    timestamps = []

    if n <= 90_000:
        # Monthly intervals
        for i in range(n):
            year = start.year + (start.month + i - 1) // 12
            month = (start.month + i - 1) % 12 + 1
            dt = datetime(year, month, 1, 0, 0, 0)
            timestamps.append(dt.isoformat())
    elif n <= 2_500_000:
        # Daily intervals
        for i in range(n):
            year = start.year + i // 365
            day_of_year = i % 365
            month = day_of_year // 30 + 1
            day = day_of_year % 30 + 1
            if month > 12:
                month = 12
                day = 31
            dt = datetime(year, month, day, 0, 0, 0)
            timestamps.append(dt.isoformat())
    else:
        # Minute intervals
        for i in range(n):
            minutes_total = i
            hours, minutes = divmod(minutes_total, 60)
            days, hours = divmod(hours, 24)
            years, days = divmod(days, 365)
            year = start.year + years
            month = days // 30 + 1
            day = days % 30 + 1
            if month > 12:
                month = 12
                day = 31
            dt = datetime(year, month, day, hours, minutes, 0)
            timestamps.append(dt.isoformat())

    return timestamps


def generate_values(
    n: int,
    pattern: ValuePattern = ValuePattern.RANDOM,
    base: float = 100.0,
    scale: float = 1.0,
) -> list[float]:
    """Generate numeric values with optional pattern.

    Args:
        n: Number of values to generate
        pattern: Value pattern - random (random walk), linear, volatile, seasonal
        base: Starting value
        scale: Value range multiplier
    """
    if pattern == ValuePattern.LINEAR:
        return [base + scale * i for i in range(n)]

    if pattern == ValuePattern.VOLATILE:
        return [base + scale * 100 * (random.random() - 0.5) for _ in range(n)]

    if pattern == ValuePattern.SEASONAL:
        return [
            base + scale * 30 * math.sin(2 * math.pi * i / 12) + scale * 10 * (random.random() - 0.5) for i in range(n)
        ]

    # random - gentle random walk
    values = []
    prev = base
    for _ in range(n):
        change = scale * 10 * (random.random() - 0.5)
        next_val = max(0, prev + change)
        values.append(next_val)
        prev = next_val
    return values


def generate_series(
    name: str = "Series",
    n_points: int = 50,
    pattern: ValuePattern = ValuePattern.RANDOM,
    base: float = 100.0,
    scale: float = 1.0,
) -> SeriesConfig:
    """Generate a single series configuration.

    Args:
        name: Series name
        n_points: Number of data points
        pattern: Value pattern - random, linear, volatile, seasonal
        base: Starting value
        scale: Value multiplier
    """
    timestamps = generate_timestamps(n_points)
    values = generate_values(n_points, pattern=pattern, base=base, scale=scale)

    return SeriesConfig(
        x=ColumnInfo(name="timestamp", type=ColumnType.DATETIME),
        y=ColumnInfo(name="value", type=ColumnType.NUMBER),
        x_values=timestamps,
        y_values=values,
        display_name=name,
        chart_type="line",
        stacked=False,
    )


def generate_chart_config(
    n_series: int = 1,
    n_points: int = 50,
    pattern: ValuePattern = ValuePattern.RANDOM,
    title: str | None = None,
) -> ChartConfigSchema:
    """Generate a complete chart configuration for testing.

    Args:
        n_series: Number of series
        n_points: Data points per series
        pattern: Value pattern for all series
        title: Chart title
    """
    names = SERIES_NAMES[:n_series]
    series = {}

    for idx, series_name in enumerate(names):
        series[series_name] = generate_series(
            name=series_name,
            n_points=n_points,
            pattern=pattern,
            base=80 + 20 * idx,
            scale=0.8 + 0.4 * random.random(),
        )

    return ChartConfigSchema(
        series=series,
        timeline_events=[],
        display_type="line",
        title=title,
    )


# --------------------------------------------------- Utilities -----------------------------------------------------


def analyze_chart_output(chart_config: ChartConfigSchema, deep: bool = False) -> str:
    """Run the full analyze-chart pipeline and return the markdown output.

    Args:
        chart_config: A chart configuration
        deep: Whether to compute deep statistics
    """
    stats = compute_chart_stats(chart_config, deep=deep)
    return stats.get_comprehensive_representation(chart_title=chart_config.title)


def get_stats(chart_config: ChartConfigSchema, deep: bool = False):
    """Compute chart statistics without generating representation.
    Useful for inspecting the raw stats data structure.
    """
    return compute_chart_stats(chart_config, deep=deep)


def generate_repr(stats, title: str | None = None) -> str:
    """Generate markdown representation from pre-computed stats.
    Useful for testing representation separately from computation.
    """
    return stats.get_comprehensive_representation(chart_title=title)


# ------------------------------------------------ Saving Artifacts ------------------------------------------------

DEFAULT_OUTPUT_DIR = Path("./analyze-chart-bench-runs")


def save_bench_artifacts(
    chart_config: ChartConfigSchema,
    output_md: str,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
) -> tuple[Path, Path]:
    """Save benchmark artifacts to disk.

    Args:
        chart_config: The chart configuration used
        output_md: The markdown output from analysis
        output_dir: Directory to save artifacts

    Returns:
        Tuple of (config_path, output_path)
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    config_path = output_dir / "chart_config_input.json"
    output_path = output_dir / "bench_output.md"

    config_path.write_text(chart_config.model_dump_json(indent=2))
    output_path.write_text(output_md)

    return config_path, output_path


# -------------------------------------------------- Benchmarking ---------------------------------------------------


@dataclass
class BenchResult:
    """Benchmark results."""

    n_points: int
    n_series: int
    total_points: int
    deep: bool
    runs: int
    times_ms: list[float]
    min_ms: float
    max_ms: float
    mean_ms: float
    throughput_pts_per_ms: float


def elapsed_ms(func) -> tuple[any, float]:
    """Execute func and return (result, elapsed_ms)."""
    start = time.perf_counter_ns()
    result = func()
    end = time.perf_counter_ns()
    return result, (end - start) / 1e6


def quick_bench(
    n_points: int,
    n_series: int = 1,
    deep: bool = False,
    warmup: int = 3,
    runs: int = 5,
    config: ChartConfigSchema | None = None,
) -> tuple[BenchResult, ChartConfigSchema]:
    """Quick benchmark of analyze-chart with generated data.

    Args:
        n_points: Data points per series
        n_series: Number of series
        deep: Run with deep statistics
        warmup: Number of warmup iterations
        runs: Number of timed runs
        config: Optional pre-generated config (if None, generates one)

    Returns:
        Tuple of (BenchResult with timing statistics, ChartConfigSchema used)
    """
    if config is None:
        config = generate_chart_config(n_series=n_series, n_points=n_points)

    def run_fn():
        return compute_chart_stats(config, deep=deep)

    # Warmup
    for _ in range(warmup):
        run_fn()

    # Timed runs
    times = []
    for _ in range(runs):
        _, elapsed = elapsed_ms(run_fn)
        times.append(elapsed)

    total_points = n_points * n_series
    mean_ms = sum(times) / len(times)

    result = BenchResult(
        n_points=n_points,
        n_series=n_series,
        total_points=total_points,
        deep=deep,
        runs=runs,
        times_ms=times,
        min_ms=min(times),
        max_ms=max(times),
        mean_ms=mean_ms,
        throughput_pts_per_ms=total_points / mean_ms if mean_ms > 0 else 0,
    )
    return result, config


def print_bench(
    n_points: int,
    n_series: int = 1,
    deep: bool = False,
    warmup: int = 3,
    runs: int = 5,
    config: ChartConfigSchema | None = None,
) -> tuple[BenchResult, ChartConfigSchema]:
    """Run quick_bench and print formatted results.

    Returns:
        Tuple of (BenchResult, ChartConfigSchema used)
    """
    result, config = quick_bench(n_points, n_series, deep=deep, warmup=warmup, runs=runs, config=config)

    print(f"Benchmark: {result.n_points} points × {result.n_series} series = {result.total_points} total (deep={result.deep})")
    print(f"  Runs: {result.runs} | Min: {result.min_ms:.2f} ms | Max: {result.max_ms:.2f} ms | Mean: {result.mean_ms:.2f} ms")
    print(f"  Throughput: {result.throughput_pts_per_ms:.1f} points/ms")

    return result, config


def run_benchmark_suite(deep: bool = False) -> None:
    """Run a suite of benchmarks with various configurations."""
    print(f"\n{'=' * 60}")
    print(f"Chart Statistics Benchmark Suite (deep={deep})")
    print(f"{'=' * 60}\n")

    configs = [
        (50, 1),
        (100, 1),
        (100, 3),
        (500, 1),
        (500, 3),
        (1000, 1),
        (1000, 5),
        (5000, 1),
        (5000, 3),
    ]

    for n_points, n_series in configs:
        _ = print_bench(n_points, n_series, deep=deep)
        print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Benchmark chart statistics computation")
    parser.add_argument("--points", "-p", type=int, default=100, help="Data points per series")
    parser.add_argument("--series", "-s", type=int, default=1, help="Number of series")
    parser.add_argument("--deep", "-d", action="store_true", help="Run deep statistics")
    parser.add_argument("--warmup", "-w", type=int, default=3, help="Warmup iterations")
    parser.add_argument("--runs", "-r", type=int, default=5, help="Timed runs")
    parser.add_argument("--suite", action="store_true", help="Run full benchmark suite")
    parser.add_argument("--output", "-o", action="store_true", help="Print sample output instead of benchmarking")
    parser.add_argument("--save", action="store_true", help="Save chart config and output to ./analyze-chart-bench-runs/")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Directory to save artifacts")

    args = parser.parse_args()

    if args.output:
        cfg = generate_chart_config(n_series=args.series, n_points=args.points)
        output_md = analyze_chart_output(cfg, deep=args.deep)
        print(output_md)

        if args.save:
            config_path, output_path = save_bench_artifacts(cfg, output_md, args.output_dir)
            print(f"\nSaved artifacts to:")
            print(f"  Config: {config_path}")
            print(f"  Output: {output_path}")

    elif args.suite:
        run_benchmark_suite(deep=False)
        run_benchmark_suite(deep=True)
    else:
        _, cfg = print_bench(args.points, args.series, deep=args.deep, warmup=args.warmup, runs=args.runs)

        if args.save:
            output_md = analyze_chart_output(cfg, deep=args.deep)
            config_path, output_path = save_bench_artifacts(cfg, output_md, args.output_dir)
            print(f"\nSaved artifacts to:")
            print(f"  Config: {config_path}")
            print(f"  Output: {output_path}")
