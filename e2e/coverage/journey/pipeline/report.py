"""Usage: python report.py <out dir> [--pairs N]

Prints the headline numbers of a journey run from journey-graph.json, journey-overlap.json and work/,
with example pair diffs picked from the verdicts.
"""

import argparse
import json
import os

from journey_lib import LEVELS, Run
from pairs import format_pair, pair_diff


def pct(a, b):
    return f"{100 * a / b:.0f}%" if b else "-"


def section(title):
    print(f"\n## {title}\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("out")
    parser.add_argument("--pairs", type=int, default=3)
    args = parser.parse_args()
    out = args.out
    work = os.path.join(out, "work")
    summary = json.load(open(os.path.join(work, "extract-summary.json")))
    graph = json.load(open(os.path.join(out, "journey-graph.json")))
    overlap = json.load(open(os.path.join(out, "journey-overlap.json")))
    static_file = os.path.join(work, "static-align.json")
    static = json.load(open(static_file))["summary"] if os.path.exists(static_file) else None
    run = Run(work)

    section("Run")
    t = overlap["totals"]
    print(f"sha {summary['sha']}, {len(summary['shards'])} shards, {t['tests']} tests from {t['specs']} specs, "
          f"{t['attempts']} attempts ({t['retried_tests']} retried, {t['failed_tests']} failed in their final attempt), "
          f"{t['suite_seconds'] / 60:.1f} min of test time")
    ms = sum(s["totalMs"] for s in summary["shards"])
    print(f"extract: {ms / 1000:.1f}s ({ms / max(t['tests'], 1):.0f} ms per test)")
    print(f"baseline-subtracted: {t['fe_functions']} fe functions in {t['fe_files']} files, {t['be_classes']} be classes in "
          f"{t['be_namespaces']} namespaces, {t['api_routes']} API routes, {t['assertions_normalized']} distinct assertion messages, "
          f"{t.get('checks_normalized', '-')} distinct checks")

    section("Shards")
    shards = summary["shards"]
    print(f"{len(shards)} shards read, {summary.get('shardsExpected')} expected, missing indices {summary.get('missingShardIndices')}, shas {summary.get('shasSeen')}")
    outcome_counts = {}
    for sh in shards:
        key = json.dumps(sh.get("outcomes"), sort_keys=True)
        outcome_counts[key] = outcome_counts.get(key, 0) + 1
    for key, n in sorted(outcome_counts.items(), key=lambda kv: -kv[1]):
        print(f"  {n:>3} shards with outcomes {key}")
    failed = [sh for sh in shards if sh.get("failed")]
    print(f"  final attempts failed: {sum(sh.get('failed', 0) for sh in shards)} tests in {len(failed)} shards, "
          f"{sum(sh.get('pending', 0) for sh in shards)} tests pending (skipped at run time)")
    odd = [sh["index"] for sh in shards if (sh.get("outcomes") or {}).get("tests") == "failure" and not sh.get("failed")]
    if odd:
        print(f"  shards whose tests step failed with no failed final attempt: {odd}")
    lost = [sh for sh in shards if sh.get("tests", 0) == 0 or sh.get("withoutSteps") or sh.get("withoutBackend") or sh.get("recordingErrors") or sh.get("cutsWithoutDump")]
    for sh in lost:
        print(f"  shard {sh.get('index')}: {sh.get('tests')} tests, {sh.get('withoutSteps')} without steps, "
              f"{sh.get('withoutBackend')} without backend classes, {sh.get('recordingErrors')} recording errors, "
              f"{sh.get('cutsWithoutDump')} cuts without a backend dump, outcomes {sh.get('outcomes')}")
    if not lost:
        print("  every shard has tests, and every test has steps and backend classes with no recording errors")
    slow = sorted(shards, key=lambda sh: -sh["totalMs"])[:3]
    print("  slowest to extract: " + ", ".join(f"{sh['shard']} {sh['totalMs'] / 1000:.1f}s ({sh['tests']} tests)" for sh in slow))

    section("Capture data problems")
    for key, value in summary["problems"].items():
        if value not in (0, [], {}, None) and key != "classNamesSeen":
            print(f"  {key}: {json.dumps(value)[:400]}")

    merge = overlap.get("merge") or {}
    if merge.get("reruns"):
        section("Reruns")
        for r in merge["reruns"]:
            print(f"  {r['source']}: {r['tests']} tests, shas {r['shas']}, same sha as the main run: {r['sameShaAsMain']}")
        print(f"  replaced by a rerun's passing attempt: {len(merge['replaced'])}")
        for x in merge["replaced"]:
            print(f"    ({x['mainState']} in the main run) {x['key']}")
        print(f"  never passed in any run: {len(merge['stillNotPassing'])}")
        for x in merge["stillNotPassing"]:
            print(f"    {x['state']}, reruns {[r['state'] for r in x['reruns']]}  {x['key']}")
        print(f"  passed in both, kept as second samples: {merge['secondSamples']}")
        print(f"  only in a rerun: {len(merge['rerunOnly'])}, passed in the main run but not in a rerun: {len(merge['rerunFailedMainPassed'])}")
        for x in merge["rerunFailedMainPassed"]:
            print(f"    {x['rerunState']} in the rerun  {x['key']}")

    if static:
        section("Static source cross-check")
        print(json.dumps(static, indent=1))

    hooks = overlap.get("before_hooks")
    if hooks:
        section("Describes with before hooks")
        print(f"{hooks['describes_with_before_hooks']} describes with before hooks in the source, {hooks['describes_with_recorded_hooks']} with recorded hook commands or cuts, "
              f"{hooks['tests_in_those_describes']} tests in those describes, {hooks['tests_changed']} tests whose path or code changed")
        for key, n in sorted(hooks["hook_tokens"].items(), key=lambda kv: -hooks["members"][kv[0]]):
            print(f"  {hooks['members'][key]:>3} tests, {n:>3} hook tokens, {hooks['hook_cuts'][key]:>3} hook cuts  {key}")
        for name in ("describes_without_recorded_hooks", "hooks_without_a_parsed_describe", "nested_describes_sharing_a_first_test", "titles_the_describe_chain_does_not_match"):
            if hooks[name]:
                print(f"  {name.replace('_', ' ')}: {len(hooks[name])}")
                for key in hooks[name][:10]:
                    print(f"    {key}")

    section("Step graph")
    for level in LEVELS:
        print(f"{level}: {json.dumps(graph['levels'][level]['stats'])}")
    nodes = graph["levels"]["normalized"]["nodes"]
    shared = [n for n in nodes if n["parent"] >= 0 and n["tests"] >= 2]
    print("\nmost shared prefixes (normalized), by tests then depth:")
    for n in sorted(shared, key=lambda x: (-x["tests"], -x["end"]))[:12]:
        print(f"  node {n['id']:>5} tokens {n['start']:>3}-{n['end']:<3} tests {n['tests']:>5} specs {n['specs']:>4} "
              f"prefix fe∩ {n['prefix']['feCommon']:>5} be∩ {n['prefix']['beCommon']:>5} | {n['label'][:100]}")
    print("\nprefixes shared by the most specs, deepest first among ties:")
    for n in sorted(shared, key=lambda x: (-x["specs"], -x["end"]))[:12]:
        print(f"  node {n['id']:>5} tokens {n['start']:>3}-{n['end']:<3} tests {n['tests']:>5} specs {n['specs']:>4} "
              f"prefix fe∩ {n['prefix']['feCommon']:>5} be∩ {n['prefix']['beCommon']:>5} | {n['label'][:100]}")
    print("\ndeepest prefixes shared by two or more specs:")
    for n in sorted([x for x in shared if x["specs"] >= 2], key=lambda x: (-x["end"], -x["tests"]))[:12]:
        print(f"  node {n['id']:>5} tokens {n['start']:>3}-{n['end']:<3} tests {n['tests']:>5} specs {n['specs']:>4} "
              f"prefix fe∩ {n['prefix']['feCommon']:>5} be∩ {n['prefix']['beCommon']:>5} | {n['label'][:100]}")

    section("Overlap per granularity")
    print(f"{'granularity':28} {'tests':>6} {'items':>7} {'med/test':>9} {'identical':>10} {'subsumed':>9} {'J>=0.9 pairs':>13} {'J>=0.9 clusters':>16} {'cover':>6} {'NN J med':>9}")
    for name, g in overlap["granularities"].items():
        if "distinct_items" not in g:
            continue
        cl = g["clusters"]["0.9"]
        h = g["pairwise_jaccard_histogram"]
        close = sum(n for b, n in zip(h["bins"], h["all_pairs"]) if b >= 0.9)
        print(f"{name:28} {g['tests_with_items']:>6} {g['distinct_items']:>7} {g['items_per_test']['median']:>9.0f} "
              f"{g['identical_signatures']['tests_in_groups']:>10} {g['subsumed']['strictly_subsumed_tests']:>9} {close:>13} "
              f"{cl['count']:>7}/{cl['tests_in_clusters']:<8} {g['set_cover']['tests_needed']:>6} "
              f"{g['nearest_neighbour_jaccard']['any_spec']['median']:>9.3f}")

    section("Weighted set cover (by duration): a coverage ceiling, not a deletion list")
    wc = overlap["weighted_cover"]
    print(f"{wc['why']}\n")
    for group in ("combined", "single"):
        for name, c in wc[group].items():
            print(f"  {name:48} {c['tests_needed']:>5}/{c['out_of']:<5} tests, {c['seconds_needed'] / 60:7.1f} of "
                  f"{c['seconds_total'] / 60:.1f} min ({c['pct_of_suite_time']}%), {c['items']} items, {c['specs_touched']} specs")

    kc = overlap.get("kills_cover")
    if kc:
        section("Kills-first cover")
        print(f"  {kc['tests_needed']}/{kc['out_of']} tests, {kc['seconds_needed'] / 60:.1f} of {kc['seconds_total'] / 60:.1f} min "
              f"({kc['pct_of_suite_time']}%), {kc['items']} mutants that only e2e tests kill, {kc['specs_touched']} specs")

    section("Duplicate verdicts")
    for level in LEVELS:
        v = overlap["verdicts"][level]
        print(f"{level}: thresholds {v['same_code_threshold']}, {v['not_judged_failed_tests']} failed tests not judged, "
              f"{v['duplicates_with_identical_code']} duplicate pairs with identical code sets, backend baseline {overlap.get('backend_baseline')}")
        for name, desc in v["definitions"].items():
            print(f"  {name:42} {v['pair_counts'][name]:>6} pairs, {v['tests_involved'][name]:>5} tests  ({desc})")
        print(f"  same_it_different_data pairs by what they would otherwise be: {json.dumps({k: n for k, n in v['same_it_different_data_by_comparison'].items() if n})}")
        print(f"  groups: {json.dumps(v['groups'])}")

    section("Duplicate pairs (normalized)")
    for e in overlap["verdicts"]["normalized"]["pairs"]["duplicate"]:
        print(f"  {'same spec' if e['same_spec'] else 'two specs'}, fe {e['fe_jaccard']}, be {e['be_jaccard']}, {e['tokens'][0]} tokens")
        print(f"    {e['a']}")
        print(f"    {e['b']}")

    section("Deletion verdicts")
    d = overlap["deletion"]
    if d["kills"] is None:
        print("no kill matrix (--kills), so every test is unmeasured")
    else:
        k = d["kills"]
        print(f"kill matrix {k['file']}: {k['mutants']} mutants, strata {json.dumps(k['strata'])}, ran known: {k['ran_known']}, "
              f"e2e ids not in this run: {len(k['e2e_ids_not_in_run'])}, ids matching several tests: {len(k['ids_matching_several_tests'])}")
        print(f"min mutants {d['min_mutants']}, required strata {d['required_strata']}")
    for name in ("summary", "summary_for_tests_in_duplicate_pairs"):
        print(f"{name.replace('_', ' ')}: {json.dumps(d[name])}")

    section("Prefix subtraction")
    ps = overlap["prefix_subtraction"]
    for name in ("strict_prefix", "nearest_shared_prefix"):
        print(f"{name}: {json.dumps(ps[name]['summary'])}")

    if overlap.get("noise_floor"):
        section("Noise floor (the same test measured twice)")
        for name, nf in overlap["noise_floor"].items():
            print(f"{name}: {json.dumps(nf)}")

    section("Example pairs")
    picked = []
    v = overlap["verdicts"]["normalized"]["pairs"]
    for name in ("duplicate", "same_path_different_assertions", "path_is_prefix", "same_assertions_different_path",
                 "same_code_different_path_and_assertions"):
        for e in v.get(name, []):
            pair = (run.by_key[e["a"]].id, run.by_key[e["b"]].id)
            if pair not in picked:
                picked.append(pair)
                break
        if len(picked) >= args.pairs:
            break
    for a, b in picked:
        print("-" * 100)
        print(format_pair(pair_diff(run, a, b, "normalized")))


if __name__ == "__main__":
    main()
