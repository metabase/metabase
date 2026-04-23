"""Navigation validation metrics."""

from typing import TYPE_CHECKING, Literal

from pydantic import Field

from src.metrics.base import ActionResult, BaseMetric, MetricCategories

if TYPE_CHECKING:
    from src.core.test_case import E2EAgentTestCase


class NavigationOccurred(BaseMetric):
    """Validate that navigation did or did not occur as expected.

    Use this metric to explicitly test navigation behavior separately from query
    correctness.
    """

    category = MetricCategories.TOOL_USAGE_CORRECTNESS
    expected: bool = Field(
        default=True,
        description="Whether navigation is expected to occur.",
    )
    entity_type: Literal["query", "chart", "dashboard", "metric", "model", "table", "question"] | None = Field(
        default=None,
        description="If specified, only consider navigation to this entity type.",
    )
    entity_id: str | int | None = Field(
        default=None,
        description="If specified, check for navigation to this specific entity ID.",
    )

    async def measure(self, test_case: "E2EAgentTestCase"):
        self.action_result = ActionResult(
            is_action_needed=True,
            is_action_hallucination=False,
            is_hesitation=False,
        )

        if self.entity_id is not None:
            await self._measure_specific_entity(test_case)
            return

        await self._measure_general_navigation(test_case)

    async def _measure_specific_entity(self, test_case: "E2EAgentTestCase"):
        """Check for navigation to a specific entity ID."""
        if self.entity_type is None or self.entity_type == "query":
            raise ValueError("entity_type must be set to a non-query type when entity_id is specified")

        navigated_ids = test_case.get_referenced_entity_ids(entity_type=self.entity_type, only_consider_navigated=True)
        all_navigated_links = test_case.get_response_links(only_consider_navigated=True)
        entity_found = str(self.entity_id) in navigated_ids

        if self.expected:
            if entity_found:
                self.score = 1
                self.reason = f"Agent navigated to the expected {self.entity_type} (ID: {self.entity_id})."
            elif not navigated_ids:
                self.score = 0
                if all_navigated_links:
                    self.action_result.is_action_hallucination = True
                    self.reason = (
                        f"Agent navigated, but not to entity type {self.entity_type}. "
                        f"Navigated to: {all_navigated_links}"
                    )
                else:
                    self.action_result.is_hesitation = True
                    self.reason = "No navigation actions found in the response."
            else:
                self.score = 0
                self.action_result.is_action_hallucination = True
                self.reason = (
                    f"Agent did not navigate to the expected {self.entity_type} ID {self.entity_id}. "
                    f"Navigated to IDs: {list(navigated_ids)}"
                )
        else:
            if entity_found:
                self.score = 0
                self.action_result.is_action_hallucination = True
                self.reason = f"Navigation to {self.entity_type} ID {self.entity_id} occurred but was not expected."
            else:
                self.score = 1
                self.reason = f"Did not navigate to {self.entity_type} ID {self.entity_id} as expected."

    async def _measure_general_navigation(self, test_case: "E2EAgentTestCase"):
        """Check for general navigation (any or by entity type)."""
        navigated_links = test_case.get_response_links(only_consider_navigated=True)

        if self.entity_type and navigated_links:
            if self.entity_type in ("query", "chart"):
                navigated_links = [link for link in navigated_links if link.startswith("/question#")]
            else:
                prefix = f"/{self.entity_type}/"
                navigated_links = [link for link in navigated_links if link.startswith(prefix)]

        navigation_occurred = len(navigated_links) > 0

        if self.expected:
            if navigation_occurred:
                self.score = 1
                entity_desc = f" to {self.entity_type}" if self.entity_type else ""
                self.reason = f"Navigation{entity_desc} occurred as expected."
            else:
                self.score = 0
                self.action_result.is_hesitation = True
                entity_desc = f" to {self.entity_type}" if self.entity_type else ""
                self.reason = f"Expected navigation{entity_desc} but none occurred."
        else:
            if navigation_occurred:
                self.score = 0
                self.action_result.is_action_hallucination = True
                self.reason = f"Navigation occurred but was not expected. Navigated to: {navigated_links}"
            else:
                self.score = 1
                self.reason = "No navigation occurred as expected."
