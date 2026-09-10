#!/usr/bin/env python3
"""Load a generated semantic layer into the running instance.

    load.py <schema>            # runs layers/<schema>/build.sh, then pushes layers/<schema>/layer.json (if any)
    load.py <schema> --reset    # full reset first

layers/<schema>/build.sh is the layer: a replayable sequence of `mb ... --profile $MB_PROFILE` calls
(transforms -> run --wait -> db sync-schema --wait -> library publish -> measures/segments -> metrics -> dashboards).
layers/<schema>/layer.json, if present, is the agent's full intent and is stored verbatim in the dev prototype
store (GET /api/dev/prototype/semantic-layer/) for the internal tooling to render.
"""
import json
import os
import subprocess
import sys
import time

from common import HERE, MB_PROFILE, URL, WAREHOUSE_DB, api, die, healthy, load_state, log
import reset


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        die("usage: load.py <schema> [--reset]")
    schema = args[0]
    layer_dir = HERE / "layers" / schema
    build = layer_dir / "build.sh"
    if not build.exists():
        die(f"{build} not found")
    if "--reset" in sys.argv:
        reset.main(keep_warehouse="--keep-warehouse" in sys.argv)
    if not healthy():
        die(f"instance at {URL} is not up; run server.py start (or --reset)")

    state = load_state()
    env = os.environ | {
        "MB_PROFILE": MB_PROFILE, "MB_URL": URL, "SL_SCHEMA": schema,
        "SL_WAREHOUSE_DB": WAREHOUSE_DB, "SL_WAREHOUSE_DB_ID": str(state.get("warehouse_db_id", "")),
        "SL_LAYER_DIR": str(layer_dir),
    }
    t0 = time.monotonic()
    log(f"running {build} ...")
    r = subprocess.run(["bash", "-euo", "pipefail", str(build)], cwd=layer_dir, env=env)
    if r.returncode != 0:
        die(f"build.sh failed with exit {r.returncode}")

    layer_json = layer_dir / "layer.json"
    if layer_json.exists():
        doc = json.loads(layer_json.read_text())
        doc.setdefault("schema", schema)
        existing = api("GET", "/api/dev/prototype/semantic-layer/", api_key=state.get("api_key")) or []
        for row in existing:
            if row.get("schema") == schema:
                api("DELETE", f"/api/dev/prototype/semantic-layer/{row['id']}", api_key=state.get("api_key"))
        api("POST", "/api/dev/prototype/semantic-layer/", doc, api_key=state.get("api_key"))
        log("pushed layer.json to /api/dev/prototype/semantic-layer/")
    log(f"loaded {schema} in {time.monotonic() - t0:.0f}s -> {URL}")


if __name__ == "__main__":
    main()
