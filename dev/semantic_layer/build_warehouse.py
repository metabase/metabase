#!/usr/bin/env python3
"""
Rebuild the `semantic_layer_test` database from scratch.

Each source database is copied into its own schema of the target database:

    grammargrind.public  ->  semantic_layer_test.grammargrind
    chinook.public       ->  semantic_layer_test.chinook
    pagila.public        ->  semantic_layer_test.pagila
    lego.public          ->  semantic_layer_test.lego

A source database's non-`public` schemas are copied too and prefixed with the
source db name unless they already are (chinook.chinook_enriched stays
`chinook_enriched`).

The target database is DROPPED and recreated on every run. Anything in it is
gone, and any open connections to it are force-terminated.

Requires: psycopg (pip install 'psycopg[binary]'), and pg_dump / psql on PATH.
Connection settings come from the usual PG* env vars, overridable with flags.

Usage:
    build_semantic_layer_test.py
    build_semantic_layer_test.py --target other_db --sources chinook lego
    build_semantic_layer_test.py --host localhost --port 5432 --user sameer
"""

import argparse
import os
import shutil
import subprocess
import sys
import time

import psycopg
from psycopg import sql

DEFAULT_SOURCES = ["grammargrind", "chinook", "pagila", "lego"]
DEFAULT_TARGET = "semantic_layer_test"
SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "pg_toast"]


def log(msg: str) -> None:
    print(msg, flush=True)


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sources", nargs="+", default=DEFAULT_SOURCES, metavar="DB",
                   help=f"source databases to copy (default: {' '.join(DEFAULT_SOURCES)})")
    p.add_argument("--target", default=DEFAULT_TARGET, help=f"target database (default: {DEFAULT_TARGET})")
    p.add_argument("--maintenance-db", default="postgres",
                   help="database to connect to for DROP/CREATE DATABASE (default: postgres)")
    p.add_argument("--host", default=None, help="server host (default: $PGHOST or local socket)")
    p.add_argument("--port", default=None, help="server port (default: $PGPORT or 5432)")
    p.add_argument("--user", default=None, help="user name (default: $PGUSER or the OS user)")
    return p.parse_args()


def connection_env(args: argparse.Namespace) -> dict:
    """Env for pg_dump/psql subprocesses. Inherits PG* vars, overridden by flags."""
    env = os.environ.copy()
    if args.host:
        env["PGHOST"] = args.host
    if args.port:
        env["PGPORT"] = str(args.port)
    if args.user:
        env["PGUSER"] = args.user
    return env


def connect(args: argparse.Namespace, dbname: str) -> psycopg.Connection:
    kwargs = {"dbname": dbname, "autocommit": True}
    if args.host:
        kwargs["host"] = args.host
    if args.port:
        kwargs["port"] = args.port
    if args.user:
        kwargs["user"] = args.user
    return psycopg.connect(**kwargs)


def user_schemas(conn: psycopg.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT nspname FROM pg_namespace "
        "WHERE nspname <> ALL(%s) AND nspname NOT LIKE 'pg_temp_%%' AND nspname NOT LIKE 'pg_toast_temp_%%' "
        "ORDER BY nspname",
        (SYSTEM_SCHEMAS,),
    ).fetchall()
    return [r[0] for r in rows]


def target_schema_name(source_db: str, schema: str) -> str:
    if schema == "public":
        return source_db
    if schema == source_db or schema.startswith(source_db + "_"):
        return schema
    return f"{source_db}_{schema}"


def relation_counts(conn: psycopg.Connection, schema: str) -> dict:
    """Counts of tables/views/sequences/functions in a schema, for before/after comparison."""
    row = conn.execute(
        """
        SELECT
          (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = %(s)s AND c.relkind IN ('r','p')) AS tables,
          (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = %(s)s AND c.relkind IN ('v','m')) AS views,
          (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = %(s)s AND c.relkind = 'S') AS sequences,
          (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = %(s)s) AS functions
        """,
        {"s": schema},
    ).fetchone()
    return {"tables": row[0], "views": row[1], "sequences": row[2], "functions": row[3]}


def row_counts(conn: psycopg.Connection, schema: str) -> dict:
    tables = [r[0] for r in conn.execute(
        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
        "WHERE n.nspname = %s AND c.relkind IN ('r','p') ORDER BY 1", (schema,)).fetchall()]
    out = {}
    for t in tables:
        q = sql.SQL("SELECT count(*) FROM {}.{}").format(sql.Identifier(schema), sql.Identifier(t))
        out[t] = conn.execute(q).fetchone()[0]
    return out


def dump_and_restore(source_db: str, target_db: str, env: dict) -> None:
    """Stream `pg_dump source | psql target` in one go, failing on the first error."""
    dump_cmd = ["pg_dump", "--no-owner", "--no-privileges", "--no-tablespaces", "--dbname", source_db]
    restore_cmd = ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "--dbname", target_db]

    dump = subprocess.Popen(dump_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    restore = subprocess.Popen(restore_cmd, stdin=dump.stdout, stdout=subprocess.DEVNULL,
                               stderr=subprocess.PIPE, env=env)
    dump.stdout.close()  # let pg_dump get SIGPIPE if psql dies
    _, restore_err = restore.communicate()
    _, dump_err = dump.communicate()

    if dump.returncode != 0:
        die(f"pg_dump of {source_db} failed (exit {dump.returncode}):\n{dump_err.decode(errors='replace')}")
    if restore.returncode != 0:
        die(f"psql restore into {target_db} failed (exit {restore.returncode}):\n{restore_err.decode(errors='replace')}")


def main() -> None:
    args = parse_args()
    env = connection_env(args)

    for tool in ("pg_dump", "psql"):
        if not shutil.which(tool):
            die(f"{tool} not found on PATH")
    if args.target in args.sources:
        die(f"target {args.target!r} is also a source")
    if len(set(args.sources)) != len(args.sources):
        die("duplicate source databases given")

    started = time.monotonic()

    # ---- Preflight: sources exist, work out the schema mapping, check for collisions ----
    with connect(args, args.maintenance_db) as maint:
        existing = {r[0] for r in maint.execute("SELECT datname FROM pg_database").fetchall()}
    missing = [s for s in args.sources if s not in existing]
    if missing:
        die(f"source database(s) not found: {', '.join(missing)}")

    plan: dict[str, dict[str, str]] = {}   # source_db -> {source_schema: target_schema}
    source_stats: dict[str, dict] = {}     # (source_db, schema) stats for verification
    for src in args.sources:
        with connect(args, src) as conn:
            schemas = user_schemas(conn)
            if not schemas:
                die(f"{src} has no user schemas to copy")
            plan[src] = {s: target_schema_name(src, s) for s in schemas}
            for s in schemas:
                source_stats[(src, s)] = {"objects": relation_counts(conn, s), "rows": row_counts(conn, s)}

    all_targets = [t for m in plan.values() for t in m.values()]
    dupes = sorted({t for t in all_targets if all_targets.count(t) > 1})
    if dupes:
        die(f"schema name collision in target: {', '.join(dupes)}")
    if "public" in all_targets:
        die("a source schema would map to target schema 'public'; refusing")

    log(f"Rebuilding database {args.target!r} from {len(args.sources)} source database(s):")
    for src, mapping in plan.items():
        for s, t in mapping.items():
            log(f"  {src + '.' + s:<28} -> {args.target}.{t}")

    # ---- Nuke and recreate the target ----
    with connect(args, args.maintenance_db) as maint:
        log(f"\nDropping {args.target!r} (if it exists, terminating any connections) ...")
        maint.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(args.target)))
        log(f"Creating {args.target!r} ...")
        maint.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(args.target)))

    # ---- Copy each source, then move its schemas into place ----
    for src, mapping in plan.items():
        t0 = time.monotonic()
        log(f"\n[{src}] pg_dump | psql ...")
        dump_and_restore(src, args.target, env)

        with connect(args, args.target) as conn:
            # Rename `public` first so the next source restores into a fresh, empty `public`.
            for s, t in sorted(mapping.items(), key=lambda kv: kv[0] != "public"):
                if s == t:
                    log(f"[{src}] keeping schema {t}")
                    continue
                log(f"[{src}] renaming schema {s} -> {t}")
                conn.execute(sql.SQL("ALTER SCHEMA {} RENAME TO {}").format(sql.Identifier(s), sql.Identifier(t)))
                if s == "public":
                    conn.execute("CREATE SCHEMA public")
        log(f"[{src}] done in {time.monotonic() - t0:.1f}s")

    # ---- Drop the now-empty public schema and verify ----
    problems = []
    with connect(args, args.target) as conn:
        leftover = relation_counts(conn, "public")
        if any(leftover.values()):
            problems.append(f"target 'public' schema is not empty after restore: {leftover}")
        else:
            conn.execute("DROP SCHEMA public")

        log("\nVerification (target vs source):")
        for src, mapping in plan.items():
            for s, t in mapping.items():
                want = source_stats[(src, s)]
                got = {"objects": relation_counts(conn, t), "rows": row_counts(conn, t)}
                total_rows = sum(got["rows"].values())
                status = "ok"
                if got["objects"] != want["objects"]:
                    status = "MISMATCH"
                    problems.append(f"{t}: object counts differ, source={want['objects']} target={got['objects']}")
                if got["rows"] != want["rows"]:
                    status = "MISMATCH"
                    diff = {k: (want["rows"].get(k), got["rows"].get(k))
                            for k in set(want["rows"]) | set(got["rows"])
                            if want["rows"].get(k) != got["rows"].get(k)}
                    problems.append(f"{t}: row counts differ (table: source, target) {diff}")
                o = got["objects"]
                log(f"  {t:<24} tables={o['tables']:<3} views={o['views']:<3} "
                    f"sequences={o['sequences']:<3} functions={o['functions']:<3} rows={total_rows:<9} {status}")

    elapsed = time.monotonic() - started
    if problems:
        log("")
        for p in problems:
            log(f"PROBLEM: {p}")
        die(f"finished with {len(problems)} problem(s) in {elapsed:.1f}s")
    log(f"\nAll good. {args.target!r} rebuilt in {elapsed:.1f}s.")


if __name__ == "__main__":
    main()
