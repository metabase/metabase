#!/usr/bin/env python3
"""
Python execution server for Metabase.
Runs Python scripts in isolated processes with resource limits and monitoring.
"""

import os
import sys
import time
import signal
import resource
import threading
import subprocess
from pathlib import Path
from queue import Queue, Empty
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from flask import Flask, request, jsonify
from werkzeug.exceptions import HTTPException

DEFAULT_TIMEOUT = 30  # seconds
MAX_MEMORY_MB = 1024  # Increased for pandas/numpy
MAX_CPU_TIME_SECONDS = 60
MAX_QUEUE_SIZE = 10
QUEUE_TIMEOUT = 60  # seconds to wait in queue
MAX_FILE_DESCRIPTORS = 256
MAX_PROCESSES = 50
MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024

app = Flask(__name__)

metrics = {
    "total_requests": 0,
    "successful_executions": 0,
    "failed_executions": 0,
    "timeouts": 0,
    "rejected_requests": 0,
    "current_queue_size": 0,
    "average_execution_time": 0,
    "execution_times": [],
}
metrics_lock = threading.Lock()

request_queue = Queue(maxsize=MAX_QUEUE_SIZE)
current_execution_request = None
execution_lock = threading.Lock()


class ExecutionRequest:
    def __init__(self, code: str, timeout: int, request_id: str,
                 table_mapping: Optional[Dict[str, str]] = None,
                 manifest_mapping: Optional[Dict[str, str]] = None,
                 output_url: Optional[str] = None,
                 output_manifest_url: Optional[str] = None,
                 stdout_url: Optional[str] = None,
                 stderr_url: Optional[str] = None):
        self.code = code
        self.timeout = timeout
        self.request_id = request_id
        self.table_mapping = table_mapping
        self.manifest_mapping = manifest_mapping
        self.output_url = output_url
        self.output_manifest_url = output_manifest_url
        self.stdout_url = stdout_url
        self.stderr_url = stderr_url
        self.result_event = threading.Event()
        self.result = None
        self.queued_at = time.time()
        self.process = None
        self.cancelled = False


def upload_file_to_s3(file_path: str, s3_url: str):
    """Upload a local file to S3 using a presigned PUT URL."""
    if not s3_url or not Path(file_path).exists():
        return

    try:
        import urllib.request
        import urllib.error

        content = Path(file_path).read_text()
        if isinstance(content, str):
            content = content.encode('utf-8')

        req = urllib.request.Request(s3_url, data=content, method='PUT')
        req.add_header('Content-Type', 'text/plain')
        req.add_header('Content-Length', str(len(content)))

        with urllib.request.urlopen(req) as response:
            return response.read()
    except Exception as e:
        app.logger.warning(f"Failed to upload {file_path} to S3: {e}")


def terminate_subprocess(process, timeout_seconds=5):
    """Terminate a subprocess gracefully, falling back to SIGKILL if needed."""
    if not process or process.poll() is not None:
        return

    try:
        # Try graceful termination first
        os.killpg(os.getpgid(process.pid), signal.SIGTERM)

        # Wait for graceful termination
        try:
            process.wait(timeout=timeout_seconds)
            return
        except subprocess.TimeoutExpired:
            pass

        # Force kill if graceful termination failed
        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        process.wait()

    except (OSError, subprocess.SubprocessError) as e:
        app.logger.warning(f"Error terminating subprocess: {e}")


def set_resource_limits():
    memory_bytes = MAX_MEMORY_MB * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    resource.setrlimit(resource.RLIMIT_CPU, (MAX_CPU_TIME_SECONDS, MAX_CPU_TIME_SECONDS))
    resource.setrlimit(resource.RLIMIT_NOFILE, (MAX_FILE_DESCRIPTORS, MAX_FILE_DESCRIPTORS))
    resource.setrlimit(resource.RLIMIT_NPROC, (MAX_PROCESSES, MAX_PROCESSES))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))  # No core dumps
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_BYTES))

def execute_code(req: ExecutionRequest) -> Dict[str, Any]:
    import tempfile

    start_time = time.time()

    # Check if cancelled before starting
    if req.cancelled:
        return {
            "exit_code": -1,
            "execution_time": 0,
            "error": "Execution was cancelled",
            "cancelled": True
        }

    # Always use a temporary directory for execution
    with tempfile.TemporaryDirectory(prefix=f"python-exec-{req.request_id}-") as temp_dir:
        work_path = Path(temp_dir)
        return _execute_in_directory(req, work_path, start_time)


def _execute_in_directory(req: ExecutionRequest, work_path: Path, start_time: float) -> Dict[str, Any]:
    """Execute code in the specified directory."""
    stdout_file = work_path / "stdout.log"
    stderr_file = work_path / "stderr.log"
    script_file = work_path / "script.py"
    output_file = work_path / "output.csv"

    script_file.write_text(req.code)

    # Start with minimal, safe environment
    env = {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "PYTHONPATH": "",
        "PYTHONUNBUFFERED": "1",
        "HOME": str(work_path),
        "TMPDIR": str(work_path),
        "TEMP": str(work_path),
        "TMP": str(work_path),
        "LC_ALL": "C.UTF-8",
        "LANG": "C.UTF-8",
    }

    # Only add necessary environment variables
    if req.output_url:
        env["OUTPUT_URL"] = req.output_url
    else:
        env["OUTPUT_FILE"] = str(output_file)

    if req.output_manifest_url:
        env["OUTPUT_MANIFEST_URL"] = req.output_manifest_url
    if req.stdout_url:
        env["STDOUT_URL"] = req.stdout_url
    if req.stderr_url:
        env["STDERR_URL"] = req.stderr_url

    if req.table_mapping:
        import json
        env["TABLE_FILE_MAPPING"] = json.dumps(req.table_mapping)
    
    if req.manifest_mapping:
        import json
        env["TABLE_MANIFEST_MAPPING"] = json.dumps(req.manifest_mapping)

    # Use transform_runner.py if it exists AND we have S3 URLs, otherwise run script directly
    runner_path = Path(__file__).parent / "transform_runner.py"
    use_transform_runner = runner_path.exists() and (req.output_url or req.stdout_url or req.stderr_url)
    if use_transform_runner:
        cmd = [sys.executable, str(runner_path)]
    else:
        cmd = [sys.executable, str(script_file)]

    try:
        with open(stdout_file, "w", buffering=1) as stdout, open(stderr_file, "w", buffering=1) as stderr:
            process = subprocess.Popen(
                cmd,
                stdout=stdout,
                stderr=stderr,
                cwd=str(work_path),
                env=env,
                preexec_fn=set_resource_limits,
                start_new_session=True,
                universal_newlines=True,
                # Additional security options
                restore_signals=True,  # Reset signal handlers to default
                pass_fds=()  # Don't inherit any file descriptors
            )

            # Store process reference for cancellation and log file paths
            req.process = process
            req.log_files = {
                'stdout': str(stdout_file),
                'stderr': str(stderr_file)
            }
            req.execution_info = {
                'cmd': cmd,
                'use_transform_runner': use_transform_runner,
                'has_output_url': bool(req.output_url),
                'has_stdout_url': bool(req.stdout_url),
                'has_stderr_url': bool(req.stderr_url),
            }

            try:
                exit_code = process.wait(timeout=req.timeout)
                execution_time = time.time() - start_time

                # Check if cancelled during execution
                if req.cancelled:
                    return {
                        "exit_code": -1,
                        "execution_time": execution_time,
                        "error": "Execution was cancelled",
                        "cancelled": True,
                        "stdout_file": str(stdout_file),
                        "stderr_file": str(stderr_file),
                    }

                result = {
                    "exit_code": exit_code,
                    "execution_time": execution_time,
                    "timeout": False,
                    "stdout_file": str(stdout_file),
                    "stderr_file": str(stderr_file),
                }

                # Add output file if it was created
                if output_file.exists():
                    result["output_file"] = str(output_file)

                # Upload log files to S3 if URLs are provided
                upload_file_to_s3(str(stdout_file), req.stdout_url)
                upload_file_to_s3(str(stderr_file), req.stderr_url)

                return result

            except subprocess.TimeoutExpired:
                terminate_subprocess(process)

                with metrics_lock:
                    metrics["timeouts"] += 1

                # Upload log files to S3 even on timeout
                upload_file_to_s3(str(stdout_file), req.stdout_url)
                upload_file_to_s3(str(stderr_file), req.stderr_url)

                return {
                    "exit_code": -1,
                    "execution_time": req.timeout,
                    "timeout": True,
                    "error": f"Script execution timed out after {req.timeout} seconds",
                    "stdout_file": str(stdout_file),
                    "stderr_file": str(stderr_file),
                }

            finally:
                # Clear process reference
                req.process = None

    except Exception as e:
        app.logger.error(f"Error executing script: {e}")
        return {
            "exit_code": -1,
            "execution_time": time.time() - start_time,
            "timeout": False,
            "error": str(e),
        }


def worker_thread():
    global current_execution_request

    while True:
        try:
            req = request_queue.get(timeout=1)

            wait_time = time.time() - req.queued_at
            if wait_time > QUEUE_TIMEOUT:
                req.result = {
                    "error": f"Request timed out in queue after {wait_time:.1f} seconds",
                    "exit_code": -1,
                }
                req.result_event.set()
                continue

            with execution_lock:
                current_execution_request = req

            with metrics_lock:
                metrics["current_queue_size"] = request_queue.qsize()

            try:
                result = execute_code(req)
                result["request_id"] = req.request_id

                with metrics_lock:
                    if result.get("exit_code") == 0:
                        metrics["successful_executions"] += 1
                    else:
                        metrics["failed_executions"] += 1

                    if not result.get("timeout"):
                        metrics["execution_times"].append(result["execution_time"])
                        if len(metrics["execution_times"]) > 100:
                            metrics["execution_times"] = metrics["execution_times"][-100:]
                        if metrics["execution_times"]:
                            metrics["average_execution_time"] = sum(metrics["execution_times"]) / len(metrics["execution_times"])

                req.result = result

            except Exception as e:
                app.logger.error(f"Worker error: {e}")
                req.result = {
                    "error": str(e),
                    "exit_code": -1,
                    "request_id": req.request_id,
                }

            finally:
                with execution_lock:
                    current_execution_request = None

                req.result_event.set()

        except Empty:
            continue
        except Exception as e:
            app.logger.error(f"Worker thread error: {e}")


@app.route("/execute", methods=["POST"])
def execute():
    with metrics_lock:
        metrics["total_requests"] += 1

    data = request.get_json()
    if not data or "code" not in data or "request_id" not in data:
        return jsonify({"error": "code and request_id are required"}), 400

    code = data["code"]
    request_id = data["request_id"]
    timeout = data.get("timeout", DEFAULT_TIMEOUT)
    table_mapping = data.get("table_mapping")
    manifest_mapping = data.get("manifest_mapping")
    output_url = data.get("output_url")
    output_manifest_url = data.get("output_manifest_url")
    stdout_url = data.get("stdout_url")
    stderr_url = data.get("stderr_url")

    req = ExecutionRequest(code, timeout, request_id,
                           table_mapping, manifest_mapping, output_url, output_manifest_url,
                           stdout_url, stderr_url)

    try:
        request_queue.put_nowait(req)
        with metrics_lock:
            metrics["current_queue_size"] = request_queue.qsize()
    except:
        with metrics_lock:
            metrics["rejected_requests"] += 1
        return jsonify({
            "error": "Server is at capacity, please retry later",
            "queue_size": request_queue.qsize(),
        }), 503

    if not req.result_event.wait(timeout=timeout + QUEUE_TIMEOUT):
        return jsonify({
            "error": "Request processing timeout",
            "request_id": request_id,
        }), 504

    result = req.result
    status_code = 200 if result.get("exit_code") == 0 else 500

    return jsonify(result), status_code


@app.route("/status", methods=["GET"])
def status():
    with execution_lock:
        is_executing = current_execution_request is not None
        exec_id = current_execution_request.request_id if current_execution_request else None

    with metrics_lock:
        success_count = metrics["successful_executions"]
        fail_count = metrics["failed_executions"]
        total_completed = success_count + fail_count

        status_data = {
            "healthy": True,
            "queue_size": request_queue.qsize(),
            "max_queue_size": MAX_QUEUE_SIZE,
            "currently_executing": is_executing,
            "current_execution_id": exec_id,
            "metrics": {
                "total_requests": metrics["total_requests"],
                "completed": total_completed,
                "success_rate": success_count / max(1, total_completed),
                "timeouts": metrics["timeouts"],
                "rejected": metrics["rejected_requests"],
                "avg_execution_time": round(metrics["average_execution_time"], 2),
            }
        }

    return jsonify(status_data)


@app.route("/cancel", methods=["POST"])
def cancel_execution():
    data = request.get_json()
    if not data or "request_id" not in data:
        return jsonify({"error": "request_id is required"}), 400

    request_id = data["request_id"]

    with execution_lock:
        if not current_execution_request:
            return jsonify({"error": "No execution currently running"}), 404

        if current_execution_request.request_id != request_id:
            return jsonify({"error": f"Request ID {current_execution_request.request} does not match current execution {request_id}"}), 404

        # Mark as cancelled
        current_execution_request.cancelled = True

        # Terminate subprocess if running
        if current_execution_request.process:
            terminate_subprocess(current_execution_request.process)

    return jsonify({"message": f"Cancellation requested for {request_id}"})


@app.route("/logs", methods=["GET"])
def get_logs():
    """Get current stdout/stderr content for the running execution."""
    with execution_lock:
        if not current_execution_request:
            return jsonify({
                "stdout": "",
                "stderr": "",
                "execution_id": None,
                "status": "no_execution"
            })

        # Read current log files if they exist
        stdout_content = ""
        stderr_content = ""
        debug_info = {}

        # Try to find the log files from the current execution
        if hasattr(current_execution_request, 'log_files'):
            stdout_file = current_execution_request.log_files.get('stdout')
            stderr_file = current_execution_request.log_files.get('stderr')

            debug_info['stdout_file'] = stdout_file
            debug_info['stderr_file'] = stderr_file
            debug_info['stdout_exists'] = stdout_file and Path(stdout_file).exists()
            debug_info['stderr_exists'] = stderr_file and Path(stderr_file).exists()

            if stdout_file and Path(stdout_file).exists():
                try:
                    stdout_content = Path(stdout_file).read_text()
                    debug_info['stdout_size'] = len(stdout_content)
                except Exception as e:
                    app.logger.warning(f"Error reading stdout file: {e}")
                    debug_info['stdout_error'] = str(e)

            if stderr_file and Path(stderr_file).exists():
                try:
                    stderr_content = Path(stderr_file).read_text()
                    debug_info['stderr_size'] = len(stderr_content)
                except Exception as e:
                    app.logger.warning(f"Error reading stderr file: {e}")
                    debug_info['stderr_error'] = str(e)
        else:
            debug_info['has_log_files'] = False

        # Add execution info if available
        if hasattr(current_execution_request, 'execution_info'):
            debug_info.update(current_execution_request.execution_info)

        return jsonify({
            "stdout": stdout_content,
            "stderr": stderr_content,
            "execution_id": current_execution_request.request_id,
            "status": "executing",
            "debug": debug_info
        })


@app.errorhandler(Exception)
def handle_error(e):
    if isinstance(e, HTTPException):
        return jsonify({"error": e.description}), e.code

    app.logger.error(f"Unhandled error: {e}")
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    worker = threading.Thread(target=worker_thread, daemon=True)
    worker.start()

    app.run(host="0.0.0.0", port=5000, threaded=True)
