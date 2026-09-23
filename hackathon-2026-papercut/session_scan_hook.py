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


ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "local" / "papercuts"
SESSION_ID = re.compile(r"^[0-9a-fA-F-]{36}$")


def scan_command(source, session_id):
    if source not in {"claude", "codex"} or not SESSION_ID.fullmatch(session_id):
        raise ValueError("invalid source or session ID")
    return [str(ROOT / "bin" / "mage"), f"papercuts-scan-{source}",
            "--session", session_id, "--min-idle", "0", "--no-subagents", "--jobs", "1"]


def launch(source, payload):
    if os.environ.get("PAPERCUTS_SCAN_HOOK") == "1":
        return False  # The drill-down agent must not scan itself.
    if payload.get("hook_event_name") not in {"Stop", "SessionEnd"}:
        return False
    session_id = payload.get("session_id")
    if not isinstance(session_id, str):
        return False
    scan_command(source, session_id)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with (LOG_DIR / "hook-scan.log").open("a") as log:
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--worker", source, session_id],
                         cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                         start_new_session=True, close_fds=True)
    return True


def work(source, session_id):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    # The last assistant message may reach the transcript just after Stop.
    time.sleep(3)
    with (LOG_DIR / f"hook-scan.{source}.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        print(f"Scanning {source} session {session_id}", flush=True)
        return subprocess.call(scan_command(source, session_id), cwd=ROOT,
                               env={**os.environ, "PAPERCUTS_SCAN_HOOK": "1"})


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--worker":
        return work(sys.argv[2], sys.argv[3])
    if len(sys.argv) != 2 or sys.argv[1] not in {"claude", "codex"}:
        print("usage: session_scan_hook.py claude|codex", file=sys.stderr)
        return 2
    try:
        launch(sys.argv[1], json.load(sys.stdin))
    except (ValueError, json.JSONDecodeError) as error:
        print(f"papercut scan hook: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
