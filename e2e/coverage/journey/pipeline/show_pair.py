"""Usage: python show_pair.py <work dir> <test A> <test B> [--level exact|normalized] [--json]

Prints two tests' shared path, where they part, and the assertions and code each adds after that.
A test is its "<spec path>::<full title>" key, its id in tests.jsonl, or a unique substring of its key.
"""

import argparse
import json
import sys

from journey_lib import Run
from pairs import format_pair, pair_diff


def find(run, query):
    if query in run.by_key:
        return run.by_key[query].id
    if query.isdigit() and int(query) < len(run.tests):
        return int(query)
    hits = [t.id for t in run.tests if query.lower() in t.label().lower()]
    if len(hits) != 1:
        print(f"{query!r} matches {len(hits)} tests:", file=sys.stderr)
        for h in hits[:20]:
            print(f"  {h}: {run.tests[h].label()}", file=sys.stderr)
        sys.exit(1)
    return hits[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("work")
    parser.add_argument("a")
    parser.add_argument("b")
    parser.add_argument("--level", default="normalized", choices=["exact", "normalized"])
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    run = Run(args.work)
    d = pair_diff(run, find(run, args.a), find(run, args.b), args.level)
    print(json.dumps(d, indent=1, default=str) if args.json else format_pair(d))


if __name__ == "__main__":
    main()
