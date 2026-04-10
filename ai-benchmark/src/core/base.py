"""E2E Benchmark class that runs test cases against a live Metabase instance."""

import asyncio
import logging

from pydantic import Field
from tqdm import tqdm

from src.benchmarks.config import BenchmarkConfig
from src.metabase.client import BenchmarkMetabaseClient
from src.metrics import Benchmark

logger = logging.getLogger(__name__)


class BenchmarkE2E(Benchmark):
    """Benchmark that runs E2E test cases against a live Metabase instance.

    Unlike the standard Benchmark class which uses mocked clients,
    this benchmark creates a real HTTP client connection to Metabase
    and runs test cases against the live API.

    Set batch_size to control parallelism:
    - batch_size > 1: Parallel execution (faster, no isolation between tests)
    - batch_size = 1: Sequential execution
                      (slower, pre_test_case_hook called between tests which can be used to reset the environment))
    """

    batch_size: int = 30  # E2E default is smaller to avoid overwhelming Metabase
    config: BenchmarkConfig = Field(default_factory=BenchmarkConfig)

    async def run(self, test_case_kwargs: dict | None = None):
        """Run all test cases in batches against a live Metabase instance.

        Args:
            test_case_kwargs: Additional kwargs to pass to test case run() method.
        """
        if test_case_kwargs is None:
            test_case_kwargs = {}

        logger.info("Running E2E benchmark: %s", self.name)
        logger.info("Metabase host: %s", self.config.metabase_host)
        logger.info("Profile ID: %s", test_case_kwargs.get("profile_id"))
        logger.info("Total test cases: %d", len(self.test_cases))

        # Create both tester and admin clients for the entire benchmark run
        async with (
            BenchmarkMetabaseClient(
                host=self.config.metabase_host,
                username=self.config.mb_tester_username,
                password=self.config.mb_tester_password,
            ) as client,
            BenchmarkMetabaseClient(
                host=self.config.metabase_host,
                username=self.config.mb_admin_username,
                password=self.config.mb_admin_password,
            ) as admin_client,
        ):
            # Call setup hook once before all test cases
            await self.setup_hook()

            # Process in batches with progress bar
            with tqdm(
                total=len(self.test_cases),
                desc=f"{self.name}",
                unit="case",
                leave=False,
                position=1,
            ) as pbar:
                for i in range(0, len(self.test_cases), self.batch_size):
                    batch = self.test_cases[i : i + self.batch_size]  # noqa: E203
                    if self.batch_size == 1:
                        # Sequential execution with pre_test_case_hook for isolation
                        for case in batch:
                            await self.pre_test_case_hook(client=client)
                            await case.run(client=client, admin_client=admin_client, **test_case_kwargs)
                            pbar.update(1)
                    else:
                        # Parallel execution within batch (faster, no isolation)
                        await asyncio.gather(
                            *[case.run(client=client, admin_client=admin_client, **test_case_kwargs) for case in batch],
                            return_exceptions=True,
                        )
                        pbar.update(len(batch))

            # Call teardown hook once after all test cases
            await self.teardown_hook(client=client)
