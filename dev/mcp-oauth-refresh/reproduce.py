#!/usr/bin/env python3
"""Reproduce a background OAuth refresh persistence failure in Codex.

The fixture uses disposable loopback MCP/OAuth credentials and an isolated
Codex home. See README.md for the tested backend version and control cases.
"""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import queue
import subprocess
import tempfile
import threading
import time
import urllib.parse

parser = argparse.ArgumentParser()
parser.add_argument("--codex", required=True, help="Path to the Codex backend to test")
parser.add_argument("--coordinated", action="store_true")
parser.add_argument(
    "--reuse-refresh-token",
    action="store_true",
    help="Control: keep refresh tokens reusable",
)
parser.add_argument(
    "--no-background-stream",
    action="store_true",
    help="Control: respond 405 to MCP GET requests",
)
args = parser.parse_args()
binary = Path(args.codex).expanduser().resolve()
version = subprocess.check_output([str(binary), "--version"], text=True).strip()
home = Path(tempfile.mkdtemp(prefix="mcp-refresh-fixture-"))
expect_failure = not (
    args.coordinated or args.reuse_refresh_token or args.no_background_stream
)
started = time.monotonic()
events = []
rotated = threading.Event()
reconnected = threading.Event()
stop = threading.Event()
state = {"generation": 0, "expires": time.time() + 45, "sessions": 0}
lock = threading.Lock()


def record(kind, **data):
    event = {"seconds": round(time.monotonic() - started, 2), "event": kind, **data}
    events.append(event)
    print(json.dumps(event), flush=True)


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def response(self, status, body=None, headers=None):
        content = b"" if body is None else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if content:
            self.wfile.write(content)

    def do_GET(self):
        if self.path.startswith("/.well-known/oauth-protected-resource"):
            return self.response(
                200,
                {
                    "resource": base + "/mcp",
                    "authorization_servers": [base],
                    "scopes_supported": ["read"],
                },
            )
        if self.path.startswith("/.well-known/oauth-authorization-server"):
            return self.response(
                200,
                {
                    "issuer": base,
                    "authorization_endpoint": base + "/authorize",
                    "token_endpoint": base + "/token",
                    "registration_endpoint": base + "/register",
                    "response_types_supported": ["code"],
                    "grant_types_supported": ["authorization_code", "refresh_token"],
                    "token_endpoint_auth_methods_supported": ["none"],
                    "code_challenge_methods_supported": ["S256"],
                    "scopes_supported": ["read"],
                },
            )
        if self.path == "/mcp":
            if args.no_background_stream:
                return self.response(405, {})
            if not self.headers.get("Authorization"):
                return self.response(
                    401,
                    {},
                    {
                        "WWW-Authenticate": 'Bearer resource_metadata="'
                        + base
                        + '/.well-known/oauth-protected-resource/mcp"'
                    },
                )
            record("sse_open", session=self.headers.get("Mcp-Session-Id"))
            if state["generation"] > 0:
                reconnected.set()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(b": keepalive\n\n")
            self.wfile.flush()
            stop.wait(max(0, 20 - (time.monotonic() - started)))
            if time.monotonic() - started >= 20 and not rotated.is_set():
                record("sse_timeout")
            else:
                stop.wait(120)
            self.close_connection = True
            return
        return self.response(404, {})

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if self.path == "/token":
            params = urllib.parse.parse_qs(raw.decode())
            with lock:
                submitted = params.get("refresh_token", [""])[0]
                expected = "fixture-refresh-" + str(
                    0 if args.reuse_refresh_token else state["generation"]
                )
                accepted = submitted == expected
                record(
                    "refresh_request",
                    grant=params.get("grant_type"),
                    submitted_generation=submitted.removeprefix("fixture-refresh-"),
                    accepted=accepted,
                )
                if not accepted:
                    return self.response(
                        400,
                        {
                            "error": "invalid_request",
                            "error_description": "The token request is invalid.",
                        },
                    )
                state["generation"] += 1
                generation = state["generation"]
                self.response(
                    200,
                    {
                        "access_token": "fixture-access-" + str(generation),
                        "refresh_token": "fixture-refresh-"
                        + str(0 if args.reuse_refresh_token else generation),
                        "token_type": "Bearer",
                        "expires_in": 3600,
                        "scope": "read",
                    },
                )
                rotated.set()
                return
        if self.path != "/mcp":
            return self.response(404, {})
        message = json.loads(raw)
        method = message.get("method")
        if "id" not in message:
            return self.response(202)
        headers = {}
        if method == "initialize":
            with lock:
                state["sessions"] += 1
                session = "fixture-session-" + str(state["sessions"])
            headers["Mcp-Session-Id"] = session
            result = {
                "protocolVersion": "2025-03-26",
                "capabilities": {
                    "tools": {"listChanged": True},
                    "resources": {},
                    "logging": {},
                },
                "serverInfo": {"name": "local-refresh-fixture", "version": "1"},
            }
            record("initialize", session=session)
        elif method == "tools/list":
            result = {
                "tools": [
                    {
                        "name": "probe",
                        "description": "Local fixture health check",
                        "inputSchema": {"type": "object", "properties": {}},
                    }
                ]
            }
        elif method == "resources/list":
            result = {"resources": []}
        elif method == "resources/templates/list":
            result = {"resourceTemplates": []}
        elif method == "tools/call":
            result = {"content": [{"type": "text", "text": "fixture success"}]}
            record("tool_reached_server")
        else:
            result = {}
        self.response(
            200, {"jsonrpc": "2.0", "id": message["id"], "result": result}, headers
        )

    def do_DELETE(self):
        self.response(200)


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
server.daemon_threads = True
base = "http://127.0.0.1:" + str(server.server_port)
threading.Thread(target=server.serve_forever, daemon=True).start()
name = "rotation_fixture"
url = base + "/mcp"
key = (
    name
    + "|"
    + hashlib.sha256(
        json.dumps(
            {"type": "http", "url": url, "headers": {}}, separators=(",", ":")
        ).encode()
    ).hexdigest()[:16]
)
credential_path = home / ".credentials.json"
credential_path.write_text(
    json.dumps(
        {
            key: {
                "server_name": name,
                "server_url": url,
                "issuer": base,
                "client_id": "fixture-client",
                "access_token": "fixture-access-0",
                "refresh_token": "fixture-refresh-0",
                "expires_at": int(state["expires"] * 1000),
                "scopes": ["read"],
            }
        }
    )
)
credential_path.chmod(0o600)
(home / "config.toml").write_text(
    'mcp_oauth_credentials_store = "file"\nmodel = "fixture"\nmodel_provider = "fixture"\n[model_providers.fixture]\nname = "Local test fixture"\nbase_url = "'
    + base
    + '/unused-model-api"\nwire_api = "responses"\nrequires_openai_auth = false\n[analytics]\nenabled = false\n[features]\nmcp_oauth_refresh_coordination = '
    + str(args.coordinated).lower()
    + "\n[mcp_servers."
    + name
    + ']\nurl = "'
    + url
    + '"\n'
)
env = {
    **os.environ,
    "CODEX_HOME": str(home),
    "RUST_LOG": "warn,codex_rmcp_client=debug,rmcp::transport::auth=debug",
}
stderr = (home / "backend.log").open("w")
proc = subprocess.Popen(
    [str(binary), "app-server", "--stdio"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=stderr,
    text=True,
    env=env,
    cwd=home,
)
responses = queue.Queue()
sequence = 0


def reader():
    for line in proc.stdout:
        try:
            msg = json.loads(line)
            responses.put(msg)
        except ValueError:
            pass


threading.Thread(target=reader, daemon=True).start()


def rpc(method, params):
    global sequence
    sequence += 1
    current = sequence
    proc.stdin.write(
        json.dumps({"id": current, "method": method, "params": params}) + "\n"
    )
    proc.stdin.flush()
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        msg = responses.get(timeout=max(0.1, deadline - time.monotonic()))
        if msg.get("id") == current:
            if "error" in msg:
                record("rpc_error", method=method, error=msg["error"])
            return msg
    raise TimeoutError(method)


def saved_generation():
    d = json.loads(credential_path.read_text())
    assert len(d) == 1, "Fixture credentials must use the installed backend store key"
    return d[key]["refresh_token"].removeprefix("fixture-refresh-")


try:
    record(
        "start",
        version=version,
        coordinated=args.coordinated,
        reuse_refresh_token=args.reuse_refresh_token,
        no_background_stream=args.no_background_stream,
        artifacts=str(home),
    )
    init = rpc(
        "initialize",
        {
            "clientInfo": {"name": "refresh_fixture", "version": "1"},
            "capabilities": {"experimentalApi": True},
        },
    )
    proc.stdin.write('{"method":"initialized"}\n')
    proc.stdin.flush()
    thread = rpc("thread/start", {"cwd": str(home), "ephemeral": True})
    thread_id = thread["result"]["thread"]["id"]
    status = rpc("mcpServerStatus/list", {"threadId": thread_id})
    record("initial_status", result=status)
    assert "result" in status, "MCP startup status request must succeed"
    if not args.no_background_stream:
        if not rotated.wait(35):
            raise RuntimeError("No background refresh observed before deadline")
        assert reconnected.wait(10), "Background stream must reopen after refresh"
        record("after_background_refresh", saved_generation=saved_generation())
        if args.coordinated and not args.reuse_refresh_token:
            assert (
                saved_generation() == "1"
            ), "Background refresh must persist its replacement"
    stop.wait(max(0, 47 - (time.monotonic() - started)))
    result = rpc(
        "mcpServer/tool/call",
        {"threadId": thread_id, "server": name, "tool": "probe", "arguments": {}},
    )
    record("tool_after_expiry", result=result, saved_generation=saved_generation())
    tool_result = result.get("result", {})
    if not expect_failure:
        assert saved_generation() == (
            "0" if args.reuse_refresh_token else "1"
        ), "Expected refresh token was not persisted"
        assert (
            tool_result.get("isError") is not True
        ), "Tool call still requires authorization"
        assert any(
            x.get("text") == "fixture success" for x in tool_result.get("content", [])
        ), "Tool call did not reach fixture"
        another = rpc("thread/start", {"cwd": str(home), "ephemeral": True})
        another_id = another["result"]["thread"]["id"]
        result = rpc(
            "mcpServer/tool/call",
            {"threadId": another_id, "server": name, "tool": "probe", "arguments": {}},
        )
        record("fresh_client_tool", result=result)
        assert any(
            x.get("text") == "fixture success"
            for x in result.get("result", {}).get("content", [])
        ), "Fresh client did not reach fixture"
    else:
        assert saved_generation() == "0", "Expected to reproduce an unsaved replacement"
        assert (
            tool_result.get("isError") is True
        ), "Expected the old token to fail after expiry"
        assert "Reconnect" in tool_result["content"][0]["text"]
    record("expectations_passed", expected_reconnect_error=expect_failure)
finally:
    stop.set()
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    server.shutdown()
    stderr.close()
    (home / "events.json").write_text(json.dumps(events, indent=2))
