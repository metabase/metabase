#!/usr/bin/env python3
"""Start/stop the dev Metabase backend (EE, hot reload) on port 3000 + its Postgres app DB.

It serves the frontend bundle the watcher writes to resources/frontend_client/app/dist; `make dev` starts
both (the `metabase-dev` launch config runs that). The backend is detached from whatever started it, so a
reset can bounce it while the watcher keeps running.

    server.py start | stop | restart | status | logs
"""
import os
import signal
import subprocess
import sys
import time

from common import (APP_DB, DEV_ENV_FILE, LOGFILE, NREPL_PORT, PG_HOST, PG_PORT, PG_USER, PIDFILE, PORT, REPO, SCRATCH,
                    URL, die, healthy, log, wait_healthy)


def running_pid():
    if not PIDFILE.exists():
        return None
    try:
        pid = int(PIDFILE.read_text().strip())
        os.kill(pid, 0)
        return pid
    except (ValueError, ProcessLookupError, PermissionError):
        PIDFILE.unlink(missing_ok=True)
        return None


def start():
    if running_pid():
        log(f"already running (pid {running_pid()}) at {URL}")
        return
    if not DEV_ENV_FILE.exists():
        die(f"{DEV_ENV_FILE} missing (MB_EDITION=ee + MB_PREMIUM_EMBEDDING_TOKEN)")
    SCRATCH.mkdir(exist_ok=True)
    env_overrides = {
        "MB_JETTY_PORT": str(PORT),
        "NREPL_PORT": str(NREPL_PORT),
        "MB_DB_TYPE": "postgres",
        "MB_DB_HOST": PG_HOST,
        "MB_DB_PORT": str(PG_PORT),
        "MB_DB_DBNAME": APP_DB,
        "MB_DB_USER": PG_USER,
        "MB_DB_PASS": "",
        "MB_ENABLE_TEST_ENDPOINTS": "true",
        "MB_SITE_URL": URL,
    }
    exports = " ".join(f"{k}={v!r}" for k, v in env_overrides.items())
    cmd = (f"cd {REPO} && set -a && . {DEV_ENV_FILE} && set +a && export {exports} && "
           "exec mise exec -- clojure -M:run:ee:dev:dev-start --hot")
    logf = open(LOGFILE, "ab")
    logf.write(f"\n===== start {time.strftime('%F %T')} =====\n".encode())
    proc = subprocess.Popen(["bash", "-lc", cmd], stdout=logf, stderr=subprocess.STDOUT,
                            start_new_session=True, cwd=REPO)
    PIDFILE.write_text(str(proc.pid))
    log(f"starting backend (pid {proc.pid}, port {PORT}, app db {APP_DB}, nrepl {NREPL_PORT}); log: {LOGFILE}")
    wait_healthy()


def stop():
    pid = running_pid()
    if not pid:
        log("not running")
        return
    log(f"stopping pid {pid} ...")
    try:
        os.killpg(os.getpgid(pid), signal.SIGTERM)
    except ProcessLookupError:
        pass
    for _ in range(60):
        if not running_pid():
            break
        time.sleep(0.5)
    else:
        log("still alive, sending SIGKILL")
        try:
            os.killpg(os.getpgid(pid), signal.SIGKILL)
        except ProcessLookupError:
            pass
    PIDFILE.unlink(missing_ok=True)
    log("stopped")


def status():
    pid = running_pid()
    print(f"pid: {pid or '-'}   healthy: {healthy()}   url: {URL}   app db: {APP_DB}   nrepl: {NREPL_PORT}")
    return 0 if pid else 1


def logs():
    os.execvp("tail", ["tail", "-n", "80", "-f", str(LOGFILE)])


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "status"
    {"start": start, "stop": stop, "restart": lambda: (stop(), start()),
     "status": lambda: sys.exit(status()), "logs": logs}.get(action, lambda: die(f"unknown action {action}"))()
