"""Configuration module for the benchmark framework."""

import logging
import os
import sys
from enum import Enum
from functools import lru_cache
from pathlib import Path

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.config.toml_config import ConfigFile

file_dir = Path(__file__).resolve().parent
env_file = file_dir / "../../.env"


class RunModes(Enum):
    DEV_MODE = "development"
    PROD_MODE = "production"


class EnvFileConfig(BaseSettings):
    """Configs provided via environment variables."""

    model_config = SettingsConfigDict(
        env_file=env_file,
        env_file_encoding="utf-8",
        env_prefix="AI_SERVICE_",
        hide_input_in_errors=True,
        extra="ignore",
    )

    HOST: str = Field(default="127.0.0.1")
    PORT: int = Field(default=8000)
    LOG_LEVEL: str = Field(default="info")
    MODE: RunModes = Field(default=RunModes.PROD_MODE)

    # AWS
    AWS_ACCESS_KEY_ID: str = Field(default="")
    AWS_SECRET_ACCESS_KEY: str = Field(default="")

    # OpenAI
    OPEN_AI_API_KEY: str = Field(default="")

    # Anthropic
    ANTHROPIC_API_KEY: str = Field(default="")
    ANTHROPIC_CACHING_DISABLE_ALL: bool = Field(default=False)
    ANTHROPIC_CACHING_DISABLE_SYS_PROMPT: bool = Field(default=False)
    ANTHROPIC_CACHING_DISABLE_USER_MSG: bool = Field(default=False)
    ANTHROPIC_CACHING_DISABLE_TOOL_RESULT_MSG: bool = Field(default=False)
    ANTHROPIC_CACHING_DISABLE_TOOL_SCHEMAS: bool = Field(default=False)

    # Gemini
    GEMINI_API_KEY: str = Field(default="")

    # Open Router
    OPEN_ROUTER_API_KEY: str = Field(default="")

    # Metabase
    MB_BASE_URL_OVERRIDE: str = Field(default="")

    # Configuration file
    CONFIG_FILE: str = Field(default=".config.toml")

    # Debug/Development
    LLM_COMPLETION_LOG_DIR: str | None = Field(default=None)

    @computed_field
    @property
    def is_running_tests(self) -> bool:
        return bool(os.environ.get("PYTEST_CURRENT_TEST"))

    @computed_field
    @property
    def is_running_benchmark(self) -> bool:
        if hasattr(sys, "argv") and sys.argv:
            script_path = Path(sys.argv[0]).resolve()
            return script_path.parent.name == "benchmarks"
        return False


class Settings(BaseSettings):
    env: EnvFileConfig = Field(default_factory=EnvFileConfig)
    config_file: ConfigFile | None = Field(default=None)

    def __init__(self, **kwargs):
        # Get env or create it
        env = kwargs.get("env")
        if env is None:
            env = EnvFileConfig()
            kwargs["env"] = env

        # Pass config_file_path to ConfigFile initialization
        if "config_file" not in kwargs or kwargs["config_file"] is None:
            try:
                kwargs["config_file"] = ConfigFile(config_file_path=env.CONFIG_FILE)
            except FileNotFoundError:
                # Use a minimal default config if file not found
                kwargs["config_file"] = None

        super().__init__(**kwargs)


@lru_cache(maxsize=1)
def get_config() -> Settings:
    """Lazy-load config singleton."""
    return Settings()


class _ConfigProxy:
    """Proxy that lazily loads config on attribute access."""

    def __getattr__(self, name):
        return getattr(get_config(), name)


config = _ConfigProxy()
