"""Start a single-session papercut scan from a Claude or Codex lifecycle hook.

Hook deadlines are short, so the hook only queues the session and starts a detached worker. At most one worker
per agent runs: it scans every queued session, and a worker that finds another running leaves its session to it.
Scan output is logged under local/papercuts/.
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
    enqueue(source, session_id, event, normalize_server(server) if server is not None else None)
    with (LOG_DIR / "hook-scan.log").open("a") as log:
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--worker", source],
                         cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                         start_new_session=True, close_fds=True)
    return True


# How long a transcript gets to take its last record after the hook fires.
SETTLE_SECONDS = 3
# What decides where a scan reads transcripts from and reports to. A queued session is scanned with its own hook's
# values, not the worker's, since the worker may have been started by another session.
SCAN_ENV = ("CLAUDE_CONFIG_DIR", "CODEX_HOME", "PAPERCUTS_SERVER", "PAPERCUTS_TOKEN", "TYPESAFE_API_KEY")


def pending_path(source):
    return LOG_DIR / f"hook-scan.{source}.pending"


def enqueue(source, session_id, event, server):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    env = {key: os.environ[key] for key in SCAN_ENV if key in os.environ}
    # Entries can hold a token until the worker reads them, so only the owner can read the queue.
    with os.fdopen(os.open(pending_path(source), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600), "a") as pending:
        fcntl.flock(pending, fcntl.LOCK_EX)
        os.fchmod(pending.fileno(), 0o600)  # A queue made before tokens went in it may be readable by others.
        pending.write(json.dumps({"session": session_id, "event": event, "server": server, "env": env,
                                  "queued_at": time.time()}) + "\n")


def merged(entries):
    """One scan per session, in first-queued order. SessionEnd wins, since it also screens a short last stretch."""
    by_session = {}
    for entry in entries:
        prior = by_session.get(entry["session"])
        if prior and prior["event"] == "SessionEnd":
            entry = {**entry, "event": "SessionEnd"}
        by_session[entry["session"]] = entry
    return list(by_session.values())


def take_pending(pending):
    """Read and clear the queue. `pending` must be open and locked."""
    pending.seek(0)
    entries = [json.loads(line) for line in pending.read().splitlines() if line.strip()]
    pending.seek(0)
    pending.truncate()
    return merged(entries)


def scan(source, entry):
    # The last assistant message may reach the transcript just after the hook fires, for every queued session, not only
    # the one that started this worker.
    time.sleep(max(0.0, entry.get("queued_at", 0) + SETTLE_SECONDS - time.time()))
    print(f"Scanning {source} session {entry['session']} after {entry['event']}", flush=True)
    env = {key: value for key, value in os.environ.items() if key not in SCAN_ENV}
    subprocess.call(scan_command(source, entry["session"], entry["event"], entry["server"]), cwd=ROOT,
                    env={**env, **entry.get("env", {}), "PAPERCUTS_SCAN_HOOK": "1"})


def work(source):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with (LOG_DIR / f"hook-scan.{source}.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0  # The running worker scans what this one queued.
        while True:
            with pending_path(source).open("a+") as pending:
                fcntl.flock(pending, fcntl.LOCK_EX)
                entries = take_pending(pending)
                if not entries:
                    # Unlock while still holding the queue, so a session queued from here on starts a worker that
                    # can take the lock.
                    fcntl.flock(lock, fcntl.LOCK_UN)
                    return 0
            for entry in entries:
                scan(source, entry)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--worker" and sys.argv[2] in {"claude", "codex"}:
        return work(sys.argv[2])
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
