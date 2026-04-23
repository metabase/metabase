"""LLM client wrapper using LiteLLM."""

import copy
import dataclasses
import logging
import time
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING

import litellm
import litellm.types.utils as litellm_utils
from litellm import stream_chunk_builder
from pydantic import BaseModel
from tenacity import retry, retry_if_exception_type, stop_after_attempt

from src.config import config
from src.llm.models import AvailableModels
from src.types.messages import (
    AssistantMessage,
    FunctionSchemaOpenAi,
    Messages,
    OpenAIToolSchema,
    ToolCall,
    ToolSchema,
)
from src.types.usage import TokenUsage, UsageDict

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

litellm.modify_params = True


def get_litellm_request_cost(response: litellm_utils.ModelResponse) -> float:
    """Get the cost of a LiteLLM request based on the response usage data."""
    try:
        return litellm.cost_calculator.completion_cost(response)
    except Exception:
        return 0


@dataclasses.dataclass
class AnthropicCacheConfig:
    """Configuration for Anthropic prompt caching behavior."""

    disable_all: bool = False
    disable_sys_prompt: bool = False
    disable_user_msg: bool = False
    disable_tool_result_msg: bool = False
    disable_tool_schemas: bool = False

    def should_cache_system_prompt(self) -> bool:
        return not (self.disable_all or self.disable_sys_prompt)

    def should_cache_user_message(self) -> bool:
        return not (self.disable_all or self.disable_user_msg)

    def should_cache_tool_result(self) -> bool:
        return not (self.disable_all or self.disable_tool_result_msg)

    def should_cache_tool_schemas(self) -> bool:
        return not (self.disable_all or self.disable_tool_schemas)


def get_litellm_provider(model: str, with_fallback: bool = False) -> str | None:
    """Get the provider name for a model using litellm's model info."""
    fallback = model.split("/")[0] if with_fallback else None
    try:
        return litellm.get_model_info(model).get("litellm_provider", fallback)
    except Exception as e:
        logger.warning(f"LiteLLM provider lookup failed for model='{model}': {str(e)}")
        return fallback


def provider_is_anthropic(model: AvailableModels) -> bool:
    """Check if a model is ultimately provided by Anthropic."""
    model_str = model.value
    provider = get_litellm_provider(model_str, with_fallback=True)

    match provider:
        case "anthropic":
            return True
        case "bedrock" | "bedrock_converse":
            return "anthropic." in model_str
        case "openrouter":
            return "anthropic/" in model_str
        case _:
            return False


def find_index(lst, predicate, reverse=False):
    if reverse:
        for i in range(len(lst) - 1, -1, -1):
            if predicate(lst[i]):
                return i
    else:
        for i, item in enumerate(lst):
            if predicate(item):
                return i
    return None


def _reformat_as_anthropic_breakpoint(msg: dict) -> dict:
    msg_copy = msg.copy()
    if isinstance(msg["content"], str):
        msg_copy["content"] = [{"type": "text", "text": msg["content"], "cache_control": {"type": "ephemeral"}}]
    elif isinstance(msg["content"], list):
        msg_copy["content"] = [block.copy() for block in msg["content"]]
        msg_copy["content"][-1]["cache_control"] = {"type": "ephemeral"}
    return msg_copy


def apply_anthropic_cache_breakpoints(
    messages: list[dict],
    tools: list[dict],
    cache_config: AnthropicCacheConfig | None = None,
) -> tuple[list[dict], list[dict]]:
    """Apply Anthropic prompt caching markers to messages and tools."""
    if cache_config is None:
        cache_config = AnthropicCacheConfig(
            disable_all=config.env.ANTHROPIC_CACHING_DISABLE_ALL,
            disable_sys_prompt=config.env.ANTHROPIC_CACHING_DISABLE_SYS_PROMPT,
            disable_user_msg=config.env.ANTHROPIC_CACHING_DISABLE_USER_MSG,
            disable_tool_result_msg=config.env.ANTHROPIC_CACHING_DISABLE_TOOL_RESULT_MSG,
            disable_tool_schemas=config.env.ANTHROPIC_CACHING_DISABLE_TOOL_SCHEMAS,
        )

    if cache_config.disable_all:
        return messages, tools

    def _apply_anthropic_breakpoint(msgs: list[dict], role: str, position: str) -> None:
        idx = find_index(msgs, lambda msg: msg["role"] == role, reverse=(position == "last"))
        if idx is not None:
            msgs[idx] = _reformat_as_anthropic_breakpoint(msgs[idx])

    cached_msgs = copy.deepcopy(messages) if messages else []
    cached_tools = copy.deepcopy(tools) if tools else []

    if cache_config.should_cache_system_prompt():
        _apply_anthropic_breakpoint(cached_msgs, "system", "first")

    if cache_config.should_cache_user_message():
        _apply_anthropic_breakpoint(cached_msgs, "user", "last")

    if cache_config.should_cache_tool_result():
        _apply_anthropic_breakpoint(cached_msgs, "tool", "last")

    if cache_config.should_cache_tool_schemas() and cached_tools and cached_tools[-1].get("function"):
        cached_tools[-1]["function"]["cache_control"] = {"type": "ephemeral"}

    return cached_msgs, cached_tools


class LLMResponseMetadata(BaseModel):
    usage: TokenUsage


class LLMResponse(BaseModel):
    message: AssistantMessage | None = None
    metadata: LLMResponseMetadata


class StructuredResponse(LLMResponse):
    response: BaseModel


def resolve_refs(d: dict, drop_defs: bool = True) -> dict:
    """Resolve all JSON Schema $ref references to their inline definitions."""
    import jsonref

    res = jsonref.replace_refs(d, proxies=False)
    if drop_defs:
        res.pop("$defs", None)
    return res


class LLM:
    def __init__(self):
        self.usage = UsageDict()

    def _resolve_model_and_auth_kwargs(self, model: str) -> dict:
        PROVIDER_AUTH_MAPPING = {
            "openai": {"api_key": config.env.OPEN_AI_API_KEY},
            "anthropic": {"api_key": config.env.ANTHROPIC_API_KEY},
            "bedrock": {
                "aws_access_key_id": config.env.AWS_ACCESS_KEY_ID,
                "aws_secret_access_key": config.env.AWS_SECRET_ACCESS_KEY,
            },
            "bedrock_converse": {
                "aws_access_key_id": config.env.AWS_ACCESS_KEY_ID,
                "aws_secret_access_key": config.env.AWS_SECRET_ACCESS_KEY,
            },
            "gemini": {"api_key": config.env.GEMINI_API_KEY},
            "openrouter": {"api_key": config.env.OPEN_ROUTER_API_KEY},
        }

        provider = get_litellm_provider(model, with_fallback=True)
        return {"model": model, **PROVIDER_AUTH_MAPPING.get(provider, {})}

    async def _track_usage(
        self,
        model: str,
        response: litellm_utils.ModelResponse | litellm_utils.TextCompletionResponse,
        duration_ms: float,
    ):
        usage = TokenUsage(
            model=model,
            total=response.usage.total_tokens,
            prompt=response.usage.prompt_tokens,
            completion=response.usage.completion_tokens,
            costs=get_litellm_request_cost(response),
        )
        self.usage.add(usage)

    @retry(
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type(litellm.exceptions.RateLimitError),
    )
    async def _get_stream_response(
        self,
        model: str,
        *args,
        **kwargs,
    ) -> AsyncGenerator[litellm_utils.ModelResponseStream, None]:
        start_time = time.perf_counter()

        llm_kwargs = {
            "max_retries": 3,
            "drop_params": True,
            "stream": True,
            "stream_options": {"include_usage": True},
            **kwargs,
            **self._resolve_model_and_auth_kwargs(model),
        }

        try:
            res = await litellm.acompletion(*args, **llm_kwargs)
            chunks = []
            async for chunk in res:
                chunks.append(chunk)
                yield chunk

            duration_ms = (time.perf_counter() - start_time) * 1000
            full_response = stream_chunk_builder(chunks)
            await self._track_usage(model=model, response=full_response, duration_ms=duration_ms)
        except Exception as e:
            logger.error(f"Error generating stream response: {e}")
            raise

    @retry(
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type(litellm.exceptions.RateLimitError),
    )
    async def _get_response(
        self,
        model: str,
        *args,
        **kwargs,
    ) -> litellm_utils.ModelResponse:
        try:
            start_time = time.perf_counter()
            res = await litellm.acompletion(
                max_retries=3,
                drop_params=True,
                *args,
                **kwargs,
                **self._resolve_model_and_auth_kwargs(model),
            )
            duration_ms = (time.perf_counter() - start_time) * 1000
            await self._track_usage(model=model, response=res, duration_ms=duration_ms)
            return res
        except Exception as e:
            logger.error(f"Error generating response: {e}")
            raise e

    @staticmethod
    def convert_messages_to_openai(messages: list[Messages]) -> list[dict]:
        return [message.model_dump_open_ai() for message in messages]

    @staticmethod
    def convert_tools_to_openai(tools: list[ToolSchema] | None, inline_refs: bool = False) -> list[dict]:
        if not tools:
            return []

        converted_tools = []
        for tool in tools:
            tool_dict = OpenAIToolSchema(
                function=FunctionSchemaOpenAi(**tool.model_dump(exclude={"examples"}))
            ).model_dump()

            if inline_refs and "function" in tool_dict and "parameters" in tool_dict["function"]:
                tool_dict["function"]["parameters"] = resolve_refs(tool_dict["function"]["parameters"])

            converted_tools.append(tool_dict)
        return converted_tools

    def _prepare_messages_and_tools(
        self,
        messages: list[Messages],
        tools: list[ToolSchema] | None,
        model: AvailableModels,
        inline_refs: bool = False,
    ) -> tuple[list[dict], list[dict]]:
        openai_msgs = self.convert_messages_to_openai(messages)
        openai_tools = self.convert_tools_to_openai(tools, inline_refs=inline_refs)

        if provider_is_anthropic(model):
            openai_msgs, openai_tools = apply_anthropic_cache_breakpoints(
                messages=openai_msgs,
                tools=openai_tools,
            )

        return openai_msgs, openai_tools

    @staticmethod
    def convert_response(model, res):
        tool_calls = []
        if res.choices[0].message.tool_calls:
            tool_calls = [
                ToolCall(
                    id=tool_call.id,
                    name=tool_call.function.name,
                    arguments=tool_call.function.arguments,
                )
                for tool_call in res.choices[0].message.tool_calls
            ]

        return LLMResponse(
            message=AssistantMessage(content=res.choices[0].message.content, tool_calls=tool_calls),
            metadata=LLMResponseMetadata(
                usage=TokenUsage(
                    model=model,
                    total=res.usage.total_tokens,
                    prompt=res.usage.prompt_tokens,
                    completion=res.usage.completion_tokens,
                    costs=get_litellm_request_cost(res),
                ),
            ),
        )

    async def generate_async(
        self,
        messages: list[Messages],
        model: AvailableModels,
        tools: list[ToolSchema] = None,
        temperature: float = 0.5,
        inline_refs: bool = False,
        *args,
        **kwargs,
    ) -> LLMResponse:
        openai_msgs, openai_tools = self._prepare_messages_and_tools(
            messages=messages,
            tools=tools,
            model=model,
            inline_refs=inline_refs,
        )

        res = await self._get_response(
            model=model.value,
            messages=openai_msgs,
            tools=openai_tools,
            temperature=temperature,
            *args,
            **kwargs,
        )
        return self.convert_response(model, res)

    async def stream(
        self,
        messages: list[Messages],
        model: AvailableModels,
        tools: list[ToolSchema] = None,
        temperature: float = 0.5,
        inline_refs: bool = False,
        *args,
        **kwargs,
    ) -> AsyncGenerator[litellm_utils.ModelResponseStream, None]:
        openai_msgs, openai_tools = self._prepare_messages_and_tools(
            messages=messages,
            tools=tools,
            model=model,
            inline_refs=inline_refs,
        )

        async for chunk in self._get_stream_response(
            model=model.value,
            messages=openai_msgs,
            tools=openai_tools,
            temperature=temperature,
            *args,
            **kwargs,
        ):
            yield chunk

    @retry(
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type(litellm.exceptions.RateLimitError),
    )
    async def structured_completion(
        self,
        messages: list[Messages],
        model: AvailableModels,
        response_format: BaseModel,
        temperature: float = 0.5,
        inline_refs: bool = False,
        *args,
        **kwargs,
    ) -> StructuredResponse:
        openai_msgs = self.convert_messages_to_openai(messages)
        res = await self._get_response(
            model=model.value,
            tools=self.convert_tools_to_openai(
                [
                    ToolSchema(
                        name="json",
                        description="Respond with a JSON object",
                        parameters=response_format.model_json_schema(),
                    ),
                ],
                inline_refs=inline_refs,
            ),
            tool_choice={"type": "function", "function": {"name": "json"}},
            messages=openai_msgs,
            temperature=temperature,
            *args,
            **kwargs,
        )
        tool_call = res.choices[0].message.tool_calls[0].function if res.choices[0].message.tool_calls else None
        tool_call.arguments if tool_call else res.choices[0].message.content

        if not res.choices[0].message.tool_calls:
            try:
                result = response_format.model_validate_json(res.choices[0].message.content)
            except Exception as e:
                raise ValueError(
                    f"Failed to parse LLM response for structured completion. "
                    f"Expected schema: {response_format.__name__}. "
                    f"Validation error: {str(e)}"
                ) from e
        else:
            tool_call = res.choices[0].message.tool_calls[0].function
            try:
                result = response_format.model_validate_json(tool_call.arguments)
            except Exception as e:
                raise ValueError(
                    f"Failed to parse LLM response for structured completion. "
                    f"Expected schema: {response_format.__name__}. "
                    f"Validation error: {str(e)}"
                ) from e

        return StructuredResponse(
            response=result,
            metadata=LLMResponseMetadata(
                usage=TokenUsage(
                    model=model,
                    total=res.usage.total_tokens,
                    prompt=res.usage.prompt_tokens,
                    completion=res.usage.completion_tokens,
                    costs=get_litellm_request_cost(res),
                ),
            ),
        )
