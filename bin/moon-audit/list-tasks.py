#!/usr/bin/env python3
"""Print the tasks an audit should cover, read from moon rather than hardcoded.

  with-outputs   cached tasks that declare outputs, for the write audit
  cached         every cached task, for the read audit

Uncached tasks are skipped: they always run, so their declarations never decide
anything.
"""
import json, subprocess, sys

which = sys.argv[1] if len(sys.argv) > 1 else "cached"
project = sys.argv[2] if len(sys.argv) > 2 else "metabase"

out = subprocess.run(["moon", "query", "tasks"], capture_output=True, text=True).stdout
tasks = json.loads(out)["tasks"].get(project, {})

for name, task in sorted(tasks.items()):
    if (task.get("options") or {}).get("cache") is False:
        continue
    if which == "with-outputs" and not task.get("outputs"):
        continue
    print(name)
