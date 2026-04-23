"""Search benchmarks for data asset and documentation search."""

from src.benchmarks.search.data_asset import data_asset_search_benchmark
from src.benchmarks.search.documentation import documentation_search_benchmark

__all__ = [
    "data_asset_search_benchmark",
    "documentation_search_benchmark",
]
