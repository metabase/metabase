"""Available LLM models for the benchmark framework."""

from enum import Enum


class AvailableModels(str, Enum):
    # Bedrock models
    LLAMA3_8b = "bedrock/meta.llama3-1-8b-instruct-v1:0"
    LLAMA3_70B = "bedrock/meta.llama3-1-70b-instruct-v1:0"
    MISTRAL_8X7B = "bedrock/mistral.mixtral-8x7b-instruct-v0:1"
    MISTRAL_LARGE = "bedrock/mistral.mistral-large-2402-v1:0"
    CLAUDE_3_5_SONNET = "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0"
    CLAUDE_3_5_HAIKU = "bedrock/anthropic.claude-3-5-haiku-20241022-v1:0"

    # OpenAI models
    GPT_4_o = "openai/gpt-4o-2024-11-20"
    GPT_4_1 = "openai/gpt-4.1-2025-04-14"
    GPT_4_o_MINI = "openai/gpt-4o-mini-2024-07-18"
    GPT_4_1_MINI = "openai/gpt-4.1-mini-2025-04-14"
    GPT_4_1_NANO = "openai/gpt-4.1-nano-2025-04-14"
    GPT_5 = "openai/gpt-5-2025-08-07"
    GPT_5_MINI = "openai/gpt-5-mini-2025-08-07"
    GPT_5_NANO = "openai/gpt-5-nano-2025-08-07"
    TEXT_EMBEDDING_3_SMALL = "openai/text-embedding-3-small"

    # Google models
    GEMINI_2_0_FLASH = "gemini/gemini-2.0-flash"
    GEMINI_2_5_FLASH = "gemini/gemini-2.5-flash-preview-04-17"

    # Anthropic
    ANTHROPIC_CLAUDE_HAIKU_4_5 = "anthropic/claude-haiku-4-5"
    ANTHROPIC_CLAUDE_SONNET_4_5 = "anthropic/claude-sonnet-4-5"

    # Open Router models
    CLAUDE_4_SONNET = "openrouter/anthropic/claude-sonnet-4"
    CLAUDE_4_5_SONNET = "openrouter/anthropic/claude-sonnet-4.5"
    CLAUDE_4_5_HAIKU = "openrouter/anthropic/claude-haiku-4.5"
    CLAUDE_4_5_OPUS = "openrouter/anthropic/claude-opus-4.5"
    GPT_OSS_20B = "openrouter/openai/gpt-oss-20b"

    # Bedrock
    BEDROCK_CLAUDE_HAIKU_4_5 = "bedrock/anthropic.claude-haiku-4-5-20251001-v1:0"
    BEDROCK_GLOBAL_CLAUDE_HAIKU_4_5 = "bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0"

    # Internal models
    SNOWFLAKE_ARTIC_EMBED_LG_2 = "Snowflake/snowflake-arctic-embed-l-v2.0"
