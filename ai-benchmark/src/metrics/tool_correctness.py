"""Tool correctness metrics for validating agent tool usage."""

import copy
import json
import logging
import re
from difflib import ndiff
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, computed_field

from src.llm import LLM, AvailableModels
from src.metrics.base import ActionResult, BaseMetric
from src.metrics.response import ResponseCorrectness
from src.types import AssistantMessage, ToolCall, UserMessage

logger = logging.getLogger(__name__)


class MatchValue(str, Enum):
    """Special values for matching in tool call arguments."""

    ANY = "__ANY__VALUE__"


ANY = MatchValue.ANY


def _sort_nested(obj):
    """Recursively sort nested dictionaries and lists."""

    def _sort_key(elem):
        if isinstance(elem, dict):
            return sorted(elem.items())
        return elem

    if obj == MatchValue.ANY:
        return MatchValue.ANY
    if isinstance(obj, dict):
        return {k: _sort_nested(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        return sorted([_sort_nested(elem) for elem in obj], key=_sort_key)

    if isinstance(obj, float) and obj.is_integer():
        return str(int(obj))
    return str(obj)


def _align_actual_for_any(expected_val: Any, actual_val: Any) -> Any:
    """Recursively creates a modified version of actual_val."""
    if expected_val == MatchValue.ANY:
        return MatchValue.ANY

    actual_val_processed = copy.deepcopy(actual_val)

    if isinstance(expected_val, dict) and isinstance(actual_val_processed, dict):
        for key, e_v in expected_val.items():
            if key in actual_val_processed:
                actual_val_processed[key] = _align_actual_for_any(e_v, actual_val_processed[key])
        return actual_val_processed

    if isinstance(expected_val, list) and isinstance(actual_val_processed, list):
        if len(expected_val) == len(actual_val_processed):
            for i in range(len(expected_val)):
                actual_val_processed[i] = _align_actual_for_any(expected_val[i], actual_val_processed[i])
            return actual_val_processed
        return actual_val_processed

    return actual_val_processed


def _compare_dicts(expected_dict: dict, actual_dict: dict):
    """Compare two dictionaries and raise an AssertionError if they don't match."""
    actual_dict_aligned = _align_actual_for_any(expected_dict, actual_dict)

    class CustomEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, MatchValue):
                return obj.value
            return json.JSONEncoder.default(self, obj)

    expected_json_for_diff = json.dumps(expected_dict, indent=2, cls=CustomEncoder)
    actual_json_for_diff = json.dumps(actual_dict_aligned, indent=2, cls=CustomEncoder)

    if actual_json_for_diff != expected_json_for_diff:
        display_expected_json = json.dumps(expected_dict, cls=CustomEncoder, sort_keys=True)
        display_actual_json = json.dumps(actual_dict, cls=CustomEncoder, sort_keys=True)

        diff = ndiff(expected_json_for_diff.splitlines(), actual_json_for_diff.splitlines())
        diff_str = "\n".join(diff)

        raise AssertionError(
            f"Dictionaries don't match. "
            f"(Note: For comparison, parts of 'Actual' corresponding to '{MatchValue.ANY.value}' "
            f"in 'Expected' were aligned to '{MatchValue.ANY.value}'.)\n"
            f"Original Expected (sorted for readability):\n{display_expected_json}\n\n"
            f"Original Actual (sorted for readability):\n{display_actual_json}\n\n"
            f"Diff (between Expected and aligned Actual, order preserved):\n{diff_str}"
        )


class ActualToolCall(BaseModel):
    name: str
    arguments: dict
    model_config = ConfigDict(extra="forbid")


class ExpectedToolCall(BaseModel):
    name: str
    arguments: dict | None = Field(default=None)
    order_matters: bool | None = Field(default=False)
    model_config = ConfigDict(extra="forbid")

    def assert_equal(self, actual: ActualToolCall):
        assert self.name == actual.name, f"Tool names don't match.\nExpected: {self.name} != Actual: {actual.name}"
        if self.arguments is None:
            return

        if self.order_matters:
            expected_dict = self.arguments
            actual_dict = actual.arguments
        else:
            expected_dict = _sort_nested(self.arguments)
            actual_dict = _sort_nested(actual.arguments)

        _compare_dicts(expected_dict, actual_dict)


class AnyOfToolCalls:
    def __init__(self, *options):
        self.options = [
            [ExpectedToolCall(**call) if isinstance(call, dict) else call for call in option] for option in options
        ]


class MissingCallError(AssertionError):
    pass


def check_that_tool_calls_happened(actual_calls: list[ActualToolCall], expected_calls: list[ExpectedToolCall]) -> None:
    """Check if all expected tool calls happened."""
    if len(expected_calls) == 0:
        if len(actual_calls) > 0:
            raise AssertionError(f"Expected no tool calls, but got: {', '.join(tool.name for tool in actual_calls)}")

    expected_tool_names = [tool.name for tool in expected_calls]
    actual_tool_names = [tool.name for tool in actual_calls]
    missing_calls = set(expected_tool_names) - set(actual_tool_names)
    if missing_calls:
        raise MissingCallError(
            f"Missing expected tool calls: {', '.join(missing_calls)}.\n"
            f"Expected: {expected_tool_names}\n"
            f"Actual: {actual_tool_names}"
        )

    expected_sorted = sorted(expected_calls, key=lambda x: x.model_dump_json())
    actual_sorted = sorted(actual_calls, key=lambda x: x.model_dump_json())

    for expected in expected_sorted:
        actual = next(tool for tool in actual_sorted if tool.name == expected.name)
        actual_arguments = actual.arguments

        if actual_arguments is not None and expected.arguments is not None:
            actual_arguments = {k: v for k, v in actual_arguments.items() if k in expected.arguments}

        processed_actual = ActualToolCall(name=actual.name, arguments=actual_arguments)
        expected.assert_equal(processed_actual)
        actual_sorted.remove(actual)


def check_expected_tool_calls(tool_calls: list[ToolCall], expected_tool_calls: list[ExpectedToolCall] | AnyOfToolCalls):
    """Check expected tool calls against actual tool calls."""
    actual_calls = [ActualToolCall(name=tool.name, arguments=json.loads(tool.arguments)) for tool in tool_calls]

    if isinstance(expected_tool_calls, AnyOfToolCalls):
        error_msg = ["Value did not match any expected options:"]
        call_didnt_match = False
        for expected in expected_tool_calls.options:
            try:
                check_that_tool_calls_happened(actual_calls, expected)
                return
            except MissingCallError as e:
                error_msg.append(str(e))
                continue
            except AssertionError as e:
                call_didnt_match = True
                error_msg.append(str(e))
                continue
        if call_didnt_match:
            raise AssertionError("\n".join(error_msg))
        raise MissingCallError("\n".join(error_msg))
    check_that_tool_calls_happened(actual_calls, expected_tool_calls)


class ToolCorrectnessResult(BaseModel):
    max_score: float = Field(default=0)
    reasons: list[str] = Field(default_factory=list)
    current_score: float = Field(default=0.0)
    action_result: ActionResult = Field(default_factory=ActionResult)

    @computed_field
    def score(self) -> float:
        if self.max_score == 0:
            return 0.0
        return self.current_score / self.max_score


class ToolCorrectness(BaseMetric):
    """Check if the tool calls made by the agent are correct."""

    expected_tool_calls: list[ExpectedToolCall] | AnyOfToolCalls | None = Field(default=None)
    prohibited_tool_calls: list[str] | None = Field(default=None)
    expected_api_calls: list | None = Field(default=None)
    expectation: str | None = Field(default=None)

    def _get_actual_api_calls(self, test_case):
        calls = []
        for call_args in test_case.mocked_client.request.call_args_list:
            method, call_path = call_args[0]
            kwargs = call_args[1]
            calls.append(
                {
                    "method": method,
                    "path": call_path,
                    "data": kwargs.get("data"),
                    "params": kwargs.get("params"),
                }
            )
        return calls

    async def _explain_error(self, error_message):
        prompt = f"""
You are given an error message from a failed test case where an agent action was tested against expected tool calls.
Briefly explain what the agent did wrong but keep it concise.
This is the error message:
{error_message}
"""
        llm = LLM()
        completion = await llm.generate_async(
            model=AvailableModels.ANTHROPIC_CLAUDE_HAIKU_4_5, messages=[UserMessage(content=prompt)]
        )
        return completion.message.content

    async def get_tool_calls(self, test_case) -> list[ToolCall]:
        tool_calls = []
        for m in test_case.response.messages:
            if isinstance(m, AssistantMessage):
                tool_calls.extend(m.tool_calls or [])
        return tool_calls

    async def _check_if_agent_called_prohibited_tool(self, test_case, result: ToolCorrectnessResult) -> None:
        if not self.prohibited_tool_calls:
            return
        result.max_score += 1
        tool_calls = await self.get_tool_calls(test_case)
        prohibited_calls = [call.name for call in tool_calls if call.name in self.prohibited_tool_calls]
        if prohibited_calls:
            result.reasons.append(f"Prohibited tool calls were made: {', '.join(prohibited_calls)}")
            result.action_result.is_action_hallucination = True
        else:
            result.current_score += 1
            result.reasons.append("The agent correctly did not make any prohibited tool calls.")

    async def _check_if_agent_called_expected_tools(self, test_case, result: ToolCorrectnessResult) -> None:
        if self.expected_tool_calls is None:
            return
        result.max_score += 1
        tool_calls = await self.get_tool_calls(test_case)
        try:
            check_expected_tool_calls(tool_calls, self.expected_tool_calls)
            result.current_score += 1
            result.reasons.append("All tool calls were correct.")
        except MissingCallError as e:
            reason = str(e) or "Expected tool calls were not made."
            explanation = await self._explain_error(str(e))
            result.reasons.append(f"{explanation} \nMissingCallError: {reason}")
            result.action_result.is_hesitation = True
        except AssertionError as e:
            reason = str(e) or "Tool calls did not match the expected tool calls."
            explanation = await self._explain_error(str(e))
            result.reasons.append(f"{explanation} \nAssertionError: {reason}")
            result.action_result.is_action_hallucination = True
        except Exception as e:
            result.reasons.append(f"Error checking tool calls: {e}")

    async def _check_if_expected_api_calls_made(self, test_case, result: ToolCorrectnessResult) -> None:
        if self.expected_api_calls is None:
            return
        result.max_score += 1
        # Simplified - full implementation would compare API calls
        result.current_score += 1
        result.reasons.append("API calls check skipped (use specialized metrics for E2E).")

    async def _check_if_agent_response_matches_expectation(self, test_case, result: ToolCorrectnessResult) -> None:
        if self.expectation is None:
            return
        result.max_score += 1
        tool_calls = await self.get_tool_calls(test_case)
        res = await ResponseCorrectness.check_output_matches_expectation(
            expectation=self.expectation, tool_calls=tool_calls
        )
        if res.matches_expectation:
            result.current_score += 1
            result.reasons.append("\nCall matches expectation: " + res.comment)
        else:
            result.reasons.append("\nCall does not match expectation: " + res.comment)

    async def _agent_must_take_action(self, test_case) -> bool:
        if not self.expected_tool_calls and not self.expected_api_calls:
            return False
        if isinstance(self.expected_tool_calls, AnyOfToolCalls):
            return any(option for option in self.expected_tool_calls.options)
        return True

    async def measure(self, test_case):
        is_action_needed = await self._agent_must_take_action(test_case)
        intermediate_res = ToolCorrectnessResult(action_result=ActionResult(is_action_needed=is_action_needed))
        await self._check_if_agent_called_prohibited_tool(test_case, intermediate_res)
        await self._check_if_agent_called_expected_tools(test_case, intermediate_res)
        await self._check_if_expected_api_calls_made(test_case, intermediate_res)
        await self._check_if_agent_response_matches_expectation(test_case, intermediate_res)

        self.score = intermediate_res.score
        self.reason = "\n".join(intermediate_res.reasons)
        if intermediate_res.action_result.is_action_hallucination:
            intermediate_res.action_result.is_hesitation = False
        self.action_result = intermediate_res.action_result


def check_matches_any_regex(regexes: list[str]):
    def checker(response: AssistantMessage):
        for regex in regexes:
            if re.search(regex, response.content, re.IGNORECASE):
                return
        raise Exception(f"Response did not match any of the regexes: {regexes}")

    return checker


def does_not_include_extra_commentary(response: str):
    def checker(response: AssistantMessage):
        wordy_regex_list = [
            r"If you need help",
            r"Is there anything else I can",
            r"It looks like",
            r"just let me know",
        ]
        for regex in wordy_regex_list:
            if re.search(regex, response.content, re.IGNORECASE):
                raise Exception(f"Response includes extra commentary: {regex}")

    return checker


def check_output_matches_expectation(expectation: str, include_tool_calls: bool = False):
    async def checker(response: AssistantMessage):
        tool_calls = response.tool_calls if include_tool_calls else None
        res = await ResponseCorrectness.check_output_matches_expectation(
            response=response.content,
            tool_calls=tool_calls,
            expectation=expectation,
        )
        if not res.matches_expectation:
            raise Exception(f"Response did not match expectation: {expectation}\nComment: {res.comment}")

    return checker
