"""Usage: python graph.py <work dir> <out dir>

Builds the step graph at both levels from extract.mjs output and writes <out dir>/journey-graph.json.
Prints the graph's shape and its most shared prefixes.
"""

import collections
import json
import os
import sys

import numpy as np

from journey_lib import KIND_RANK, LEVELS, Run, token_kind

TOP = 5
MAX_NODE_TOKENS = 30
TOKEN_WIDTH = 160


def union_count(arrays):
    return int(len(np.unique(np.concatenate(arrays)))) if arrays else 0


def node_summaries(run, tree):
    """Code, assertions and cuts per node, from the cuts each test placed on it."""
    per_node = collections.defaultdict(lambda: collections.defaultdict(list))
    for t in run.tests:
        for cut in t.cuts:
            node = tree.node_at(t.id, cut.pos)
            bucket = per_node[node]
            bucket["cuts"].append(cut)
            bucket["tests"].append(t.id)
    out = {}
    for node_id, bucket in per_node.items():
        cuts = bucket["cuts"]
        by_test = collections.defaultdict(lambda: ([], []))
        for tid, cut in zip(bucket["tests"], cuts):
            by_test[tid][0].append(cut.fns)
            by_test[tid][1].append(cut.classes)
        fe_sets = [np.unique(np.concatenate(f)) for f, _ in by_test.values()]
        be_sets = [np.unique(np.concatenate(b)) for _, b in by_test.values()]
        fe_all = np.unique(np.concatenate(fe_sets))
        be_all = np.unique(np.concatenate(be_sets))
        fe_common = fe_sets[0]
        for s in fe_sets[1:]:
            fe_common = np.intersect1d(fe_common, s, assume_unique=True)
        be_common = be_sets[0]
        for s in be_sets[1:]:
            be_common = np.intersect1d(be_common, s, assume_unique=True)
        asserts = collections.Counter(a for c in cuts for a in c.asserts[tree.level])
        out[node_id] = {
            "fe": fe_all,
            "be": be_all,
            "fe_common": len(fe_common),
            "be_common": len(be_common),
            "cuts": len(cuts),
            "tests_with_cuts": len(by_test),
            "triggers": collections.Counter(c.trigger for c in cuts),
            "asserts": asserts,
            "urls": collections.Counter(u for c in cuts for u in c.urls),
            "requests": collections.Counter(r for c in cuts for r in c.requests),
        }
    return out


def prefix_common(run, tree):
    """Per node, the code that every test through it measured on its path up to the node's end."""
    out = {}
    for node in tree.nodes:
        fe = be = None
        for tid in node["tests"]:
            t = run.tests[tid]
            f = t.code_upto(node["end"], "fns")
            b = t.code_upto(node["end"], "classes")
            fe = f if fe is None else np.intersect1d(fe, f, assume_unique=True)
            be = b if be is None else np.intersect1d(be, b, assume_unique=True)
        out[node["id"]] = (len(fe) if fe is not None else 0, len(be) if be is not None else 0)
    return out


def node_kind(run, level, tokens):
    kinds = collections.Counter(token_kind(run.token_text(level, tok)) for tok in tokens)
    primary = min(kinds, key=lambda k: KIND_RANK[k]) if kinds else "end"
    return primary, dict(kinds)


def sharing_stats(run, tree):
    level = tree.level
    total_tokens = sum(len(t.tokens[level]) for t in run.tests)
    distinct_prefixes = sum(len(n["tokens"]) for n in tree.nodes)
    # Longest prefix each test shares with any other test, as a share of its path.
    shared = []
    best = np.zeros(len(run.tests), dtype=np.int64)
    for node in tree.nodes:
        if len(node["tests"]) >= 2:
            for tid in node["tests"]:
                best[tid] = max(best[tid], node["end"])
    for t in run.tests:
        n = len(t.tokens[level])
        shared.append(best[t.id] / n if n else 1.0)
    shared = np.array(shared)
    same_path = collections.Counter(tuple(t.tokens[level].tolist()) for t in run.tests)
    return {
        "tests": len(run.tests),
        "nodes": len(tree.nodes),
        "branching_nodes": sum(1 for n in tree.nodes if len(n["children"]) >= 2),
        "leaves": sum(1 for n in tree.nodes if not n["children"]),
        "nodes_shared_by_2plus_tests": sum(1 for n in tree.nodes if len(n["tests"]) >= 2),
        "nodes_shared_by_2plus_specs": sum(
            1 for n in tree.nodes if len({run.tests[t].spec for t in n["tests"]}) >= 2
        ),
        "tokens_total": total_tokens,
        "tokens_distinct_prefixes": distinct_prefixes,
        "tokens_in_shared_prefixes_pct": round(100 * (1 - distinct_prefixes / total_tokens), 1) if total_tokens else 0,
        "median_path_tokens": float(np.median([len(t.tokens[level]) for t in run.tests])),
        "median_path_nodes": float(np.median([len(p) for p in tree.paths])),
        "median_share_of_path_shared_with_another_test": round(float(np.median(shared)), 3),
        "tests_sharing_half_their_path": int((shared >= 0.5).sum()),
        "tests_sharing_whole_path": int(sum(n for n in same_path.values() if n > 1)),
        "distinct_whole_paths": len(same_path),
    }


def build_level(run, level, detailed):
    tree = run.tree(level)
    summaries = node_summaries(run, tree)
    prefixes = prefix_common(run, tree)
    nodes = []
    for node in tree.nodes:
        s = summaries.get(node["id"])
        specs = {run.tests[t].spec for t in node["tests"]}
        kind, kinds = node_kind(run, level, node["tokens"])
        rec = {
            "id": node["id"],
            "parent": node["parent"],
            "children": node["children"],
            "start": node["start"],
            "end": node["end"],
            "label": tree.node_label(node),
            "kind": kind,
            "kinds": kinds,
            "tests": len(node["tests"]),
            "specs": len(specs),
            "ends": len(node["ends"]),
            "prefix": {"feCommon": prefixes[node["id"]][0], "beCommon": prefixes[node["id"]][1]},
        }
        shared = len(node["tests"]) >= 2
        if not shared:
            del rec["kinds"]
        if shared and detailed:
            texts = [run.token_text(level, tok)[:TOKEN_WIDTH] for tok in node["tokens"]]
            if len(texts) > MAX_NODE_TOKENS:
                half = MAX_NODE_TOKENS // 2
                texts = texts[:half] + [f"… {len(texts) - 2 * half} more …"] + texts[-half:]
            rec["tokens"] = texts
        else:
            rec["tokenCount"] = len(node["tokens"])
        if s:
            rec["code"] = {
                "fe": int(len(s["fe"])),
                "be": int(len(s["be"])),
                "feCommon": s["fe_common"],
                "beCommon": s["be_common"],
            }
            rec["cuts"] = s["cuts"]
            rec["triggers"] = dict(s["triggers"])
            rec["asserts"] = {"distinct": len(s["asserts"])}
            if detailed and shared:
                rec["asserts"]["sample"] = [run.assert_text(level, a)[:140] for a, _ in s["asserts"].most_common(3)]
                rec["urls"] = [u for u, _ in s["urls"].most_common(3)]
                rec["top"] = {
                    "files": run.top(s["fe"], "files", TOP),
                    "feModules": run.top(s["fe"], "fe_modules", TOP),
                    "beNamespaces": run.top(s["be"], "be_ns", TOP),
                    "beModules": run.top(s["be"], "be_modules", TOP),
                    "requests": [[run.vocab["routes"][r], n] for r, n in s["requests"].most_common(TOP)],
                }
        nodes.append(rec)
    return tree, {
        "stats": sharing_stats(run, tree),
        "nodes": nodes,
        "membership": {str(n["id"]): [run.tests[i].key for i in n["tests"]] for n in tree.nodes},
    }


def top_prefixes(run, level_data, n=15):
    nodes = [x for x in level_data["nodes"] if x["parent"] >= 0 and x["tests"] >= 2]
    by_tests = sorted(nodes, key=lambda x: (-x["tests"], -x["end"]))[:n]
    by_depth = sorted(nodes, key=lambda x: (-x["end"], -x["tests"]))[:n]
    cross = sorted([x for x in nodes if x["specs"] >= 2], key=lambda x: (-x["end"], -x["tests"]))[:n]
    return {"by_tests": by_tests, "deepest": by_depth, "deepest_cross_spec": cross}


def main():
    work, out_dir = sys.argv[1], sys.argv[2]
    run = Run(work)
    levels = {}
    for level in LEVELS:
        _, data = build_level(run, level, detailed=level == "normalized")
        levels[level] = data
    graph = {
        "sha": run.vocab["sha"],
        "notes": {
            "path": "Each test is a path of action tokens: Cypress commands and cy.request calls, in the order they started. "
            "Logging, aliases, callbacks and the recording's own commands are left out. "
            "A describe's before hooks run once, in its first test, and every test of the describe starts with their commands.",
            "levels": "exact keeps literal arguments and masks only values that change between runs (uuids, tokens, dates, generated ids). "
            "normalized also masks entity ids: URL path segments and query values, alias numbers, values of id keys such as "
            "table_id or card_ids, and the ids in MBQL field references. Every other number, such as a viewport size, stays.",
            "nodes": "A node is a maximal run of tokens that the same set of tests share, keyed by the full prefix before it.",
            "code": "Each step cut's measured code, baseline-subtracted, lands on the node holding the last token before the cut. "
            "code.fe/be is the union over the node's tests, feCommon/beCommon what every test with a cut there measured, "
            "prefix.feCommon/beCommon what every test through the node measured from the start of its path to the node's end.",
            "pruning": f"Nodes on a single test's path keep counts and labels, without tokens, top lists, sample assertions or URLs. "
            f"Shared nodes keep at most {MAX_NODE_TOKENS} tokens, clipped at {TOKEN_WIDTH} characters, and top lists of {TOP}. "
            "The exact level keeps only the structure, labels and counts. show_pair.py reads the full data from work/.",
        },
        "levels": levels,
        "tests": [
            {
                "key": t.key,
                "spec": t.spec,
                "title": t.title,
                "state": t.state,
                "attempts": t.attempts,
                "source": t.source,
                **({"replaces": t.replaces} if t.replaces else {}),
                **({"rerunStates": t.rerun_states} if t.rerun_states else {}),
                **({"describesWithBeforeHooks": t.suites} if t.suites else {}),
                "durationMs": t.duration_ms,
                "fe": int(len(t.fns)),
                "be": int(len(t.classes)),
                "asserts": len(t.asserts("normalized")),
                "tokens": int(len(t.tokens["normalized"])),
                "paths": {level: run.tree(level).paths[t.id] for level in LEVELS},
            }
            for t in run.tests
        ],
    }
    path = os.path.join(out_dir, "journey-graph.json")
    with open(path, "w") as f:
        json.dump(graph, f, separators=(",", ":"))
    print(f"wrote {path} ({os.path.getsize(path) / 1e6:.2f} MB)")
    for level in LEVELS:
        print(f"\n== {level}: {json.dumps(levels[level]['stats'])}")
    tops = top_prefixes(run, levels["normalized"])
    for name, rows in tops.items():
        print(f"\n-- top shared prefixes (normalized), {name}")
        for x in rows:
            code = x.get("code", {})
            print(
                f"  node {x['id']:>4} tokens {x['start']:>3}-{x['end']:<3} tests {x['tests']:>4} specs {x['specs']:>3} "
                f"kind {x['kind']:<8} prefix fe∩ {x['prefix']['feCommon']:>5} be∩ {x['prefix']['beCommon']:>5} "
                f"here fe {code.get('fe', 0):>5} be {code.get('be', 0):>5} | {x['label'][:110]}"
            )


if __name__ == "__main__":
    main()
