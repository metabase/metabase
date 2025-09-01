#!/usr/bin/env python3
"""
Test suite for Python execution server.
"""

import os
import json
import time
import tempfile
import threading
import subprocess
from pathlib import Path
from typing import Dict, Any

import requests
import boto3
from botocore.config import Config


class PythonServerTester:
    def __init__(self, server_url: str = "http://localhost:5001", s3_endpoint: str = "http://localhost:4566"):
        self.server_url = server_url.rstrip("/")
        self.s3_endpoint = s3_endpoint
        self.s3_container_endpoint = "http://localstack:4566"  # Container network endpoint
        self.session = requests.Session()
        self.test_dir = None
        self.test_subdir = None
        self.bucket_name = "metabase-python-runner"
        self.s3_client = None
        self.container_s3_client = None

    def setup(self):
        """Setup test environment."""
        # Setup S3 client for host operations (test reads/writes)
        self.s3_client = boto3.client(
            's3',
            endpoint_url=self.s3_endpoint,
            aws_access_key_id='test',
            aws_secret_access_key='test',
            region_name='us-east-1',
            config=Config(s3={'addressing_style': 'path'})
        )

        # Setup S3 client for container operations (presigned URLs)
        self.container_s3_client = boto3.client(
            's3',
            endpoint_url=self.s3_container_endpoint,
            aws_access_key_id='test',
            aws_secret_access_key='test',
            region_name='us-east-1',
            config=Config(s3={'addressing_style': 'path'})
        )

        # Create bucket if it doesn't exist
        try:
            self.s3_client.create_bucket(Bucket=self.bucket_name)
            print(f"Created S3 bucket: {self.bucket_name}")
        except self.s3_client.exceptions.BucketAlreadyOwnedByYou:
            print(f"S3 bucket already exists: {self.bucket_name}")

        # Generate unique test run ID
        import uuid
        self.test_run_id = str(uuid.uuid4())[:8]
        print(f"Test run ID: {self.test_run_id}")

    def teardown(self):
        """Cleanup test environment."""
        # Clean up S3 objects from this test run
        if self.s3_client:
            try:
                # List and delete objects with our test run prefix
                response = self.s3_client.list_objects_v2(
                    Bucket=self.bucket_name,
                    Prefix=self.test_run_id
                )
                if 'Contents' in response:
                    for obj in response['Contents']:
                        self.s3_client.delete_object(Bucket=self.bucket_name, Key=obj['Key'])
                        print(f"Cleaned up S3 object: {obj['Key']}")
            except Exception as e:
                print(f"Error cleaning up S3: {e}")

    def generate_presigned_urls(self, request_id: str):
        """Generate presigned URLs for S3 upload using container client."""
        output_key = f"{self.test_run_id}/{request_id}/output.csv"
        stdout_key = f"{self.test_run_id}/{request_id}/stdout.txt"
        stderr_key = f"{self.test_run_id}/{request_id}/stderr.txt"

        # Generate URLs using container S3 client (already has correct endpoint)
        output_url = self.container_s3_client.generate_presigned_url(
            'put_object',
            Params={'Bucket': self.bucket_name, 'Key': output_key},
            ExpiresIn=3600
        )
        stdout_url = self.container_s3_client.generate_presigned_url(
            'put_object',
            Params={'Bucket': self.bucket_name, 'Key': stdout_key},
            ExpiresIn=3600
        )
        stderr_url = self.container_s3_client.generate_presigned_url(
            'put_object',
            Params={'Bucket': self.bucket_name, 'Key': stderr_key},
            ExpiresIn=3600
        )


        return {
            'output_url': output_url,
            'stdout_url': stdout_url,
            'stderr_url': stderr_url,
            'output_key': output_key,
            'stdout_key': stdout_key,
            'stderr_key': stderr_key
        }

    def read_s3_file(self, key: str) -> str:
        """Read a file from S3."""
        try:
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
            return response['Body'].read().decode('utf-8')
        except Exception as e:
            return f"Error reading S3 object {key}: {e}"

    def load_fixture(self, fixture_name: str) -> str:
        """Load a test fixture file."""
        fixture_path = Path(__file__).parent / "fixtures" / f"{fixture_name}.py"
        return fixture_path.read_text()

    def execute_code(self, code: str, timeout: int = 10, request_id: str = None, use_s3: bool = True) -> Dict[str, Any]:
        """Execute code on the server."""
        import uuid
        if request_id is None:
            request_id = str(uuid.uuid4())

        payload = {
            "code": code,
            "request_id": request_id,
            "timeout": timeout,
        }

        # Only add S3 URLs if requested (for transform tests)
        if use_s3:
            s3_urls = self.generate_presigned_urls(request_id)
            payload.update({
                "output_url": s3_urls['output_url'],
                "stdout_url": s3_urls['stdout_url'],
                "stderr_url": s3_urls['stderr_url']
            })

        try:
            response = self.session.post(
                f"{self.server_url}/execute",
                json=payload,
                timeout=timeout + 5
            )
            result = response.json()

            # Add S3 keys to result if S3 was used
            if use_s3:
                result['s3_keys'] = {
                    'output_key': s3_urls['output_key'],
                    'stdout_key': s3_urls['stdout_key'],
                    'stderr_key': s3_urls['stderr_key']
                }
            return result
        except Exception as e:
            return {"error": f"Request failed: {e}", "exit_code": -1}

    def get_status(self) -> Dict[str, Any]:
        """Get server status."""
        try:
            response = self.session.get(f"{self.server_url}/status")
            return response.json()
        except Exception as e:
            return {"error": f"Status request failed: {e}"}

    def get_logs(self) -> Dict[str, Any]:
        """Get current logs."""
        try:
            response = self.session.get(f"{self.server_url}/logs")
            return response.json()
        except Exception as e:
            return {"error": f"Logs request failed: {e}"}


    def test_server_health(self) -> bool:
        """Test server health check."""
        print("Testing server health...")
        status = self.get_status()

        if "error" in status:
            print(f"❌ Health check failed: {status['error']}")
            return False

        if not status.get("healthy"):
            print(f"❌ Server not healthy: {status}")
            return False

        print("✅ Server health check passed")
        return True

    def test_basic_execution(self) -> bool:
        """Test basic code execution."""
        print("Testing basic code execution...")

        code = self.load_fixture("basic_hello")
        result = self.execute_code(code)

        if result.get("exit_code") != 0:
            print(f"❌ Basic execution failed: {result}")
            return False

        # Check if S3 keys are available in result
        if "s3_keys" not in result:
            print(f"❌ No S3 keys in result: {result}")
            return False

        # Read and verify CSV output from S3
        csv_content = self.read_s3_file(result['s3_keys']['output_key'])
        if "Test successful!" not in csv_content:
            print(f"❌ CSV content incorrect: {csv_content}")
            return False

        print("✅ Basic execution test passed")
        return True

    def test_error_handling(self) -> bool:
        """Test error handling."""
        print("Testing error handling...")

        code = self.load_fixture("error_test")
        result = self.execute_code(code)

        if result.get("exit_code") != 1:
            print(f"❌ Error handling failed - wrong exit code: {result}")
            return False

        if result.get("timeout", False):
            print(f"❌ Error handling failed - marked as timeout: {result}")
            return False

        print("✅ Error handling test passed")
        return True

    def test_timeout_handling(self) -> bool:
        """Test timeout handling."""
        print("Testing timeout handling...")

        code = self.load_fixture("timeout_test")
        result = self.execute_code(code, timeout=2)

        if not result.get("timeout", False):
            print(f"❌ Timeout handling failed - not marked as timeout: {result}")
            return False

        if result.get("exit_code") != -1:
            print(f"❌ Timeout handling failed - wrong exit code: {result}")
            return False

        if abs(result.get("execution_time", 0) - 2) > 0.5:
            print(f"❌ Timeout handling failed - wrong execution time: {result}")
            return False

        print("✅ Timeout handling test passed")
        return True

    def test_concurrent_requests(self) -> bool:
        """Test concurrent request handling (queuing)."""
        print("Testing concurrent requests...")

        long_code = self.load_fixture("long_task")
        quick_code = self.load_fixture("quick_task")

        results = []
        threads = []

        def execute_and_store(code, index):
            result = self.execute_code(code)
            result["test_index"] = index
            results.append(result)

        # Start long task
        thread1 = threading.Thread(target=execute_and_store, args=(long_code, 1))
        thread1.start()
        threads.append(thread1)

        # Wait a bit, then start quick task
        time.sleep(0.5)
        thread2 = threading.Thread(target=execute_and_store, args=(quick_code, 2))
        thread2.start()
        threads.append(thread2)

        # Wait for both to complete
        for thread in threads:
            thread.join(timeout=10)

        if len(results) != 2:
            print(f"❌ Concurrent requests failed - got {len(results)} results")
            return False

        # Sort by test index to match with original order
        results.sort(key=lambda x: x.get("test_index", 0))

        # First should be the long task (3+ seconds)
        if results[0].get("execution_time", 0) < 2.5:
            print(f"❌ Long task too fast: {results[0]}")
            return False

        # Second should be quick (< 1 second)
        if results[1].get("execution_time", 0) > 1:
            print(f"❌ Quick task too slow: {results[1]}")
            return False

        # Both should succeed
        if results[0].get("exit_code") != 0 or results[1].get("exit_code") != 0:
            print(f"❌ One or both concurrent tasks failed: {results}")
            return False

        print("✅ Concurrent requests test passed")
        return True

    def test_json_processing(self) -> bool:
        """Test JSON processing capabilities."""
        print("Testing JSON processing...")

        code = self.load_fixture("json_test")
        result = self.execute_code(code)

        if result.get("exit_code") != 0:
            print(f"❌ JSON processing failed: {result}")
            return False

        print("✅ JSON processing test passed")
        return True

    def test_transform_with_parameters(self) -> bool:
        """Test transform function with table parameters."""
        print("Testing transform with table parameters...")

        # This tests that the transform runner framework works but without actual Metabase API
        code = self.load_fixture("transform_mock")
        result = self.execute_code(code)

        if result.get("exit_code") != 0:
            print(f"❌ Transform with parameters failed: {result}")
            return False

        if "s3_keys" not in result:
            print(f"❌ No S3 keys in transform result: {result}")
            return False

        csv_content = self.read_s3_file(result['s3_keys']['output_key'])
        if "doubled" not in csv_content:
            print(f"❌ CSV missing expected column: {csv_content}")
            return False

        print("✅ Transform with parameters test passed")
        return True

    def test_metrics_tracking(self) -> bool:
        """Test that metrics are being tracked."""
        print("Testing metrics tracking...")

        initial_status = self.get_status()
        initial_requests = initial_status.get("metrics", {}).get("total_requests", 0)

        # Execute a simple task with transform function
        code = self.load_fixture("metrics_test")
        result = self.execute_code(code)

        if result.get("exit_code") != 0:
            print(f"❌ Metrics test execution failed: {result}")
            return False

        final_status = self.get_status()
        final_requests = final_status.get("metrics", {}).get("total_requests", 0)

        if final_requests <= initial_requests:
            print(f"❌ Metrics not updated: {initial_requests} -> {final_requests}")
            return False

        print("✅ Metrics tracking test passed")
        return True

    def test_logs_endpoint(self) -> bool:
        """Test logs endpoint when no execution is running."""
        print("Testing logs endpoint...")

        # Test when no execution is running
        logs = self.get_logs()

        if "error" in logs:
            print(f"❌ Logs endpoint failed: {logs['error']}")
            return False

        if logs.get("status") != "no_execution":
            print(f"❌ Expected no_execution status: {logs}")
            return False

        if logs.get("stdout") != "" or logs.get("stderr") != "":
            print(f"❌ Expected empty logs when no execution: {logs}")
            return False

        if logs.get("execution_id") is not None:
            print(f"❌ Expected null execution_id when no execution: {logs}")
            return False

        print("✅ Logs endpoint test passed")
        return True

    def test_logs_during_execution(self) -> bool:
        """Test logs endpoint during execution with actual content."""
        print("Testing logs endpoint during execution...")

        # Create a script that prints to stdout and stderr, then sleeps
        code = '''
import sys
import time
import pandas as pd

def transform():
    print("Starting execution...")
    print("This is stdout content", flush=True)
    print("This is stderr content", file=sys.stderr, flush=True)
    time.sleep(3)
    print("Execution complete")
    return pd.DataFrame({
        "message": ["Test successful!"],
        "status": ["OK"]
    })
'''
        # Start execution in background thread
        result_container = []
        def execute_in_background():
            result = self.execute_code(code, timeout=10, use_s3=True)
            result_container.append(result)

        execution_thread = threading.Thread(target=execute_in_background)
        execution_thread.start()

        # Wait a bit for execution to start and produce output
        time.sleep(1)

        # Check logs while execution is running
        logs = self.get_logs()

        if "error" in logs:
            print(f"❌ Logs endpoint failed during execution: {logs['error']}")
            execution_thread.join(timeout=15)
            return False

        if logs.get("status") != "executing":
            print(f"❌ Expected executing status: {logs}")
            execution_thread.join(timeout=15)
            return False

        if logs.get("execution_id") is None:
            print(f"❌ Expected execution_id during execution: {logs}")
            execution_thread.join(timeout=15)
            return False

        # Print debug info to understand what's happening
        debug_info = logs.get("debug", {})

        # Check that we got some stdout content
        stdout_content = logs.get("stdout", "")
        stderr_content = logs.get("stderr", "")

        if "Starting execution" not in stdout_content or "stdout content" not in stdout_content:
            print(f"❌ Missing expected stdout content: {stdout_content}")
            print(f"   Debug info: {debug_info}")
            execution_thread.join(timeout=15)
            return False

        # Check that we got some stderr content
        if "stderr content" not in stderr_content:
            print(f"❌ Missing expected stderr content: {stderr_content}")
            print(f"   Debug info: {debug_info}")
            execution_thread.join(timeout=15)
            return False

        # Wait for execution to complete
        execution_thread.join(timeout=15)

        if not result_container:
            print("❌ Execution didn't complete")
            return False

        if result_container[0].get("exit_code") != 0:
            print(f"❌ Background execution failed: {result_container[0]}")
            print(stdout_content)
            print(stderr_content)
            return False

        print("✅ Logs during execution test passed")
        return True

    def run_all_tests(self) -> bool:
        """Run all tests."""
        print("=" * 60)
        print("Starting Python Execution Server Test Suite")
        print("=" * 60)

        self.setup()

        tests = [
            self.test_server_health,
            self.test_logs_endpoint,
            self.test_logs_during_execution,
            self.test_basic_execution,
            self.test_error_handling,
            self.test_timeout_handling,
            self.test_json_processing,
            self.test_transform_with_parameters,
            self.test_metrics_tracking,
            self.test_concurrent_requests,  # Run this last as it takes longest
        ]

        passed = 0
        total = len(tests)

        try:
            for test in tests:
                try:
                    if test():
                        passed += 1
                    print()  # Add spacing between tests
                except Exception as e:
                    print(f"❌ Test {test.__name__} crashed: {e}")
                    print()
        finally:
            self.teardown()

        print("=" * 60)
        print(f"Test Results: {passed}/{total} tests passed")
        print("=" * 60)

        if passed == total:
            print("🎉 All tests passed!")
        else:
            print(f"⚠️  {total - passed} tests failed")

        return passed == total


if __name__ == "__main__":
    import sys

    server_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5001"

    tester = PythonServerTester(server_url)
    success = tester.run_all_tests()

    sys.exit(0 if success else 1)
