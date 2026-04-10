import asyncio
import base64
import json
import logging
import time
import uuid
from typing import TYPE_CHECKING, Any, Literal

from pydantic import Field, PrivateAttr

from src.benchmarks.helpers import find_markdown_links
from src.llm import streaming as ai_sdk
from src.metabase import MetabaseCapabilities
from src.metabase.client import BenchmarkMetabaseClient
from src.metrics import BaseTestCase, _get_metric_config, _get_metric_runtime_data
from src.core.results import E2EAgentTestCaseMetadata, MetricResult, TestCaseResult
from src.types import ToolCall, UsageDict

if TYPE_CHECKING:
    from src.types import ConversationState

logger = logging.getLogger(__name__)

DEFAULT_GLOBAL_CONTEXT_E2E = {
    "user_is_viewing": [],
    "current_time_with_timezone": "2025-09-30T13:14:43+02:00",
    "capabilities": [
        MetabaseCapabilities.FRONTEND_NAVIGATE_USER_V1,
        MetabaseCapabilities.PERMISSION_WRITE_SQL_QUERY,
        MetabaseCapabilities.PERMISSION_SAVE_QUESTIONS,
    ],
}


ADHOC_QUERY_PREFIX = "/question#"


class E2EAgentTestCase(BaseTestCase):
    description: str | None = Field(default=None)
    message: str
    conversation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    context: dict[str, Any] | None = Field(
        default=DEFAULT_GLOBAL_CONTEXT_E2E,
        description="Default context to be used for all test cases if no context is provided.",
    )
    state: dict[str, Any] | None = None
    history: list[dict[str, Any]] | None = None

    # Automatically populated fields
    response_duration: float | None = Field(
        default=None, description="How long it took to get a response from the agent in milliseconds.", init=False
    )
    response_chunks: list[str] | None = Field(
        default=None, description="Response received from the endpoint.", init=False
    )

    # Internal fields for client access during test execution
    _client: BenchmarkMetabaseClient | None = PrivateAttr(default=None)
    _admin_client: BenchmarkMetabaseClient | None = PrivateAttr(default=None)

    def _get_id_fields(self) -> dict:
        return {
            "description": self.description,
            "message": self.message,
            "conversation_id": self.conversation_id,
            "context": self.context,
            "state": self.state,
            "history": self.history,
        }

    def get_client(self) -> BenchmarkMetabaseClient:
        """Get the Metabase client for making API calls during metric evaluation.

        Only available during test execution (in metric.measure() methods).
        The client lifecycle is managed by the benchmark and will be properly
        closed after all tests complete.

        Returns:
            The Metabase client instance

        Raises:
            RuntimeError: If called outside of test execution context
        """
        if self._client is None:
            raise RuntimeError(
                "Client not available. This method can only be called "
                "during test execution (in metric.measure() methods)."
            )
        return self._client

    def get_admin_client(self) -> BenchmarkMetabaseClient:
        """Get the admin Metabase client for privileged operations during metric evaluation.

        Only available during test execution (in metric.measure() methods).
        The client lifecycle is managed by the benchmark and will be properly
        closed after all tests complete.

        Returns:
            The admin Metabase client instance

        Raises:
            RuntimeError: If called outside of test execution context or if admin client not provided
        """
        if self._admin_client is None:
            raise RuntimeError(
                "Admin client not available. This method can only be called "
                "during test execution (in metric.measure() methods) and requires "
                "an admin client to be passed to the test case run() method."
            )
        return self._admin_client

    async def run(
        self,
        client: BenchmarkMetabaseClient,
        admin_client: BenchmarkMetabaseClient | None = None,
        profile_id: str | None = None,
        timeout: float = 300,
    ):
        """Run the test case with a timeout to prevent indefinite hanging.

        Args:
            client: The Metabase client to use (tester/regular user)
            admin_client: Optional admin Metabase client for privileged operations in metrics
            profile_id: Optional agent profile ID
            timeout: Maximum time in seconds to wait for this test case (default: 300s / 5 minutes)
        """
        # Store client references for metrics to access
        self._client = client
        self._admin_client = admin_client
        try:
            start_time = time.perf_counter()

            # Wrap the entire test execution in a timeout to prevent hanging
            async def _run_with_cleanup():
                res = await client.call_agent(
                    message=self.message,
                    conversation_id=self.conversation_id,
                    context=self.context,
                    state=self.state,
                    history=self.history,
                    profile_id=profile_id,
                )
                chunks = []
                try:
                    async for chunk in res.content:
                        chunks.append(chunk.decode("utf-8"))
                finally:
                    # Ensure the response is properly closed even if iteration is interrupted
                    res.close()
                return chunks

            try:
                chunks = await asyncio.wait_for(_run_with_cleanup(), timeout=timeout)
            except TimeoutError:
                logger.error("Test case %s timed out after %d seconds", self.id, timeout)
                raise TimeoutError(f"Test case timed out after {timeout} seconds") from None

            self.response_duration = int(time.perf_counter() - start_time)
            self.response_chunks = chunks
            # Measure all metrics (metrics can access client via get_client())
            await super().run()
        except Exception as e:
            logger.error("Error running test case %s: %s", self.id, e)
            # Set empty response chunks so properties don't fail
            self.response_chunks = []
            self.response_duration = 0
            # If there is an error, we can't run the metrics but set them all to 0
            for metric in self.metrics:
                metric.score = 0
                metric.reason = f"Error running test case: {e}"
        finally:
            # Clear client references after test completes
            # Note: We don't close the clients here as they're managed by the benchmark's context manager
            self._client = None
            self._admin_client = None

    @property
    def parsed_chunks(self) -> list[ai_sdk.AISDKChunk]:
        """Helper to get all parsed chunks from the response chunks"""
        if self.response_chunks is None:
            raise ValueError("No response chunks available. Have you run the test case?")

        parsed = []
        for chunk in self.response_chunks:
            try:
                parsed.append(ai_sdk.parse_ai_sdk_chunk(chunk))
            except ValueError as e:
                # Log unparseable chunks but don't crash the benchmark
                # This handles cases where Metabase sends malformed error chunks
                logger.warning("Failed to parse chunk: %s", e)
        return parsed

    @property
    def final_response(self) -> str:
        """Helper to get the final response content from the response chunks"""
        return "".join(chunk.content for chunk in self.parsed_chunks if isinstance(chunk, ai_sdk.TextChunk))

    @property
    def tool_calls(self) -> list[ToolCall]:
        """Helper to get all tool calls from the response chunks"""
        return [
            ToolCall(id=chunk.tool_call_id, name=chunk.tool_name, arguments=chunk.arguments)
            for chunk in self.parsed_chunks
            if isinstance(chunk, ai_sdk.ToolCallChunk)
        ]

    @property
    def response_state(self) -> "ConversationState":
        """Helper to get the new conversation state from the response chunks"""
        from src.types import ConversationState

        for chunk in reversed(self.parsed_chunks.copy()):
            if isinstance(chunk, ai_sdk.DataChunk) and chunk.data_type == ai_sdk.AISDKDataTypes.STATE.value:
                return ConversationState.model_validate(chunk.value)
        return ConversationState()

    def get_response_links(self, only_consider_navigated: bool = False) -> list[str]:
        """
        Helper to get all unique links provided in the response chunks.
        This includes links from text chunks (markdown links) as well as navigation links.

        Args:
            only_consider_navigated: If True, only consider links from navigation data chunks.
        """
        uris = []
        for chunk in self.parsed_chunks:
            if isinstance(chunk, ai_sdk.DataChunk) and chunk.data_type == ai_sdk.AISDKDataTypes.NAVIGATE_TO.value:
                uris.append(chunk.value)
            elif isinstance(chunk, ai_sdk.TextChunk) and not only_consider_navigated:
                uris.extend(find_markdown_links(chunk.content))
        return list(set(uris))

    def get_response_adhoc_query_links(self, only_consider_navigated: bool = False) -> list[str]:
        """Helper to get all unique links to adhoc queries (SQL queries) provided in the response chunks."""
        return [
            link for link in self.get_response_links(only_consider_navigated) if link.startswith(ADHOC_QUERY_PREFIX)
        ]

    def get_response_queries(self, only_consider_navigated: bool = False) -> list[dict]:
        """Helper to get MBQL / SQL queries from the adhoc query links in the response chunks."""
        queries = []
        for link in self.get_response_adhoc_query_links(only_consider_navigated):
            # Extract the encoded part after the # symbol
            encoded_part = link[len(ADHOC_QUERY_PREFIX) :]  # noqa: E203
            try:
                # Decode the base64 and parse the JSON
                decoded_bytes = base64.b64decode(encoded_part.encode("utf-8"))
                url_query = json.loads(decoded_bytes.decode("utf-8"))
                queries.append(url_query)
            except (ValueError, json.JSONDecodeError):
                # Skip invalid encoded queries
                continue
        return queries

    def get_referenced_entity_ids(
        self,
        entity_type: Literal["dashboard", "metric", "question", "table", "model"],
        only_consider_navigated: bool = False,
    ) -> list[str]:
        """Helper to get all unique links to a specific entity type provided in the response chunks."""
        prefix = f"/{entity_type}/"
        return [
            link.split(prefix)[-1].split("/")[0]
            for link in self.get_response_links(only_consider_navigated)
            if link.startswith(prefix)
        ]

    @property
    def token_usage(self) -> UsageDict:
        """Helper to get the total token usage from the response chunks"""
        for chunk in self.parsed_chunks:
            if isinstance(chunk, ai_sdk.FinishMessageChunk) and chunk.usage:
                return chunk.usage
        return UsageDict()

    @property
    def response_agent_steps(self) -> list[dict[str, Any]]:
        """Helper to get the agent steps from the response chunks"""
        steps = []
        # We parse all chunks and keep the text, tool calls, tool results and data chunks
        # For the text chunks, we reduce chunks that follow each other into a single step
        current_text = ""
        for chunk in self.parsed_chunks:
            if isinstance(chunk, ai_sdk.TextChunk):
                current_text += chunk.content
            else:
                if current_text:
                    steps.append({"type": "text", "content": current_text})
                    current_text = ""
                if isinstance(chunk, ai_sdk.ToolCallChunk):
                    steps.append(
                        {
                            "type": "tool_call",
                            "tool_call_id": chunk.tool_call_id,
                            "tool_name": chunk.tool_name,
                            "arguments": chunk.arguments,
                        }
                    )
                elif isinstance(chunk, ai_sdk.ToolResultChunk):
                    steps.append(
                        {
                            "type": "tool_result",
                            "tool_call_id": chunk.tool_call_id,
                            "result": chunk.result,
                        }
                    )
                elif isinstance(chunk, ai_sdk.DataChunk) and chunk.data_type != ai_sdk.AISDKDataTypes.STATE.value:
                    steps.append(
                        {
                            "type": "data",
                            "data_type": chunk.data_type,
                            "value": chunk.value,
                        }
                    )
        if current_text:
            steps.append({"type": "text", "content": current_text})
        return steps

    def _get_result_impl(self) -> TestCaseResult[E2EAgentTestCaseMetadata]:
        token_usage = self.token_usage
        return TestCaseResult(
            test_case_id=self.id,
            description=self.description,
            difficulty=(
                self.difficulty.value
                if hasattr(self, "difficulty") and getattr(self.difficulty, "value", None) is not None
                else getattr(self, "difficulty", None)
            ),
            token_usage=token_usage.total,
            estimated_costs=token_usage.estimated_costs,
            response_duration=self.response_duration or 0.0,
            metadata=E2EAgentTestCaseMetadata(
                tool_calls=[tc.model_dump() for tc in self.tool_calls],
                agent_step_messages=self.response_agent_steps,
                response=self.final_response,
                message_history=[
                    *(self.history if self.history else []),
                    {"role": "user", "content": self.message},
                ],
                conversation_id=self.conversation_id,
                response_state=self.response_state.model_dump(),
            ),
            metrics=[
                MetricResult(
                    metric_name=m.__class__.__name__,
                    score=m.score,
                    reason=m.reason,
                    failures=[f.model_dump() for f in m.failures] if m.failures else None,
                    config=_get_metric_config(m),
                    runtime_data=_get_metric_runtime_data(m),
                    category=(
                        getattr(m.__class__, "category", None).value
                        if hasattr(getattr(m.__class__, "category", None), "value")
                        else getattr(m.__class__, "category", None)
                    ),
                    is_action_hallucination=m.action_metrics.get("is_action_hallucination", 0),
                    is_hesitation=m.action_metrics.get("is_hesitation", 0),
                    is_action_needed=m.action_metrics.get("is_action_needed", 0),
                    evaluated_actions=m.action_metrics.get("evaluated_actions", 0),
                )
                for m in self.metrics
            ],
        )
