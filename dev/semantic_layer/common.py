"""Shared config + helpers for the semantic-layer harness. Edit the CONFIG block to retarget."""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SCRATCH = HERE / ".scratch"

# ---- CONFIG -----------------------------------------------------------------
PORT = int(os.environ.get("SL_PORT", 3000))            # the one dev backend
NREPL_PORT = int(os.environ.get("SL_NREPL_PORT", 50606))
APP_DB = os.environ.get("SL_APP_DB", "mb_semantic_layer")
APP_DB_TEMPLATE = os.environ.get("SL_APP_DB_TEMPLATE", "mb_semantic_layer_clean")
WAREHOUSE_DB = os.environ.get("SL_WAREHOUSE_DB", "semantic_layer_test")
PG_USER = os.environ.get("SL_PG_USER", os.environ.get("USER", "sameer"))
PG_HOST, PG_PORT = "localhost", 5432
MB_PROFILE = os.environ.get("SL_MB_PROFILE", "semlayer")  # `mb` CLI profile name
ADMIN = {"email": "admin@semlayer.local", "password": "SemLayerDev123!", "first_name": "Semantic", "last_name": "Layer"}
DEV_ENV_FILE = Path.home() / ".config/metabase/dev.env"    # MB_EDITION=ee + EE token
URL = f"http://localhost:{PORT}"
# -----------------------------------------------------------------------------

PIDFILE = SCRATCH / "server.pid"
LOGFILE = SCRATCH / "server.log"
STATEFILE = SCRATCH / "state.json"   # api key etc. written by bootstrap


def log(msg):
    print(f"[semlayer] {msg}", flush=True)


def die(msg):
    print(f"[semlayer] error: {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def load_state():
    return json.loads(STATEFILE.read_text()) if STATEFILE.exists() else {}


def save_state(**kw):
    SCRATCH.mkdir(exist_ok=True)
    st = load_state(); st.update(kw)
    STATEFILE.write_text(json.dumps(st, indent=2) + "\n")
    STATEFILE.chmod(0o600)


# ---- HTTP (only used for bootstrap/admin ops the `mb` CLI has no verb for) ----
def api(method, path, body=None, session=None, api_key=None, timeout=60):
    req = urllib.request.Request(URL + path, method=method)
    req.add_header("Content-Type", "application/json")
    if session:
        req.add_header("X-Metabase-Session", session)
    if api_key:
        req.add_header("x-api-key", api_key)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        die(f"{method} {path} -> {e.code}: {e.read().decode(errors='replace')[:800]}")


def healthy():
    try:
        with urllib.request.urlopen(URL + "/api/health", timeout=3) as r:
            return json.loads(r.read()).get("status") == "ok"
    except Exception:
        return False


def wait_healthy(timeout=600):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        if healthy():
            log(f"instance healthy at {URL} ({time.monotonic() - t0:.0f}s)")
            return
        time.sleep(2)
    die(f"instance not healthy after {timeout}s; see {LOGFILE}")


# ---- Postgres (app DB admin) ----
def psql(sql, db="postgres"):
    r = subprocess.run(["psql", "-h", PG_HOST, "-p", str(PG_PORT), "-U", PG_USER, "-d", db, "-X", "-Atc", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        die(f"psql failed: {sql}\n{r.stderr}")
    return r.stdout.strip()


def db_exists(name):
    return psql(f"select 1 from pg_database where datname = '{name}'") == "1"


# ---- `mb` CLI ----
def mb(*args, check=True, capture=False):
    cmd = ["mb", *args, "--profile", MB_PROFILE]
    r = subprocess.run(cmd, text=True, capture_output=capture)
    if check and r.returncode != 0:
        die(f"mb failed ({r.returncode}): {' '.join(cmd)}\n{(r.stderr or '') if capture else ''}")
    return r
