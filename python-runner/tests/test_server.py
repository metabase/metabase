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


class PythonServerTester:
    def __init__(self, server_url: str = "http://localhost:5001"):
        self.server_url = server_url.rstrip("/")
        self.session = requests.Session()
        self.test_dir = None
        self.test_subdir = None
        
    def setup(self):
        """Setup test environment."""
        # Use the mounted test directory from environment variable
        self.test_dir = os.environ.get("TEST_DIR", "/tmp/python-exec-tests")
        # Create a unique subdirectory for this test run
        import uuid
        self.test_subdir = os.path.join(self.test_dir, str(uuid.uuid4())[:8])
        os.makedirs(self.test_subdir, exist_ok=True)
        print(f"Test directory: {self.test_subdir}")
        
    def teardown(self):
        """Cleanup test environment."""
        # Clean up the test subdirectory
        if self.test_subdir and Path(self.test_subdir).exists():
            import shutil
            shutil.rmtree(self.test_subdir)
    
    def load_fixture(self, fixture_name: str) -> str:
        """Load a test fixture file."""
        fixture_path = Path(__file__).parent / "fixtures" / f"{fixture_name}.py"
        return fixture_path.read_text()
    
    def execute_code(self, code: str, timeout: int = 10) -> Dict[str, Any]:
        """Execute code on the server."""
        payload = {
            "code": code,
            "working_dir": self.test_subdir,
            "timeout": timeout
        }
        
        try:
            response = self.session.post(
                f"{self.server_url}/execute",
                json=payload,
                timeout=timeout + 5
            )
            return response.json()
        except Exception as e:
            return {"error": f"Request failed: {e}", "exit_code": -1}
    
    def get_status(self) -> Dict[str, Any]:
        """Get server status."""
        try:
            response = self.session.get(f"{self.server_url}/status")
            return response.json()
        except Exception as e:
            return {"error": f"Status request failed: {e}"}
    
    def read_file(self, filename: str) -> str:
        """Read a file from the test directory."""
        try:
            return (Path(self.test_subdir) / filename).read_text()
        except Exception as e:
            return f"Error reading {filename}: {e}"
    
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
        
        # Check if CSV output was created
        if "output_file" not in result:
            print(f"❌ No output CSV file created: {result}")
            return False
        
        # Read and verify CSV output
        csv_content = self.read_file("output.csv")
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
        
        if "output_file" not in result:
            print(f"❌ No CSV output from transform: {result}")
            return False
            
        csv_content = self.read_file("output.csv")
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
    
    def run_all_tests(self) -> bool:
        """Run all tests."""
        print("=" * 60)
        print("Starting Python Execution Server Test Suite")
        print("=" * 60)
        
        self.setup()
        
        tests = [
            self.test_server_health,
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