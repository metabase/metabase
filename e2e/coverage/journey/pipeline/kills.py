"""Reads a kill matrix and turns it into a keep, provisional-keep, delete or unmeasured verdict per candidate test.

The kill matrix is JSON, one entry per planted mutant, keyed by an opaque mutant id:

  {"<mutant id>": {
     "killed_by":      [test id, ...],   confirmed kills only
     "unconfirmed_by": [test id, ...],   e2e kills seen once and not reproduced on rerun
     "errored":        [test id, ...],   failed for another reason (crash, timeout, setup), never a kill
     "ran":            [test id, ...],   every test run against the mutant. A miss is ran - killed_by - errored
     "stratum":        "logic" | "wiring" | "state" | "baseline",
     "origin":         "<regression id>" or "synthetic",
     "file":           "<repo-relative path>"   optional, see file_reach()
   }}

A test id is "<spec path>::<Cypress full title>" for e2e,
"<spec path>::<jest fullName>" for jest and "<namespace>/<var>" for deftest.
An entry that is a bare list of test ids, {"<mutant id>": [killer test id, ...]}, is read as killed_by with `ran` unknown,
and so is an entry without `ran`.

The candidates are the e2e tests of a pipeline run, or the tests given to the command below.
Every other id is a remaining test: it counts when deciding whether some other test kills a mutant,
and never gets a verdict.

A candidate's unique kills are the mutants it killed, among those it ran against, that no other test killed.
Its unconfirmed unique kills are the mutants it ran against where it is the only test in `unconfirmed_by` and none is in `killed_by`.
The kills-first cover keeps a candidate for every mutant that candidates kill and no remaining test does,
where a mutant's killers are the tests in its `killed_by`, or in its `unconfirmed_by` when `killed_by` is empty.
  keep              it has a unique kill, or the cover keeps it for kills it shares only with other candidates
  provisional-keep  not a keep, and it has an unconfirmed unique kill or the cover keeps it
  delete            no unique kill of either kind, at least `min_mutants` qualifying mutants, and every required stratum among them
  unmeasured        anything else, including no kill matrix, `ran` unknown, or a test that failed in the capture or isn't in it
A qualifying mutant sits in the candidate's reached code,
and both the candidate and at least one other test ran against it without erroring.

As a command, it takes the candidates' reached code from a reach index instead of a pipeline run:

  python3 kills.py --index <index dir> --kills <file> --candidates <file or test id> [--candidates ...]
                   [--min-mutants <k>] [--require-strata <s,...>] [--out <json file>] [--repo <path>] [--sha <commit>]

There a mutant's location is its `locations` list, its `location`, or its own `file`, `fn`, `line`, `column`, `ns` and `var`,
in any form lookup.mjs takes, and a candidate reaches the mutant when it ran a function or class the location resolves to.
"""

import argparse
import collections
import heapq
import json
import os
import re
import subprocess
import sys
import types

VERDICTS = ("keep", "provisional-keep", "delete", "unmeasured")
MIN_MUTANTS = 5
REQUIRED_STRATA = "logic,wiring"
HERE = os.path.dirname(os.path.abspath(__file__))


def load(path, run):
    """The kill matrix mapped onto the run: per mutant and field, the ids of the run's tests and the ids of every other test."""
    with open(path) as f:
        raw = json.load(f)
    by_base_key = collections.defaultdict(list)
    for t in run.tests:
        by_base_key[t.base_key].append(t.id)
    unknown_e2e = set()
    ambiguous = set()
    mutants = {}
    ran_known = True
    for mid, entry in raw.items():
        if isinstance(entry, list):
            entry = {"killed_by": entry}
        ran = entry.get("ran")
        ran_known = ran_known and ran is not None
        m = {
            "stratum": entry.get("stratum"), "origin": entry.get("origin"), "file": entry.get("file"),
            "located": bool(entry.get("file")), "ran_known": ran is not None,
        }
        for field in ("killed_by", "unconfirmed_by", "errored", "ran"):
            ids, others = set(), set()
            for test_id in entry.get(field) or []:
                hits = by_base_key.get(test_id)
                if hits:
                    ids.update(hits)
                    if len(hits) > 1:
                        ambiguous.add(test_id)
                else:
                    others.add(test_id)
                    if ".cy." in test_id.split("::")[0]:
                        unknown_e2e.add(test_id)
            m[field] = ids
            m[f"{field}_others"] = others
        mutants[str(mid)] = m
    return {
        "file": path,
        "mutants": mutants,
        "ran_known": ran_known,
        "strata": dict(collections.Counter(m["stratum"] for m in mutants.values())),
        "kills_by_a_test_not_in_ran": sum(1 for m in mutants.values() if m["ran_known"] and m["killed_by"] - m["ran"]),
        "kills_by_a_test_that_errored": sum(1 for m in mutants.values() if m["killed_by"] & m["errored"]),
        "e2e_ids_not_in_run": sorted(unknown_e2e),
        "ids_matching_several_tests": sorted(ambiguous),
    }


def clj_namespace(path):
    # OSS sources sit under src/ and enterprise ones under enterprise/backend/src/.
    return re.sub(r"^(?:.*?/)?src/", "", path, count=1).rsplit(".", 1)[0].replace("/", ".").replace("_", "-")


def file_reach(run):
    """Per test of the run, whether it reached a mutant's `file`.

    That is a function of that frontend file, or a class of that backend namespace for .clj and .cljc.
    """
    def for_test(t):
        files = {run.files[run.fn_file_id[f]] for f in t.fns.tolist()}
        namespaces = {run.class_ns[c] for c in t.classes.tolist()}

        def reached(m):
            path = m["file"]
            if path.endswith((".clj", ".cljc")):
                return clj_namespace(path) in namespaces
            return path in files

        return reached

    return for_test


def kills_first_cover(primary, secondary, costs):
    """Greedy cover of the primary items: the most new primary items first, then the most new secondary items, then the lowest cost.

    Afterwards, drop chosen tests whose primary items the other chosen tests already keep, most expensive first.
    """
    universe = set().union(*primary) if primary else set()
    covered, covered_secondary = set(), set()
    heap = [(-len(p), -len(secondary[i]), costs[i], i) for i, p in enumerate(primary) if p]
    heapq.heapify(heap)
    chosen = []
    while len(covered) < len(universe) and heap:
        _, _, _, i = heapq.heappop(heap)
        entry = (-len(primary[i] - covered), -len(secondary[i] - covered_secondary), costs[i], i)
        if entry[0] == 0:
            continue
        if heap and entry > heap[0]:
            heapq.heappush(heap, entry)
            continue
        chosen.append(i)
        covered |= primary[i]
        covered_secondary |= secondary[i]
    counts = collections.Counter(x for i in chosen for x in primary[i])
    kept = []
    for i in sorted(chosen, key=lambda i: -costs[i]):
        if all(counts[x] > 1 for x in primary[i]):
            for x in primary[i]:
                counts[x] -= 1
        else:
            kept.append(i)
    return kept, len(universe)


def cover_killers(m):
    """The candidates the kills-first cover can keep the mutant through.

    When every test in `killed_by` is a candidate, they are those tests.
    When `killed_by` is empty and every test in `unconfirmed_by` is a candidate, they are the ones that ran the mutant.
    """
    if m["killed_by_others"]:
        return set()
    if m["killed_by"]:
        return m["killed_by"]
    if m["unconfirmed_by_others"]:
        return set()
    return {i for i in m["unconfirmed_by"] if not m["ran_known"] or i in m["ran"]}


def cover_kills(tests, mutants, secondary, costs):
    """Keeps every mutant that cover_killers() gives a passing candidate for."""
    primary = [set() for _ in tests]
    for mid, m in mutants.items():
        for i in cover_killers(m):
            if tests[i].state == "passed":
                primary[i].add(mid)
    return kills_first_cover(primary, secondary, costs)


def verdicts(run, kills, cover_keeps, min_mutants, required_strata, reach=None):
    """`reach(t)` gives a function that says whether test t reached a located mutant, file_reach(run) by default."""
    tests = run.tests
    mutants = kills["mutants"] if kills else {}
    reach = reach or file_reach(run)
    killed_by_test = collections.defaultdict(set)
    ran_by_test = collections.defaultdict(set)
    errored_by_test = collections.defaultdict(set)
    cover_by_test = collections.defaultdict(set)
    for mid, m in mutants.items():
        for i in m["killed_by"]:
            killed_by_test[i].add(mid)
        for i in cover_killers(m):
            cover_by_test[i].add(mid)
        for i in m["ran"]:
            ran_by_test[i].add(mid)
        for i in m["errored"]:
            errored_by_test[i].add(mid)

    def by_stratum_ids(mids):
        return {s: [mid for mid in mids if mutants[mid]["stratum"] == s] for s in {mutants[mid]["stratum"] for mid in mids}}

    out = {}
    for t in tests:
        if kills is None:
            out[t.key] = {"verdict": "unmeasured", "reason": "no kill matrix"}
            continue
        unconfirmed_unique = sorted(
            mid for mid in cover_by_test[t.id] if not mutants[mid]["killed_by"] and len(mutants[mid]["unconfirmed_by"]) == 1)
        cover_kept_for = sorted(cover_by_test[t.id]) if t.id in cover_keeps else []
        mine = killed_by_test[t.id] | ran_by_test[t.id] | errored_by_test[t.id] | cover_by_test[t.id]
        if not mine:
            out[t.key] = {"verdict": "unmeasured", "reason": "not in the kill matrix"}
            continue
        reached = reach(t)
        kills_here = {mid for mid in killed_by_test[t.id] if not mutants[mid]["ran_known"] or mid in ran_by_test[t.id]}
        unique = sorted(mid for mid in kills_here if not (mutants[mid]["killed_by"] - {t.id}) and not mutants[mid]["killed_by_others"])
        errored = sorted(errored_by_test[t.id])
        # A mutant without a location counts as reached by every test that ran against it,
        # which holds when the producer runs each test against the mutants its coverage reaches.
        qualifying = [
            mid for mid in ran_by_test[t.id]
            if mid not in errored_by_test[t.id]
            and ((mutants[mid]["ran"] - {t.id}) or mutants[mid]["ran_others"])
            and (not mutants[mid]["located"] or reached(mutants[mid]))
        ]
        strata = collections.Counter(mutants[mid]["stratum"] for mid in qualifying)
        detail = {
            "unique_kills": by_stratum_ids(unique),
            "unconfirmed_unique_kills": by_stratum_ids(unconfirmed_unique),
            "cover_kept_for": by_stratum_ids(cover_kept_for),
            "kills": len(kills_here),
            "misses": len(ran_by_test[t.id] - killed_by_test[t.id] - errored_by_test[t.id]),
            "errored": errored,
            "qualifying_mutants": dict(strata),
            "qualifying_without_location": dict(collections.Counter(
                mutants[mid]["stratum"] for mid in qualifying if not mutants[mid]["located"])),
        }
        missing = [s for s in required_strata if not strata.get(s)]
        if unique:
            verdict, reason = "keep", "unique kills"
        elif any(mutants[mid]["killed_by"] for mid in cover_kept_for):
            verdict, reason = "keep", "the kills-first cover keeps it for kills it shares only with other candidates"
        elif unconfirmed_unique:
            verdict, reason = "provisional-keep", "unconfirmed unique kills"
        elif cover_kept_for:
            verdict, reason = "provisional-keep", "the kills-first cover keeps it for unconfirmed kills it shares only with other candidates"
        elif t.state is None:
            verdict, reason = "unmeasured", "not in the capture run, so its reached code is unknown"
        elif t.state != "passed":
            verdict, reason = "unmeasured", f"{t.state} in the capture run, so its reached code is incomplete"
        elif not all(mutants[mid]["ran_known"] for mid in mine):
            verdict, reason = "unmeasured", "ran unknown"
        elif len(qualifying) < min_mutants:
            verdict, reason = "unmeasured", f"{len(qualifying)} qualifying mutants, fewer than {min_mutants}"
        elif missing:
            verdict, reason = "unmeasured", f"no qualifying {', '.join(missing)} mutant"
        else:
            verdict, reason = "delete", "no unique kill"
        out[t.key] = {"verdict": verdict, "reason": reason, **detail}
    return out


def summarize(results, keys=None):
    rows = [results[k] for k in keys] if keys is not None else list(results.values())
    by_verdict = collections.Counter(r["verdict"] for r in rows)
    reasons = collections.Counter(f'{r["verdict"]}: {r["reason"].split(",")[0]}' for r in rows)
    strata = {v: collections.Counter() for v in VERDICTS}
    for r in rows:
        if r["verdict"] == "keep":
            strata["keep"].update(r.get("unique_kills", {}).keys())
        elif r["verdict"] == "provisional-keep":
            strata["provisional-keep"].update(r["unconfirmed_unique_kills"].keys())
        else:
            strata[r["verdict"]].update(s for s, n in r.get("qualifying_mutants", {}).items() if n)
    return {
        "candidates": len(rows),
        "verdicts": {v: by_verdict.get(v, 0) for v in VERDICTS},
        "reasons": dict(reasons.most_common()),
        "strata": {
            "keep, tests with a unique kill in the stratum": dict(strata["keep"]),
            "provisional-keep, tests with an unconfirmed unique kill in the stratum": dict(strata["provisional-keep"]),
            "delete, tests with a qualifying mutant in the stratum": dict(strata["delete"]),
            "unmeasured, tests with a qualifying mutant in the stratum": dict(strata["unmeasured"]),
        },
    }


# ---------- verdicts over a reach index ----------

LOCATION_FIELDS = ("file", "fn", "line", "column", "ns", "var")


def mutant_locations(entry):
    """Its `locations`, else its `location`, else a location made of its own file, fn, line, column, ns and var."""
    if not isinstance(entry, dict):
        return []
    if entry.get("locations"):
        return list(entry["locations"])
    if entry.get("location"):
        return [entry["location"]]
    own = {k: entry[k] for k in LOCATION_FIELDS if entry.get(k) is not None}
    return [own] if "file" in own or "ns" in own else []


def read_candidates(values):
    """Test ids, from each value that is a file and otherwise from the value itself.

    A file holds one id per line, a JSON list, or JSON lines with `deleted_test` or `id`.
    """
    ids = []
    for value in values:
        if not os.path.isfile(value):
            ids.append(value)
            continue
        with open(value) as f:
            text = f.read()
        if text.lstrip().startswith("["):
            ids.extend(json.loads(text))
            continue
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("{"):
                row = json.loads(line)
                ids.append(row.get("deleted_test") or row.get("id"))
            elif line:
                ids.append(line)
    return list(dict.fromkeys(i for i in ids if i))


def index_reach(index_dir, test_ids, locations, repo=None, sha=None):
    command = ["node", os.path.join(HERE, "..", "lookup", "reach.mjs"), "--index", index_dir]
    if repo:
        command += ["--repo", repo]
    if sha:
        command += ["--sha", sha]
    request = json.dumps({"tests": test_ids, "locations": locations})
    done = subprocess.run(command, input=request, stdout=subprocess.PIPE, text=True, check=True)
    return json.loads(done.stdout)


def evaluate(index_dir, kills_path, candidate_ids, min_mutants=MIN_MUTANTS, required_strata=REQUIRED_STRATA.split(","),
             repo=None, sha=None):
    candidate_ids = list(dict.fromkeys(candidate_ids))
    with open(kills_path) as f:
        raw = json.load(f)
    locations = {str(mid): mutant_locations(entry) for mid, entry in raw.items()}
    reach = index_reach(index_dir, candidate_ids, {mid: locs for mid, locs in locations.items() if locs}, repo, sha)
    in_index = reach["tests"]
    # A candidate missing from the index has state None.
    candidates = [
        types.SimpleNamespace(id=i, key=cid, base_key=cid, state=in_index[cid]["state"] if cid in in_index else None)
        for i, cid in enumerate(candidate_ids)
    ]
    run = types.SimpleNamespace(tests=candidates)
    kills = load(kills_path, run)
    position = {c.key: c.id for c in candidates}

    mutants = {}
    for mid, m in kills["mutants"].items():
        resolved = reach["locations"].get(mid)
        m["located"] = resolved is not None
        m["reached_by"] = {position[cid] for cid in resolved["reach"]} if resolved else set()
        if not resolved:
            how = "no location, so every candidate that ran it counts as reaching it"
        elif any(r["keys"] for r in resolved["resolved"]):
            how = "a location"
        else:
            how = "a location that resolves to no code"
        mutants[mid] = {
            "stratum": m["stratum"],
            "origin": m["origin"],
            "reach": how,
            "locations": resolved["resolved"] if resolved else [],
            "candidates_reaching": len(m["reached_by"]),
        }

    # The index has no durations or assertion text, so the cover breaks ties on reached code, then on candidate order.
    secondary = [set(in_index[c.key]["keys"]) if c.key in in_index else set() for c in candidates]
    kept, universe = cover_kills(candidates, kills["mutants"], secondary, [1] * len(candidates))
    results = verdicts(run, kills, set(kept), min_mutants, required_strata,
                       reach=lambda t: lambda m: t.id in m["reached_by"])

    with open(os.path.join(index_dir, "tests.json")) as f:
        index_ids = {t["id"] for t in json.load(f)}
    by_reach = collections.Counter(m["reach"] for m in mutants.values())
    return {
        "index": {"dir": index_dir, "sha": reach["sha"], "runs": reach["runs"]},
        "kills": {
            "file": kills_path,
            "mutants": len(mutants),
            "strata": kills["strata"],
            "reach": dict(by_reach),
            "ran_known": kills["ran_known"],
            "kills_by_a_test_not_in_ran": kills["kills_by_a_test_not_in_ran"],
            "kills_by_a_test_that_errored": kills["kills_by_a_test_that_errored"],
            "e2e_ids_not_in_index": sorted(i for i in kills["e2e_ids_not_in_run"] if i not in index_ids),
        },
        "min_mutants": min_mutants,
        "required_strata": required_strata,
        "candidates_not_in_index": [c.key for c in candidates if c.state is None],
        "summary": summarize(results),
        "kills_cover": {"mutants": universe, "kept": [candidates[i].key for i in sorted(kept)]},
        "candidates": {c.key: {"state": c.state, **results[c.key]} for c in candidates},
        "mutants": mutants,
    }


def by_stratum(counts):
    return ", ".join(f"{s or 'no stratum'} {n}" for s, n in sorted(counts.items(), key=lambda x: str(x[0])))


def ids_by_stratum(groups):
    return "; ".join(f"{s or 'no stratum'} {', '.join(mids)}" for s, mids in sorted(groups.items(), key=lambda x: str(x[0])))


def report(result):
    k, s = result["kills"], result["summary"]
    lines = [
        f"Verdicts from {k['file']} over the reach index at {result['index']['sha'][:11]} (runs {', '.join(result['index']['runs'])})",
        f"{k['mutants']} mutants: {by_stratum(k['strata'])}",
        *(f"  {n} with {how}" for how, n in sorted(k["reach"].items())),
        f"{s['candidates']} candidates, {len(result['candidates_not_in_index'])} of them not in the index",
        f"A delete needs {result['min_mutants']} qualifying mutants, among them {', '.join(result['required_strata']) or 'any stratum'}",
        "",
        *(f"{v:<16} {n}" for v, n in s["verdicts"].items()),
        "",
        "Reasons",
        *(f"  {n:>4}  {reason}" for reason, n in s["reasons"].items()),
        "",
        "Candidates by stratum",
        *(f"  {what}: {by_stratum(counts) or 'none'}" for what, counts in s["strata"].items()),
    ]
    rows = result["candidates"]
    for verdict in ("keep", "provisional-keep", "delete"):
        chosen = sorted(cid for cid, r in rows.items() if r["verdict"] == verdict)
        if chosen:
            lines += ["", verdict.capitalize()]
        for cid in chosen:
            r = rows[cid]
            if r["unique_kills"]:
                why = f"unique kills: {by_stratum({st: len(mids) for st, mids in r['unique_kills'].items()})}"
            elif verdict == "provisional-keep" and r["unconfirmed_unique_kills"]:
                why = f"unconfirmed unique kills: {by_stratum({st: len(mids) for st, mids in r['unconfirmed_unique_kills'].items()})}"
            elif verdict != "delete":
                why = r["reason"]
            else:
                why = f"no unique kill, qualifying mutants: {by_stratum(r['qualifying_mutants'])}"
            lines += [f"  {cid}", f"      {why}"]
            if r["cover_kept_for"]:
                lines.append(f"      kept by the cover for {ids_by_stratum(r['cover_kept_for'])}")
    unresolved = sorted(mid for mid, m in result["mutants"].items() if m["reach"] == "a location that resolves to no code")
    if unresolved:
        lines += ["", "Mutants whose location resolves to no code, so no candidate reaches them"]
        for mid in unresolved:
            notes = "; ".join(n for r in result["mutants"][mid]["locations"] for n in r["notes"])
            lines.append(f"  {mid}" + (f": {notes}" if notes else ""))
    for field, what in (("kills_by_a_test_not_in_ran", "a killer that isn't in `ran`"),
                        ("kills_by_a_test_that_errored", "a killer that also errored")):
        if k[field]:
            lines += ["", f"{k[field]} mutants have {what}"]
    if k["e2e_ids_not_in_index"]:
        lines += ["", f"{len(k['e2e_ids_not_in_index'])} e2e ids of the kills file are not in the index, and count as remaining tests"]
        lines += [f"  {i}" for i in k["e2e_ids_not_in_index"][:10]]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Keep, delete or unmeasured verdicts from a kills file and a reach index.")
    parser.add_argument("--index", default=os.environ.get("JOURNEY_LOOKUP_INDEX"), help="the reach index, or JOURNEY_LOOKUP_INDEX")
    parser.add_argument("--kills", required=True, help="the kills file")
    parser.add_argument("--candidates", action="append", required=True,
                        help="a file of test ids or a single test id, repeatable")
    parser.add_argument("--min-mutants", type=int, default=MIN_MUTANTS, help="qualifying mutants a delete verdict needs")
    parser.add_argument("--require-strata", default=REQUIRED_STRATA, help="strata a delete verdict needs among them")
    parser.add_argument("--out", help="write the full result here as JSON")
    parser.add_argument("--repo", help="the git repo for source reads, default the one lookup/ is in")
    parser.add_argument("--sha", help="read source at this commit instead of the captured one")
    args = parser.parse_args()
    if not args.index:
        parser.error("pass the index directory with --index <dir> or JOURNEY_LOOKUP_INDEX")
    required = [x for x in args.require_strata.split(",") if x]
    result = evaluate(args.index, args.kills, read_candidates(args.candidates), args.min_mutants, required, args.repo, args.sha)
    if args.out:
        with open(args.out, "w") as f:
            json.dump(result, f, indent=1)
        print(f"wrote {args.out}", file=sys.stderr)
    print(report(result))


if __name__ == "__main__":
    main()
