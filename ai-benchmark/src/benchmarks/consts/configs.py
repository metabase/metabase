"""Pre-configured benchmark user configs."""

from src.benchmarks.config import BenchmarkConfig

default_user_config = BenchmarkConfig(
    mb_admin_username="admin@example.com",
    mb_admin_password="benchmark123",
    mb_tester_username="user@example.com",
    mb_tester_password="benchmark123",
)

sql_user_config = BenchmarkConfig(
    mb_admin_username="admin@example.com",
    mb_admin_password="benchmark123",
    mb_tester_username="sql@example.com",
    mb_tester_password="benchmark123",
)

# User with full access to all Metabase features (but not admin)
full_access_user_config = BenchmarkConfig(
    mb_admin_username="admin@example.com",
    mb_admin_password="benchmark123",
    mb_tester_username="full_access@example.com",
    mb_tester_password="benchmark123",
)

# SQL Gen user, has raw data table access but not transform tables
sqlgen_raw_user_config = BenchmarkConfig(
    mb_admin_username="admin@example.com",
    mb_admin_password="benchmark123",
    mb_tester_username="sqlgen_raw@example.com",
    mb_tester_password="benchmark123",
)

# SQL Gen Models user, has access to native queries but can only find models/metrics in the query builder
sql_gen_models_user_config = BenchmarkConfig(
    mb_admin_username="admin@example.com",
    mb_admin_password="benchmark123",
    mb_tester_username="sql_gen_models@example.com",
    mb_tester_password="benchmark123",
)
