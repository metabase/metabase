#!/usr/bin/env python3
"""One-time: build the pristine app-DB template the harness resets from.

  1. create an empty Postgres app DB and boot the backend against it (runs migrations)
  2. complete /api/setup with the admin user, mint an admin API key, store it as `mb` profile
  3. add the warehouse (semantic_layer_test) and wait for the initial sync
  4. stop, snapshot the app DB as the template, then bring the instance back up via reset

Re-run whenever the template should change (new warehouse schema, new migration, ...).
"""
import subprocess
import sys
import time

from common import (ADMIN, APP_DB, APP_DB_TEMPLATE, MB_PROFILE, PG_HOST, PG_PORT, PG_USER, URL, WAREHOUSE_DB,
                    api, db_exists, die, log, psql, save_state)
import server


def main():
    server.stop()
    if db_exists(APP_DB):
        psql(f'DROP DATABASE "{APP_DB}" WITH (FORCE)')
    psql(f'CREATE DATABASE "{APP_DB}"')
    server.start()

    props = api("GET", "/api/session/properties")
    token = props.get("setup-token")
    if not token:
        die("instance already set up; the app DB should have been empty")
    log("running setup wizard ...")
    session = api("POST", "/api/setup", {
        "token": token,
        "user": ADMIN,
        "prefs": {"site_name": "Semantic Layer Test", "site_locale": "en"},
    })["id"]

    groups = api("GET", "/api/permissions/group", session=session)
    admin_gid = next(g["id"] for g in groups if g["name"] == "Administrators")
    key = api("POST", "/api/api-key", {"name": "semlayer harness", "group_id": admin_gid}, session=session)["unmasked_key"]
    save_state(api_key=key)
    log(f"storing API key as mb profile {MB_PROFILE!r}")
    r = subprocess.run(["mb", "auth", "login", "--url", URL, "--api-key", key, "--profile", MB_PROFILE],
                       capture_output=True, text=True)
    if r.returncode != 0:
        die(f"mb auth login failed: {r.stderr or r.stdout}")

    log(f"adding warehouse {WAREHOUSE_DB} ...")
    db = api("POST", "/api/database", {
        "engine": "postgres", "name": WAREHOUSE_DB, "is_full_sync": True, "is_on_demand": False,
        "details": {"host": PG_HOST, "port": PG_PORT, "dbname": WAREHOUSE_DB, "user": PG_USER,
                    "ssl": False, "schema-filters-type": "all", "advanced-options": False},
    }, api_key=key)
    db_id = db["id"]
    save_state(warehouse_db_id=db_id)
    for _ in range(300):
        st = api("GET", f"/api/database/{db_id}", api_key=key)["initial_sync_status"]
        if st == "complete":
            break
        time.sleep(2)
    else:
        die("warehouse sync did not complete")
    n = len(api("GET", f"/api/database/{db_id}/metadata", api_key=key)["tables"])
    log(f"warehouse synced: database id {db_id}, {n} tables")

    server.stop()
    if db_exists(APP_DB_TEMPLATE):
        psql(f'DROP DATABASE "{APP_DB_TEMPLATE}" WITH (FORCE)')
    psql(f'CREATE DATABASE "{APP_DB_TEMPLATE}" TEMPLATE "{APP_DB}"')
    log(f"template {APP_DB_TEMPLATE!r} saved. Admin login: {ADMIN['email']} / {ADMIN['password']}")
    server.start()
    log(f"done. {URL}")


if __name__ == "__main__":
    main()
