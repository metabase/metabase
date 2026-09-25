"""Usage: python overlap.py <work dir> <out dir> [--same-fe <jaccard>] [--same-be <jaccard>]
                            [--backend-baseline union|shard] [--kills <file>] [--min-mutants <k>] [--require-strata <s,...>]

Writes <out dir>/journey-overlap.json.
Tests are "<spec path>::<full title>" throughout.
  granularities   per-test overlap at each granularity
  weighted_cover  coverage ceiling: cheapest tests by measured duration that keep every item. Not a deletion list
  kills_cover     with --kills: the tests that keep every kill, then the most code and checks, then the least time
  verdicts        duplicate verdicts that combine code, path and assertions
  deletion        keep, provisional-keep, delete or unmeasured per test, from --kills (kills.py has the format)
  prefix_subtraction  inferred (totals minus totals) against measured (step deltas) for tests whose paths extend another's
  noise_floor     the same test measured twice, when the run has a control pass
"""

import argparse
import collections
import heapq
import itertools
import json
import os
import sys

import numpy as np
import scipy.sparse as sp

import kills as kill_matrix
from journey_lib import BACKEND_BASELINES, LEVELS, Run, jaccard, lcp

J_BINS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 1.0000001]


def item_sets(run):
    """Per test, the items at every granularity, as python sets."""
    out = collections.defaultdict(list)
    for t in run.tests:
        fns = t.fns.tolist()
        files = {int(run.fn_file_id[f]) for f in fns}
        classes = t.classes.tolist()
        routes = t.routes
        out["functions"].append(set(fns))
        out["files"].append(files)
        out["fe_areas"].append({run.file_area[f] for f in files})
        out["fe_modules"].append({run.file_module[f] for f in files})
        out["fe_feature_modules"].append({m for m in (run.file_module[f] for f in files) if m.startswith("feature/")})
        out["pages"].append(set(t.pages))
        out["api_routes"].append(set(routes))
        out["be_modules_from_routes"].append({run.vocab["routeModules"][r] for r in routes})
        out["pages_plus_routes"].append({("p", p) for p in t.pages} | {("r", r) for r in routes})
        out["be_classes"].append(set(classes))
        out["be_namespaces"].append({run.class_ns[c] for c in classes})
        out["be_modules"].append({run.class_module[c] for c in classes})
        for level in LEVELS:
            out[f"assertions_{level}"].append(set(t.asserts(level)))
            out[f"checks_{level}"].append({key for _, key, _ in run.assertions(t, level)})
            out[f"path_tokens_{level}"].append(set(t.tokens[level].tolist()))
    return out


# ---------- per-granularity overlap ----------


def build_matrix(sets, ids):
    vocab = {}
    rows, cols = [], []
    for r, i in enumerate(ids):
        for item in sets[i]:
            c = vocab.setdefault(item, len(vocab))
            rows.append(r)
            cols.append(c)
    X = sp.csr_matrix(
        (np.ones(len(rows), dtype=np.float32), (rows, cols)),
        shape=(len(ids), len(vocab)),
    )
    return X, vocab


def greedy_cover(sets):
    """Lazy greedy set cover over a list of python sets.

    Returns the chosen indices, in order, and the number of distinct items.
    """
    universe = set().union(*sets) if sets else set()
    covered = set()
    heap = [(-len(s), i) for i, s in enumerate(sets)]
    heapq.heapify(heap)
    chosen = []
    while len(covered) < len(universe):
        neg, i = heapq.heappop(heap)
        gain = len(sets[i] - covered)
        if gain == 0:
            continue
        if heap and gain < -heap[0][0]:
            heapq.heappush(heap, (-gain, i))
            continue
        chosen.append(i)
        covered |= sets[i]
    return chosen, len(universe)


def components(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    groups = collections.defaultdict(list)
    for x in range(n):
        groups[find(x)].append(x)
    return [g for g in groups.values() if len(g) > 1]


def analyze(run, name, sets):
    tests = run.tests
    key = lambda i: tests[i].key
    N = len(tests)
    ids = [i for i in range(N) if sets[i]]
    empty = N - len(ids)
    if len(ids) < 2:
        return {"granularity": name, "tests_with_items": len(ids), "tests_empty": empty}, None
    X, vocab = build_matrix(sets, ids)
    n = len(ids)
    sizes = np.asarray(X.sum(axis=1)).ravel()
    inter = (X @ X.T).toarray()
    union = sizes[:, None] + sizes[None, :] - inter
    J = inter / np.maximum(union, 1)
    np.fill_diagonal(J, -1)

    spec_of = np.array([tests[i].spec for i in ids])
    same_spec = spec_of[:, None] == spec_of[None, :]

    # Rarity-weighted Jaccard: items weighted by log(n/df) so app-shell items shared by most tests count for little.
    df = np.asarray(X.sum(axis=0)).ravel()
    w = np.log(n / df).astype(np.float32)
    Xw = X.multiply(w[None, :]).tocsr()
    winter = (Xw @ X.T).toarray()
    wsize = np.asarray(Xw.sum(axis=1)).ravel()
    wunion = wsize[:, None] + wsize[None, :] - winter
    WJ = np.where(wunion > 0, winter / np.maximum(wunion, 1e-9), 0)
    np.fill_diagonal(WJ, -1)

    iu = np.triu_indices(n, 1)
    pair_j = J[iu]
    pair_same = same_spec[iu]
    hist_all = np.histogram(pair_j, bins=J_BINS)[0].tolist()
    hist_same = np.histogram(pair_j[pair_same], bins=J_BINS)[0].tolist()
    hist_cross = np.histogram(pair_j[~pair_same], bins=J_BINS)[0].tolist()
    del pair_j

    nn = J.max(axis=1)
    J_cross = np.where(same_spec, -1, J)
    nn_cross = J_cross.max(axis=1)
    nn_cross_idx = J_cross.argmax(axis=1)
    wnn_cross = np.where(same_spec, -1, WJ).max(axis=1)

    def nn_summary(arr):
        return {f">={t}": int((arr >= t).sum()) for t in (0.5, 0.8, 0.9, 0.95, 0.99, 1.0)} | {
            "median": float(np.median(arr))
        }

    sig_groups = collections.defaultdict(list)
    for r, i in enumerate(ids):
        sig_groups[frozenset(sets[i])].append(r)
    identical = [g for g in sig_groups.values() if len(g) > 1]
    identical_cross = [g for g in identical if len({spec_of[r] for r in g}) > 1]

    # Subsumption: A's set is a proper subset of B's.
    sub = (inter == sizes[:, None]) & (sizes[:, None] < sizes[None, :])
    np.fill_diagonal(sub, False)
    sub_same = sub & same_spec
    sub_cross = sub & ~same_spec
    subsumed_any = sub.any(axis=1)
    subsumed_same_only = sub_same.any(axis=1) & ~sub_cross.any(axis=1)
    subsumed_cross = sub_cross.any(axis=1)
    subsumed_list = []
    for r in np.nonzero(subsumed_any)[0]:
        supers = np.nonzero(sub[r])[0]
        best = supers[np.argmin(sizes[supers])]
        subsumed_list.append(
            {
                "test": key(ids[r]),
                "size": int(sizes[r]),
                "supersets": int(len(supers)),
                "cross_spec_supersets": int(sub_cross[r].sum()),
                "tightest_superset": key(ids[best]),
                "tightest_superset_size": int(sizes[best]),
                "tightest_same_spec": bool(same_spec[r, best]),
            }
        )

    clusters = {}
    for th in (0.9, 0.95):
        a, b = np.nonzero(np.triu(J >= th, 1))
        comps = components(n, zip(a.tolist(), b.tolist()))
        comps.sort(key=len, reverse=True)
        clusters[str(th)] = {
            "count": len(comps),
            "tests_in_clusters": int(sum(len(c) for c in comps)),
            "cross_spec_clusters": int(sum(1 for c in comps if len({spec_of[r] for r in c}) > 1)),
            "largest": [len(c) for c in comps[:10]],
            "clusters": [
                {"size": len(c), "specs": len({spec_of[r] for r in c}), "tests": [key(ids[r]) for r in c][:50]}
                for c in comps[:100]
            ],
        }

    item_sets_ = [sets[i] for i in ids]
    chosen, universe = greedy_cover(item_sets_)
    cover_specs = len({tests[ids[c]].spec for c in chosen})
    curve = {}
    covered = set()
    for k, c in enumerate(chosen, 1):
        covered |= item_sets_[c]
        for pct in (0.5, 0.8, 0.9, 0.95, 0.99):
            if str(pct) not in curve and len(covered) >= pct * universe:
                curve[str(pct)] = k
    item_df = collections.Counter(x for s in item_sets_ for x in s)
    singletons = sum(1 for v in item_df.values() if v == 1)
    tests_owning_singletons = len({r for r, s in enumerate(item_sets_) if any(item_df[x] == 1 for x in s)})

    top_pairs = []
    seen = set()
    for r in np.argsort(-nn_cross)[:400]:
        if nn_cross[r] < 0:
            break
        c = int(nn_cross_idx[r])
        pair = tuple(sorted((int(r), c)))
        if pair in seen:
            continue
        seen.add(pair)
        top_pairs.append(
            {
                "a": key(ids[pair[0]]),
                "b": key(ids[pair[1]]),
                "jaccard": round(float(J[pair]), 4),
                "weighted_jaccard": round(float(WJ[pair]), 4),
                "size_a": int(sizes[pair[0]]),
                "size_b": int(sizes[pair[1]]),
            }
        )
        if len(top_pairs) >= 100:
            break

    result = {
        "granularity": name,
        "tests_with_items": n,
        "tests_empty": empty,
        "distinct_items": len(vocab),
        "items_per_test": {"median": float(np.median(sizes)), "mean": round(float(sizes.mean()), 1), "max": int(sizes.max())},
        "pairwise_jaccard_histogram": {
            "bins": J_BINS[:-1],
            "all_pairs": hist_all,
            "same_spec_pairs": hist_same,
            "cross_spec_pairs": hist_cross,
        },
        "nearest_neighbour_jaccard": {
            "any_spec": nn_summary(nn),
            "cross_spec": nn_summary(nn_cross),
            "cross_spec_rarity_weighted": nn_summary(wnn_cross),
        },
        "identical_signatures": {
            "groups": len(identical),
            "tests_in_groups": int(sum(len(g) for g in identical)),
            "redundant_tests": int(sum(len(g) - 1 for g in identical)),
            "cross_spec_groups": len(identical_cross),
        },
        "subsumed": {
            "strictly_subsumed_tests": int(subsumed_any.sum()),
            "by_same_spec_only": int(subsumed_same_only.sum()),
            "by_some_cross_spec_test": int(subsumed_cross.sum()),
        },
        "clusters": clusters,
        "set_cover": {
            "tests_needed": len(chosen),
            "out_of": n,
            "specs_touched": cover_specs,
            "items": universe,
            "tests_for_pct_of_items": curve,
            "items_seen_by_one_test": singletons,
            "tests_owning_a_unique_item": tests_owning_singletons,
            "chosen": [key(ids[c]) for c in chosen],
        },
        "top_cross_spec_pairs": top_pairs,
        "subsumed_list": sorted(subsumed_list, key=lambda row: -row["size"])[:500],
    }
    return result, (ids, J)


# ---------- weighted set cover ----------


def weighted_cover(sets, costs):
    """Greedy weighted set cover: repeatedly take the test with the most new items per second.

    Afterwards, drop chosen tests whose items the other chosen tests already keep, most expensive first.
    """
    universe = set().union(*sets) if sets else set()
    covered = set()
    heap = [(-len(s) / costs[i], i) for i, s in enumerate(sets) if s]
    heapq.heapify(heap)
    chosen = []
    while len(covered) < len(universe) and heap:
        neg, i = heapq.heappop(heap)
        gain = len(sets[i] - covered)
        if gain == 0:
            continue
        ratio = gain / costs[i]
        if heap and ratio < -heap[0][0] - 1e-12:
            heapq.heappush(heap, (-ratio, i))
            continue
        chosen.append(i)
        covered |= sets[i]
    counts = collections.Counter(x for i in chosen for x in sets[i])
    kept = []
    for i in sorted(chosen, key=lambda i: -costs[i]):
        if all(counts[x] > 1 for x in sets[i]):
            for x in sets[i]:
                counts[x] -= 1
        else:
            kept.append(i)
    return kept, len(universe)


def cover_report(run, kept, universe, costs):
    total = sum(max(t.duration_ms, 1) for t in run.tests)
    chosen_cost = sum(costs[i] for i in kept)
    return {
        "items": universe,
        "tests_needed": len(kept),
        "out_of": len(run.tests),
        "seconds_needed": round(chosen_cost / 1000, 1),
        "seconds_total": round(total / 1000, 1),
        "pct_of_suite_time": round(100 * chosen_cost / total, 1) if total else None,
        "specs_touched": len({run.tests[i].spec for i in kept}),
        "chosen": [run.tests[i].key for i in sorted(kept)],
    }


def tagged(run, sets, *parts):
    return [set().union(*({(name, x) for x in sets[name][i]} for name in parts)) for i in range(len(run.tests))]


FINE = ("functions", "be_classes", "checks_normalized")


def weighted_covers(run, sets):
    costs = [t.cost_ms for t in run.tests]
    combos = {
        "fine: functions + be_classes + checks": ("functions", "be_classes", "checks_normalized"),
        "medium: files + be_namespaces + checks": ("files", "be_namespaces", "checks_normalized"),
        "coarse: fe_modules + be_modules + checks": ("fe_modules", "be_modules", "checks_normalized"),
        "fine, code only: functions + be_classes": ("functions", "be_classes"),
    }
    out = {
        "what": "coverage ceiling, not a deletion list",
        "why": "It keeps the cheapest tests that still run every item. Of two twins it keeps the faster one, "
        "which may be the one that doesn't catch its bug, so a test it leaves out is not shown to be redundant. "
        "kills_cover orders by kills first once a kill matrix exists.",
        "weights": "durationMs of each test's final attempt, less the time its describe's before hooks took when it ran them",
        "combined": {},
        "single": {},
    }
    for name, parts in combos.items():
        item_sets = tagged(run, sets, *parts)
        out["combined"][name] = cover_report(run, *weighted_cover(item_sets, costs), costs)
    for name in (
        "functions", "files", "fe_areas", "fe_modules", "be_classes", "be_namespaces", "be_modules",
        "api_routes", "pages", "checks_normalized", "assertions_normalized", "assertions_exact",
    ):
        out["single"][name] = cover_report(run, *weighted_cover(sets[name], costs), costs)
    return out


def kills_cover(run, sets, kills):
    """Keeps every mutant that some e2e test of the run kills and no other test does.

    Code and checks break ties, then time.
    """
    costs = [t.cost_ms for t in run.tests]
    kept, universe = kill_matrix.cover_kills(run.tests, kills["mutants"], tagged(run, sets, *FINE), costs)
    return cover_report(run, kept, universe, costs) | {
        "what": "kept tests for every mutant only e2e tests kill, ordered by kills, then code and checks, then time",
        "tie_breaks": list(FINE),
    }, set(kept)


# ---------- duplicate verdicts ----------

VERDICTS = [
    ("same_it_different_data", "both come from one source it, run over different data. Never a duplicate"),
    ("duplicate", "same path, same checks and the same code within the noise thresholds"),
    ("same_path_same_assertions_code_differs", "same path and assertions, but the code differs beyond the noise threshold"),
    ("same_path_different_assertions", "same path, different checks"),
    ("path_is_prefix", "one test's path is a prefix of the other's"),
    ("same_assertions_different_path", "same checks on a different path (different inputs)"),
    ("same_code_different_path_and_assertions", "code within the noise thresholds, but the paths and checks differ"),
]


# A verdict with at most this many pairs keeps every pair, and a larger one keeps examples.
ALL_PAIRS_UP_TO = 2000
# Pairs from one source it that would otherwise be one of these always keep their row.
KEEP_SAME_IT_AS = {"duplicate", "same_path_same_assertions_code_differs", "same_path_different_assertions", "path_is_prefix"}


def verdicts(run, sets, fe_j, be_j, level, fe_threshold, be_threshold, examples=40):
    tests = run.tests
    path = [tuple(t.tokens[level].tolist()) for t in tests]
    asserts = sets[f"checks_{level}"]
    judged = [t.state == "passed" for t in tests]

    by_path = collections.defaultdict(list)
    by_asserts = collections.defaultdict(list)
    for t in tests:
        if judged[t.id]:
            by_path[path[t.id]].append(t.id)
            if asserts[t.id]:
                by_asserts[frozenset(asserts[t.id])].append(t.id)

    candidates = set()
    for group in itertools.chain(by_path.values(), by_asserts.values()):
        for a, b in itertools.combinations(sorted(group)[:300], 2):
            candidates.add((a, b))
    close = np.argwhere(np.triu((fe_j >= fe_threshold) & (be_j >= be_threshold), 1))
    for a, b in close.tolist():
        if judged[a] and judged[b]:
            candidates.add((a, b))
    tree = run.tree(level)
    for t in tests:
        if not judged[t.id]:
            continue
        for node in tree.paths[t.id][:-1]:
            if tree.nodes[node]["end"] == 0:
                continue
            for other in tree.nodes[node]["ends"]:
                if other != t.id and judged[other]:
                    candidates.add(tuple(sorted((other, t.id))))

    static_key = {int(k): v.get("static") for k, v in run.static.items()}
    counts = collections.Counter()
    same_it_as = collections.Counter()
    strict = 0
    pairs = collections.defaultdict(list)
    tests_in = collections.defaultdict(set)
    for a, b in sorted(candidates):
        same_path = path[a] == path[b]
        same_asserts = asserts[a] == asserts[b]
        same_code = fe_j[a, b] >= fe_threshold and be_j[a, b] >= be_threshold
        k = lcp(tests[a].tokens[level], tests[b].tokens[level])
        prefix = not same_path and k == min(len(path[a]), len(path[b]))
        identical_code = np.array_equal(tests[a].fns, tests[b].fns) and np.array_equal(tests[a].classes, tests[b].classes)
        if same_path and same_asserts and identical_code:
            strict += 1
        if same_path and same_asserts and same_code:
            v = "duplicate"
        elif same_path and same_asserts:
            v = "same_path_same_assertions_code_differs"
        elif same_path:
            v = "same_path_different_assertions"
        elif prefix:
            v = "path_is_prefix"
        elif same_asserts and asserts[a]:
            v = "same_assertions_different_path"
        elif same_code:
            v = "same_code_different_path_and_assertions"
        else:
            continue
        compared_as = v
        from_one_it = static_key.get(a) is not None and static_key.get(a) == static_key.get(b)
        if from_one_it:
            same_it_as[v] += 1
            v = "same_it_different_data"
        counts[v] += 1
        tests_in[v].update((a, b))
        short, long_ = (a, b) if len(path[a]) <= len(path[b]) else (b, a)
        sa, sb = asserts[short], asserts[long_]
        pairs[v].append(
            {
                "a": tests[short].key,
                "b": tests[long_].key,
                **({"compared_as": compared_as} if from_one_it else {}),
                "same_spec": tests[a].spec == tests[b].spec,
                "shared_tokens": k,
                "tokens": [len(path[short]), len(path[long_])],
                "fe_jaccard": round(float(fe_j[a, b]), 4),
                "be_jaccard": round(float(be_j[a, b]), 4),
                "asserts": {"both": len(sa & sb), "only_a": len(sa - sb), "only_b": len(sb - sa)},
                "a_asserts_subset_of_b": sa <= sb,
                "exact_level_same_path": tuple(tests[a].tokens["exact"].tolist()) == tuple(tests[b].tokens["exact"].tolist()),
                "identical_code": bool(identical_code),
            }
        )
    for v in pairs:
        if counts[v] > ALL_PAIRS_UP_TO:
            pairs[v] = pairs[v][:examples] + [e for e in pairs[v][examples:] if e.get("compared_as") in KEEP_SAME_IT_AS]
    return {
        "level": level,
        "same_code_threshold": {"fe_functions_jaccard": fe_threshold, "be_classes_jaccard": be_threshold},
        "duplicates_with_identical_code": strict,
        "not_judged_failed_tests": sum(1 for j in judged if not j),
        "definitions": dict(VERDICTS),
        "pair_counts": {v: counts[v] for v, _ in VERDICTS},
        "same_it_different_data_by_comparison": {v: same_it_as[v] for v, _ in VERDICTS if v != "same_it_different_data"},
        "tests_involved": {v: len(tests_in[v]) for v, _ in VERDICTS},
        "tests_in_pairs": {v: sorted(tests[i].key for i in tests_in[v]) for v, _ in VERDICTS if counts[v] <= ALL_PAIRS_UP_TO},
        "groups": {
            "same_path": {
                "groups": sum(1 for g in by_path.values() if len(g) > 1),
                "tests": sum(len(g) for g in by_path.values() if len(g) > 1),
            },
            "same_assertions": {
                "groups": sum(1 for g in by_asserts.values() if len(g) > 1),
                "tests": sum(len(g) for g in by_asserts.values() if len(g) > 1),
            },
        },
        "pairs": {v: pairs[v] for v, _ in VERDICTS},
        "pairs_kept": {
            v: "all" if counts[v] <= ALL_PAIRS_UP_TO
            else f"first {examples}" + (", and every one that would otherwise share a path" if v == "same_it_different_data" else "")
            for v, _ in VERDICTS
        },
    }


# ---------- prefix subtraction ----------


def subtraction_record(A, B, k):
    """How well B.total - A.total (inference) matches what B measured after the shared k tokens."""
    rec = {"a": A.key, "b": B.key, "shared_tokens": k, "tokens": [int(len(A.tokens["normalized"])), int(len(B.tokens["normalized"]))]}
    for kind, total_a, total_b in (("fe", A.fns, B.fns), ("be", A.classes, B.classes)):
        attr = "fns" if kind == "fe" else "classes"
        inferred = np.setdiff1d(total_b, total_a)
        measured_after = B.code_after(k, attr)
        measured_before = B.code_upto(k, attr)
        measured_new = np.setdiff1d(measured_after, measured_before)
        hidden = np.intersect1d(measured_after, total_a)
        rec[kind] = {
            "inferred": int(len(inferred)),
            "measured_after": int(len(measured_after)),
            "measured_new": int(len(measured_new)),
            "inferred_that_ran_after": round(len(np.intersect1d(inferred, measured_after)) / len(inferred), 4) if len(inferred) else None,
            "after_hidden_from_inference": round(len(hidden) / len(measured_after), 4) if len(measured_after) else None,
            "jaccard_inferred_vs_measured_new": round(jaccard(inferred, measured_new), 4) if len(inferred) or len(measured_new) else None,
        }
    return rec


def summarize_subtraction(records):
    out = {"pairs": len(records)}
    for kind in ("fe", "be"):
        s = {}
        for key in ("inferred_that_ran_after", "after_hidden_from_inference", "jaccard_inferred_vs_measured_new"):
            values = [r[kind][key] for r in records if r[kind][key] is not None]
            if values:
                s[key] = {
                    "median": round(float(np.median(values)), 4),
                    "p10": round(float(np.percentile(values, 10)), 4),
                    "p90": round(float(np.percentile(values, 90)), 4),
                    "n": len(values),
                }
        for key in ("inferred", "measured_after", "measured_new"):
            s[f"{key}_median"] = float(np.median([r[kind][key] for r in records])) if records else None
        out[kind] = s
    return out


def prefix_subtraction(run, level="normalized"):
    tree = run.tree(level)
    strict, nearest = [], []
    for t in run.tests:
        path = tree.paths[t.id]
        for node in path[:-1]:
            if tree.nodes[node]["end"] == 0:
                continue
            for other in tree.nodes[node]["ends"]:
                if other != t.id:
                    strict.append(subtraction_record(run.tests[other], t, tree.nodes[node]["end"]))
        # The deepest node this test shares with a test on a different path gives its nearest partner.
        own = tuple(t.tokens[level].tolist())
        for node in reversed(path):
            members = [
                m for m in tree.nodes[node]["tests"]
                if m != t.id and tuple(run.tests[m].tokens[level].tolist()) != own
            ]
            if members:
                ends_here = [m for m in tree.nodes[node]["ends"] if m in members]
                partner = (ends_here or members)[0]
                k = lcp(run.tests[partner].tokens[level], t.tokens[level])
                if k > 0:
                    nearest.append(subtraction_record(run.tests[partner], t, k))
                break
    return {
        "level": level,
        "definitions": {
            "inferred": "B's per-test code minus A's per-test code: what set subtraction says B adds",
            "measured_after": "the union of B's step deltas after the tokens it shares with A",
            "measured_new": "measured_after minus what B itself measured before the divergence",
            "inferred_that_ran_after": "share of the inferred difference that B's snapshots place after the divergence. The rest ran in B's shared part, where A did not run it",
            "after_hidden_from_inference": "share of B's post-divergence code that A also ran somewhere, so subtraction cannot attribute it to B's extension",
            "jaccard_inferred_vs_measured_new": "agreement between the inferred difference and the code first run after the divergence",
        },
        "strict_prefix": {"summary": summarize_subtraction(strict), "pairs": strict[:200]},
        "nearest_shared_prefix": {"summary": summarize_subtraction(nearest), "pairs": nearest[:200]},
    }


# ---------- noise floor ----------


def noise_floor(run):
    out = {}
    control = [t.control for t in run.tests if t.control]
    if control:
        out["control_pass"] = self_similarity(control) | {
            "wall_ms": {"with_steps": sum(t.wall_ms for t in run.tests if t.control), "control": sum(r["wallMs"] for r in control)},
        }
    if run.second_samples:
        out["rerun_second_sample"] = self_similarity(run.second_samples, "classJaccardUnion" if run.backend_baseline == "union" else "classJaccard")
    return out or None


def self_similarity(rows, class_key="classJaccard"):
    """The same test measured twice: code, route and assertion Jaccard, and whether its path and cut positions repeat."""
    def dist(key):
        values = np.array([r[key] for r in rows])
        return {
            "median": round(float(np.median(values)), 4),
            "p10": round(float(np.percentile(values, 10)), 4),
            "min": round(float(values.min()), 4),
            "identical": int((values == 1).sum()),
            "below_0.95": int((values < 0.95).sum()),
        }

    return {
        "tests": len(rows),
        "fe_functions_jaccard": dist("fnJaccard"),
        "be_classes_jaccard": dist(class_key if all(class_key in r for r in rows) else "classJaccard"),
        "routes_jaccard": dist("routeJaccard"),
        "assertions_jaccard": dist("assertJaccard"),
        "same_path": {level: sum(1 for r in rows if r[level]["same"]) for level in LEVELS},
        "same_cut_positions": sum(1 for r in rows if r["cutPositions"]["same"]),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("work")
    parser.add_argument("out")
    parser.add_argument("--same-fe", type=float, default=0.95)
    parser.add_argument("--same-be", type=float, default=0.9)
    parser.add_argument("--backend-baseline", choices=BACKEND_BASELINES, default=None,
                        help="union (default) or shard; JOURNEY_BACKEND_BASELINE sets the default")
    parser.add_argument("--kills", help="kill matrix JSON, see kills.py")
    parser.add_argument("--min-mutants", type=int, default=kill_matrix.MIN_MUTANTS, help="qualifying mutants a delete verdict needs")
    parser.add_argument("--require-strata", default=kill_matrix.REQUIRED_STRATA, help="strata a delete verdict needs among them")
    args = parser.parse_args()
    run = Run(args.work, backend_baseline=args.backend_baseline)
    sets = item_sets(run)
    kills = kill_matrix.load(args.kills, run) if args.kills else None

    grans = {}
    matrices = {}
    for name in (
        "functions", "files", "fe_areas", "fe_modules", "fe_feature_modules", "pages", "api_routes",
        "be_modules_from_routes", "pages_plus_routes", "be_classes", "be_namespaces", "be_modules",
        "assertions_normalized", "assertions_exact", "checks_normalized", "path_tokens_normalized",
    ):
        print("analyzing", name, file=sys.stderr)
        res, extra = analyze(run, name, sets[name])
        grans[name] = res
        if name in ("functions", "be_classes") and extra:
            matrices[name] = extra

    def full_matrix(name):
        n = len(run.tests)
        M = np.zeros((n, n), dtype=np.float32)
        if name in matrices:
            ids, J = matrices[name]
            M[np.ix_(ids, ids)] = J
        # Two tests with no items at this granularity count as the same.
        empty = [i for i in range(n) if not sets[name][i]]
        M[np.ix_(empty, empty)] = 1
        return M

    fe_j, be_j = full_matrix("functions"), full_matrix("be_classes")
    verdicts_by_level = {level: verdicts(run, sets, fe_j, be_j, level, args.same_fe, args.same_be) for level in LEVELS}

    cover_by_kills, cover_keeps = kills_cover(run, sets, kills) if kills else (None, set())
    required = [x for x in args.require_strata.split(",") if x]
    deletion = kill_matrix.verdicts(run, kills, cover_keeps, args.min_mutants, required)
    in_duplicates = verdicts_by_level["normalized"]["tests_in_pairs"].get("duplicate", [])
    key_of = {t.id: t.key for t in run.tests}
    merge = run.summary.get("merge")
    if merge:
        for row in merge.get("replaced", []) + merge.get("stillNotPassing", []) + merge.get("rerunFailedMainPassed", []):
            row["key"] = key_of[row.pop("id")]

    out = {
        "sha": run.vocab["sha"],
        "totals": {
            "specs": len({t.spec for t in run.tests}),
            "tests": len(run.tests),
            "attempts": run.summary["attempts"],
            "retried_tests": sum(1 for t in run.tests if t.attempts > 1),
            "failed_tests": sum(1 for t in run.tests if t.state != "passed"),
            "suite_seconds": round(sum(t.duration_ms for t in run.tests) / 1000, 1),
            "tests_without_duration": sum(1 for t in run.tests if not t.duration_ms),
            "tests_by_source": dict(collections.Counter(t.source for t in run.tests)),
            "tests_by_state": dict(collections.Counter(t.state for t in run.tests)),
            "fe_functions": len(set().union(*sets["functions"])),
            "fe_files": len(set().union(*sets["files"])),
            "be_classes": len(set().union(*sets["be_classes"])),
            "be_namespaces": len(set().union(*sets["be_namespaces"])),
            "api_routes": len(set().union(*sets["api_routes"])),
            "assertions_normalized": len(set().union(*sets["assertions_normalized"])),
            "assertions_exact": len(set().union(*sets["assertions_exact"])),
            "checks_normalized": len(set().union(*sets["checks_normalized"])),
            "path_tokens": {level: len(run.vocab["tokens"][level]) for level in LEVELS},
        },
        "notes": {
            "attempts": "Each test is its final attempt. Cypress stops retrying after a pass, so for passing tests that is also the first passing attempt.",
            "subtraction": "Frontend functions, routes and backend classes are baseline-subtracted by the capture reader "
            "(coverage-baseline both rounds, plus backend-idle for classes). Per-test backend classes exclude beforeTest, "
            "except that a describe's before hooks keep the first test's beforeTest classes. "
            + (
                "Backend classes that any shard's coverage-baseline ran are also dropped (--backend-baseline union)."
                if run.backend_baseline == "union"
                else "Backend classes are subtracted per shard only (--backend-baseline shard)."
            ),
            "before_hooks": "A describe's before hooks run once, in its first test. Every test of the describe starts its path with "
            "their commands and holds their code, and the first test keeps only what its own hooks and body ran.",
            "assertions": "Assertions are Cypress assert log messages, with generated ids masked (both levels) and URL paths normalized (normalized level). Numbers stay literal. "
            "Their recorded chain is the command current when the log arrived, usually the next command, so it is not part of the key. "
            "checks_* key an assertion by its source line when static_align.py tied it to one, and by its message otherwise. Verdicts and covers use checks.",
        },
        "backend_baseline": run.backend_baseline,
        "before_hooks": run.suite_summary,
        "granularities": grans,
        "weighted_cover": weighted_covers(run, sets),
        "kills_cover": cover_by_kills,
        "verdicts": verdicts_by_level,
        "deletion": {
            "kills": None if kills is None else {k: v for k, v in kills.items() if k != "mutants"} | {"mutants": len(kills["mutants"])},
            "min_mutants": args.min_mutants,
            "required_strata": required,
            "summary": kill_matrix.summarize(deletion),
            "summary_for_tests_in_duplicate_pairs": kill_matrix.summarize(deletion, in_duplicates),
            "tests": deletion if kills else None,
        },
        "prefix_subtraction": prefix_subtraction(run),
        "noise_floor": noise_floor(run),
        "merge": merge,
        "tests": [
            {"key": t.key, "spec": t.spec, "title": t.title, "state": t.state, "durationMs": t.duration_ms, "source": t.source,
             **({"describesWithBeforeHooks": t.suites} if t.suites else {})}
            for t in run.tests
        ],
    }
    path = os.path.join(args.out, "journey-overlap.json")
    with open(path, "w") as f:
        json.dump(out, f, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    print(f"wrote {path} ({os.path.getsize(path) / 1e6:.2f} MB)", file=sys.stderr)


if __name__ == "__main__":
    main()
