import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any

import aiohttp

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)


class BenchmarkMetabaseClient:
    def __init__(
        self,
        host: str,
        username: str,
        password: str,
        timeout_total: int = 300,
        timeout_sock_read: int = 60,
    ):
        self.host = host
        self.username = username
        self.password = password
        self.timeout_total = timeout_total
        self.timeout_sock_read = timeout_sock_read
        self.session_id = None
        self.headers = {}
        self._http_session = None
        self._session_lock = asyncio.Lock()
        self._closed = False

    async def __aenter__(self):
        """Async context manager entry"""
        await self.login()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - cleanup resources"""
        await self.close()

    async def _ensure_http_session(self):
        """Ensure we have a valid HTTP session for making requests"""
        async with self._session_lock:
            if self._http_session is None or self._http_session.closed:
                # Create session with proper timeout and connection limits
                timeout = aiohttp.ClientTimeout(
                    total=self.timeout_total,
                    sock_read=self.timeout_sock_read,
                )
                connector = aiohttp.TCPConnector(
                    limit=100,  # Max connections
                    limit_per_host=20,  # Max connections per host
                    keepalive_timeout=60,
                )
                self._http_session = aiohttp.ClientSession(timeout=timeout, connector=connector)
        return self._http_session

    async def login(self):
        """login to Metabase via the API"""
        if self._closed:
            raise RuntimeError("Client has been closed")

        login_url = f"{self.host}/api/session"
        login_data = {"username": self.username, "password": self.password}

        session = await self._ensure_http_session()
        async with session.post(login_url, json=login_data) as response:
            response.raise_for_status()
            session_data = await response.json()

        self.session_id = session_data.get("id")
        self.headers = {"X-Metabase-Session": self.session_id}

        return self.session_id

    async def close(self):
        """Close the HTTP session and clean up resources"""
        self._closed = True
        if self._http_session and not self._http_session.closed:
            await self._http_session.close()
            self._http_session = None

    def _ensure_connected(self):
        if self._closed:
            raise RuntimeError("Client has been closed")
        if not self.session_id:
            raise ValueError("Must login first before making requests")

    async def call_agent(
        self,
        message: str,
        conversation_id: str | None = None,
        context: dict[str, Any] | None = None,
        state: dict[str, Any] | None = None,
        history: list[dict[str, Any]] | None = None,
        metabot_id: str | None = None,
        profile_id: str | None = None,
    ) -> aiohttp.ClientResponse:
        """Send a request to the Metabot endpoint

        Args:
            message: The message to send to the agent
            conversation_id: UUID for the conversation (auto-generated if not provided)
            context: Context object with user viewing state, capabilities, etc.
            state: State object for maintaining conversation state
            history: List of previous messages in the conversation
            metabot_id: Optional metabot ID
            profile_id: Optional profile ID

        Returns:
            aiohttp ClientResponse object from the streaming endpoint
        """
        self._ensure_connected()

        # Generate conversation ID if not provided
        if conversation_id is None:
            conversation_id = str(uuid.uuid4())

        # Set default context if not provided
        if context is None:
            context = {
                "user_is_viewing": [],
                "current_time_with_timezone": datetime.now().astimezone().isoformat(),
                "capabilities": [
                    "frontend:navigate_user_v1",
                    "permission:save_questions",
                    "permission:write_sql_queries",
                ],
            }

        # Set default empty state if not provided
        if state is None:
            state = {}

        # Set default empty history if not provided
        if history is None:
            history = []

        # Prepare the request data
        request_data = {
            "message": message,
            "context": context,
            "state": state,
            "history": history,
            "conversation_id": conversation_id,
        }

        # Add optional parameters if provided
        if metabot_id is not None:
            request_data["metabot_id"] = metabot_id
        if profile_id is not None:
            request_data["profile_id"] = profile_id

        # Prepare headers
        headers = {
            **self.headers,
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }

        # Make the request to the streaming endpoint
        agent_url = f"{self.host}/api/metabot/agent-streaming"

        # Use the shared HTTP session
        session = await self._ensure_http_session()

        try:
            response = await session.post(agent_url, headers=headers, json=request_data)
            response.raise_for_status()
            return response
        except Exception as e:
            # If there's an error, make sure we don't leave hanging connections
            print(f"Error in call_agent: {e}")
            raise

    async def get_sql_representation(self, query: dict[str, Any]) -> str:
        """Get the SQL representation of a query using the native dataset endpoint

        Args:
            query: Query dictionary containing the query structure and database ID.
                   Example: {"database": 2, "type": "query", "query": {...}, "pretty": true}

        Returns:
            String containing the SQL representation of the query
        """
        self._ensure_connected()

        native_url = f"{self.host}/api/dataset/native"

        # Prepare headers
        headers = {
            **self.headers,
            "Content-Type": "application/json",
        }

        # Use the shared HTTP session
        session = await self._ensure_http_session()

        async with session.post(native_url, headers=headers, json=query) as response:
            response.raise_for_status()
            result = await response.json()

        # The response is a dict with a "query" key containing the SQL string
        return result.get("query", result)

    async def run_query(self, query: dict[str, Any]) -> dict[str, Any]:
        """Run a query using the dataset endpoint

        Args:
            query: Query dictionary containing the query structure and database ID.
                   Example: {"database": 2, "type": "query", "query": {...}, "pretty": true}

        Returns:
            Dictionary containing the query results
        """
        self._ensure_connected()

        dataset_url = f"{self.host}/api/dataset"

        # Prepare headers
        headers = {
            **self.headers,
            "Content-Type": "application/json",
        }

        # Use the shared HTTP session
        session = await self._ensure_http_session()

        async with session.post(dataset_url, headers=headers, json=query) as response:
            response.raise_for_status()
            result = await response.json()

        return result

    async def get_databases(self) -> list[dict[str, Any]]:
        """Get list of all databases in Metabase

        Returns:
            List of database dictionaries with id, name, engine, etc.
        """
        self._ensure_connected()

        databases_url = f"{self.host}/api/database"

        # Prepare headers
        headers = {
            **self.headers,
            "Content-Type": "application/json",
        }

        # Use the shared HTTP session
        session = await self._ensure_http_session()

        async with session.get(databases_url, headers=headers) as response:
            response.raise_for_status()
            result = await response.json()

        # The response is a dict with a "data" key containing the list of databases
        return result.get("data", result)

    async def get_session_info(self) -> dict[str, Any]:
        """Get Metabase version information

        Returns:
            Dictionary containing version information
        """
        self._ensure_connected()

        version_url = f"{self.host}/api/session/properties"

        # Prepare headers
        headers = {
            **self.headers,
            "Content-Type": "application/json",
        }

        # Use the shared HTTP session
        session = await self._ensure_http_session()

        async with session.get(version_url, headers=headers) as response:
            response.raise_for_status()
            result = await response.json()

        return result
