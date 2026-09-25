"""Two tests side by side: where their paths part, and what each checks and runs after that."""

import numpy as np

from journey_lib import lcp, run_label


def display_steps(run, t, level, split_at=None):
    """The test's path cut into steps at its cut positions, one step per position.

    A step that straddles `split_at` is split there, and the cut after the split measures the code of both parts.
    """
    steps = []
    prev = 0
    for cut in t.cuts:
        if steps and cut.pos == steps[-1]["to"]:
            steps[-1]["cuts"].append(cut)
            continue
        if split_at is not None and prev < split_at < cut.pos:
            steps.append({"from": prev, "to": split_at, "cuts": []})
            prev = split_at
        steps.append({"from": prev, "to": cut.pos, "cuts": [cut]})
        prev = cut.pos
    n = len(t.tokens[level])
    if prev < n:
        steps.append({"from": prev, "to": n, "cuts": []})
    return steps


def step_record(run, t, level, step):
    lo, hi = step["from"], step["to"]
    label = run_label(run, level, t.tokens[level][lo:hi].tolist(), 150, t.helpers[lo:hi], t.terminal[lo:hi])
    cuts = step["cuts"]
    fe = np.unique(np.concatenate([c.fns for c in cuts])) if cuts else np.array([], dtype=np.int32)
    be = np.unique(np.concatenate([c.classes for c in cuts])) if cuts else np.array([], dtype=np.int32)
    return {
        "tokens": [lo, hi],
        "label": label or "(no new commands)",
        "ends_with": [f"{c.trigger} {c.trigger_text}".strip() for c in cuts] or ["(measured with the next cut)"],
        "asserts": [text for pos, _, text in run.assertions(t, level) if step["from"] < pos <= step["to"] or (pos == step["to"] == 0)] if cuts else [],
        "urls": sorted({u for c in cuts for u in c.urls}),
        "fe": int(len(fe)),
        "be": int(len(be)),
    }


def assertion_diff(a_items, b_items):
    """Assertions of two tests compared by key.

    Items are (position, key, display).
    """
    display = {key: text for _, key, text in a_items + b_items}
    ka, kb = {key for _, key, _ in a_items}, {key for _, key, _ in b_items}
    text = lambda keys: [display[k] for k in sorted(keys)]
    return {"shared": text(ka & kb), "only_a": text(ka - kb), "only_b": text(kb - ka)}


def code_summary(run, fns, classes):
    return {
        "fe": int(len(fns)),
        "be": int(len(classes)),
        "top_files": run.top(fns, "files", 4),
        "top_be_namespaces": run.top(classes, "be_ns", 4),
    }


def pair_diff(run, a_id, b_id, level="normalized"):
    A, B = run.tests[a_id], run.tests[b_id]
    ta, tb = A.tokens[level], B.tokens[level]
    k = lcp(ta, tb)
    tree = run.tree(level)
    pb = set(tree.paths[b_id])
    common = [n for n in tree.paths[a_id] if n in pb]
    common_node = common[-1] if common else 0

    pre_fe_a, pre_fe_b = A.code_upto(k, "fns"), B.code_upto(k, "fns")
    pre_be_a, pre_be_b = A.code_upto(k, "classes"), B.code_upto(k, "classes")
    post_fe_a, post_fe_b = A.code_after(k, "fns"), B.code_after(k, "fns")
    post_be_a, post_be_b = A.code_after(k, "classes"), B.code_after(k, "classes")

    items_a, items_b = run.assertions(A, level), run.assertions(B, level)
    asserts_pre_a = [x for x in items_a if x[0] <= k]
    asserts_pre_b = [x for x in items_b if x[0] <= k]
    asserts_post_a = [x for x in items_a if x[0] > k]
    asserts_post_b = [x for x in items_b if x[0] > k]

    steps_a = display_steps(run, A, level, k)
    steps_b = display_steps(run, B, level, k)
    shared_steps = [step_record(run, A, level, s) for s in steps_a if s["to"] <= k]
    after_a = [step_record(run, A, level, s) for s in steps_a if s["to"] > k]
    after_b = [step_record(run, B, level, s) for s in steps_b if s["to"] > k]

    same_path = k == len(ta) == len(tb)
    return {
        "level": level,
        "a": {"key": A.key, "state": A.state, "durationMs": A.duration_ms, "tokens": int(len(ta))},
        "b": {"key": B.key, "state": B.state, "durationMs": B.duration_ms, "tokens": int(len(tb))},
        "shared_tokens": k,
        "same_path": same_path,
        "a_path_is_prefix_of_b": k == len(ta) < len(tb),
        "b_path_is_prefix_of_a": k == len(tb) < len(ta),
        "common_node": common_node,
        "divergence": {
            "a": run.token_text(level, int(ta[k])) if k < len(ta) else None,
            "b": run.token_text(level, int(tb[k])) if k < len(tb) else None,
        },
        "shared_steps": shared_steps,
        "shared_code": {
            "fe_a": int(len(pre_fe_a)),
            "fe_b": int(len(pre_fe_b)),
            "fe_both": int(len(np.intersect1d(pre_fe_a, pre_fe_b))),
            "be_a": int(len(pre_be_a)),
            "be_b": int(len(pre_be_b)),
            "be_both": int(len(np.intersect1d(pre_be_a, pre_be_b))),
        },
        "asserts_in_shared_part": assertion_diff(asserts_pre_a, asserts_pre_b),
        "after_a": after_a,
        "after_b": after_b,
        "asserts_after": assertion_diff(asserts_post_a, asserts_post_b),
        "asserts_whole_test": assertion_diff(items_a, items_b),
        "a_adds": code_summary(run, np.setdiff1d(post_fe_a, B.fns), np.setdiff1d(post_be_a, B.classes)),
        "b_adds": code_summary(run, np.setdiff1d(post_fe_b, A.fns), np.setdiff1d(post_be_b, A.classes)),
        "totals": {
            "fe_jaccard": jaccard_arrays(A.fns, B.fns),
            "be_jaccard": jaccard_arrays(A.classes, B.classes),
            "fe_only_a": int(len(np.setdiff1d(A.fns, B.fns))),
            "fe_only_b": int(len(np.setdiff1d(B.fns, A.fns))),
            "be_only_a": int(len(np.setdiff1d(A.classes, B.classes))),
            "be_only_b": int(len(np.setdiff1d(B.classes, A.classes))),
        },
    }


def jaccard_arrays(a, b):
    union = len(np.union1d(a, b))
    return round(len(np.intersect1d(a, b)) / union, 4) if union else 1.0


def clip(text, n=150):
    return text if len(text) <= n else text[: n - 1] + "…"


def format_step(prefix, s):
    ends = "; ".join(clip(e, 90) for e in s["ends_with"]) or "-"
    line = f"{prefix}[{s['tokens'][0]}-{s['tokens'][1]}] {clip(s['label'], 110)}\n{prefix}    → {ends}   (+{s['fe']} fe, +{s['be']} be)"
    return line


def format_asserts(title, diff, indent="  ", limit=12):
    out = [f"{indent}{title}: {len(diff['shared'])} both, {len(diff['only_a'])} only A, {len(diff['only_b'])} only B"]
    for key, name in (("only_a", "only A"), ("only_b", "only B"), ("shared", "both")):
        for text in diff[key][:limit]:
            out.append(f"{indent}  {name:<6} {clip(text, 140)}")
        if len(diff[key]) > limit:
            out.append(f"{indent}  {name:<6} … {len(diff[key]) - limit} more")
    return out


def format_pair(d, max_steps=12):
    out = []
    a, b = d["a"], d["b"]
    out.append(f"A {a['key']}  [{a['state']}, {a['durationMs'] / 1000:.1f}s, {a['tokens']} tokens]")
    out.append(f"B {b['key']}  [{b['state']}, {b['durationMs'] / 1000:.1f}s, {b['tokens']} tokens]")
    t = d["totals"]
    out.append(
        f"per-test code: fe jaccard {t['fe_jaccard']} ({t['fe_only_a']} only A, {t['fe_only_b']} only B), "
        f"be jaccard {t['be_jaccard']} ({t['be_only_a']} only A, {t['be_only_b']} only B)"
    )
    k = d["shared_tokens"]
    if d["same_path"]:
        out.append(f"\nSame path all the way ({k} tokens, {d['level']}):")
    else:
        rel = " (A's whole path is a prefix of B's)" if d["a_path_is_prefix_of_b"] else " (B's whole path is a prefix of A's)" if d["b_path_is_prefix_of_a"] else ""
        out.append(f"\nSame path for {k} tokens ({d['level']}){rel}, up to here:")
    steps = d["shared_steps"]
    shown = steps if len(steps) <= max_steps else steps[:3] + [None] + steps[-(max_steps - 4):]
    for s in shown:
        out.append("  …" if s is None else format_step("  ", s))
    sc = d["shared_code"]
    out.append(f"  shared part measured: fe A {sc['fe_a']} / B {sc['fe_b']} / both {sc['fe_both']}, be A {sc['be_a']} / B {sc['be_b']} / both {sc['be_both']}")
    pre = d["asserts_in_shared_part"]
    if pre["only_a"] or pre["only_b"]:
        out.extend(format_asserts("assertions within the shared part differ", pre))
    elif pre["shared"]:
        out.append(f"  assertions within the shared part: the same {len(pre['shared'])}")
    if not d["same_path"]:
        out.append("\nThen:")
        out.append(f"  A next: {clip(d['divergence']['a'] or '(A ends here)', 150)}")
        out.append(f"  B next: {clip(d['divergence']['b'] or '(B ends here)', 150)}")
        for name, steps in (("A", d["after_a"]), ("B", d["after_b"])):
            out.append(f"  {name} continues with {len(steps)} steps:")
            shown = steps if len(steps) <= max_steps else steps[: max_steps - 1] + [None]
            for s in shown:
                out.append("    …" if s is None else format_step("    ", s))
        out.extend(format_asserts("\nAssertions after the divergence", d["asserts_after"], indent=""))
    else:
        out.extend(format_asserts("\nAssertions (whole test)", d["asserts_whole_test"], indent=""))
    for name, key in (("A adds over B", "a_adds"), ("B adds over A", "b_adds")):
        c = d[key]
        files = ", ".join(f"{f.split('/')[-1]}×{n}" for f, n in c["top_files"])
        ns = ", ".join(f"{x}×{n}" for x, n in c["top_be_namespaces"])
        out.append(f"{name} after the divergence: {c['fe']} fe functions [{files}], {c['be']} be classes [{ns}]")
    return "\n".join(out)
