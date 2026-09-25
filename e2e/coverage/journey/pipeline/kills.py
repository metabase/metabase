"""Reads a kill matrix and turns it into a keep, delete or unmeasured verdict per e2e test of the run.

The kill matrix is JSON, one entry per planted mutant, keyed by an opaque mutant id:

  {"<mutant id>": {
     "killed_by": [test id, ...],   confirmed kills only
     "errored":   [test id, ...],   failed for another reason (crash, timeout, setup), never a kill
     "ran":       [test id, ...],   every test run against the mutant. A miss is ran - killed_by - errored
     "stratum":   "logic" | "wiring" | "state" | "baseline",
     "origin":    "<regression id>" or "synthetic",
     "file":      "<repo-relative path>"   optional, see reached()
   }}

A test id is "<spec path>::<Cypress full title>" for e2e,
"<spec path>::<jest fullName>" for jest and "<namespace>/<var>" for deftest.
An entry that is a bare list of test ids, {"<mutant id>": [killer test id, ...]}, is read as killed_by with `ran` unknown,
and so is an entry without `ran`.

Only e2e tests of this run are candidates.
Every other id is a remaining test: it counts when deciding whether some other test kills a mutant,
and never gets a verdict.

A candidate's unique kills are the mutants it killed, among those it ran against, that no other test killed.
  keep        it has a unique kill, or the kills-first cover keeps it for kills it shares only with other candidates
  delete      no unique kill, at least `min_mutants` qualifying mutants, and every required stratum among them
  unmeasured  anything else, including no kill matrix, `ran` unknown, or a test that failed in the capture
A qualifying mutant sits in the candidate's reached code,
and both the candidate and at least one other test ran against it without erroring.
"""

import collections
import json


def load(path, run):
    """The kill matrix mapped onto the run: per mutant and field, the ids of the run's tests and the ids of every other test."""
    raw = json.load(open(path))
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
        m = {"stratum": entry.get("stratum"), "origin": entry.get("origin"), "file": entry.get("file"), "ran_known": ran is not None}
        for field in ("killed_by", "errored", "ran"):
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


def reached(run, t, m, files, namespaces):
    """Whether a mutant sits in code the test reached.

    With a `file`, the test has to have run a function of that frontend file or a class of that backend namespace.
    Without one, running the test against the mutant counts as reaching it,
    which holds when the producer runs each test against the mutants its coverage reaches.
    """
    path = m["file"]
    if not path:
        return t.id in m["ran"]
    if path.endswith((".clj", ".cljc")):
        ns = path.split("/src/", 1)[-1].rsplit(".", 1)[0].replace("/", ".").replace("_", "-")
        return ns in namespaces
    return path in files


def verdicts(run, kills, cover_keeps, min_mutants, required_strata):
    tests = run.tests
    mutants = kills["mutants"] if kills else {}
    killed_by_test = collections.defaultdict(set)
    ran_by_test = collections.defaultdict(set)
    errored_by_test = collections.defaultdict(set)
    for mid, m in mutants.items():
        for i in m["killed_by"]:
            killed_by_test[i].add(mid)
        for i in m["ran"]:
            ran_by_test[i].add(mid)
        for i in m["errored"]:
            errored_by_test[i].add(mid)

    out = {}
    for t in tests:
        if kills is None:
            out[t.key] = {"verdict": "unmeasured", "reason": "no kill matrix"}
            continue
        mine = killed_by_test[t.id] | ran_by_test[t.id] | errored_by_test[t.id]
        if not mine:
            out[t.key] = {"verdict": "unmeasured", "reason": "not in the kill matrix"}
            continue
        files = {run.files[run.fn_file_id[f]] for f in t.fns.tolist()}
        namespaces = {run.class_ns[c] for c in t.classes.tolist()}
        kills_here = {mid for mid in killed_by_test[t.id] if not mutants[mid]["ran_known"] or mid in ran_by_test[t.id]}
        unique = sorted(mid for mid in kills_here if not (mutants[mid]["killed_by"] - {t.id}) and not mutants[mid]["killed_by_others"])
        errored = sorted(errored_by_test[t.id])
        qualifying = [
            mid for mid in ran_by_test[t.id]
            if mid not in errored_by_test[t.id]
            and ((mutants[mid]["ran"] - {t.id}) or mutants[mid]["ran_others"])
            and reached(run, t, mutants[mid], files, namespaces)
        ]
        strata = collections.Counter(mutants[mid]["stratum"] for mid in qualifying)
        detail = {
            "unique_kills": {s: [mid for mid in unique if mutants[mid]["stratum"] == s] for s in {mutants[mid]["stratum"] for mid in unique}},
            "kills": len(kills_here),
            "misses": len(ran_by_test[t.id] - killed_by_test[t.id] - errored_by_test[t.id]),
            "errored": errored,
            "qualifying_mutants": dict(strata),
        }
        missing = [s for s in required_strata if not strata.get(s)]
        if unique:
            verdict, reason = "keep", "unique kills"
        elif t.id in cover_keeps:
            verdict, reason = "keep", "the kills-first cover keeps it for kills it shares only with other candidates"
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
    strata = {v: collections.Counter() for v in ("keep", "delete", "unmeasured")}
    for r in rows:
        if r["verdict"] == "keep":
            strata["keep"].update(r.get("unique_kills", {}).keys())
        else:
            strata[r["verdict"]].update(s for s, n in r.get("qualifying_mutants", {}).items() if n)
    return {
        "candidates": len(rows),
        "verdicts": {v: by_verdict.get(v, 0) for v in ("keep", "delete", "unmeasured")},
        "reasons": dict(reasons.most_common()),
        "strata": {
            "keep, tests with a unique kill in the stratum": dict(strata["keep"]),
            "delete, tests with a qualifying mutant in the stratum": dict(strata["delete"]),
            "unmeasured, tests with a qualifying mutant in the stratum": dict(strata["unmeasured"]),
        },
    }
