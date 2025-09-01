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
current_execution_id = None
execution_id_lock = threading.Lock()


class ExecutionRequest:
    def __init__(self, code: str, working_dir: str, timeout: int, request_id: str,
                 table_mapping: Optional[Dict[str, str]] = None,
                 output_url: Optional[str] = None,
                 stdout_url: Optional[str] = None,
                 stderr_url: Optional[str] = None):
        self.code = code
        self.working_dir = working_dir
        self.timeout = timeout
        self.request_id = request_id
        self.table_mapping = table_mapping
        self.output_url = output_url
        self.stdout_url = stdout_url
        self.stderr_url = stderr_url
        self.result_event = threading.Event()
        self.result = None
        self.queued_at = time.time()


def set_resource_limits():
    memory_bytes = MAX_MEMORY_MB * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    resource.setrlimit(resource.RLIMIT_CPU, (MAX_CPU_TIME_SECONDS, MAX_CPU_TIME_SECONDS))
    resource.setrlimit(resource.RLIMIT_NOFILE, (MAX_FILE_DESCRIPTORS, MAX_FILE_DESCRIPTORS))
    resource.setrlimit(resource.RLIMIT_NPROC, (MAX_PROCESSES, MAX_PROCESSES))


def execute_code(code: str, working_dir: str, timeout: int,
                 table_mapping: Optional[Dict[str, str]] = None,
                 output_url: Optional[str] = None,
                 stdout_url: Optional[str] = None,
                 stderr_url: Optional[str] = None) -> Dict[str, Any]:
    start_time = time.time()

    work_path = Path(working_dir)
    if not work_path.exists():
        return {
            "exit_code": -1,
            "execution_time": 0,
            "error": f"Working directory does not exist: {working_dir}"
        }

    stdout_file = work_path / "stdout.log"
    stderr_file = work_path / "stderr.log"
    script_file = work_path / "script.py"
    output_file = work_path / "output.csv"

    script_file.write_text(code)

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    
    # Set S3 URLs if provided, otherwise use file paths
    if output_url:
        env["OUTPUT_URL"] = output_url
    else:
        env["OUTPUT_FILE"] = str(output_file)
    
    if stdout_url:
        env["STDOUT_URL"] = stdout_url
    if stderr_url:
        env["STDERR_URL"] = stderr_url

    if table_mapping:
        import json
        env["TABLE_FILE_MAPPING"] = json.dumps(table_mapping)

    # Use transform_runner.py if it exists, otherwise run script directly
    runner_path = Path(__file__).parent / "transform_runner.py"
    if runner_path.exists():
        cmd = [sys.executable, str(runner_path)]
    else:
        cmd = [sys.executable, str(script_file)]

    try:
        with open(stdout_file, "w") as stdout, open(stderr_file, "w") as stderr:
            process = subprocess.Popen(
                cmd,
                stdout=stdout,
                stderr=stderr,
                cwd=str(work_path),
                env=env,
                preexec_fn=set_resource_limits,
                start_new_session=True
            )

            try:
                exit_code = process.wait(timeout=timeout)
                execution_time = time.time() - start_time

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

                return result

            except subprocess.TimeoutExpired:
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                process.wait()

                with metrics_lock:
                    metrics["timeouts"] += 1

                return {
                    "exit_code": -1,
                    "execution_time": timeout,
                    "timeout": True,
                    "error": f"Script execution timed out after {timeout} seconds",
                    "stdout_file": str(stdout_file),
                    "stderr_file": str(stderr_file),
                }

    except Exception as e:
        app.logger.error(f"Error executing script: {e}")
        return {
            "exit_code": -1,
            "execution_time": time.time() - start_time,
            "timeout": False,
            "error": str(e),
        }


def worker_thread():
    global current_execution_id

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

            with execution_id_lock:
                current_execution_id = req.request_id

            with metrics_lock:
                metrics["current_queue_size"] = request_queue.qsize()

            try:
                result = execute_code(
                    req.code,
                    req.working_dir,
                    req.timeout,
                    req.table_mapping,
                    req.output_url,
                    req.stdout_url,
                    req.stderr_url
                )
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
                with execution_id_lock:
                    current_execution_id = None

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
    if not data or "code" not in data or "working_dir" not in data:
        return jsonify({"error": "code and working_dir are required"}), 400

    code = data["code"]
    working_dir = data["working_dir"]
    timeout = data.get("timeout", DEFAULT_TIMEOUT)
    table_mapping = data.get("table_mapping")
    output_url = data.get("output_url")
    stdout_url = data.get("stdout_url")
    stderr_url = data.get("stderr_url")

    import uuid
    request_id = str(uuid.uuid4())

    req = ExecutionRequest(code, working_dir, timeout, request_id,
                           table_mapping, output_url, stdout_url, stderr_url)

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
    with execution_id_lock:
        is_executing = current_execution_id is not None
        exec_id = current_execution_id

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
