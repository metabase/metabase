#!/usr/bin/env python3
"""
Client interface for the Python execution server.
Used by Metabase to execute Python code via HTTP API.
"""

import json
import tempfile
import requests
from pathlib import Path
from typing import Dict, Any, Optional


class PythonExecutionClient:
    def __init__(self, server_url: str = "http://localhost:5000"):
        self.server_url = server_url.rstrip("/")
        self.session = requests.Session()
    
    def execute_code(self, code: str, working_dir: Optional[str] = None, timeout: int = 30) -> Dict[str, Any]:
        """
        Execute Python code on the server.
        
        Args:
            code: Python code to execute
            working_dir: Directory for execution (created if None)
            timeout: Timeout in seconds
        
        Returns:
            Dict with execution results including exit_code, stdout_file, stderr_file
        """
        # Create temp directory if none provided
        if working_dir is None:
            temp_dir = tempfile.mkdtemp(prefix="python_exec_")
            working_dir = temp_dir
        
        # Ensure working directory exists
        Path(working_dir).mkdir(parents=True, exist_ok=True)
        
        payload = {
            "code": code,
            "working_dir": working_dir,
            "timeout": timeout
        }
        
        try:
            response = self.session.post(
                f"{self.server_url}/execute",
                json=payload,
                timeout=timeout + 10  # Add buffer for HTTP timeout
            )
            
            return response.json()
        
        except requests.exceptions.Timeout:
            return {
                "error": "HTTP request timed out",
                "exit_code": -1,
                "timeout": True
            }
        except requests.exceptions.ConnectionError:
            return {
                "error": "Could not connect to Python execution server",
                "exit_code": -1
            }
        except Exception as e:
            return {
                "error": f"Client error: {str(e)}",
                "exit_code": -1
            }
    
    def get_status(self) -> Dict[str, Any]:
        """Get server status and metrics."""
        try:
            response = self.session.get(f"{self.server_url}/status")
            return response.json()
        except Exception as e:
            return {"error": f"Status check failed: {str(e)}"}
    
    def read_output_file(self, file_path: str) -> str:
        """Read contents of an output file."""
        try:
            return Path(file_path).read_text()
        except Exception as e:
            return f"Error reading file: {e}"


def run_python_script(code: str, working_dir: Optional[str] = None, timeout: int = 30) -> Dict[str, Any]:
    """
    Convenience function to execute Python code.
    
    This is the main interface that Metabase code should use.
    """
    client = PythonExecutionClient()
    return client.execute_code(code, working_dir, timeout)


if __name__ == "__main__":
    # Example usage
    client = PythonExecutionClient()
    
    # Check server status
    status = client.get_status()
    print("Server status:", json.dumps(status, indent=2))
    
    # Test execution
    test_code = """
import pandas as pd
import json

# Create a simple dataset
data = {'name': ['Alice', 'Bob', 'Charlie'], 'age': [25, 30, 35]}
df = pd.DataFrame(data)

print(f"Created DataFrame with {len(df)} rows")
print(df.to_string())

# Save results to output
with open('results.json', 'w') as f:
    json.dump(data, f)
"""
    
    result = client.execute_code(test_code)
    print("\nExecution result:", json.dumps(result, indent=2))
    
    # Read stdout if available
    if "stdout_file" in result:
        stdout_content = client.read_output_file(result["stdout_file"])
        print("\nStdout:")
        print(stdout_content)