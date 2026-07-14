"""Newline-delimited JSON stdin/stdout server around sql_tools, for running sqlglot on a native
CPython instead of GraalPy. Spawned by metabase.sql-parsing.python with this directory (or a zip of
it) on PYTHONPATH; prints one ready line, then answers one response line per request line:

    {"fn": "referenced_tables", "args": ["SELECT 1", "postgres"]}
    -> {"ok": true, "result": "..."} | {"ok": false, "error": "..."}
"""

import json
import sys

import sql_tools


def _resolve(fn_name):
    if fn_name.startswith("_"):
        raise ValueError(f"unknown sql_tools function: {fn_name}")
    fn = getattr(sql_tools, fn_name, None)
    if not callable(fn):
        raise ValueError(f"unknown sql_tools function: {fn_name}")
    return fn


def main():
    out = sys.stdout
    out.write(json.dumps({"ready": True}) + "\n")
    out.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            result = _resolve(request["fn"])(*request["args"])
            response = {"ok": True, "result": result}
        except Exception as e:  # noqa: BLE001 -- any failure is reported to the JVM side
            response = {"ok": False, "error": f"{type(e).__name__}: {e}"}
        out.write(json.dumps(response) + "\n")
        out.flush()


if __name__ == "__main__":
    main()
