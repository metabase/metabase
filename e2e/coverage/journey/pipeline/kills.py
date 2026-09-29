"""Reads a kill matrix and turns it into a keep, provisional-keep, delete, unmeasured or accepted verdict per candidate test.

The kill matrix is JSON, one entry per planted mutant, keyed by an opaque mutant id:

  {"<mutant id>": {
     "killed_by":      [test id, ...],   confirmed kills only
     "symptom_kills":  [test id, ...],   the tests in killed_by that failed only through the bug's own symptom
     "unconfirmed_by": [test id, ...],   e2e kills seen once and not reproduced on rerun
     "symptom_unconfirmed_by": [test id, ...],   the tests in unconfirmed_by that failed only through the bug's own symptom
     "errored":        [test id, ...],   failed for another reason (crash, timeout, setup), never a kill
     "ran":            [test id, ...],   every test run against the mutant. A miss is ran - killed_by - errored - unconfirmed_by
     "stratum":        "logic" | "intra-frontend-wiring" | "store-state" | "boundary-wiring" | "server-state"
                       | "cross-page-timing" | "browser-measurement", or a coarse stratum,
     "stratum_coarse": "logic" | "wiring" | "state" | "baseline",
     "origin":         "<regression id>" or "synthetic",
     "file":           "<repo-relative path>"   optional, see file_reach()
     "equivalent_suspect": true,         optional, below
   }}

A test id is "<spec path>::<Cypress full title>" for e2e,
"<spec path>::<jest fullName>" for jest and "<namespace>/<var>" for deftest.
An entry that is a bare list of test ids, {"<mutant id>": [killer test id, ...]}, is read as killed_by with `ran` unknown,
and so is an entry without `ran`.

That is the flat format. Format 2 wraps the same entries as {"meta": {"format": 2, "layer_roles": {...}, ...}, "mutants": {...}}.
Each entry's `layer_results` has one result per layer, with the same lists, and optionally `scope` ("full" or "selected"),
`selected` (the tests chosen to run) and `excluded` ([{"test", "reason"}], tests left out on a static reading).
A missing scope means full.
`meta.layer_roles` gives each layer other than the checkers' a role: removed, remaining or reference.
With it, a candidate's results count only from removed layers and every other test's only from remaining layers,
so a kept test that ran at the base and at the head counts only through its head result, and a reference layer never counts.
Without it, the entry's own lists count, a candidate's results as removed and every other test's as remaining.

Each test's execution state on a mutant is killed, symptom kill, unconfirmed, unconfirmed symptom kill, errored, missed,
or not run (selected, and not in `ran`), and only missed is a miss.
The remaining side's result on a mutant is killed, missed, unresolved (only errored, unconfirmed or not run),
statically excluded (no remaining test ran it and a remaining layer excluded tests) or unmeasured at the head (no remaining test ran it).
Its scope is selected when any remaining layer that has a result for the mutant has a selected scope.
A mutant's states are among four: caught by a removed test, missed by the selected remaining tests, statically excluded,
and unmeasured at the head.

A mutant with `equivalent_suspect: true` and no confirmed kill earns no sample credit, so it isn't a qualifying mutant.
It stays unresolved, and counts as a survivor that blocks acceptance,
until it records a reviewed equivalence, `equivalence: {reviewed_by, date, reason}`, or a scope decision, `scope_decision: {by, date, reason}`.
A record missing a field is ignored and listed.
A suspect with a confirmed kill counts as any killed mutant does.

The type checker and the contract checker kill a mutant when `killed_at_layer` names their layer, "tsc" or "contract",
and `kill_confirmed` is true, or when their `layer_results` entry has the result "killed".
They run on every PR, so each counts as a remaining test that kills it, named "type checker" or "contract checker".
An unconfirmed checker kill doesn't count, and a mutant whose two records of a checker kill disagree is listed.
Each candidate's `also_killed_by_checker` lists its kills that a checker also makes.

A symptom kill counts as a kill everywhere, and its two fields only mark it.
A missing symptom field means no symptom kills, and an id in one that isn't in its killed_by or unconfirmed_by is ignored and counted.

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
A qualifying mutant sits in the candidate's reached code, the candidate ran against it without erroring,
at least one other test ran against it, and it isn't a suspected equivalent mutant with no confirmed kill.
A candidate passes the baseline check with a confirmed kill among its qualifying mutants or a run against a baseline mutant,
because only a baseline mutant run shows whether a candidate that kills nothing it reaches still guards boot.

A kept candidate is one whose verdict is keep or provisional-keep, and it stays in the suite like a remaining test.
A delete, accepted or unmeasured candidate's `depends_on` lists each mutant it killed that no remaining test kills,
with the kept candidates that kill it, which include the one the cover keeps for it.
The joint check fails on any mutant a delete or accepted candidate killed that no remaining test or kept candidate kills.

A keep rests on its unique kills and the confirmed kills the cover keeps it for,
and a provisional-keep on its unconfirmed unique kills and the unconfirmed kills the cover keeps it for.
When all of them are the candidate's symptom kills, its `symptom_only` is true and its reason gains ", all symptom kills".
Its `scope` is the widest scope at which the remaining side missed any of them: full, selected,
or unmeasured when the remaining side missed none of them.
When that isn't full, the reason ends in "; " and the remaining side's result on each of them.
A delete, accepted or unmeasured candidate's `symptom_only_after_deletion` lists each mutant it killed
that remaining tests and kept candidates kill only through symptom kills,
and its `scope` is the same scope over the mutants in its `depends_on` that no kept candidate kills.

An unmeasured candidate that passed in the capture becomes accepted, a deletion on a stated risk and never a measured delete,
when it has all four of these fields:
  prior    the highest `score` the location prior gives the files of its qualifying mutants' locations,
           and the files of their direct callers when a callers file is given
  sampled  n, the number of its qualifying mutants
  bound    3/n, the rule of three: remaining tests killed all n, so their miss rate there is below 3/n at 95% confidence.
           It is missing while n is 3 or less, where 3/n bounds nothing
  module   the location prior's module for each of the files of its qualifying mutants' locations
It also needs a confirmed kill by a remaining test or a kept candidate on every one of the n, no unresolved suspected
equivalent mutant among the ones it would sample, the baseline check, and a prior of at most `max_prior`.
Each unresolved suspect in a sample records the candidates whose verdict changes when only that suspect is dismissed.
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

or from a candidates file, with no index, when the only --candidates is a JSON object:

  {"removed_at": "<commit>", "head": "<commit>", "tests": ["<test id>", ...]}

`head` is optional. A candidate then reaches every mutant it ran, with basis ran, and has no capture state.

The index keys the nth test of a spec with a repeated title `<spec>::<title> [n]`, and the kill matrix only knows `<spec>::<title>`,
so a candidate id stands for every index test with its spec and title. Its reach is the union of theirs,
it passed when they all passed, and the result lists those tests under `ordinals`.

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
SYMPTOM_FIELDS = {"symptom_kills": "killed_by", "symptom_unconfirmed_by": "unconfirmed_by"}
TEST_FIELDS = ("killed_by", "unconfirmed_by", "errored", "ran")
LIST_FIELDS = TEST_FIELDS + tuple(SYMPTOM_FIELDS) + ("selected",)
CHECKERS = {"tsc": "type checker", "contract": "contract checker"}
LAYERS = ("tsc", "contract", "jest", "deftest", "e2e")
ROLES = ("removed", "remaining", "reference")
ALL_LAYERS = "all"
TEST_STATES = ("killed", "symptom kill", "unconfirmed", "unconfirmed symptom kill", "errored", "missed", "not run")
MUTANT_STATES = {
    "missed": "missed by the selected remaining tests",
    "statically excluded": "statically excluded",
    "unmeasured at the head": "unmeasured at the head",
}
SCOPES = ("full", "selected", "unmeasured")
EQUIVALENCE_RECORDS = {"equivalence": ("reviewed_by", "date", "reason"), "scope_decision": ("by", "date", "reason")}
EQUIVALENCE_RESOLVED = {"equivalence": "reviewed equivalence", "scope_decision": "scope decision"}
EQUIVALENCE_STATES = ("unresolved", "reviewed equivalence", "scope decision", "killed")
NO_CREDIT = ("unresolved", "reviewed equivalence", "scope decision")
SUSPECT_IN_SAMPLE = "unresolved suspected equivalent mutant in sample"
RAN_BASIS = "ran"
RAN_REACH = "reach taken from `ran`, since a candidates file reads no index"
SYMPTOM_ONLY = "all symptom kills"
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


def checker_kills(entry):
    """The checkers with a confirmed kill of the mutant, by name, and whether `killed_at_layer` and `layer_results` disagree on one."""
    results = entry.get("layer_results") or {}
    confirmed = entry.get("kill_confirmed") is True
    at = entry.get("killed_at_layer")
    names, disagree = [], False
    for layer, name in CHECKERS.items():
        recorded = confirmed and at == layer
        result = (results.get(layer) or {}).get("result")
        if recorded or result == "killed":
            names.append(name)
        if recorded and result not in (None, "killed"):
            disagree = True
        # `killed_at_layer` is the cheapest layer with a confirmed kill, so a checker kill puts it at that checker or a cheaper one.
        if result == "killed" and "kill_confirmed" in entry and not (confirmed and at in LAYERS[:LAYERS.index(layer) + 1]):
            disagree = True
    return names, disagree


def read_kills_file(path):
    """The kills file's format, its `meta` and its entries by mutant id, from format 2 or the flat format."""
    with open(path) as f:
        raw = json.load(f)
    if isinstance(raw, dict) and isinstance(raw.get("meta"), dict) and isinstance(raw.get("mutants"), dict):
        meta = raw["meta"]
        if meta.get("format") != 2:
            raise ValueError(f"{path} has a `meta` with format {meta.get('format')!r}, and kills.py reads format 2 and the flat format")
        return {"format": 2, "meta": meta, "entries": raw["mutants"]}
    return {"format": "flat", "meta": {}, "entries": raw}


def read_layer_roles(meta, entries):
    """`meta.layer_roles`, or None when the kills file gives none, after checking that it names every tested layer's role."""
    roles = meta.get("layer_roles")
    if roles is None:
        return None
    unknown = sorted(f"{layer} {role!r}" for layer, role in roles.items() if role not in ROLES)
    if unknown:
        raise ValueError(f"meta.layer_roles gives roles other than {', '.join(ROLES)}: {', '.join(unknown)}")
    unnamed = sorted({layer for entry in entries.values() if isinstance(entry, dict)
                      for layer in entry.get("layer_results") or {} if layer not in roles and layer not in CHECKERS})
    if unnamed:
        raise ValueError(f"meta.layer_roles gives no role to the layers {', '.join(unnamed)}")
    return dict(roles)


def excluded_entries(result, layer):
    return [{"test": x.get("test"), "reason": x.get("reason"), "layer": layer}
            for x in (result or {}).get("excluded") or [] if isinstance(x, dict)]


def mutant_layers(entry, roles):
    """The layers whose results count for the mutant, each with its role, scope, selection, exclusions and test ids.

    Without layer roles, one layer named `all` holds the entry's own lists,
    and its scope is selected when any layer result's scope is.
    The checkers' layers are read by checker_kills() instead.
    """
    tested = {name: r for name, r in (entry.get("layer_results") or {}).items() if name not in CHECKERS and isinstance(r, dict)}
    if roles is None:
        return [{
            **{field: set(entry.get(field) or []) for field in LIST_FIELDS},
            "name": ALL_LAYERS, "role": None, "ran_known": entry.get("ran") is not None,
            "scope": "selected" if any(r.get("scope") == "selected" for r in tested.values()) else "full",
            "selected": set().union(*(r.get("selected") or [] for r in tested.values())),
            "excluded": [x for name, r in sorted(tested.items()) for x in excluded_entries(r, name)],
        }]
    return [{
        **{field: set(r.get(field) or []) for field in LIST_FIELDS},
        "name": name, "role": roles[name], "ran_known": r.get("ran") is not None,
        "scope": r.get("scope") or "full", "selected": set(r.get("selected") or []), "excluded": excluded_entries(r, name),
    } for name, r in sorted(tested.items()) if roles[name] != "reference"]


def side_states(lists):
    """Each test's execution state on one mutant, from one side's lists.

    Killed and symptom kill are confirmed kills, and unconfirmed, errored and not run (selected, and not in `ran`) are never misses.
    """
    states = {}
    for t in set().union(*(lists[field] for field in ("killed_by", "unconfirmed_by", "errored", "ran", "selected"))):
        if t in lists["killed_by"]:
            states[t] = "symptom kill" if t in lists["symptom_kills"] else "killed"
        elif t in lists["unconfirmed_by"]:
            states[t] = "unconfirmed symptom kill" if t in lists["symptom_unconfirmed_by"] else "unconfirmed"
        elif t in lists["errored"]:
            states[t] = "errored"
        elif t in lists["ran"]:
            states[t] = "missed"
        else:
            states[t] = "not run"
    return states


def by_state(states):
    groups = collections.defaultdict(list)
    for t, state in sorted(states.items()):
        groups[state].append(t)
    return groups


def equivalence_state(entry, killed):
    """How a mutant's equivalence suspicion stands, None for a mutant not suspected, and each record missing a field."""
    if entry.get("equivalent_suspect") is not True:
        return None, []
    if killed:
        return "killed", []
    incomplete = []
    for field, keys in EQUIVALENCE_RECORDS.items():
        record = entry.get(field)
        if record is None:
            continue
        missing = [k for k in keys if not (isinstance(record, dict) and record.get(k))]
        if not missing:
            return EQUIVALENCE_RESOLVED[field], incomplete
        incomplete.append(f"`{field}` has no {', '.join(missing)}")
    return "unresolved", incomplete


def load(path, run):
    """The kill matrix mapped onto the run: per mutant and field, the ids of the run's tests and the ids of every other test.

    With layer roles, the run's tests count through the removed layers and every other test through the remaining layers.
    """
    kills_file = read_kills_file(path)
    entries = kills_file["entries"]
    roles = read_layer_roles(kills_file["meta"], entries)
    by_base_key = collections.defaultdict(list)
    for t in run.tests:
        by_base_key[t.base_key].append(t.id)
    unknown_e2e = set()
    ambiguous = set()
    mutants = {}
    ran_known = True
    symptom = collections.Counter()
    checkers = collections.Counter()
    disagreements = []
    off_side = collections.Counter()
    incomplete_records = {}
    for mid, entry in entries.items():
        if isinstance(entry, list):
            entry = {"killed_by": entry}
        layers = mutant_layers(entry, roles)
        listed = {field: set() for field in LIST_FIELDS}
        for layer in layers:
            for field in LIST_FIELDS:
                for test_id in layer[field]:
                    if layer["role"] is None or (layer["role"] == "removed") == (test_id in by_base_key):
                        listed[field].add(test_id)
            if layer["role"] is not None:
                ran_there = set().union(*(layer[field] for field in TEST_FIELDS))
                off_side[layer["role"]] += sum(1 for t in ran_there if (layer["role"] == "removed") != (t in by_base_key))
            layer["excluded"] = [x for x in layer["excluded"] if (x["test"] in by_base_key) == (layer["role"] == "removed")]
        mutant_ran_known = all(layer["ran_known"] for layer in layers)
        ran_known = ran_known and mutant_ran_known
        m = {
            "stratum": entry.get("stratum"), "origin": entry.get("origin"), "file": entry.get("file"),
            "coarse": coarse_stratum(entry), "files": {entry["file"]} if entry.get("file") else set(),
            "located": bool(entry.get("file")), "ran_known": mutant_ran_known,
        }
        for field, within in SYMPTOM_FIELDS.items():
            symptom[f"{field}_ignored"] += len(listed[field] - listed[within])
            listed[field] &= listed[within]
        checked, disagree = checker_kills(entry)
        checkers.update(checked)
        if disagree:
            disagreements.append(str(mid))
        confirmed = listed["killed_by"] | set(checked)
        killers, marked = ((confirmed, listed["symptom_kills"]) if confirmed
                           else (listed["unconfirmed_by"], listed["symptom_unconfirmed_by"]))
        symptom["kills"] += len(listed["killed_by"])
        symptom["symptom_kills"] += len(listed["symptom_kills"])
        symptom["unconfirmed_kills"] += len(listed["unconfirmed_by"])
        symptom["unconfirmed_symptom_kills"] += len(listed["symptom_unconfirmed_by"])
        symptom["mutants_resting_only_on_symptom_kills"] += bool(killers) and killers <= marked
        m["suspect"], incomplete = equivalence_state(entry, bool(confirmed))
        if incomplete:
            incomplete_records[str(mid)] = incomplete
        if m["suspect"] is not None:
            m["equivalence_records"] = {field: entry[field] for field in EQUIVALENCE_RECORDS if field in entry}
        for field, test_ids in listed.items():
            ids, others = set(), set()
            for test_id in test_ids:
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
        m["checker_kills"] = checked
        m["killed_by_others"] |= set(checked)
        m["ran_others"] |= set(checked)
        m["remaining"] = remaining_side(m, [layer for layer in layers if layer["role"] != "removed"], by_base_key)
        mutants[str(mid)] = m
    suspects = collections.Counter(m["suspect"] for m in mutants.values() if m["suspect"])
    return {
        "file": path,
        "format": kills_file["format"],
        "layer_roles": roles,
        "mutants": mutants,
        "ran_known": ran_known,
        "strata": dict(collections.Counter(m["stratum"] for m in mutants.values())),
        "kills_by_a_test_not_in_ran": sum(1 for m in mutants.values() if m["ran_known"] and m["killed_by"] - m["ran"]),
        "kills_by_a_test_that_errored": sum(1 for m in mutants.values() if m["killed_by"] & m["errored"]),
        "e2e_ids_not_in_run": sorted(unknown_e2e),
        "ids_matching_several_tests": sorted(ambiguous),
        "symptom_kills": {
            **{k: symptom[k] for k in ("kills", "symptom_kills", "unconfirmed_kills", "unconfirmed_symptom_kills",
                                       "mutants_resting_only_on_symptom_kills")},
            "ignored": {field: symptom[f"{field}_ignored"] for field in SYMPTOM_FIELDS},
        },
        "checker_kills": {name: checkers[name] for name in CHECKERS.values()},
        "checker_disagreements": disagreements,
        "results_on_the_other_side": {
            "candidates in a remaining layer": off_side["remaining"], "other tests in a removed layer": off_side["removed"],
        },
        "equivalent_suspects": {state: suspects[state] for state in EQUIVALENCE_STATES},
        "incomplete_equivalence_records": incomplete_records,
    }


def remaining_side(m, layers, candidates):
    """What the remaining tests and checkers did on the mutant: a result, the scope it was measured at, and each test by its state.

    The result is killed, missed, unresolved (only errored, unconfirmed or not run), statically excluded or unmeasured at the head.
    """
    lists = {field: m[f"{field}_others"] for field in LIST_FIELDS}
    groups = by_state(side_states(lists))
    killed = sorted(groups["killed"] + groups["symptom kill"])
    unconfirmed = sorted(groups["unconfirmed"] + groups["unconfirmed symptom kill"])
    excluded = [x for layer in layers for x in layer["excluded"]]
    scope = "selected" if any(layer["scope"] == "selected" for layer in layers) else "full" if layers else None
    if killed:
        result = "killed"
    elif groups["missed"]:
        result = "missed"
    elif groups["errored"] or unconfirmed:
        result = "unresolved"
    elif excluded:
        result = "statically excluded"
    else:
        result = "unmeasured at the head"
    side = {
        "result": result, "scope": scope,
        "killed_by": killed, "missed": len(groups["missed"]),
        **({"missed_by": groups["missed"]} if scope == "selected" else {}),
        "errored": groups["errored"], "unconfirmed_by": unconfirmed, "not_run": groups["not run"], "excluded": excluded,
        "layers": {layer["name"]: layer_counts(layer, candidates) for layer in layers},
    }
    side["text"] = remaining_text(side)
    return side


def layer_counts(layer, candidates):
    """One remaining layer's role, scope, and number of tests in each state, leaving out the candidates."""
    lists = {field: {t for t in layer[field] if t not in candidates} for field in LIST_FIELDS}
    counts = collections.Counter(side_states(lists).values())
    return {"role": layer["role"], "scope": layer["scope"], "selected": len(lists["selected"]),
            **{state: counts[state] for state in TEST_STATES if counts[state]}, "excluded": len(layer["excluded"])}


def remaining_text(side):
    """The remaining side's result in words, with the tests that gave no result and the tests excluded."""
    tail = [f"{n} {what}" for n, what in (
        (len(side["errored"]), "errored"), (len(side["unconfirmed_by"]), "unconfirmed"),
        (len(side["not_run"]), "selected but not run"),
        (len(side["excluded"]) if side["result"] != "statically excluded" else 0, "excluded")) if n]
    selected = "selected " if side["scope"] == "selected" else ""
    if side["result"] == "killed":
        text = f"killed by {len(side['killed_by'])} {selected}remaining tests"
    elif side["result"] == "missed":
        text = f"missed by {side['missed']} {selected}remaining tests"
    elif side["result"] == "unresolved":
        text = f"no result from the {selected}remaining tests"
    elif side["result"] == "statically excluded":
        reasons = sorted({"no reason given" if x["reason"] is None else str(x["reason"]) for x in side["excluded"]})
        text = f"statically excluded: {'; '.join(reasons)}"
    else:
        text = "not run by any remaining test"
    return ", ".join([text, *tail])


def removed_side(m, key_of):
    """What the candidates did on the mutant: caught, missed, unresolved or not run, and each candidate by its state."""
    states = side_states({field: {key_of[i] for i in m[field]} for field in LIST_FIELDS})
    found = set(states.values())
    if found & {"killed", "symptom kill"}:
        result = "caught"
    elif "missed" in found:
        result = "missed"
    elif found - {"not run"}:
        result = "unresolved"
    else:
        result = "not run"
    return {"result": result, "tests": dict(sorted(states.items()))}


def mutant_states(removed, remaining):
    """The mutant's states among the four a report prints: caught by a removed test, and the remaining side's result."""
    states = ["caught by a removed test"] if removed["result"] == "caught" else []
    if remaining["result"] in MUTANT_STATES:
        states.append(MUTANT_STATES[remaining["result"]])
    return states


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


def kills_first_cover(primary, secondary, costs, symptom=None):
    """Greedy cover of the primary items: the most new primary items first, then the most new of them outside the test's `symptom`
    items, then the most new secondary items, then the lowest cost.

    Afterwards, drop chosen tests whose primary items the other chosen tests already keep,
    most expensive first, then those with the most `symptom` items first.
    """
    symptom = symptom or [set() for _ in primary]
    assertion = [p - symptom[i] for i, p in enumerate(primary)]
    universe = set().union(*primary) if primary else set()
    covered, covered_secondary = set(), set()
    heap = [(-len(p), -len(assertion[i]), -len(secondary[i]), costs[i], i) for i, p in enumerate(primary) if p]
    heapq.heapify(heap)
    chosen = []
    while len(covered) < len(universe) and heap:
        i = heapq.heappop(heap)[-1]
        entry = (-len(primary[i] - covered), -len(assertion[i] - covered), -len(secondary[i] - covered_secondary), costs[i], i)
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
    for i in sorted(chosen, key=lambda i: (-costs[i], -len(symptom[i]))):
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


def passed(t):
    """Whether the candidate passed in the capture. A candidate from a candidates file has no capture, and counts as passed."""
    return t.state == "passed" or not getattr(t, "captured", True)


def cover_kills(tests, mutants, secondary, costs):
    """Keeps every mutant that cover_killers() gives a passing candidate for, preferring a candidate whose kill isn't a symptom kill."""
    primary = [set() for _ in tests]
    symptom = [set() for _ in tests]
    for mid, m in mutants.items():
        marked = m["symptom_kills"] if m["killed_by"] else m["symptom_unconfirmed_by"]
        for i in cover_killers(m):
            if passed(tests[i]):
                primary[i].add(mid)
                if i in marked:
                    symptom[i].add(mid)
    return kills_first_cover(primary, secondary, costs, symptom)


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
    unconfirmed_by_test = collections.defaultdict(set)
    cover_by_test = collections.defaultdict(set)
    symptom_by_test = collections.defaultdict(set)
    unconfirmed_symptom_by_test = collections.defaultdict(set)
    for mid, m in mutants.items():
        for i in m["killed_by"]:
            killed_by_test[i].add(mid)
        for i in cover_killers(m):
            cover_by_test[i].add(mid)
        for i in m["ran"]:
            ran_by_test[i].add(mid)
        for i in m["errored"]:
            errored_by_test[i].add(mid)
        for i in m["unconfirmed_by"]:
            unconfirmed_by_test[i].add(mid)
        for i in m["symptom_kills"]:
            symptom_by_test[i].add(mid)
        for i in m["symptom_unconfirmed_by"]:
            unconfirmed_symptom_by_test[i].add(mid)

    def by_stratum_ids(mids):
        return {s: [mid for mid in mids if mutants[mid]["stratum"] == s] for s in {mutants[mid]["stratum"] for mid in mids}}

    def checker_ids(mids):
        return {s: {mid: mutants[mid]["checker_kills"] for mid in ids} for s, ids in by_stratum_ids(mids).items()}

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
        suspects = []
        for mid in ran_by_test[t.id]:
            m = mutants[mid]
            if mid in errored_by_test[t.id] or not ((m["ran"] - {t.id}) or m["ran_others"]):
                continue
            bases = reach_bases(reached(m)) if m["located"] else []
            if m["located"] and not bases:
                continue
            if m["suspect"] in NO_CREDIT:
                suspects.append(mid)
                continue
            for basis in bases:
                qualifying_basis[basis].append(mid)
            qualifying.append(mid)
        strata = collections.Counter(mutants[mid]["stratum"] for mid in qualifying)
        unconfirmed_symptom = sorted(
            mid for mid in unconfirmed_symptom_by_test[t.id] if not mutants[mid]["ran_known"] or mid in ran_by_test[t.id])
        detail = {
            "unique_kills": by_stratum_ids(unique),
            "unconfirmed_unique_kills": by_stratum_ids(unconfirmed_unique),
            "cover_kept_for": by_stratum_ids(cover_kept_for),
            "symptom_kills": by_stratum_ids(sorted(kills_here & symptom_by_test[t.id])),
            "unconfirmed_symptom_kills": by_stratum_ids(unconfirmed_symptom),
            "also_killed_by_checker": checker_ids(sorted(mid for mid in kills_here if mutants[mid]["checker_kills"])),
            "kills": len(kills_here),
            "misses": len(ran_by_test[t.id] - killed_by_test[t.id] - errored_by_test[t.id] - unconfirmed_by_test[t.id]),
            "errored": errored,
            "qualifying_mutants": dict(strata),
            "qualifying_without_location": dict(collections.Counter(
                mutants[mid]["stratum"] for mid in qualifying if not mutants[mid]["located"])),
            "qualifying_basis": {basis: sorted(mids) for basis, mids in sorted(qualifying_basis.items())},
            "equivalent_suspects": {mid: mutants[mid]["suspect"] for mid in sorted(suspects)},
        }
        ran_known = all(mutants[mid]["ran_known"] for mid in mine)
        located = [mid for mid in qualifying if mutants[mid]["located"]]
        evidence[t.key] = {
            "sampled": len(qualifying) if ran_known else None,
            "files": set().union(*(mutants[mid]["files"] for mid in located)),
            "fileless": sum(1 for mid in located if not mutants[mid]["files"]),
            "qualifying": qualifying,
            "unresolved_suspects": sorted(mid for mid in suspects if mutants[mid]["suspect"] == "unresolved"),
            "killed": any(mid in killed_by_test[t.id] for mid in qualifying),
            "ran_baseline": any(mutants[mid]["coarse"] == "baseline" for mid in ran_by_test[t.id] - errored_by_test[t.id]),
        }
        coarse = {mutants[mid]["coarse"] for mid in qualifying}
        missing = [s for s in required_strata if s not in coarse]
        captured = getattr(t, "captured", True)
        if unique:
            verdict, reason = "keep", "unique kills"
        elif any(mutants[mid]["killed_by"] for mid in cover_kept_for):
            verdict, reason = "keep", "the kills-first cover keeps it for kills it shares only with other candidates"
        elif unconfirmed_unique:
            verdict, reason = "provisional-keep", "unconfirmed unique kills"
        elif cover_kept_for:
            verdict, reason = "provisional-keep", "the kills-first cover keeps it for unconfirmed kills it shares only with other candidates"
        elif captured and t.state is None:
            verdict, reason = "unmeasured", "not in the capture run, so its reached code is unknown"
        elif captured and t.state != "passed":
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
        symptom_only = rests_only_on_symptom_kills(t.id, verdict, unique, unconfirmed_unique, cover_kept_for, mutants)
        if symptom_only:
            reason = f"{reason}, {SYMPTOM_ONLY}"
        grounds = reading_grounds(verdict, unique, unconfirmed_unique, cover_kept_for, mutants)
        scope, scope_text = reading_scope(grounds, mutants)
        if scope_text:
            reason = f"{reason}; {scope_text}"
        out[t.key] = {"verdict": verdict, "reason": reason, "scope": scope, **detail, "symptom_only": symptom_only}
    kept = {t.id for t in tests if out[t.key]["verdict"] in KEPT}
    for ev in evidence.values():
        ev["survivors"] = sorted({mid for mid in ev["qualifying"] if not stays_killed(mutants[mid], kept)}
                                 | set(ev["unresolved_suspects"]))
    if accept is not None:
        outcomes = acceptance_outcomes(tests, out, evidence, accept)
        apply_acceptance(out, outcomes)
        dismissal_dependencies(tests, out, evidence, accept, outcomes, mutants)
    key_of = {t.id: t.key for t in tests}
    for t in tests:
        if out[t.key]["verdict"] in KEPT:
            continue
        depends_on = collections.defaultdict(dict)
        after_deletion = collections.defaultdict(list)
        for mid in sorted(killed_by_test[t.id]):
            m = mutants[mid]
            if not m["killed_by_others"]:
                depends_on[m["stratum"]][mid] = sorted(key_of[i] for i in m["killed_by"] & kept)
            if stays_killed(m, kept) and stays_killed_only_by_symptom_kills(m, kept):
                after_deletion[m["stratum"]].append(mid)
        out[t.key]["depends_on"] = dict(depends_on)
        out[t.key]["symptom_only_after_deletion"] = dict(after_deletion)
        lost = [mid for mids in depends_on.values() for mid, stay in mids.items() if not stay]
        out[t.key]["scope"] = reading_scope(lost, mutants)[0]
    return out


def reading_grounds(verdict, unique, unconfirmed_unique, cover_kept_for, mutants):
    """The mutants a keep or provisional-keep rests on: nothing remaining kills them."""
    if verdict == "keep":
        return sorted(set(unique) | {mid for mid in cover_kept_for if mutants[mid]["killed_by"]})
    if verdict == "provisional-keep":
        return sorted(set(unconfirmed_unique) | set(cover_kept_for))
    return []


def reading_scope(mids, mutants):
    """The widest scope at which the remaining side missed any of the mutants, and the remaining side's result on each when it isn't full.

    None for no mutants, full when the remaining tests of a full run missed one, selected when only a selection did,
    and unmeasured when no remaining test missed any of them.
    """
    if not mids:
        return None, None
    sides = {mid: mutants[mid]["remaining"] for mid in mids}
    missed = {side["scope"] for side in sides.values() if side["result"] == "missed"}
    scope = "full" if "full" in missed else "selected" if missed else "unmeasured"
    if scope == "full":
        return scope, None
    by_text = collections.defaultdict(list)
    for mid, side in sides.items():
        by_text[side["text"]].append(mid)
    return scope, "; ".join(f"{', '.join(ids)}: {text}" for text, ids in sorted(by_text.items(), key=lambda x: x[1]))


def rests_only_on_symptom_kills(test_id, verdict, unique, unconfirmed_unique, cover_kept_for, mutants):
    """Whether every kill a keep or provisional-keep rests on is a symptom kill of the test."""
    if verdict == "keep":
        grounds = set(unique) | {mid for mid in cover_kept_for if mutants[mid]["killed_by"]}
    elif verdict == "provisional-keep":
        grounds = set(unconfirmed_unique) | set(cover_kept_for)
    else:
        return False

    def symptom_kill(m):
        return test_id in (m["symptom_kills"] if m["killed_by"] else m["symptom_unconfirmed_by"])

    return bool(grounds) and all(symptom_kill(mutants[mid]) for mid in grounds)


def stays_killed(m, kept):
    """Whether a remaining test or one of the `kept` candidates has a confirmed kill of the mutant."""
    return bool(m["killed_by_others"] or m["killed_by"] & kept)


def stays_killed_only_by_symptom_kills(m, kept):
    """Whether every confirmed kill of the mutant by a remaining test or one of the `kept` candidates is a symptom kill."""
    return m["killed_by_others"] <= m["symptom_kills_others"] and (m["killed_by"] & kept) <= m["symptom_kills"]


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


def acceptance_outcomes(tests, out, evidence, accept):
    """Each unmeasured candidate's acceptance fields and outcome, accepting those whose fields allow it,
    lowest prior then lowest bound first, while their modules have room.
    """
    records = {}
    ready = []
    for t in tests:
        row = out[t.key]
        if row["verdict"] != "unmeasured":
            continue
        ev = evidence.get(t.key)
        records[t.key] = a = acceptance_fields(t.key, ev, row["reason"], accept)
        if not passed(t):
            a["outcome"] = "never: did not pass in the capture"
        elif a["missing"]:
            a["outcome"] = "missing fields"
        elif a["survivors"]:
            a["outcome"] = SUSPECT_IN_SAMPLE if set(a["survivors"]) <= set(ev["unresolved_suspects"]) else "survivor in sample"
        elif not passes_baseline_check(ev):
            a["outcome"] = "needs a baseline check"
        elif a["prior"]["score"] > accept.max_prior:
            a["outcome"] = "prior above the maximum"
        else:
            ready.append(t)
    taken = collections.Counter()
    for t in sorted(ready, key=lambda t: (records[t.key]["prior"]["score"], records[t.key]["bound"], t.id)):
        a = records[t.key]
        if any(taken[m] >= accept.cap for m in a["modules"]):
            a["outcome"] = "over the module cap"
            continue
        taken.update(a["modules"])
        a["outcome"] = "accepted"
    return records


def apply_acceptance(out, records):
    for key, a in records.items():
        out[key]["acceptance"] = a
        if a["outcome"] == "accepted":
            out[key]["verdict"] = "accepted"


def dismissal_dependencies(tests, out, evidence, accept, records, mutants):
    """Records on each unresolved suspected equivalent mutant in a sample the candidates whose verdict changes if it is dismissed."""
    before = {key: row["verdict"] for key, row in out.items()}
    unaccepted = {key: dict(row, verdict="unmeasured") if key in records else row for key, row in out.items()}
    for mid in sorted({mid for ev in evidence.values() for mid in ev["unresolved_suspects"]}):
        dismissed = {key: dict(ev, survivors=[s for s in ev["survivors"] if s != mid],
                               unresolved_suspects=[s for s in ev["unresolved_suspects"] if s != mid])
                     for key, ev in evidence.items()}
        after = acceptance_outcomes(tests, unaccepted, dismissed, accept)
        mutants[mid]["dismissal_changes"] = sorted(
            key for key, a in after.items() if ("accepted" if a["outcome"] == "accepted" else "unmeasured") != before[key])


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
    reasons = collections.Counter(
        f'{r["verdict"]}: {re.split("[,;]", r["reason"])[0]}' + (f", {SYMPTOM_ONLY}" if r.get("symptom_only") else "") for r in rows)
    scopes = collections.defaultdict(collections.Counter)
    for r in rows:
        if r.get("scope"):
            scopes[r["verdict"]][r["scope"]] += 1

    def count(field):
        return sum(len(mids) for r in rows for mids in (r.get(field) or {}).values())

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
        "scopes": {v: {s: scopes[v][s] for s in SCOPES if scopes[v][s]} for v in VERDICTS if scopes[v]},
        "strata": {
            "keep, tests with a unique kill in the stratum": dict(strata["keep"]),
            "provisional-keep, tests with an unconfirmed unique kill in the stratum": dict(strata["provisional-keep"]),
            "delete, tests with a qualifying mutant in the stratum": dict(strata["delete"]),
            "unmeasured, tests with a qualifying mutant in the stratum": dict(strata["unmeasured"]),
            "accepted, tests with a qualifying mutant in the stratum": dict(strata["accepted"]),
        },
        "symptom_kills": {
            "kills": sum(r.get("kills", 0) for r in rows),
            "symptom_kills": count("symptom_kills"),
            "unconfirmed_symptom_kills": count("unconfirmed_symptom_kills"),
            "resting_only_on_symptom_kills": {v: sum(1 for r in rows if r["verdict"] == v and r.get("symptom_only")) for v in KEPT},
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


def ordinal_members(index_tests, candidate_ids):
    """Per candidate id, the ids of the index tests with its spec and title, or the id itself when there are none."""
    by_title = collections.defaultdict(list)
    for t in index_tests:
        by_title[f"{t['spec']}::{t['title']}"].append(t["id"])
    return {cid: by_title.get(cid) or [cid] for cid in candidate_ids}


def merge_ordinals(tests, members):
    """Each candidate's state and reached keys from those of its index tests: passed when every one passed, else the first other state."""
    merged = {}
    for cid, ids in members.items():
        found = [tests[i] for i in ids if i in tests]
        if not found:
            continue
        states = [t["state"] for t in found]
        keys = found[0]["keys"] if len(found) == 1 else sorted(set().union(*(t["keys"] for t in found)))
        merged[cid] = {"state": next((st for st in states if st != "passed"), "passed"), "keys": keys}
    return merged


def read_candidates_file(path):
    """The removed-at revision, the head revision when it names one, and the test ids of a candidates file, or None for any other file.

    A candidates file is a JSON object: {"removed_at": "<commit>", "head": "<commit>", "tests": ["<test id>", ...]}.
    """
    if not os.path.isfile(path):
        return None
    with open(path) as f:
        text = f.read()
    try:
        data = json.loads(text) if text.lstrip().startswith("{") else None
    except ValueError:
        return None
    if not isinstance(data, dict) or "tests" not in data:
        return None
    if not data.get("removed_at"):
        raise ValueError(f"{path} has no `removed_at`, the revision its tests were removed at")
    return {"file": path, "removed_at": data["removed_at"], "head": data.get("head"),
            "tests": list(dict.fromkeys(i for i in data["tests"] if i))}


def evaluate(index_dir, kills_path, candidate_ids, min_mutants=MIN_MUTANTS, required_strata=REQUIRED_STRATA.split(","),
             repo=None, sha=None, prior_path=None, ci_history_path=None, cap=ACCEPT_CAP, max_prior=MAX_PRIOR,
             callers_path=None):
    accept = read_acceptance(prior_path, ci_history_path, cap, max_prior, callers_path)
    candidate_ids = list(dict.fromkeys(candidate_ids))
    entries = read_kills_file(kills_path)["entries"]
    with open(os.path.join(index_dir, "tests.json")) as f:
        index_tests = json.load(f)
    members = ordinal_members(index_tests, candidate_ids)
    owners = collections.defaultdict(list)
    for cid, ids in members.items():
        for i in ids:
            owners[i].append(cid)
    locations = {str(mid): mutant_locations(entry) for mid, entry in entries.items()}
    reach = index_reach(index_dir, list(owners), {mid: locs for mid, locs in locations.items() if locs}, repo, sha)
    in_index = merge_ordinals(reach["tests"], members)
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
        m["reached_by"] = {position[cid] for i in resolved["reach"] for cid in owners[i]} if resolved else set()
        m["reach_bases"] = {}
        for basis, ids in (resolved or {}).get("reach_by_basis", {}).items():
            for cid in {cid for i in ids for cid in owners[i]}:
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
    index_ids = {t["id"] for t in index_tests}
    return {
        **judge(candidates, kills, mutants, secondary, lambda t: lambda m: m["reach_bases"].get(t.id), accept,
                min_mutants, required_strata, lambda i: i not in index_ids),
        "mode": "index",
        "index": {"dir": index_dir, "sha": reach["sha"], "runs": reach["runs"]},
        "candidates_file": None,
        "candidates_not_in_index": [c.key for c in candidates if c.state is None],
        "ordinals": {cid: ids for cid, ids in members.items() if len(ids) > 1},
    }


def evaluate_candidates_file(kills_path, candidates_file, min_mutants=MIN_MUTANTS, required_strata=REQUIRED_STRATA.split(","),
                             prior_path=None, ci_history_path=None, cap=ACCEPT_CAP, max_prior=MAX_PRIOR, callers_path=None):
    """Verdicts for the tests of a candidates file, with no index: every mutant counts as reached by the candidates that ran it."""
    accept = read_acceptance(prior_path, ci_history_path, cap, max_prior, callers_path)
    candidates = [types.SimpleNamespace(id=i, key=cid, base_key=cid, state=None, captured=False)
                  for i, cid in enumerate(candidates_file["tests"])]
    kills = load(kills_path, types.SimpleNamespace(tests=candidates))
    entries = read_kills_file(kills_path)["entries"]
    mutants = {}
    for mid, m in kills["mutants"].items():
        entry = entries[mid] if isinstance(entries[mid], dict) else {}
        m["files"] = {loc["file"] for loc in mutant_locations(entry) if isinstance(loc, dict) and loc.get("file")}
        m["located"] = bool(m["files"])
        mutants[mid] = {"stratum": m["stratum"], "origin": m["origin"], "reach": RAN_REACH,
                        "candidates_reaching": len(m["ran"] | m["killed_by"] | m["errored"])}
    return {
        **judge(candidates, kills, mutants, [set() for _ in candidates], lambda t: lambda m: [RAN_BASIS], accept,
                min_mutants, required_strata, None),
        "mode": "candidates file",
        "index": None,
        "candidates_file": {k: candidates_file[k] for k in ("file", "removed_at", "head")},
    }


def judge(candidates, kills, mutants, secondary, reach, accept, min_mutants, required_strata, not_in_index):
    """The verdicts and the result keys both kinds of evaluation share, with each mutant's two sides and states added to `mutants`."""
    run = types.SimpleNamespace(tests=candidates)
    kept, universe = cover_kills(candidates, kills["mutants"], secondary, [1] * len(candidates))
    results = verdicts(run, kills, set(kept), min_mutants, required_strata, reach=reach, accept=accept)
    key_of = {c.id: c.key for c in candidates}
    for mid, m in kills["mutants"].items():
        removed = removed_side(m, key_of)
        mutants[mid].update(removed=removed, remaining=m["remaining"], states=mutant_states(removed, m["remaining"]))
        if m["suspect"]:
            changes = m.get("dismissal_changes") or []
            mutants[mid]["equivalent_suspect"] = {"state": m["suspect"], **m["equivalence_records"],
                                                  "deletion_depends_on_dismissing": bool(changes), "candidates": changes}
    by_reach = collections.Counter(m["reach"] for m in mutants.values())
    return {
        "joint_check": joint_check(candidates, kills["mutants"], results),
        "kills": {
            "file": kills["file"],
            "format": kills["format"],
            "layer_roles": kills["layer_roles"],
            "mutants": len(mutants),
            "strata": kills["strata"],
            "reach": dict(by_reach),
            "ran_known": kills["ran_known"],
            "kills_by_a_test_not_in_ran": kills["kills_by_a_test_not_in_ran"],
            "kills_by_a_test_that_errored": kills["kills_by_a_test_that_errored"],
            "e2e_ids_not_in_index": sorted(i for i in kills["e2e_ids_not_in_run"] if not_in_index(i)) if not_in_index else None,
            "symptom_kills": kills["symptom_kills"],
            "checker_kills": kills["checker_kills"],
            "checker_disagreements": kills["checker_disagreements"],
            "results_on_the_other_side": kills["results_on_the_other_side"],
            "equivalent_suspects": kills["equivalent_suspects"],
            "incomplete_equivalence_records": kills["incomplete_equivalence_records"],
        },
        "min_mutants": min_mutants,
        "required_strata": required_strata,
        "summary": summarize(results),
        "mutant_states": state_counts(mutants),
        "accepted": accepted_section(results, accept),
        "kills_cover": {"mutants": universe, "kept": [candidates[i].key for i in sorted(kept)]},
        "candidates": {c.key: {"state": c.state, **results[c.key]} for c in candidates},
        "mutants": mutants,
    }


def state_counts(mutants):
    """How many mutants are in each of the four states, and how many have each result on each side."""
    return {
        "states": {state: sum(1 for m in mutants.values() if state in m["states"])
                   for state in ("caught by a removed test", *MUTANT_STATES.values())},
        "caught by a removed test and killed by no remaining test": sum(
            1 for m in mutants.values() if m["removed"]["result"] == "caught" and m["remaining"]["result"] != "killed"),
        "removed": dict(collections.Counter(m["removed"]["result"] for m in mutants.values()).most_common()),
        "remaining": dict(collections.Counter(m["remaining"]["result"] for m in mutants.values()).most_common()),
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


def symptom_report(in_file, in_candidates):
    if not (in_file["symptom_kills"] or in_file["unconfirmed_symptom_kills"]):
        return []
    resting = in_candidates["resting_only_on_symptom_kills"]
    return [
        "",
        "Symptom kills",
        f"  {in_file['symptom_kills']} of the kills file's {in_file['kills']} kills are symptom kills, "
        f"and {in_file['unconfirmed_symptom_kills']} of its {in_file['unconfirmed_kills']} unconfirmed kills",
        f"  {in_file['mutants_resting_only_on_symptom_kills']} mutants rest only on symptom kills: "
        "their kills, or their unconfirmed kills when they have none, are all symptom kills",
        f"  {in_candidates['symptom_kills']} of the candidates' {in_candidates['kills']} kills are symptom kills, "
        f"and they have {in_candidates['unconfirmed_symptom_kills']} unconfirmed symptom kills",
        f"  {resting['keep']} keeps and {resting['provisional-keep']} provisional-keeps rest only on symptom kills",
    ]


def checker_lines(by_stratum_mids):
    by_name = collections.defaultdict(lambda: collections.defaultdict(list))
    for stratum, mids in by_stratum_mids.items():
        for mid, names in mids.items():
            for name in names:
                by_name[name][stratum].append(mid)
    return [f"the {name} also kills {ids_by_stratum(groups)}" for name, groups in sorted(by_name.items())]


def symptom_lines(r):
    return [f"      {what}: {ids_by_stratum(r[field])}"
            for field, what in (("symptom_kills", "symptom kills"), ("unconfirmed_symptom_kills", "unconfirmed symptom kills"))
            if r.get(field)]


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


def source_line(result):
    k = result["kills"]
    if result["mode"] == "candidates file":
        cf = result["candidates_file"]
        head = f" and head {cf['head'][:11]}" if cf["head"] else ""
        return (f"Verdicts from {k['file']} for the candidates in {cf['file']}, removed at {cf['removed_at'][:11]}{head}, "
                "with no index, so a candidate reaches every mutant it ran")
    return f"Verdicts from {k['file']} over the reach index at {result['index']['sha'][:11]} (runs {', '.join(result['index']['runs'])})"


def roles_line(k):
    if k["layer_roles"] is None:
        return f"Kills file format {k['format']}, with no layer roles: a candidate's results count as removed and every other test's as remaining"
    return f"Kills file format {k['format']}, layer roles: {', '.join(f'{layer} {role}' for layer, role in sorted(k['layer_roles'].items()))}"


def scope_suffix(row):
    """The part of a reason that names the scope of the remaining side, or None."""
    parts = row["reason"].split("; ", 1)
    return parts[1] if len(parts) > 1 else None


def states_report(result):
    counts = result["mutant_states"]
    mutants = result["mutants"]
    lines = [
        "",
        "Mutants by state",
        *(f"  {n:>4}  {state}" for state, n in counts["states"].items()),
        f"  Removed side: {', '.join(f'{r} {n}' for r, n in counts['removed'].items())}",
        f"  Remaining side: {', '.join(f'{r} {n}' for r, n in counts['remaining'].items())}",
    ]
    lost = sorted(mid for mid, m in mutants.items() if m["removed"]["result"] == "caught" and m["remaining"]["result"] != "killed")
    if lost:
        lines += ["", "Caught by a removed test and killed by no remaining test"]
    for mid in lost:
        m = mutants[mid]
        caught = sorted(t for t, state in m["removed"]["tests"].items() if state in ("killed", "symptom kill"))
        lines += [f"  {m['stratum'] or 'no stratum'} {mid}: {m['remaining']['text']}", *(f"      {t}" for t in caught)]
    return lines


def suspects_report(result):
    suspects = {mid: m["equivalent_suspect"] for mid, m in result["mutants"].items() if "equivalent_suspect" in m}
    if not suspects:
        return []
    lines = ["", "Suspected equivalent mutants"]
    for mid, s in sorted(suspects.items()):
        if s["state"] == "unresolved":
            depends = (f"a deletion depends on dismissing it: {', '.join(s['candidates'])}" if s["deletion_depends_on_dismissing"]
                       else "no deletion depends on dismissing it")
            lines.append(f"  {mid}: unresolved, no sample credit and a blocker, {depends}")
        elif s["state"] == "killed":
            lines.append(f"  {mid}: killed, so not equivalent, and it counts as any killed mutant does")
        else:
            record = s.get("equivalence") or s.get("scope_decision")
            by = record.get("reviewed_by") or record.get("by")
            lines.append(f"  {mid}: {s['state']} by {by} on {record['date']}, no sample credit and not a blocker")
    for mid, problems in sorted(result["kills"]["incomplete_equivalence_records"].items()):
        lines.append(f"  {mid}: {'; '.join(problems)}, so the record is ignored")
    return lines


def report(result):
    k, s = result["kills"], result["summary"]
    in_index = (f", {len(result['candidates_not_in_index'])} of them not in the index" if result["mode"] == "index" else "")
    lines = [
        *joint_check_report(result["joint_check"]),
        source_line(result),
        roles_line(k),
        f"{k['mutants']} mutants: {by_stratum(k['strata'])}",
        *([f"  {', '.join(f'{n} killed by the {name}' for name, n in k['checker_kills'].items())}, which count as remaining tests"]
          if any(k["checker_kills"].values()) else []),
        *(f"  {n} with {how}" for how, n in sorted(k["reach"].items())),
        f"{s['candidates']} candidates{in_index}",
        *([f"{len(result['ordinals'])} candidates each stand for several index tests that share their title"]
          if result.get("ordinals") else []),
        f"A delete needs {result['min_mutants']} qualifying mutants, among them {', '.join(result['required_strata']) or 'any stratum'}",
        "",
        *(f"{v:<16} {n}" for v, n in s["verdicts"].items()),
        *symptom_report(k["symptom_kills"], s["symptom_kills"]),
        "",
        "Reasons",
        *(f"  {n:>4}  {reason}" for reason, n in s["reasons"].items()),
        *(["", "Scope of the remaining side under each keep or lost kill",
           *(f"  {v}: {', '.join(f'{scope} {n}' for scope, n in counts.items())}" for v, counts in s["scopes"].items())]
          if s["scopes"] else []),
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
            marker = f", {SYMPTOM_ONLY}" if r["symptom_only"] else ""
            if r["unique_kills"]:
                why = f"unique kills{marker}: {by_stratum({st: len(mids) for st, mids in r['unique_kills'].items()})}"
            elif verdict == "provisional-keep" and r["unconfirmed_unique_kills"]:
                counts = by_stratum({st: len(mids) for st, mids in r["unconfirmed_unique_kills"].items()})
                why = f"unconfirmed unique kills{marker}: {counts}"
            elif verdict != "delete":
                why = r["reason"].split("; ", 1)[0]
            else:
                why = f"no unique kill, qualifying mutants: {by_stratum(r['qualifying_mutants'])}"
            lines += [f"  {cid}", f"      {why}"]
            if scope_suffix(r):
                lines.append(f"      scope {r['scope']}: {scope_suffix(r)}")
            if r["cover_kept_for"]:
                lines.append(f"      kept by the cover for {ids_by_stratum(r['cover_kept_for'])}")
            lines += symptom_lines(r)
    dependent = sorted(cid for cid, r in rows.items() if r.get("depends_on"))
    if dependent:
        lines += ["", "Kills that no remaining test has"]
    for cid in dependent:
        lines += [f"  {cid}", *(f"      {rows[cid]['verdict']}, {line}" for line in depends_on_lines(rows[cid]["depends_on"]))]
        if rows[cid]["scope"] not in (None, "full"):
            lost = sorted(mid for mids in rows[cid]["depends_on"].values() for mid, stay in mids.items() if not stay)
            texts = "; ".join(f"{mid}: {result['mutants'][mid]['remaining']['text']}" for mid in lost)
            lines.append(f"      scope {rows[cid]['scope']}: {texts}")
    checked = sorted(cid for cid, r in rows.items() if r.get("also_killed_by_checker"))
    if checked:
        lines += ["", "Kills a checker also makes"]
    for cid in checked:
        lines += [f"  {cid}", *(f"      {rows[cid]['verdict']}, {line}" for line in checker_lines(rows[cid]["also_killed_by_checker"]))]
    on_symptoms = sorted(cid for cid, r in rows.items() if r.get("symptom_only_after_deletion"))
    if on_symptoms:
        lines += ["", "Kills that stay only as symptom kills"]
    for cid in on_symptoms:
        mids = ids_by_stratum(rows[cid]["symptom_only_after_deletion"])
        lines += [f"  {cid}", f"      {rows[cid]['verdict']}, the tests that stay kill {mids} only through symptom kills"]
    lines += states_report(result)
    lines += suspects_report(result)
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
    if k["checker_disagreements"]:
        lines += ["", f"{len(k['checker_disagreements'])} mutants record a checker kill differently in `killed_at_layer` and `layer_results`: "
                      f"{listed(k['checker_disagreements'])}"]
    for field, within in SYMPTOM_FIELDS.items():
        if k["symptom_kills"]["ignored"][field]:
            lines += ["", f"{k['symptom_kills']['ignored'][field]} ids in `{field}` aren't in their mutant's `{within}`, and are ignored"]
    other_side = {what: n for what, n in k["results_on_the_other_side"].items() if n}
    if other_side:
        lines += ["", f"Results that don't count because their layer's role is the other side: "
                      f"{', '.join(f'{n} of {what}' for what, n in other_side.items())}"]
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
                        help="a file of test ids or a single test id, repeatable, or one candidates file, which reads no index")
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
    required = [x for x in args.require_strata.split(",") if x]
    candidates_files = [c for c in map(read_candidates_file, args.candidates) if c]
    if candidates_files:
        if len(args.candidates) > 1:
            parser.error("a candidates file with `removed_at` must be the only --candidates")
        result = evaluate_candidates_file(args.kills, candidates_files[0], args.min_mutants, required,
                                          args.prior, args.ci_history, args.accept_cap, args.max_prior, args.callers)
    else:
        if not args.index:
            parser.error("pass the index directory with --index <dir> or JOURNEY_LOOKUP_INDEX")
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
