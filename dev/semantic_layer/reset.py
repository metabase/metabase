#!/usr/bin/env python3
"""Nuke everything and start clean: warehouse rebuilt from the source DBs, app DB cloned from the template.

    reset.py                 # full reset
    reset.py --keep-warehouse   # only the app DB (faster; use when no transforms ran)
"""
import subprocess
import sys
import time

from common import (APP_DB, APP_DB_TEMPLATE, HERE, PG_HOST, PG_PORT, PG_USER, SCRATCH, URL, WAREHOUSE_DB, db_exists, die,
                    log, psql)
import server

# Human judgements from the viz A/B pages (/_internal/viz-ab, /_internal/overview). They are the one thing in the app DB
# that is not regenerable, so they ride across the re-clone.
JUDGEMENT_TABLES = ["viz_eval_judgement", "overview_eval_judgement"]
JUDGEMENT_DUMP = SCRATCH / "judgements.sql"
PG = ["-h", PG_HOST, "-p", str(PG_PORT), "-U", PG_USER]


def dump_judgements():
    if not db_exists(APP_DB):
        return False
    present = [t for t in JUDGEMENT_TABLES
               if psql(f"select 1 from information_schema.tables where table_name = '{t}'", db=APP_DB) == "1"]
    if not present:
        return False
    cmd = ["pg_dump", *PG, "--no-owner", "--no-privileges", "--clean", "--if-exists", "-f", str(JUDGEMENT_DUMP)]
    for t in present:
        cmd += ["-t", t]
    r = subprocess.run(cmd + [APP_DB], capture_output=True, text=True)
    if r.returncode != 0:
        die(f"pg_dump of judgements failed:\n{r.stderr}")
    counts = {t: psql(f"select count(*) from {t}", db=APP_DB) for t in present}
    log(f"saved judgements {counts} -> {JUDGEMENT_DUMP}")
    return True


def restore_judgements():
    r = subprocess.run(["psql", *PG, "-d", APP_DB, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(JUDGEMENT_DUMP)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        die(f"restoring judgements failed:\n{r.stderr}")
    log("restored judgements")


def main(keep_warehouse=False):
    t0 = time.monotonic()
    if not db_exists(APP_DB_TEMPLATE):
        die(f"template {APP_DB_TEMPLATE!r} missing; run bootstrap.py first")
    server.stop()
    saved = dump_judgements()
    if not keep_warehouse:
        log(f"rebuilding warehouse {WAREHOUSE_DB} ...")
        r = subprocess.run([sys.executable, str(HERE / "build_warehouse.py"), "--target", WAREHOUSE_DB])
        if r.returncode != 0:
            die("warehouse rebuild failed")
    log(f"cloning app db {APP_DB} from {APP_DB_TEMPLATE} ...")
    if db_exists(APP_DB):
        psql(f'DROP DATABASE "{APP_DB}" WITH (FORCE)')
    psql(f'CREATE DATABASE "{APP_DB}" TEMPLATE "{APP_DB_TEMPLATE}"')
    if saved:
        restore_judgements()
    server.start()
    log(f"reset complete in {time.monotonic() - t0:.0f}s -> {URL}")


if __name__ == "__main__":
    main(keep_warehouse="--keep-warehouse" in sys.argv)
