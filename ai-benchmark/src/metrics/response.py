"""Response quality and tool usage metrics."""

import logging
from typing import TYPE_CHECKING, Literal

from pydantic import Field

from src.llm import LLM, AvailableModels
from src.metrics.base import BaseMetric, MetricCategories
from src.types import NoAdditionalPropsBaseModel, ToolCall, UserMessage

if TYPE_CHECKING:
    from src.core.test_case import E2EAgentTestCase

logger = logging.getLogger(__name__)


class OutputCheckResult(NoAdditionalPropsBaseModel):
    comment: str = Field(description="Concise comment on why you chose true or false.")
    matches_expectation: bool = Field(description="Whether the response matches the expectation.")


class ResponseCorrectness(BaseMetric):
    """Check if the final response message matches the expectations."""

    expectation: str | None = None
    include_tool_calls: bool = Field(default=False)
    category = MetricCategories.FINAL_RESPONSE_QUALITY

    @staticmethod
    async def check_output_matches_expectation(
        expectation: str,
        response: str = None,
        tool_calls: list[ToolCall] = None,
    ) -> OutputCheckResult:
        llm = LLM()

        message_content = f"""
Your task is to determine whether the output of an agent matches a given "expectation".
The expectation gives context on how the agent should respond.
Here is the expectation:
<expectation>
{expectation}.
</expectation>

## Agent Output
"""
        if response:
            message_content += f"""
The response is as follows:
<response>
{response}
</response>
"""
        if tool_calls:
            message_content += f"""
The tool calls made by the model are:
<tool_calls>
{tool_calls}
</tool_calls>
"""
        message_content += "Based on the above information, determine whether agent's response matches the expectation."

        completion = await llm.structured_completion(
            model=AvailableModels.ANTHROPIC_CLAUDE_HAIKU_4_5,
            messages=[UserMessage(content=message_content)],
            response_format=OutputCheckResult,
        )

        res = completion.response
        logger.info("Checking expectation: %s", expectation)
        logger.info("Evaluation comment: %s", getattr(res, "comment", ""))
        return res


class ResponseCorrectnessE2E(ResponseCorrectness):
    """Validate the agent's final text response quality.

    Uses an LLM as a judge to evaluate whether the agent's response is correct
    based on the expected behavior.
    """

    category = MetricCategories.FINAL_RESPONSE_QUALITY

    async def measure(self, test_case: "E2EAgentTestCase"):
        final_response = test_case.final_response
        tool_calls = test_case.tool_calls if self.include_tool_calls else None
        res = await ResponseCorrectness.check_output_matches_expectation(
            expectation=self.expectation, response=final_response, tool_calls=tool_calls
        )
        self.score = int(res.matches_expectation)
        self.reason = res.comment


class ToolCorrectnessE2E(BaseMetric):
    """Validate that the agent used the correct tools during execution.

    NOTE: API call checking is disabled for E2E tests since calls happen between
    Metabase and the AI service (not directly observable).
    """

    expected_tool_calls: list | None = Field(default=None)
    prohibited_tool_calls: list[str] | None = Field(default=None)
    expectation: str | None = Field(default=None)
    category = MetricCategories.TOOL_USAGE_CORRECTNESS

    async def get_tool_calls(self, test_case: "E2EAgentTestCase") -> list[ToolCall]:
        return test_case.tool_calls

    async def measure(self, test_case: "E2EAgentTestCase"):
        # Implementation would check tool calls against expectations
        # This is a simplified version
        tool_calls = await self.get_tool_calls(test_case)

        if self.prohibited_tool_calls:
            prohibited_calls = [call.name for call in tool_calls if call.name in self.prohibited_tool_calls]
            if prohibited_calls:
                self.score = 0
                self.reason = f"Prohibited tool calls were made: {', '.join(prohibited_calls)}"
                return

        self.score = 1
        self.reason = "Tool calls validated successfully."


class LinkedEntitiesE2E(BaseMetric):
    """Validate that the agent referenced specific entities in the final response."""

    entity_type: Literal["dashboard", "question", "metric", "model", "table"] = Field(
        description="Type of entity to check for mentions."
    )
    ids: list[str | int] = Field(description="List of expected entity IDs to be mentioned.")
    allow_additional: bool = Field(
        default=True,
        description="Whether to allow additional entity mentions beyond the expected ones.",
    )
    category = MetricCategories.FINAL_RESPONSE_QUALITY

    def get_max_score(self) -> int:
        max_score = 1
        if not self.allow_additional:
            max_score += 1
        return max_score

    async def measure(self, test_case: "E2EAgentTestCase"):
        score = 0
        reason = ""
        expected_ids = [str(_id) for _id in self.ids]
        mentioned_ids = test_case.get_referenced_entity_ids(self.entity_type)
        missing = set(expected_ids) - set(mentioned_ids)
        additional = set(mentioned_ids) - set(expected_ids)
        if not mentioned_ids:
            self.score = 0
            self.reason = "No entities mentioned in the response."
            return
        if not missing:
            score += 1
            reason += "All expected entities mentioned. "
        else:
            reason += f"Missing expected entity mentions: {missing}. "
        if not self.allow_additional:
            if not additional:
                score += 1
                reason += "No unexpected entity mentions."
            else:
                reason += f"Unexpected entity mentions: {additional}."
        self.score = score / self.get_max_score()
        self.reason = reason.strip()
