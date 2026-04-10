"""TOML configuration file parsing."""

from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    TomlConfigSettingsSource,
)

from src.llm.models import AvailableModels

file_dir = Path(__file__).resolve().parent


def get_toml_file_path(config_file_path: str) -> Path:
    """Get the resolved absolute path to the TOML config file."""
    toml_file = (file_dir / f"../../{config_file_path}").resolve()

    if not toml_file.exists():
        raise FileNotFoundError(
            f"Config file {toml_file} does not exist. "
            f"Check AI_SERVICE_CONFIG_FILE environment variable (currently '{config_file_path}'). "
        )

    return toml_file


class FeatureSettings(BaseModel):
    model: str | None = Field(None)
    temperature: float = Field(-1)
    prompt_template_folder: str | None = Field(None)
    resolve_schema_refs: bool | None = Field(False)


class LLMToolConfig(BaseModel):
    model: str = Field(...)
    temperature: float = Field(...)
    resolve_schema_refs: bool = Field(default=False)


class AgentFeatureSettings(FeatureSettings):
    model_config = SettingsConfigDict(
        pyproject_toml_table_header=("features", "agent"),
    )
    prompt_template_folder: str | None = "agent/default"
    query_tool: LLMToolConfig = Field(default_factory=LLMToolConfig)


class Features(BaseModel):
    model: str = Field(...)
    temperature: float = Field(...)
    resolve_schema_refs: bool | None = Field(False)
    agent: AgentFeatureSettings = Field(default_factory=AgentFeatureSettings)

    def get_feature_config(self, feature_settings: FeatureSettings) -> Any:
        defaults = {
            "model": self.model,
            "temperature": self.temperature,
            "resolve_schema_refs": self.resolve_schema_refs,
        }
        return feature_settings.__class__(**{**defaults, **feature_settings.model_dump(exclude_unset=True)})


class AnalyticsConfig(BaseModel):
    model_config = SettingsConfigDict(
        pyproject_toml_table_header=("analytics",),
    )
    classifier_model: str = Field(default=AvailableModels.GPT_OSS_20B.value)


class ConfigFile(BaseSettings):
    model_config = SettingsConfigDict()

    config_file_path: str = Field(
        default=".config.toml",
        exclude=True,
    )
    required_env_vars: list[str] = Field(default_factory=list)
    features: Features = Field(...)
    analytics: AnalyticsConfig = Field(default_factory=AnalyticsConfig)

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        config_file_path = ".config.toml"
        try:
            init_data = init_settings()
            if "config_file_path" in init_data:
                config_file_path = init_data["config_file_path"]
        except Exception:
            pass

        toml_file = get_toml_file_path(config_file_path)
        return (
            init_settings,
            TomlConfigSettingsSource(settings_cls, toml_file),
        )

    def get_agent_config(self) -> AgentFeatureSettings:
        return self.features.get_feature_config(self.features.agent)
