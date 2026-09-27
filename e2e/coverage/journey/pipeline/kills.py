"""Reads a kill matrix and turns it into a keep, provisional-keep, delete, unmeasured or accepted verdict per candidate test.

The kill matrix is JSON, one entry per planted mutant, keyed by an opaque mutant id:

  {"<mutant id>": {
     "killed_by":      [test id, ...],   confirmed kills only
     "unconfirmed_by": [test id, ...],   e2e kills seen once and not reproduced on rerun
     "errored":        [test id, ...],   failed for another reason (crash, timeout, setup), never a kill
     "ran":            [test id, ...],   every test run against the mutant. A miss is ran - killed_by - errored
     "stratum":        "logic" | "intra-frontend-wiring" | "store-state" | "boundary-wiring" | "server-state"
                       | "cross-page-timing" | "browser-measurement", or a coarse stratum,
     "stratum_coarse": "logic" | "wiring" | "state" | "baseline",
     "origin":         "<regression id>" or "synthetic",
     "file":           "<repo-relative path>"   optional, see file_reach()
   }}

A test id is "<spec path>::<Cypress full title>" for e2e,
"<spec path>::<jest fullName>" for jest and "<namespace>/<var>" for deftest.
An entry that is a bare list of test ids, {"<mutant id>": [killer test id, ...]}, is read as killed_by with `ran` unknown,
and so is an entry without `ran`.

A mutant's coarse stratum is its `stratum_coarse`, else the coarse stratum COARSE_STRATA gives its `stratum`, else its `stratum`.
Required strata name coarse strata, and a baseline mutant is one whose coarse stratum is baseline.

The candidates are the e2e tests of a pipeline run, or the tests given to the command below.
Every other id is a remaining test: it counts when deciding whether some other test kills a mutant,
and never gets a verdict.

A candidate's unique kills are the mutants it killed, among those it ran against, that no other test killed.
Its unconfirmed unique kills are the mutants it ran against where it is the only test in `unconfirmed_by` and none is in `killed_by`.
The kills-first cover keeps a candidate for every mutant that candidates kill and no remaining test does,
where a mutant's killers are the tests in its `killed_by`, or in its `unconfirmed_by` when `killed_by` is empty.
  keep              it has a unique kill, or the cover keeps it for kills it shares only with other candidates
  provisional-keep  not a keep, and it has an unconfirmed unique kill or the cover keeps it
  delete            no unique kill of either kind, at least `min_mutants` qualifying mutants, every required stratum among them,
                    and it passes the baseline check
  unmeasured        anything else, including no kill matrix, `ran` unknown, or a test that failed in the capture or isn't in it
A qualifying mutant sits in the candidate's reached code,
and both the candidate and at least one other test ran against it without erroring.
A candidate passes the baseline check with a confirmed kill among its qualifying mutants or a run against a baseline mutant,
because only a baseline mutant run shows whether a candidate that kills nothing it reaches still guards boot.

A kept candidate is one whose verdict is keep or provisional-keep, and it stays in the suite like a remaining test.
A delete, accepted or unmeasured candidate's `depends_on` lists each mutant it killed that no remaining test kills,
with the kept candidates that kill it, which include the one the cover keeps for it.
The joint check fails on any mutant a delete or accepted candidate killed that no remaining test or kept candidate kills.

An unmeasured candidate that passed in the capture becomes accepted, a deletion on a stated risk and never a measured delete,
when it has all four of these fields:
  prior    the highest `score` the location prior gives the files of its qualifying mutants' locations,
           and the files of their direct callers when a callers file is given
  sampled  n, the number of its qualifying mutants
  bound    3/n, the rule of three: remaining tests killed all n, so their miss rate there is below 3/n at 95% confidence.
           It is missing while n is 3 or less, where 3/n bounds nothing
  module   the location prior's module for each of the files of its qualifying mutants' locations
It also needs a confirmed kill by a remaining test or a kept candidate on every one of the n, the baseline check,
and a prior of at most `max_prior`.
Each module takes at most `cap` accepted candidates, lowest prior first, then lowest bound.
A candidate over several modules counts against each of them.

The location prior is JSON keyed by repo-relative file, with a rollup per module:

  {"files":   {"<path>": {"module": "<module>", "score": <0 to 1, higher is riskier>, ...}},
   "modules": {"<module>": {"score": ..., ...}}}

Its graph file sits beside it as `<prior name>-graph.json`:

  {"barrels": [<path>, ...], "importers": {"<path>": [<importing path>, ...]}}

A file's static importers are the files that import it, and through a barrel, the files that import the barrel.
Each acceptance records a summary of its files' static importers as information only, and they never change its prior.

The callers file is JSON keyed by test id:

  {"<test id>": [<caller path>, ...]}

A candidate's entry lists the files of the direct callers of the functions its qualifying mutants sit in.
When a callers file is given, a candidate without an entry has no prior.

The CI history is JSON keyed by test id. A candidate's entry is copied onto its acceptance and never decides it.

As a command, it takes the candidates' reached code from a reach index instead of a pipeline run:

  python3 kills.py --index <index dir> --kills <file> --candidates <file or test id> [--candidates ...]
                   [--min-mutants <k>] [--require-strata <s,...>] [--prior <file>] [--callers <file>] [--ci-history <file>]
                   [--accept-cap <k>] [--max-prior <x>] [--out <json file>] [--repo <path>] [--sha <commit>]
                   [--joint-check-report-only]

There a mutant's location is its `locations` list, its `location`, or its own `file`, `fn`, `line`, `column`, `ns` and `var`,
in any form lookup.mjs takes, and a candidate reaches the mutant when it ran a function or class the location resolves to.
That reach has basis subtraction when the index measured it, and basis baseline when it is inferred for code in every test's baseline.
Both count, and each candidate's `qualifying_basis` lists its located qualifying mutants under the basis of its reach.
When the joint check fails, it exits with code 1, and with `--joint-check-report-only` it only reports the failure.
The pipeline takes no location prior, so it never gives accepted.
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

VERDICTS = ("keep", "provisional-keep", "delete", "unmeasured", "accepted")
KEPT = ("keep", "provisional-keep")
DELETED = ("delete", "accepted")
MIN_MUTANTS = 5
REQUIRED_STRATA = "logic,wiring"
# Two, so one wrong prior takes at most two tests out of a module before an escape there brings them back.
ACCEPT_CAP = 2
# At or below the median file, when the score is a percentile.
MAX_PRIOR = 0.5
ACCEPT_FIELDS = ("prior", "sampled", "bound", "module")
BOUND_RULE = "3/n, the rule of three: when remaining tests kill all n sampled mutants, their miss rate is below 3/n at 95% confidence"
PRIOR_REACHED = "reached files"
PRIOR_WITH_CALLERS = "reached files plus direct callers"
IMPORTERS_ROLE = "information only"
IMPORTERS_LISTED = 10
COARSE_STRATA = {
    "logic": "logic",
    "intra-frontend-wiring": "wiring",
    "boundary-wiring": "wiring",
    "browser-measurement": "wiring",
    "store-state": "state",
    "server-state": "state",
    "cross-page-timing": "state",
}
HERE = os.path.dirname(os.path.abspath(__file__))


def coarse_stratum(entry):
    return entry.get("stratum_coarse") or COARSE_STRATA.get(entry.get("stratum"), entry.get("stratum"))


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
            "coarse": coarse_stratum(entry), "files": {entry["file"]} if entry.get("file") else set(),
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


def reach_bases(reached):
    if not reached:
        return []
    if reached is True:
        return ["subtraction"]
    return list(reached)


def verdicts(run, kills, cover_keeps, min_mutants, required_strata, reach=None, accept=None):
    """`reach(t)` gives a function that says whether test t reached a located mutant, file_reach(run) by default.

    Its value is a list of the reach's bases, or True for reach after baseline subtraction.
    With `accept`, from read_acceptance(), every unmeasured candidate gets an `acceptance` and can become accepted.
    """
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
    evidence = {}
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
        qualifying = []
        qualifying_basis = collections.defaultdict(list)
        for mid in ran_by_test[t.id]:
            m = mutants[mid]
            if mid in errored_by_test[t.id] or not ((m["ran"] - {t.id}) or m["ran_others"]):
                continue
            if m["located"]:
                bases = reach_bases(reached(m))
                if not bases:
                    continue
                for basis in bases:
                    qualifying_basis[basis].append(mid)
            qualifying.append(mid)
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
            "qualifying_basis": {basis: sorted(mids) for basis, mids in sorted(qualifying_basis.items())},
        }
        ran_known = all(mutants[mid]["ran_known"] for mid in mine)
        located = [mid for mid in qualifying if mutants[mid]["located"]]
        evidence[t.key] = {
            "sampled": len(qualifying) if ran_known else None,
            "files": set().union(*(mutants[mid]["files"] for mid in located)),
            "fileless": sum(1 for mid in located if not mutants[mid]["files"]),
            "qualifying": qualifying,
            "killed": any(mid in killed_by_test[t.id] for mid in qualifying),
            "ran_baseline": any(mutants[mid]["coarse"] == "baseline" for mid in ran_by_test[t.id] - errored_by_test[t.id]),
        }
        coarse = {mutants[mid]["coarse"] for mid in qualifying}
        missing = [s for s in required_strata if s not in coarse]
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
        elif not ran_known:
            verdict, reason = "unmeasured", "ran unknown"
        elif len(qualifying) < min_mutants:
            verdict, reason = "unmeasured", f"{len(qualifying)} qualifying mutants, fewer than {min_mutants}"
        elif missing:
            verdict, reason = "unmeasured", f"no qualifying {', '.join(missing)} mutant"
        elif not passes_baseline_check(evidence[t.key]):
            verdict, reason = "unmeasured", "needs a baseline check"
        else:
            verdict, reason = "delete", "no unique kill"
        out[t.key] = {"verdict": verdict, "reason": reason, **detail}
    kept = {t.id for t in tests if out[t.key]["verdict"] in KEPT}
    for ev in evidence.values():
        ev["survivors"] = sorted(mid for mid in ev["qualifying"] if not stays_killed(mutants[mid], kept))
    if accept is not None:
        accept_unmeasured(tests, out, evidence, accept)
    key_of = {t.id: t.key for t in tests}
    for t in tests:
        if out[t.key]["verdict"] in KEPT:
            continue
        depends_on = collections.defaultdict(dict)
        for mid in sorted(killed_by_test[t.id]):
            m = mutants[mid]
            if not m["killed_by_others"]:
                depends_on[m["stratum"]][mid] = sorted(key_of[i] for i in m["killed_by"] & kept)
        out[t.key]["depends_on"] = dict(depends_on)
    return out


def stays_killed(m, kept):
    """Whether a remaining test or one of the `kept` candidates has a confirmed kill of the mutant."""
    return bool(m["killed_by_others"] or m["killed_by"] & kept)


def joint_check(tests, mutants, rows):
    """By stratum, each mutant that delete or accepted candidates killed and no remaining test or kept candidate kills,
    with those candidates, or "ok" when there is none.
    """
    verdict = {t.id: rows[t.key]["verdict"] for t in tests}
    kept = {i for i, v in verdict.items() if v in KEPT}
    key_of = {t.id: t.key for t in tests}
    failures = collections.defaultdict(dict)
    for mid, m in sorted(mutants.items()):
        deleted = sorted(key_of[i] for i in m["killed_by"] if verdict[i] in DELETED)
        if deleted and not stays_killed(m, kept):
            failures[m["stratum"]][mid] = deleted
    return dict(failures) or "ok"


def passes_baseline_check(evidence):
    return evidence["killed"] or evidence["ran_baseline"]


def rule_of_three(n):
    """3/n, or None when n is 3 or less and 3/n bounds nothing."""
    return round(3 / n, 4) if n and n > 3 else None


def static_importers(files, graph):
    importers, barrels = graph["importers"], set(graph.get("barrels") or [])
    found, stack = set(), [i for f in files for i in importers.get(f, [])]
    while stack:
        f = stack.pop()
        if f not in found:
            found.add(f)
            if f in barrels:
                stack.extend(importers.get(f, []))
    return found - set(files)


def importer_summary(files, accept):
    """How many static importers the files have, how many the prior doesn't score, and the highest-scored of them."""
    importers = static_importers(files, accept.graph)
    scores = {f: (accept.prior["files"].get(f) or {}).get("score") for f in importers}
    scored = sorted(((s, f) for f, s in scores.items() if s is not None), key=lambda x: (-x[0], x[1]))
    return {"role": IMPORTERS_ROLE, "count": len(importers), "unscored": len(importers) - len(scored),
            "max": scored[0][0] if scored else None, "highest": {f: s for s, f in scored[:IMPORTERS_LISTED]}}


def listed(paths, most=5):
    return ", ".join(paths[:most]) + (f" and {len(paths) - most} more" if len(paths) > most else "")


def acceptance_fields(test_id, evidence, reason, accept):
    """The four fields an accepted verdict records, and which of them are missing and why."""
    n = evidence["sampled"] if evidence else None
    files = sorted(evidence["files"]) if evidence else []
    bound = rule_of_three(n)
    prior, importers, modules, missing = None, None, [], {}
    if accept.prior is None:
        missing["prior"] = missing["module"] = "no location prior given"
    elif not n:
        missing["prior"] = missing["module"] = "no mutants sampled, so no reached locations"
    elif not files or evidence["fileless"]:
        why = "a sampled mutant's location resolves to no file" if evidence["fileless"] else "none of its sampled mutants has a location"
        missing["prior"] = missing["module"] = why
    else:
        callers = sorted(set(accept.callers.get(test_id) or []) - set(files)) if accept.callers is not None else []
        entries = {f: accept.prior["files"].get(f) or {} for f in files + callers}
        unscored = [f for f in files + callers if entries[f].get("score") is None]
        unassigned = [f for f in files if not entries[f].get("module")]
        if accept.callers is not None and test_id not in accept.callers:
            missing["prior"] = "no entry for it in the callers file"
        elif unscored:
            missing["prior"] = f"no score in the prior for {listed(unscored)}"
        else:
            prior = {"score": max(entries[f]["score"] for f in files + callers),
                     "files": {f: entries[f]["score"] for f in files}}
            if accept.callers is not None:
                prior["callers"] = {f: entries[f]["score"] for f in callers}
        if accept.graph:
            importers = importer_summary(files, accept)
        if unassigned:
            missing["module"] = f"no module in the prior for {listed(unassigned)}"
        else:
            modules = sorted({entries[f]["module"] for f in files})
    if n is None:
        missing["sampled"] = "ran unknown for some of its mutants" if evidence else reason
    elif n == 0:
        missing["sampled"] = "no qualifying mutants"
    if bound is None:
        missing["bound"] = f"3/n bounds nothing for n = {n}" if n else "no mutants sampled"
    record = {
        "prior": prior, "prior_over": accept.prior_over,
        **({"importers": importers} if accept.graph else {}),
        "sampled": n, "bound": bound, "modules": modules,
        "missing": {f: missing[f] for f in ACCEPT_FIELDS if f in missing},
        "survivors": evidence["survivors"] if evidence else [],
        "outcome": None,
    }
    if accept.ci_history is not None:
        record["ci_history"] = accept.ci_history.get(test_id)
    return record


def accept_unmeasured(tests, out, evidence, accept):
    """Accepts the unmeasured candidates whose fields allow it, lowest prior then lowest bound first, while their modules have room."""
    ready = []
    for t in tests:
        row = out[t.key]
        if row["verdict"] != "unmeasured":
            continue
        ev = evidence.get(t.key)
        row["acceptance"] = a = acceptance_fields(t.key, ev, row["reason"], accept)
        if t.state != "passed":
            a["outcome"] = "never: did not pass in the capture"
        elif a["missing"]:
            a["outcome"] = "missing fields"
        elif a["survivors"]:
            a["outcome"] = "survivor in sample"
        elif not passes_baseline_check(ev):
            a["outcome"] = "needs a baseline check"
        elif a["prior"]["score"] > accept.max_prior:
            a["outcome"] = "prior above the maximum"
        else:
            ready.append(t)
    taken = collections.Counter()
    for t in sorted(ready, key=lambda t: (out[t.key]["acceptance"]["prior"]["score"], out[t.key]["acceptance"]["bound"], t.id)):
        a = out[t.key]["acceptance"]
        if any(taken[m] >= accept.cap for m in a["modules"]):
            a["outcome"] = "over the module cap"
            continue
        taken.update(a["modules"])
        a["outcome"] = "accepted"
        out[t.key]["verdict"] = "accepted"


def read_acceptance(prior_path=None, ci_history_path=None, cap=ACCEPT_CAP, max_prior=MAX_PRIOR, callers_path=None):
    prior = graph = graph_path = ci_history = callers = None
    if prior_path:
        with open(prior_path) as f:
            prior = json.load(f)
        if not isinstance(prior.get("files"), dict):
            raise ValueError(f"{prior_path} has no `files` object, so it isn't a location prior")
        graph_path = os.path.splitext(prior_path)[0] + "-graph.json"
        if os.path.isfile(graph_path):
            with open(graph_path) as f:
                graph = json.load(f)
        else:
            graph_path = None
    if ci_history_path:
        with open(ci_history_path) as f:
            ci_history = json.load(f)
        if isinstance(ci_history.get("tests"), dict):
            ci_history = ci_history["tests"]
    if callers_path:
        with open(callers_path) as f:
            callers = json.load(f)
    return types.SimpleNamespace(prior=prior, prior_file=prior_path, graph=graph, graph_file=graph_path,
                                 callers=callers, callers_file=callers_path,
                                 prior_over=PRIOR_WITH_CALLERS if callers is not None else PRIOR_REACHED,
                                 ci_history=ci_history, ci_history_file=ci_history_path, cap=cap, max_prior=max_prior)


def accepted_section(rows, accept):
    """The accepted verdicts apart from the others, with the settings they were given under."""
    records = {cid: r["acceptance"] for cid, r in rows.items() if "acceptance" in r}
    rollup = (accept.prior or {}).get("modules") or {}
    modules = {}
    for cid, a in sorted(records.items()):
        if a["outcome"] in ("accepted", "over the module cap"):
            for m in a["modules"]:
                entry = modules.setdefault(m, {"accepted": [], "over_cap": [], "prior": (rollup.get(m) or {}).get("score")})
                entry["accepted" if a["outcome"] == "accepted" else "over_cap"].append(cid)
    return {
        "cap": accept.cap,
        "max_prior": accept.max_prior,
        "bound": BOUND_RULE,
        "prior": {"file": accept.prior_file, "base_commit": ((accept.prior or {}).get("meta") or {}).get("base_commit"),
                  "over": accept.prior_over, "callers": accept.callers_file,
                  "graph": accept.graph_file, "importers": IMPORTERS_ROLE if accept.graph else None},
        "ci_history": accept.ci_history_file,
        "candidates": {cid: a for cid, a in records.items() if a["outcome"] == "accepted"},
        "modules": dict(sorted(modules.items())),
        "outcomes": dict(collections.Counter(a["outcome"] for a in records.values()).most_common()),
        "missing": {f: n for f in ACCEPT_FIELDS
                    if (n := sum(1 for a in records.values() if a["outcome"] == "missing fields" and f in a["missing"]))},
    }


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
            "accepted, tests with a qualifying mutant in the stratum": dict(strata["accepted"]),
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
             repo=None, sha=None, prior_path=None, ci_history_path=None, cap=ACCEPT_CAP, max_prior=MAX_PRIOR,
             callers_path=None):
    accept = read_acceptance(prior_path, ci_history_path, cap, max_prior, callers_path)
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
        m["files"] = {r["file"] for r in resolved["resolved"] if r["file"]} if resolved else set()
        m["reached_by"] = {position[cid] for cid in resolved["reach"]} if resolved else set()
        m["reach_bases"] = {}
        for basis, cids in (resolved or {}).get("reach_by_basis", {}).items():
            for cid in cids:
                m["reach_bases"].setdefault(position[cid], []).append(basis)
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
                       reach=lambda t: lambda m: m["reach_bases"].get(t.id), accept=accept)

    with open(os.path.join(index_dir, "tests.json")) as f:
        index_ids = {t["id"] for t in json.load(f)}
    by_reach = collections.Counter(m["reach"] for m in mutants.values())
    return {
        "joint_check": joint_check(candidates, kills["mutants"], results),
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
        "accepted": accepted_section(results, accept),
        "kills_cover": {"mutants": universe, "kept": [candidates[i].key for i in sorted(kept)]},
        "candidates": {c.key: {"state": c.state, **results[c.key]} for c in candidates},
        "mutants": mutants,
    }


def by_stratum(counts):
    return ", ".join(f"{s or 'no stratum'} {n}" for s, n in sorted(counts.items(), key=lambda x: str(x[0])))


def ids_by_stratum(groups):
    return "; ".join(f"{s or 'no stratum'} {', '.join(mids)}" for s, mids in sorted(groups.items(), key=lambda x: str(x[0])))


def accepted_report(a):
    lines = [
        "",
        "Accepted, on a stated risk and not a measured delete",
        f"  location prior {a['prior']['file']}" if a["prior"]["file"] else "  no location prior given",
        f"  the prior covers {a['prior']['over']}" + (f", from {a['prior']['callers']}" if a["prior"]["callers"] else ""),
        *([f"  static importers from {a['prior']['graph']} are {a['prior']['importers']}"] if a["prior"]["graph"] else []),
        f"  at most {a['cap']} per module, lowest prior first, and a prior of at most {a['max_prior']}",
        f"  bound {a['bound']}",
    ]
    for cid, r in sorted(a["candidates"].items()):
        lines += [
            f"  {cid}",
            f"      module {', '.join(r['modules'])}, prior {r['prior']['score']}, {r['sampled']} mutants sampled, bound {r['bound']}",
        ]
        if r.get("importers"):
            lines.append(f"      {r['importers']['count']} static importers, highest score {r['importers']['max']}, {IMPORTERS_ROLE}")
        if r.get("ci_history") is not None:
            lines.append(f"      CI history {json.dumps(r['ci_history'])}")
    over = {m: e["over_cap"] for m, e in a["modules"].items() if e["over_cap"]}
    if over:
        lines.append("  Over the module cap")
        for m, cids in over.items():
            lines += [f"    {m}", *(f"      {cid}" for cid in cids)]
    lines += ["  Not accepted", *(f"  {n:>4}  {outcome}" for outcome, n in a["outcomes"].items() if outcome != "accepted")]
    if a["missing"]:
        lines.append(f"  Missing fields: {', '.join(f'{field} {n}' for field, n in a['missing'].items())}")
    return lines


def joint_check_report(joint):
    if joint == "ok":
        return ["Joint check: ok"]
    failures = sum(len(mids) for mids in joint.values())
    lines = [f"Joint check: failed, {failures} mutants killed by delete or accepted candidates and by no remaining test or kept candidate"]
    for stratum, mids in sorted(joint.items(), key=lambda x: str(x[0])):
        for mid, cids in mids.items():
            lines += [f"  {stratum or 'no stratum'} {mid}", *(f"      {cid}" for cid in cids)]
    return lines


def depends_on_lines(depends_on):
    kept_kills = {s: [mid for mid, cids in mids.items() if cids] for s, mids in depends_on.items()}
    lost_kills = {s: [mid for mid, cids in mids.items() if not cids] for s, mids in depends_on.items()}
    stay = sorted({cid for mids in depends_on.values() for cids in mids.values() for cid in cids})
    lines = []
    if stay:
        lines.append(f"safe only while {', '.join(stay)} stay, for {ids_by_stratum({s: m for s, m in kept_kills.items() if m})}")
    if any(lost_kills.values()):
        lines.append(f"no remaining test or kept candidate kills {ids_by_stratum({s: m for s, m in lost_kills.items() if m})}")
    return lines


def report(result):
    k, s = result["kills"], result["summary"]
    lines = [
        *joint_check_report(result["joint_check"]),
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
    dependent = sorted(cid for cid, r in rows.items() if r.get("depends_on"))
    if dependent:
        lines += ["", "Kills that no remaining test has"]
    for cid in dependent:
        lines += [f"  {cid}", *(f"      {rows[cid]['verdict']}, {line}" for line in depends_on_lines(rows[cid]["depends_on"]))]
    lines += accepted_report(result["accepted"])
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
    parser = argparse.ArgumentParser(
        description="Keep, provisional-keep, delete, unmeasured or accepted verdicts from a kills file and a reach index.")
    parser.add_argument("--index", default=os.environ.get("JOURNEY_LOOKUP_INDEX"), help="the reach index, or JOURNEY_LOOKUP_INDEX")
    parser.add_argument("--kills", required=True, help="the kills file")
    parser.add_argument("--candidates", action="append", required=True,
                        help="a file of test ids or a single test id, repeatable")
    parser.add_argument("--min-mutants", type=int, default=MIN_MUTANTS, help="qualifying mutants a delete verdict needs")
    parser.add_argument("--require-strata", default=REQUIRED_STRATA, help="strata a delete verdict needs among them")
    parser.add_argument("--prior", help="the location prior, which an accepted verdict needs, with its graph file beside it if it has one")
    parser.add_argument("--callers", help="the files of each candidate's direct callers by test id, which the prior then covers too")
    parser.add_argument("--ci-history", help="CI failure history by test id, recorded on each acceptance")
    parser.add_argument("--accept-cap", type=int, default=ACCEPT_CAP, help="accepted verdicts a module can take")
    parser.add_argument("--max-prior", type=float, default=MAX_PRIOR, help="the highest prior an accepted verdict can have")
    parser.add_argument("--out", help="write the full result here as JSON")
    parser.add_argument("--repo", help="the git repo for source reads, default the one lookup/ is in")
    parser.add_argument("--sha", help="read source at this commit instead of the captured one")
    parser.add_argument("--joint-check-report-only", action="store_true",
                        help="report a failed joint check without exiting with code 1")
    args = parser.parse_args()
    if not args.index:
        parser.error("pass the index directory with --index <dir> or JOURNEY_LOOKUP_INDEX")
    required = [x for x in args.require_strata.split(",") if x]
    result = evaluate(args.index, args.kills, read_candidates(args.candidates), args.min_mutants, required, args.repo, args.sha,
                      args.prior, args.ci_history, args.accept_cap, args.max_prior, args.callers)
    if args.out:
        with open(args.out, "w") as f:
            json.dump(result, f, indent=1)
        print(f"wrote {args.out}", file=sys.stderr)
    print(report(result))
    if result["joint_check"] != "ok" and not args.joint_check_report_only:
        sys.exit("the joint check failed, which is a bug in the verdict rules: see the top of the report")


if __name__ == "__main__":
    main()
