"""Start a single-session papercut scan from a Claude or Codex lifecycle hook.

Hook deadlines are short. A detached worker runs mage and serializes access to
its per-agent progress file. Scan output is logged under local/papercuts/.
"""

import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "local" / "papercuts"
SESSION_ID = re.compile(r"^[0-9a-fA-F-]{36}$")
EVENTS = {"Stop", "SessionEnd"}


def normalize_server(server):
    parsed = urlsplit(server)
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password
            or parsed.path not in {"", "/"} or parsed.query or parsed.fragment
            or (parsed.port is not None and not 1 <= parsed.port <= 65535)):
        raise ValueError("server must be an HTTP(S) origin, optionally with a port")
    return server.rstrip("/")


def scan_command(source, session_id, event, server=None):
    if source not in {"claude", "codex"} or not SESSION_ID.fullmatch(session_id) or event not in EVENTS:
        raise ValueError("invalid source, session ID or event")
    command = [str(ROOT / "bin" / "mage"), f"papercuts-scan-{source}",
               "--session", session_id, "--min-idle", "0", "--no-subagents", "--jobs", "1",
               *(["--server", normalize_server(server)] if server is not None else [])]
    # After a turn the session may go on, so a short last stretch waits to be screened with the next turn's.
    # SessionEnd screens whatever is left.
    return command + ["--hold-short-tail"] if event == "Stop" else command


def launch(source, payload, server=None):
    if os.environ.get("PAPERCUTS_SCAN_HOOK") == "1":
        return False  # The drill-down agent must not scan itself.
    event = payload.get("hook_event_name")
    if event not in EVENTS:
        return False
    session_id = payload.get("session_id")
    if not isinstance(session_id, str):
        return False
    scan_command(source, session_id, event, server)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with (LOG_DIR / "hook-scan.log").open("a") as log:
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--worker", source, session_id, event,
                          normalize_server(server) if server is not None else ""],
                         cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                         start_new_session=True, close_fds=True)
    return True


def work(source, session_id, event, server):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    # The last assistant message may reach the transcript just after Stop.
    time.sleep(3)
    with (LOG_DIR / f"hook-scan.{source}.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        print(f"Scanning {source} session {session_id} after {event}", flush=True)
        return subprocess.call(scan_command(source, session_id, event, server), cwd=ROOT,
                               env={**os.environ, "PAPERCUTS_SCAN_HOOK": "1"})


def main():
    if len(sys.argv) == 6 and sys.argv[1] == "--worker":
        return work(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] or None)
    if len(sys.argv) == 2:
        # A hook installed before the server was saved in its command: the scanner resolves PAPERCUTS_SERVER as it
        # would when run by hand, then falls back to the shared server.
        source, server = sys.argv[1], None
    elif len(sys.argv) == 4 and sys.argv[2] == "--server":
        source, server = sys.argv[1], sys.argv[3]
    else:
        print("usage: session_scan_hook.py claude|codex [--server URL]", file=sys.stderr)
        return 2
    if source not in {"claude", "codex"}:
        print("source must be claude or codex", file=sys.stderr)
        return 2
    try:
        launch(source, json.load(sys.stdin), server)
    except (ValueError, json.JSONDecodeError) as error:
        print(f"papercut scan hook: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
