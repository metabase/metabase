from pydantic_settings import BaseSettings, SettingsConfigDict


class BenchmarkConfig(BaseSettings):
    """Configuration for E2E benchmarks against a live Metabase instance."""

    metabase_host: str = "http://localhost:3000"
    mb_admin_username: str = "admin@example.com"
    mb_admin_password: str = "benchmark123"
    mb_tester_username: str = "user@example.com"
    mb_tester_password: str = "benchmark123"
    container_name: str = "metabase-bench-canonical_benchmark"

    model_config = SettingsConfigDict(
        env_prefix="BENCHMARK_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )
