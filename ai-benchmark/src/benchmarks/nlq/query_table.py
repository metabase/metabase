from src.benchmarks.helpers import (
    default_user_config,
    full_access_user_config,
)
from src.benchmarks.nlq.data.table_queries import (
    aggregations,
    categorical_filters,
    complex_combined_queries,
    grouping,
    measures_and_segments,
    numeric_filters,
    sorting_and_limits,
    temporal_filters,
)
from src.benchmarks.nlq.factories import create_nlq_test_cases
from src.core.base import BenchmarkE2E


# Aggregations benchmarks
aggregations_table_mentioned = BenchmarkE2E(
    name="NLQ Tables - Aggregations (table mentioned)",
    test_cases=create_nlq_test_cases(cases=aggregations, entity_type="table", mention_entity=True),
    config=default_user_config,
)
aggregations_user_viewing_table = BenchmarkE2E(
    name="NLQ Tables - Aggregations (user viewing table)",
    test_cases=create_nlq_test_cases(cases=aggregations, entity_type="table", user_is_viewing=True),
    config=default_user_config,
)
aggregations_no_context = BenchmarkE2E(
    name="NLQ Tables - Aggregations (no context)",
    test_cases=create_nlq_test_cases(cases=aggregations, entity_type="table"),
    config=default_user_config,
)

# Categorical filters benchmarks
categorical_filters_table_mentioned = BenchmarkE2E(
    name="NLQ Tables - Categorical filters (table mentioned)",
    test_cases=create_nlq_test_cases(cases=categorical_filters, entity_type="table", mention_entity=True),
    config=default_user_config,
)
categorical_filters_user_viewing_table = BenchmarkE2E(
    name="NLQ Tables - Categorical filters (user viewing table)",
    test_cases=create_nlq_test_cases(cases=categorical_filters, entity_type="table", user_is_viewing=True),
    config=default_user_config,
)
categorical_filters_no_context = BenchmarkE2E(
    name="NLQ Tables - Categorical filters (no context)",
    test_cases=create_nlq_test_cases(cases=categorical_filters, entity_type="table"),
    config=default_user_config,
)

# Numeric filters benchmarks
numeric_filters_table_mentioned = BenchmarkE2E(
    name="NLQ Tables - Numeric filters (table mentioned)",
    test_cases=create_nlq_test_cases(cases=numeric_filters, entity_type="table", mention_entity=True),
    config=default_user_config,
)
numeric_filters_user_viewing_table = BenchmarkE2E(
    name="NLQ Tables - Numeric filters (user viewing table)",
    test_cases=create_nlq_test_cases(cases=numeric_filters, entity_type="table", user_is_viewing=True),
    config=default_user_config,
)
numeric_filters_no_context = BenchmarkE2E(
    name="NLQ Tables - Numeric filters (no context)",
    test_cases=create_nlq_test_cases(cases=numeric_filters, entity_type="table"),
    config=default_user_config,
)

# Temporal filters benchmarks
temporal_filters_table_mentioned = BenchmarkE2E(
    name="NLQ Tables - Temporal filters (table mentioned)",
    test_cases=create_nlq_test_cases(cases=temporal_filters, entity_type="table", mention_entity=True),
    config=default_user_config,
)
temporal_filters_user_viewing_table = BenchmarkE2E(
    name="NLQ Tables - Temporal filters (user viewing table)",
    test_cases=create_nlq_test_cases(cases=temporal_filters, entity_type="table", user_is_viewing=True),
    config=default_user_config,
)
temporal_filters_no_context = BenchmarkE2E(
    name="NLQ Tables - Temporal filters (no context)",
    test_cases=create_nlq_test_cases(cases=temporal_filters, entity_type="table"),
    config=default_user_config,
)

# Grouping benchmarks
grouping_table_mentioned = BenchmarkE2E(
    name="NLQ Tables - Grouping (table mentioned)",
    test_cases=create_nlq_test_cases(cases=grouping, entity_type="table", mention_entity=True),
    config=default_user_config,
)
grouping_user_viewing_table = BenchmarkE2E(
    name="NLQ Tables - Grouping (user viewing table)",
    test_cases=create_nlq_test_cases(cases=grouping, entity_type="table", user_is_viewing=True),
    config=default_user_config,
)
grouping_no_context = BenchmarkE2E(
    name="NLQ Tables - Grouping (no context)",
    test_cases=create_nlq_test_cases(cases=grouping, entity_type="table"),
    config=default_user_config,
)

# Sorting and limits benchmarks
sorting_and_limits_table_mentioned = BenchmarkE2E(
    name="NLQ Tables - Sorting and Limits (table mentioned)",
    test_cases=create_nlq_test_cases(cases=sorting_and_limits, entity_type="table", mention_entity=True),
    config=default_user_config,
)
sorting_and_limits_user_viewing_table = BenchmarkE2E(
    name="NLQ Tables - Sorting and Limits (user viewing table)",
    test_cases=create_nlq_test_cases(cases=sorting_and_limits, entity_type="table", user_is_viewing=True),
    config=default_user_config,
)
sorting_and_limits_no_context = BenchmarkE2E(
    name="NLQ Tables - Sorting and Limits (no context)",
    test_cases=create_nlq_test_cases(cases=sorting_and_limits, entity_type="table"),
    config=default_user_config,
)

# Complex combined queries benchmarks
complex_combined_queries_table_mentioned = BenchmarkE2E(
    name="NLQ Tables - Complex Combined Queries (table mentioned)",
    test_cases=create_nlq_test_cases(cases=complex_combined_queries, entity_type="table", mention_entity=True),
    config=default_user_config,
)
complex_combined_queries_user_viewing_table = BenchmarkE2E(
    name="NLQ Tables - Complex Combined Queries (user viewing table)",
    test_cases=create_nlq_test_cases(cases=complex_combined_queries, entity_type="table", user_is_viewing=True),
    config=default_user_config,
)
complex_combined_queries_no_context = BenchmarkE2E(
    name="NLQ Tables - Complex Combined Queries (no context)",
    test_cases=create_nlq_test_cases(cases=complex_combined_queries, entity_type="table"),
    config=default_user_config,
)

# Measures and segments benchmarks
measures_and_segments_table_mentioned = BenchmarkE2E(
    name="NLQ Tables - Measures and Segments (table mentioned)",
    test_cases=create_nlq_test_cases(cases=measures_and_segments, entity_type="table", mention_entity=True),
    config=full_access_user_config,
)
measures_and_segments_user_viewing_table = BenchmarkE2E(
    name="NLQ Tables - Measures and Segments (user viewing table)",
    test_cases=create_nlq_test_cases(cases=measures_and_segments, entity_type="table", user_is_viewing=True),
    config=full_access_user_config,
)
measures_and_segments_no_context = BenchmarkE2E(
    name="NLQ Tables - Measures and Segments (no context)",
    test_cases=create_nlq_test_cases(cases=measures_and_segments, entity_type="table"),
    config=full_access_user_config,
)
