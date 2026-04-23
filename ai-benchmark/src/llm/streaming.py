"""AI SDK streaming protocol types and utilities."""

import json
from collections.abc import AsyncGenerator
from enum import Enum

import litellm.types.utils as litellm_utils
from pydantic import BaseModel, Field

from src.types.usage import UsageDict


class FinishReason(str, Enum):
    STOP = "stop"
    LENGTH = "length"
    CONTENT_FILTER = "content-filter"
    TOOL_CALLS = "tool-calls"
    ERROR = "error"
    OTHER = "other"
    UNKNOWN = "unknown"


class AISDKStreamingPartType(str, Enum):
    """Types of streaming parts in the AI-SDK protocol."""

    TEXT = "0"
    DATA = "2"
    ERROR = "3"
    FINISH_MESSAGE = "d"
    FINISH_STEP = "e"
    START_STEP = "f"
    TOOL_CALL = "9"
    TOOL_RESULT = "a"


class AISDKChunk(BaseModel):
    """Base class for AI-SDK streaming chunks."""

    type: AISDKStreamingPartType

    def __str__(self):
        raise NotImplementedError("Subclasses must implement __str__ method.")

    @classmethod
    def from_string(cls, chunk: str) -> "AISDKChunk":
        raise NotImplementedError("Subclasses must implement from_string method.")


class TextChunk(AISDKChunk):
    """Represents a text chunk in the AI-SDK protocol."""

    type: AISDKStreamingPartType = AISDKStreamingPartType.TEXT
    content: str

    def __str__(self):
        return f"{self.type.value}:{json.dumps(self.content, separators=(',', ':'))}\n"

    @classmethod
    def from_string(cls, chunk: str) -> "TextChunk":
        if not chunk.startswith(AISDKStreamingPartType.TEXT.value):
            raise ValueError(f"Invalid chunk type for TextChunk: {chunk}")
        content = json.loads(chunk[2:])
        return cls(content=content)


class AISDKDataTypes(str, Enum):
    NAVIGATE_TO = "navigate_to"
    STATE = "state"
    TRANSFORM_SUGGESTION = "transform_suggestion"
    TODO_LIST = "todo_list"
    CODE_EDIT = "code_edit"
    STATIC_VIZ = "static_viz"
    ADHOC_VIZ = "adhoc_viz"


class DataChunk(AISDKChunk):
    """Represents a data chunk in the AI-SDK protocol."""

    type: AISDKStreamingPartType = AISDKStreamingPartType.DATA
    version: int = Field(default=1, description="Version of the data format")
    data_type: AISDKDataTypes
    value: str | int | dict | list = Field(..., description="Value of the data chunk")

    def __str__(self):
        data_part = {"type": self.data_type.value, "version": self.version, "value": self.value}
        return f"{self.type.value}:{json.dumps(data_part, separators=(',', ':'))}\n"

    @classmethod
    def from_string(cls, chunk: str) -> "DataChunk":
        if not chunk.startswith(AISDKStreamingPartType.DATA.value):
            raise ValueError(f"Invalid chunk type for DataChunk: {chunk}")
        data_part = json.loads(chunk[2:])
        return cls(
            data_type=AISDKDataTypes(data_part["type"]),
            version=data_part.get("version", 1),
            value=data_part["value"],
        )


class ToolCallChunk(AISDKChunk):
    """Represents a tool call chunk in the AI-SDK protocol."""

    type: AISDKStreamingPartType = AISDKStreamingPartType.TOOL_CALL
    tool_call_id: str
    tool_name: str
    arguments: str

    def __str__(self):
        tool_call_data = json.dumps(
            {"toolCallId": self.tool_call_id, "toolName": self.tool_name, "args": self.arguments},
            separators=(",", ":"),
        )
        return f"{self.type.value}:{tool_call_data}\n"

    @classmethod
    def from_string(cls, chunk: str) -> "ToolCallChunk":
        if not chunk.startswith(AISDKStreamingPartType.TOOL_CALL.value):
            raise ValueError(f"Invalid chunk type for ToolCallChunk: {chunk}")
        tool_call_data = json.loads(chunk[2:])
        return cls(
            tool_call_id=tool_call_data["toolCallId"],
            tool_name=tool_call_data["toolName"],
            arguments=tool_call_data["args"],
        )


class ToolResultChunk(AISDKChunk):
    """Represents a tool result chunk in the AI-SDK protocol."""

    type: AISDKStreamingPartType = AISDKStreamingPartType.TOOL_RESULT
    tool_call_id: str
    result: dict | list | str

    def __str__(self):
        tool_result_data = json.dumps(
            {
                "toolCallId": self.tool_call_id,
                "result": json.dumps(self.result, separators=(",", ":"))
                if isinstance(self.result, dict | list)
                else self.result,
            },
            separators=(",", ":"),
        )
        return f"{self.type.value}:{tool_result_data}\n"

    @classmethod
    def from_string(cls, chunk: str) -> "ToolResultChunk":
        if not chunk.startswith(AISDKStreamingPartType.TOOL_RESULT.value):
            raise ValueError(f"Invalid chunk type for ToolResultChunk: {chunk}")
        tool_result_data = json.loads(chunk[2:])
        return cls(
            tool_call_id=tool_result_data["toolCallId"],
            result=tool_result_data["result"],
        )


class FinishMessageChunk(AISDKChunk):
    """Represents a finish message chunk in the AI-SDK protocol."""

    type: AISDKStreamingPartType = AISDKStreamingPartType.FINISH_MESSAGE
    finish_reason: FinishReason
    usage: UsageDict

    def __str__(self):
        data = {"finishReason": self.finish_reason.value, "usage": self.usage.model_dump(by_alias=True)}
        return f"{self.type.value}:{json.dumps(data, separators=(',', ':'))}\n"

    @classmethod
    def from_string(cls, chunk: str) -> "FinishMessageChunk":
        if not chunk.startswith(AISDKStreamingPartType.FINISH_MESSAGE.value):
            raise ValueError(f"Invalid chunk type for FinishMessageChunk: {chunk}")
        data = json.loads(chunk[2:])
        res = {}
        for model_key, usage in data["usage"].items():
            if not isinstance(usage, dict):
                continue
            usage["model"] = model_key
            res[model_key] = usage
        return cls(
            finish_reason=FinishReason(data["finishReason"]),
            usage=UsageDict.model_validate(res),
        )


class StartStepChunk(AISDKChunk):
    """Represents a start step chunk in the AI-SDK protocol."""

    type: AISDKStreamingPartType = AISDKStreamingPartType.START_STEP
    message_id: str

    def __str__(self):
        data = {"messageId": self.message_id}
        return f"{self.type.value}:{json.dumps(data, separators=(',', ':'))}\n"

    @classmethod
    def from_string(cls, chunk: str) -> "StartStepChunk":
        if not chunk.startswith(AISDKStreamingPartType.START_STEP.value + ":"):
            raise ValueError(f"Invalid chunk type for StartStepChunk: {chunk}")
        data = json.loads(chunk[2:])
        return cls(message_id=data.get("messageId", ""))


class ErrorChunk(AISDKChunk):
    """Represents an error chunk in the AI-SDK protocol."""

    type: AISDKStreamingPartType = AISDKStreamingPartType.ERROR
    error_message: str

    def __str__(self):
        return f"{self.type.value}:{json.dumps(self.error_message, separators=(',', ':'))}\n"

    @classmethod
    def from_string(cls, chunk: str) -> "ErrorChunk":
        if not chunk.startswith(AISDKStreamingPartType.ERROR.value):
            raise ValueError(f"Invalid chunk type for ErrorChunk: {chunk}")
        error_message = json.loads(chunk[2:])
        return cls(error_message=error_message)


def create_text_part(text: str) -> str:
    return str(TextChunk(content=text))


def create_data_part(
    data_type: AISDKDataTypes,
    version: int,
    value: str | int | dict | list,
) -> str:
    return str(DataChunk(data_type=data_type, version=version, value=value))


def create_tool_call_part(tool_call_id: str, tool_name: str, arguments: str) -> str:
    return str(ToolCallChunk(tool_call_id=tool_call_id, tool_name=tool_name, arguments=arguments))


def create_tool_result_call_part(tool_call_id: str, result: dict | list | str) -> str:
    return str(ToolResultChunk(tool_call_id=tool_call_id, result=result))


def create_finish_message_part(finish_reason: FinishReason, usage: UsageDict) -> str:
    return str(FinishMessageChunk(finish_reason=finish_reason, usage=usage))


def create_error_part_chunks(error_message: str, usage: UsageDict) -> list[str]:
    return [
        str(ErrorChunk(error_message=error_message)),
        create_finish_message_part(finish_reason=FinishReason.ERROR, usage=usage),
    ]


def parse_ai_sdk_chunk(chunk: str) -> AISDKChunk:
    """Parse an AI-SDK streaming chunk into its type and content."""
    for cls in AISDKChunk.__subclasses__():
        try:
            return cls.from_string(chunk)
        except (NotImplementedError, ValueError):
            continue
    raise ValueError(f"Unknown chunk type in: {chunk}")


async def litellm_response_stream_to_ai_sdk_chunks(
    stream: AsyncGenerator[litellm_utils.ModelResponseStream, None],
    streamed_chunks: list | None = None,
) -> AsyncGenerator[str, None]:
    """Convert a litellm response stream to AI-SDK formatted chunks."""
    draft_tool_calls = []
    draft_tool_calls_index = -1

    async for chunk in stream:
        if streamed_chunks is not None:
            streamed_chunks.append(chunk)
        for choice in chunk.choices:
            if choice.finish_reason == "stop":
                continue
            elif choice.finish_reason == "tool_calls":
                for tool_call in draft_tool_calls:
                    yield create_tool_call_part(
                        tool_call_id=tool_call["id"],
                        tool_name=tool_call["name"],
                        arguments=tool_call["arguments"],
                    )
            elif choice.delta.tool_calls:
                for tool_call in choice.delta.tool_calls:
                    id = tool_call.id
                    name = tool_call.function.name
                    arguments = tool_call.function.arguments

                    if id is not None:
                        draft_tool_calls_index += 1
                        draft_tool_calls.append({"id": id, "name": name, "arguments": arguments})
                    else:
                        draft_tool_calls[draft_tool_calls_index]["arguments"] += arguments
            else:
                if choice.delta.content is not None:
                    yield create_text_part(choice.delta.content)
