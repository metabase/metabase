"""Loads extract.mjs output and builds the step graph: a prefix tree over each test's action tokens.

A cut's measured code lands on the node holding the last token before the cut.
"""

import collections
import copy
import json
import os
import re

import numpy as np

LEVELS = ("exact", "normalized")


def arr(values):
    return np.asarray(values, dtype=np.int32)


class Cut:
    __slots__ = (
        "pos", "trigger", "trigger_text", "phase", "fns", "classes", "raw_fns", "raw_classes",
        "asserts", "assert_chains", "requests", "urls", "in_flight", "latency_ms", "t", "owner", "index",
    )

    def __init__(self, c, owner, index):
        # A `before` hook's cut is shared by every test of its describe, so static alignment looks it up by the test that recorded it.
        self.owner = owner
        self.index = index
        self.pos = c["pos"]
        self.trigger = c["trigger"]
        self.trigger_text = c["triggerText"]
        self.phase = c["phase"]
        self.fns = arr(c["fns"])
        self.classes = arr(c["classes"])
        self.raw_fns = c["rawFns"]
        self.raw_classes = c["rawClasses"]
        self.asserts = {level: c["asserts"][level] for level in LEVELS}
        self.assert_chains = c["assertChains"]
        self.requests = c["requests"]
        self.urls = c["urls"]
        self.in_flight = c["inFlight"]
        self.latency_ms = c["latencyMs"]
        self.t = c["t"]

    def moved(self, pos):
        other = copy.copy(self)
        other.pos = pos
        return other


class Test:
    def __init__(self, r, specs):
        self.id = r["id"]
        self.shard = r["shard"]
        self.spec = specs[r["spec"]]
        self.title = r["title"]
        # "<spec path>::<full title>", with " [n]" on the nth test of a spec that repeats a title.
        self.key = r["key"]
        self.base_key = f"{self.spec}::{self.title}"
        self.state = r["state"]
        self.attempts = r["attempts"]
        self.duration_ms = r["durationMs"] or 0
        self.wall_ms = r["wallMs"]
        self.fns = arr(r["fns"])
        self.classes = arr(r["classes"])
        self.routes = r["routes"]
        self.pages = r["pages"]
        self.raw_fn_count = r["rawFnCount"]
        self.raw_class_count = r["rawClassCount"]
        self.suite_prefix = r["suitePrefix"]
        self.suite_parts = r["suite"]
        self.suites = []
        self.suite_ms = 0
        self.tokens = {level: arr(r["tokens"][level]) for level in LEVELS}
        self.helpers = r["helpers"]
        self.terminal = r["terminal"]
        self.phases = r["phases"]
        self.cuts = [Cut(c, self.id, i) for i, c in enumerate(r["cuts"])]
        self.control = r.get("control")
        self.check = r.get("check")
        self.source = r.get("source")
        self.replaces = r.get("replaces")
        self.rerun_states = r.get("rerunStates")
        self.rerun_only = r.get("rerunOnly", False)

    def asserts(self, level):
        return [a for cut in self.cuts for a in cut.asserts[level]]

    def code_upto(self, k, kind):
        parts = [getattr(c, kind) for c in self.cuts if c.pos <= k]
        return np.unique(np.concatenate(parts)) if parts else arr([])

    def code_after(self, k, kind):
        parts = [getattr(c, kind) for c in self.cuts if c.pos > k]
        return np.unique(np.concatenate(parts)) if parts else arr([])

    def label(self):
        return self.key

    @property
    def cost_ms(self):
        """Duration without the describe's `before` hooks, which run once whichever of its tests stays."""
        return max(self.duration_ms - self.suite_ms, 1)


BACKEND_BASELINES = ("union", "shard")


class Run:
    def __init__(self, work, compose=True, backend_baseline=None):
        """compose=False keeps each test's path and code as recorded, so only the first test of a describe has its `before` hooks.

        backend_baseline "union" also drops the backend classes that any shard's coverage baseline ran,
        and "shard" keeps the capture reader's per-shard subtraction only.
        """
        self.work = work
        self.vocab = json.load(open(os.path.join(work, "vocab.json")))
        self.modules = json.load(open(os.path.join(work, "modules.json")))
        self.summary = json.load(open(os.path.join(work, "extract-summary.json")))
        specs = self.vocab["specs"]
        self.tests = []
        with open(os.path.join(work, "tests.jsonl")) as f:
            for line in f:
                self.tests.append(Test(json.loads(line), specs))
        fns = self.vocab["fns"]
        self.fn_file = [f[: f.rfind("#")] for f in fns]
        self.file_ids = {}
        self.fn_file_id = arr([self.file_ids.setdefault(f, len(self.file_ids)) for f in self.fn_file])
        self.files = list(self.file_ids)
        fe_module = self.modules["feModuleOfFile"]
        fe_area = self.modules["feAreaOfFile"]
        self.file_module = [fe_module[f] for f in self.files]
        self.file_area = [fe_area[f] for f in self.files]
        self.class_ns = self.vocab["classNs"]
        be_module = self.modules["beModuleOfNs"]
        self.class_module = [be_module[ns] for ns in self.class_ns]
        self.trees = {}
        self.backend_baseline = backend_baseline or os.environ.get("JOURNEY_BACKEND_BASELINE") or "union"
        if self.backend_baseline not in BACKEND_BASELINES:
            raise ValueError(f"backend baseline {self.backend_baseline!r} is not one of {BACKEND_BASELINES}")
        # Each shard subtracts only its own coverage baseline, and those differ by hundreds of classes.
        if self.backend_baseline == "union":
            drop = arr(self.vocab.get("backendBaselineUnion", []))
            for t in self.tests:
                t.classes = np.setdiff1d(t.classes, drop)
                for cut in t.cuts:
                    cut.classes = np.setdiff1d(cut.classes, drop)
                if t.suite_parts:
                    t.suite_parts["beforeTestClasses"] = np.setdiff1d(arr(t.suite_parts["beforeTestClasses"]), drop).tolist()
        samples_file = os.path.join(work, "second-samples.json")
        self.second_samples = json.load(open(samples_file)) if os.path.exists(samples_file) else []
        static_file = os.path.join(work, "static-align.json")
        self.static = json.load(open(static_file))["tests"] if os.path.exists(static_file) else {}
        self.by_key = {t.key: t for t in self.tests}
        self.suite_summary = compose_suites(self) if compose else None

    def assertions(self, t, level):
        """(cut position, key, display) for each recorded assertion of a test, in order.

        Assertions tied to a source line are keyed by that line, the rest by their message at the given level.
        """
        out = []
        for cut in t.cuts:
            sources = self.static.get(str(cut.owner), {}).get("asserts", {})
            for k, a in enumerate(cut.asserts[level]):
                message = self.assert_text(level, a)
                src = sources.get(f"{cut.index}:{k}")
                if src:
                    via = f" (via {src['via'][0]})" if src["via"] else ""
                    out.append((cut.pos, f"src {src['text']}{via}", f"{src['text']}{via}  ⟵ {message}"))
                else:
                    out.append((cut.pos, f"msg {message}", message))
        return out

    def fn_label(self, fn):
        name = self.vocab["fnNames"][fn]
        return f'{self.vocab["fns"][fn]} {name}'.strip()

    def token_text(self, level, token):
        return self.vocab["tokens"][level][token]

    def assert_text(self, level, a):
        return self.vocab["asserts"][level][a]

    def tree(self, level):
        if level not in self.trees:
            self.trees[level] = Tree(self, level)
        return self.trees[level]

    def top(self, ids, kind, n=5):
        """Most common files/modules among fn or class ids."""
        if kind == "files":
            names = [self.files[self.fn_file_id[i]] for i in ids]
        elif kind == "fe_modules":
            names = [self.file_module[self.fn_file_id[i]] for i in ids]
        elif kind == "fe_areas":
            names = [self.file_area[self.fn_file_id[i]] for i in ids]
        elif kind == "be_ns":
            names = [self.class_ns[i] for i in ids]
        elif kind == "be_modules":
            names = [self.class_module[i] for i in ids]
        else:
            raise ValueError(kind)
        return collections.Counter(names).most_common(n)


def union(arrays):
    return np.unique(np.concatenate(arrays)) if arrays else arr([])


def has_hooks(t):
    return t.suite_prefix > 0 or any(c.phase == "before all" for c in t.cuts)


def compose_suites(run):
    """Gives every test of a describe with `before` hooks those hooks' commands, cuts and code, at the start of its path.

    The hooks run once, inside the describe's first test, so the capture records them on that test only.
    The describes above a test come from static-tests.mjs, matched against its full title by static_align.py.
    """
    tests = run.tests
    chains = {}
    members = collections.defaultdict(list)
    unparsed_titles = []
    for t in tests:
        info = run.static.get(str(t.id))
        suites = info.get("suites") if info else []
        if suites is None:
            unparsed_titles.append(t.key)
            suites = []
        chains[t.id] = [key for _, key in suites]
        for key in chains[t.id]:
            members[key].append(t.id)

    hook_test = {}
    for key, ids in members.items():
        first = next((i for i in sorted(ids) if has_hooks(tests[i])), None)
        if first is not None:
            hook_test[key] = first
    # Hooks recorded by a test that no parsed describe explains form a group of that test alone.
    lone = [t.id for t in tests if has_hooks(t) and not any(hook_test.get(key) == t.id for key in chains[t.id])]
    for tid in lone:
        key = f"{tests[tid].key}::before"
        chains[tid] = chains[tid] + [key]
        members[key].append(tid)
        hook_test[key] = tid

    # Nested describes whose `before` hooks all run in the same first test can't be told apart by their events,
    # so the innermost of them gets all of the hooks.
    sharing_a_first_test = []
    parts = {}
    for key, c in hook_test.items():
        ct = tests[c]
        recorded_here = [k for k in chains[c] if hook_test.get(k) == c]
        if key != recorded_here[-1]:
            sharing_a_first_test.append(key)
            continue
        n = ct.suite_prefix
        hook_cuts = [cut for cut in ct.cuts if cut.phase == "before all"]
        sp = ct.suite_parts or {}
        parts[key] = {
            "test": c,
            "tokens": {level: ct.tokens[level][:n] for level in LEVELS},
            "helpers": ct.helpers[:n],
            "terminal": ct.terminal[:n],
            "phases": ct.phases[:n],
            "cuts": hook_cuts,
            "fns": union([cut.fns for cut in hook_cuts]),
            "classes": union([cut.classes for cut in hook_cuts] + [arr(sp.get("beforeTestClasses", []))]),
            "routes": sp.get("routes", []),
            "pages": sp.get("pages", []),
        }

    changed = 0
    for t in tests:
        groups = [key for key in chains[t.id] if key in parts]
        if not groups and not has_hooks(t):
            continue
        if has_hooks(t):
            hook_cuts = [cut for cut in t.cuts if cut.phase == "before all"]
            body_cuts = [cut for cut in t.cuts if cut.phase != "before all"]
            t.fns = np.setdiff1d(t.fns, np.setdiff1d(union([c.fns for c in hook_cuts]), union([c.fns for c in body_cuts])))
            t.classes = np.setdiff1d(t.classes, np.setdiff1d(union([c.classes for c in hook_cuts]), union([c.classes for c in body_cuts])))
            if t.suite_parts:
                t.routes = t.suite_parts["ownRoutes"]
                t.pages = t.suite_parts["ownPages"]
            if any(parts[key]["test"] == t.id for key in groups):
                t.suite_ms = (t.suite_parts or {}).get("suiteMs", 0)
        tokens = {level: [] for level in LEVELS}
        helpers, terminal, phases, cuts = [], [], [], []
        offset = 0
        for key in groups:
            P = parts[key]
            for level in LEVELS:
                tokens[level].append(P["tokens"][level])
            helpers += P["helpers"]
            terminal += P["terminal"]
            phases += P["phases"]
            cuts += [cut.moved(cut.pos + offset) for cut in P["cuts"]]
            offset += len(P["helpers"])
        start = t.suite_prefix
        for level in LEVELS:
            t.tokens[level] = np.concatenate(tokens[level] + [t.tokens[level][start:]]).astype(np.int32)
        t.helpers = helpers + t.helpers[start:]
        t.terminal = terminal + t.terminal[start:]
        t.phases = phases + t.phases[start:]
        t.cuts = cuts + [cut.moved(cut.pos - start + offset) for cut in t.cuts if cut.phase != "before all"]
        t.fns = union([t.fns] + [parts[key]["fns"] for key in groups])
        t.classes = union([t.classes] + [parts[key]["classes"] for key in groups])
        t.routes = sorted(set(t.routes).union(*[parts[key]["routes"] for key in groups]))
        t.pages = sorted(set(t.pages).union(*[parts[key]["pages"] for key in groups]))
        t.suites = groups
        changed += 1

    return {
        "describes_with_before_hooks": len(members),
        "describes_with_recorded_hooks": len(parts),
        "describes_without_recorded_hooks": sorted(set(members) - set(hook_test)),
        "tests_in_those_describes": len({i for key in parts for i in members[key]}),
        "tests_changed": changed,
        "hook_tokens": {key: int(len(P["helpers"])) for key, P in parts.items()},
        "hook_cuts": {key: len(P["cuts"]) for key, P in parts.items()},
        "members": {key: len(members[key]) for key in parts},
        "recorded_by": {key: tests[P["test"]].key for key, P in parts.items()},
        "hooks_without_a_parsed_describe": [tests[i].key for i in lone],
        "nested_describes_sharing_a_first_test": sharing_a_first_test,
        "titles_the_describe_chain_does_not_match": unparsed_titles,
    }


ACTION_VERBS = re.compile(
    r"\.?(click|dblclick|rightclick|type|clear|check|uncheck|select|trigger|focus|blur|submit|scrollIntoView|"
    r"scrollTo|selectFile|realClick|realHover|realPress|realType|realMouseDown|realMouseUp|realMouseMove|paste)\("
)


def token_kind(text):
    body = re.sub(r"^(before each|after each|before all|after all|between): ", "", text)
    if body.startswith("request "):
        return "setup"
    if body.startswith("visit(") or body.startswith("reload(") or body.startswith("go("):
        return "page"
    if body.startswith("intercept(") or body.startswith("wait(") or body.startswith("clock(") or body.startswith("tick("):
        return "sync"
    if body.startswith(("signIn", "setCookie", "clearCookie", "exec(", "viewport(", "restore", "signOut")):
        return "setup"
    if ACTION_VERBS.search(body):
        return "action"
    if ".should(" in body or ".and(" in body:
        return "check"
    return "selector"


KIND_RANK = {"page": 0, "action": 1, "setup": 2, "check": 3, "selector": 4, "sync": 5}


class Tree:
    """Radix tree over one level's token paths, so a node is a run of tokens that the same set of tests share.

    A trie node is kept as a graph node when it is the root, branches, or ends some test's path,
    and every other trie node belongs to the kept node below it.
    """

    def __init__(self, run, level):
        self.run = run
        self.level = level
        children = [dict()]
        parent = [-1]
        token = [-1]
        ends = collections.defaultdict(list)
        self.trie_paths = []
        for t in run.tests:
            node = 0
            path = [0]
            for tok in t.tokens[level].tolist():
                nxt = children[node].get(tok)
                if nxt is None:
                    nxt = len(children)
                    children.append({})
                    parent.append(node)
                    token.append(tok)
                    children[node][tok] = nxt
                node = nxt
                path.append(node)
            ends[node].append(t.id)
            self.trie_paths.append(path)
        n = len(children)
        kept = np.zeros(n, dtype=bool)
        kept[0] = True
        for i in range(n):
            if len(children[i]) != 1 or i in ends:
                kept[i] = True
        # Each trie node maps to the kept node at or below it on its unary chain.
        # Children have higher ids than their parents, so a reverse walk resolves the child first.
        radix_of = np.full(n, -1, dtype=np.int64)
        for i in range(n - 1, -1, -1):
            if kept[i]:
                radix_of[i] = i
            else:
                (only,) = children[i].values()
                radix_of[i] = radix_of[only]
        kept_ids = np.nonzero(kept)[0]
        self.node_index = {int(k): j for j, k in enumerate(kept_ids)}
        self.nodes = []
        for k in kept_ids.tolist():
            run_tokens = []
            x = k
            while x != 0:
                run_tokens.append(token[x])
                x = parent[x]
                if kept[x]:
                    break
            run_tokens.reverse()
            parent_kept = x if k != 0 else -1
            depth_end = 0
            y = k
            while y != 0:
                depth_end += 1
                y = parent[y]
            self.nodes.append(
                {
                    "id": self.node_index[k],
                    "parent": self.node_index[parent_kept] if parent_kept >= 0 else -1,
                    "tokens": run_tokens,
                    "start": depth_end - len(run_tokens),
                    "end": depth_end,
                    "tests": [],
                    "ends": [t for t in ends.get(k, [])],
                    "children": [],
                }
            )
        for node in self.nodes:
            if node["parent"] >= 0:
                self.nodes[node["parent"]]["children"].append(node["id"])
        self.radix_of = radix_of
        self.paths = []
        for t, path in zip(run.tests, self.trie_paths):
            nodes = []
            for trie_node in path:
                r = self.node_index[int(radix_of[trie_node])]
                if not nodes or nodes[-1] != r:
                    nodes.append(r)
            self.paths.append(nodes)
            for r in nodes:
                self.nodes[r]["tests"].append(t.id)

    def node_at(self, test_id, pos):
        """The node holding the pos-th token of a test's path (the root for pos 0)."""
        return self.node_index[int(self.radix_of[self.trie_paths[test_id][pos]])]

    def node_label(self, node, width=140):
        if not node["tests"]:
            return ""
        t = self.run.tests[node["tests"][0]]
        lo, hi = node["start"], node["end"]
        return run_label(self.run, self.level, node["tokens"], width, t.helpers[lo:hi], t.terminal[lo:hi])


PHASE_PREFIX = re.compile(r"^(before each|after each|before all|after all|between): ")


def run_label(run, level, tokens, width=140, helpers=None, terminal=None):
    """Short description of a token run: the helpers that issued it, or the statements themselves."""
    parts = []
    seen = set()
    for i, tok in enumerate(tokens):
        text = run.token_text(level, tok)
        helper = helpers[i] if helpers is not None else None
        if helper is not None and helper >= 0:
            part = run.vocab["helpers"][helper]
        elif terminal is not None and not terminal[i]:
            continue
        else:
            part = PHASE_PREFIX.sub("", text)[:60]
        if part not in seen:
            seen.add(part)
            parts.append(part)
    if not parts and len(tokens):
        parts.append(PHASE_PREFIX.sub("", run.token_text(level, tokens[-1]))[:60])
    label = ", ".join(parts)
    return label if len(label) <= width else label[: width - 1] + "…"


def lcp(a, b):
    n = min(len(a), len(b))
    if n == 0:
        return 0
    diff = np.nonzero(a[:n] != b[:n])[0]
    return int(diff[0]) if len(diff) else n


def jaccard(a, b):
    a = set(a.tolist() if hasattr(a, "tolist") else a)
    b = set(b.tolist() if hasattr(b, "tolist") else b)
    union = len(a | b)
    return len(a & b) / union if union else 1.0
