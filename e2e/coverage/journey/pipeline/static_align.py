"""Usage: python static_align.py <work dir> <static-tests.json>

Ties recorded assertions to the source assertions of static-tests.mjs,
and cross-checks the recorded command order against the source.
Writes <work dir>/static-align.json.
"""

import json
import os
import re
import sys

from journey_lib import Run

CHAINER_ALIASES = {
    "attr": "attribute",
    "eq": "equal",
    "eql": "equal",
    "equals": "equal",
    "gt": "above",
    "greaterthan": "above",
    "gte": "least",
    "lt": "below",
    "lessthan": "below",
    "lte": "most",
    "lengthof": "length",
    "contains": "contain",
    "includes": "include",
    "exists": "exist",
    "prop": "property",
    "css": "css",
    "ok": "truthy",
}
FILLER = {"to", "be", "been", "is", "that", "which", "and", "has", "have", "with", "at", "of", "same", "does", "still", "a", "an", "deep"}
STRING = re.compile(r'"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|`([^`$]*)`')


def split_args(text):
    """Top-level comma split of a call's argument text."""
    out, depth, cur, quote = [], 0, "", None
    for ch in text:
        if quote:
            cur += ch
            if ch == quote:
                quote = None
            continue
        if ch in "\"'`":
            quote = ch
        elif ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        elif ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
            continue
        cur += ch
    if cur.strip():
        out.append(cur.strip())
    return out


def literal(arg):
    m = STRING.fullmatch(arg.strip())
    if m:
        return next(g for g in m.groups() if g is not None)
    if re.fullmatch(r"-?\d+(\.\d+)?", arg.strip()):
        return arg.strip()
    return None


def last_call_args(text, name):
    """Argument text of the last `.name(` call in a chain, or None."""
    at = text.rfind(f".{name}(")
    if at == -1:
        return None
    i = at + len(name) + 2
    depth, quote = 1, None
    for j in range(i, len(text)):
        ch = text[j]
        if quote:
            if ch == quote:
                quote = None
            continue
        if ch in "\"'`":
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return text[i:j]
    return text[i:]


def chainer_words(chainer):
    words = []
    for w in re.split(r"[.\s]+", chainer.lower()):
        w = CHAINER_ALIASES.get(w, w)
        if w and w not in FILLER:
            words.append(w)
    return words


def parse_static(text):
    """Chainer words and literal values of a source assertion, or None when it has no literal chainer."""
    for name in ("should", "and"):
        args = last_call_args(text, name)
        if args is not None:
            parts = split_args(args)
            if not parts:
                return None
            chainer = literal(parts[0])
            values = [v for v in (literal(p) for p in parts[1:]) if v is not None]
            if chainer is None:
                return None
            return chainer_words(chainer), values
    m = re.match(r"^expect\((.*)\)\.((?:to|not|be|been|deep|have|include|contain|a|an|and|[.\w])+?)\((.*)\)$", text, re.S)
    if m:
        values = [v for v in (literal(p) for p in split_args(m.group(3))) if v is not None]
        return chainer_words(m.group(2)), values
    m = re.match(r"^expect\((.*)\)\.([.\w]+)$", text, re.S)
    if m:
        return chainer_words(m.group(2)), []
    return None


SUBJECT_IN_MESSAGE = re.compile(r"^expected \*\*(\w+)\((.*?)\)\*\*")


def compatible(parsed, message, text):
    if parsed is None:
        return False
    # Messages about absent elements name the query, and the source has to use the same one.
    subject = SUBJECT_IN_MESSAGE.match(message)
    if subject:
        name, arg = subject.group(1), subject.group(2).strip("`")
        if f"{name}(" not in text or arg not in text:
            return False
    words, values = parsed
    low = message.lower()
    if "not" in words and " not " not in f" {low} ":
        return False
    if "not" not in words and re.search(r"\bnot\b", low):
        return False
    for w in words:
        if w == "not":
            continue
        if w not in low:
            return False
    return all(v in message for v in values)


def align(recorded, static):
    """Longest order-preserving matching of recorded messages to compatible source assertions."""
    n, m = len(recorded), len(static)
    ok = [[compatible(static[j]["parsed"], recorded[i]["message"], static[j]["text"]) for j in range(m)] for i in range(n)]
    best = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            best[i][j] = max(best[i + 1][j], best[i][j + 1], best[i + 1][j + 1] + 1 if ok[i][j] else 0)
    pairs, i, j = [], 0, 0
    while i < n and j < m:
        if ok[i][j] and best[i][j] == best[i + 1][j + 1] + 1:
            pairs.append((i, j))
            i, j = i + 1, j + 1
        elif best[i + 1][j] >= best[i][j + 1]:
            i += 1
        else:
            j += 1
    return pairs


HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


def literals(texts):
    """String literals in order, without aliases, HTTP methods or immediate repeats."""
    out = []
    for text in texts:
        for m in STRING.finditer(text):
            value = next(g for g in m.groups() if g is not None)
            if value and not value.startswith("@") and value not in HTTP_METHODS and (not out or out[-1] != value):
                out.append(value)
    return out


def lcs_len(a, b):
    if not a or not b:
        return 0
    prev = [0] * (len(b) + 1)
    for x in a:
        cur = [0]
        for j, y in enumerate(b):
            cur.append(prev[j] + 1 if x == y else max(prev[j + 1], cur[j]))
        prev = cur
    return prev[-1]


ORDER_KINDS = {"act", "nav", "wait", "intercept", "implicit", "assert"}


def suites_of(t, st):
    """The describes above a test that have `before` hooks, outermost first, as (depth, "<spec>::<describe path>").

    The describe path is the literal prefix of the test's full title that the describe titles match.
    """
    depths = st.get("beforeDepths") or []
    if not depths:
        return []
    pattern = "^" + "".join(f"({d}) " for d in st["describeRes"]) + f"(?:{st['itRe']})$"
    m = re.match(pattern, t.title, re.S)
    if not m:
        return None
    return [[d, f"{t.spec}::{' '.join(m.groups()[:d])}"] for d in depths]


def main():
    work, static_file = sys.argv[1], sys.argv[2]
    run = Run(work, compose=False)
    data = json.load(open(static_file))
    by_key = {s["key"]: s for s in data["staticTests"]}
    matches = data["matches"]
    out = {"tests": {}, "summary": {}}
    rec_total = rec_matched = static_total = static_matched = 0
    order_ratios = []
    for t in run.tests:
        key = matches.get(str(t.id))
        if not key:
            continue
        st = by_key[key]
        static = [
            {"text": e["text"], "via": e["via"], "src": e["src"], "parsed": parse_static(e["text"])}
            for e in st["events"]
            if e["kind"] == "assert"
        ]
        recorded = []
        for ci, cut in enumerate(t.cuts):
            for k, a in enumerate(cut.asserts["exact"]):
                recorded.append({"cut": ci, "index": k, "message": run.assert_text("exact", a)})
        pairs = align(recorded, static)
        rec_total += len(recorded)
        rec_matched += len(pairs)
        parseable = [s for s in static if s["parsed"] is not None]
        static_total += len(parseable)
        static_matched += len(pairs)

        recorded_literals = literals(
            run.token_text("exact", tok)
            for tok, terminal, phase in zip(t.tokens["exact"].tolist(), t.terminal, t.phases)
            if terminal and phase == "test"
        )
        static_literals = literals(e["text"] for e in st["events"] if e["kind"] in ORDER_KINDS and not e.get("hook"))
        common = set(recorded_literals) & set(static_literals)
        a = [x for x in static_literals if x in common]
        b = [x for x in recorded_literals if x in common]
        order = lcs_len(a, b) / min(len(a), len(b)) if a and b else None
        if order is not None:
            order_ratios.append(order)

        out["tests"][str(t.id)] = {
            "static": key,
            "suites": suites_of(t, st),
            "asserts": {f"{recorded[i]['cut']}:{recorded[i]['index']}": {k: static[j][k] for k in ("text", "via", "src")} for i, j in pairs},
            "recorded_asserts": len(recorded),
            "static_asserts": len(static),
            "static_parseable": len(parseable),
            "matched": len(pairs),
            "static_literals_seen": round(len(common) / len(set(static_literals)), 3) if static_literals else None,
            "literal_order_agreement": round(order, 3) if order is not None else None,
        }
    ratios = sorted(order_ratios)
    out["summary"] = {
        "tests_with_static_match": len(out["tests"]),
        "tests": len(run.tests),
        "recorded_asserts": rec_total,
        "recorded_asserts_tied_to_source": rec_matched,
        "parseable_source_asserts": static_total,
        "source_asserts_found_in_recording": static_matched,
        "literal_order_agreement_median": ratios[len(ratios) // 2] if ratios else None,
        "tests_with_order_agreement_below_0.9": sum(1 for r in ratios if r < 0.9),
    }
    path = os.path.join(work, "static-align.json")
    with open(path, "w") as f:
        json.dump(out, f)
    print(json.dumps(out["summary"]), file=sys.stderr)


if __name__ == "__main__":
    main()
