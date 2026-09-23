"""Resolve papercuts whose linked pull requests merge, by asking the GitHub REST API every few minutes."""

import json
import sys
import threading
import time
import traceback
from urllib.error import HTTPError
from urllib.request import Request, urlopen

API = "https://api.github.com/repos/metabase/metabase/pulls/"


def log(message):
    print(f"GitHub sync: {message}", file=sys.stderr, flush=True)


def check(store, token=None):
    """Ask GitHub about each open linked pull request once. A rate limit or network error ends the round early."""
    for pr in store.open_pull_requests():
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "papercuts-server"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if pr["etag"]:
            headers["If-None-Match"] = pr["etag"]
        try:
            with urlopen(Request(API + pr["url"].rsplit("/", 1)[1], headers=headers), timeout=20) as response:
                etag, body = response.headers.get("ETag"), json.load(response)
        except HTTPError as error:
            if error.code == 304:
                continue
            log(f"{pr['url']} returned {error.code}; trying again next round")
            if error.code in (403, 429):
                return
            continue
        except OSError as error:
            log(f"{pr['url']} failed: {error}; trying again next round")
            return
        state = "merged" if body.get("merged") else body.get("state")
        if state in ("open", "closed", "merged"):
            store.pull_request_checked(pr["papercut_id"], pr["url"], state, etag)


def run(store, minutes, token):
    while True:
        try:
            check(store, token)
        except Exception:
            log(traceback.format_exc())
        time.sleep(minutes * 60)


def start(store, environ):
    """Start checking every PAPERCUTS_GITHUB_SYNC minutes, 5 by default; 0 turns it off. GITHUB_TOKEN is optional."""
    try:
        minutes = float(environ.get("PAPERCUTS_GITHUB_SYNC") or 5)
    except ValueError:
        minutes = 0
    if minutes <= 0:
        log("off")
        return None
    log(f"checking linked pull requests every {minutes:g} minutes")
    thread = threading.Thread(target=run, args=(store, minutes, environ.get("GITHUB_TOKEN")), daemon=True)
    thread.start()
    return thread
