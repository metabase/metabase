#!/usr/bin/env python3
"""Assess which papercuts are ready for an automated fix, and run a fixer for the papercuts people dispatch. See
papercuts/plan.md, phases 2 and 3.

`assess` polls the papercuts server for papercuts that changed, decides a verdict for each open one and records it.
Dispatch is manual: someone presses Dispatch in the web view, which claims the papercut, or runs `dispatch --id`.
`watch` picks up each claimed papercut, creates a Linear issue, runs a headless Claude Code fixer in its own worktree,
opens a draft PR from its result and records the outcome."""

import argparse
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


JEV_URL = "https://api.typesafe.ai/v1/systemone"
ACTOR = "dispatcher"
REPO_OWNERS = ("repo-code", "repo-tooling")
OWNERS = {
    "repo-code": "Metabase product or library code: the fix is a change to application source or its tests.",
    "repo-tooling": "Tooling that lives in the Metabase repository: build scripts, mage tasks, linters, CI config, "
                    "test runners, developer docs, CLAUDE.md or skills checked into the repo.",
    "personal-tooling": "One developer's own setup: shell config, dotfiles, personal scripts, local memory notes.",
    "third-party": "A tool or service Metabase does not own: git, GitHub, a package manager, a database, an "
                   "external API.",
    "harness": "The coding-agent harness itself: Claude Code or Codex behaviour, its tools, permissions or sandbox.",
    "agent-practice": "An agent habit or judgement error with no code or tooling defect behind it.",
}
FIXABILITY_LEVELS = ["unclear cause", "needs design or product decision", "scoped change, several files",
                     "small, local change"]
SCOPED_CHANGE = FIXABILITY_LEVELS.index("scoped change, several files")
# Starting values, tuned on the archive import; override with --set key=value.
THRESHOLDS = {
    "min_reporters": 2,
    "min_reports": 3,
    "min_cost_minutes": 60,
    "fixability_confidence": 0.7,
    "actionable": 0.7,
    "still_plausible": 0.5,
    "owner_confidence": 0.7,
    # Probability of the verdict an AI suggestion needs before a person is shown it.
    "duplicate": 0.5,
    "related": 0.5,
}
# Weights of the normalized evidence inputs in evidence_score, for ranking only.
EVIDENCE_WEIGHTS = {"reporters": 0.35, "reports": 0.3, "cost": 0.2, "severity": 0.15}
SEVERITY_WEIGHT = {"high": 1.0, "medium": 0.5, "low": 0.0}
ACTIVE_DISPATCH_STATES = ("claimed", "linear_created", "running")
CONTEXT = ("A papercut reported against the Metabase monorepo (Clojure backend, TypeScript/React frontend, "
           "developer tooling). A papercut is a small defect in code, tooling or docs that slows down or misleads "
           "developers or coding agents. `reports` are excerpts from separate sightings of the same papercut.")
MAX_DESCRIPTION = 4000
MAX_EXCERPT = 1200
MAX_EXCERPTS = 3
JEV_WORKERS = 8
LINEAR_URL = "https://api.linear.app/graphql"
# Project "Hackathon 2026: Papercut Tracker".
LINEAR_PROJECT = "9abf9cc60925"
LINEAR_LABEL = "papercut-dispatch"
FIXER_DIR = Path(__file__).with_name("fixer")
RUNS_DIR = Path(__file__).with_name("runs")
# A stale ControlMaster socket can hang git over SSH, and some connections to GitHub stall for a minute.
GIT_SSH = {"GIT_SSH_COMMAND": "ssh -o ControlMaster=no -o ControlPath=none -o ConnectTimeout=10"}
# The only commands the fixer may run; anything else is denied, since nobody answers its permission prompts.
FIXER_BASH = ["Bash(./bin/test-agent:*)", "Bash(bun install --frozen-lockfile)", "Bash(bun run test-unit-keep-cljs:*)",
              "Bash(git diff:*)", "Bash(git status:*)", "Bash(git log:*)", "Bash(git show:*)"]
# A parent Claude Code session's variables, the dispatcher's own credentials, and Metabase settings that would
# reach the fixer's test JVM.
SCRUBBED_ENV = re.compile(r"^(CLAUDE|ANTHROPIC|MB_|PAPERCUTS_|LINEAR_|JEV_|TYPESAFE_)")


class JevError(RuntimeError):
    pass


def evidence(papercut, thresholds):
    """Whether the counts pass the evidence rule, and a normalized score for ranking."""
    reporters, reports = papercut["reporter_count"], papercut["report_count"]
    cost, severity = papercut["cost_minutes"] or 0, papercut.get("severity")
    passed = [name for name, ok in (
        ("reporters", reporters >= thresholds["min_reporters"]),
        ("reports", reports >= thresholds["min_reports"]),
        ("cost", cost >= thresholds["min_cost_minutes"]),
        ("severity", severity == "high" and reports >= 1),
    ) if ok]
    parts = {
        "reporters": min(reporters / thresholds["min_reporters"], 1),
        "reports": min(reports / thresholds["min_reports"], 1),
        "cost": min(cost / thresholds["min_cost_minutes"], 1),
        "severity": SEVERITY_WEIGHT.get(severity, 0.0),
    }
    score = round(sum(EVIDENCE_WEIGHTS[key] * value for key, value in parts.items()), 3)
    return passed, score


def jev_state(papercut):
    excerpts = []
    for report in papercut.get("reports", []):
        text = (report.get("description") or report.get("title") or "")[:MAX_EXCERPT]
        if text and text != papercut["description"][:MAX_EXCERPT] and text not in excerpts:
            excerpts.append(text)
        if len(excerpts) == MAX_EXCERPTS:
            break
    state = {"context": CONTEXT, "title": papercut["title"],
             "description": papercut["description"][:MAX_DESCRIPTION]}
    location = ", ".join(value for value in (papercut.get("area"), papercut.get("path")) if value)
    if location:
        state["location"] = location
    if excerpts:
        state["reports"] = excerpts
    return state


def jev_questions(ask_owner):
    questions = {
        "fixability": {
            "type": "score",
            "instructions": "How well understood and how contained is the fix for this papercut in the Metabase "
                            "repository?",
            "criteria": FIXABILITY_LEVELS,
        },
        "actionable": {
            "type": "noul",
            "instructions": "Does the description name a concrete location or mechanism a developer could act on?",
            "criteria": {"true": "It names files, functions, commands, config or a specific mechanism to change.",
                         "false": "It describes a symptom or feeling without saying where or what to change."},
        },
        "still_plausible": {
            "type": "noul",
            "instructions": "Could this papercut still be present today?",
            "criteria": {"true": "Nothing in the text says the problem was fixed, removed or made moot.",
                         "false": "The text says the problem has already been fixed or no longer applies."},
        },
    }
    if ask_owner:
        questions["owner"] = {"type": "choice", "instructions": "Where would the fix for this papercut go?",
                              "criteria": OWNERS}
    return questions


def ask_jev(state, questions, api_key, model="jev-latest", tries=4, timeout=45):
    """One System One request. Retries network errors, 429 and 5xx; other errors (auth, validation, a WAF 403)
    fail at once."""
    body = json.dumps({"model": model, "state": state, "questions": questions}).encode()
    error = None
    for attempt in range(tries):
        if attempt:
            time.sleep(2 ** attempt)
        request = Request(JEV_URL, body, {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except HTTPError as http_error:
            error = f"{http_error.code} {http_error.read()[:300].decode(errors='replace')}"
            if http_error.code != 429 and http_error.code < 500:
                break
        except (URLError, TimeoutError) as network_error:
            error = repr(network_error)
    raise JevError(error)


def decide(papercut, thresholds, jev=None):
    """The assessment payload for a papercut, or None when it is not a candidate at all. `jev` takes a state and
    questions and returns System One's response; it is only called when the code gates and evidence pass."""
    if papercut.get("merged_into") is not None or papercut["status"] != "open":
        return None
    passed, evidence_score = evidence(papercut, thresholds)
    owner = papercut.get("owner")
    inputs = {key: papercut[key] for key in ("report_count", "reporter_count", "cost_minutes")}
    inputs |= {"owner": owner, "severity": papercut.get("severity"), "evidence_passed": passed}
    assessment = {"evidence_score": evidence_score, "inputs": inputs, "actor": ACTOR}

    def verdict(value, reason):
        return assessment | {"verdict": value, "reason": reason}

    if active := [d["id"] for d in papercut.get("dispatches", []) if d["state"] in ACTIVE_DISPATCH_STATES]:
        return verdict("not_ready", f"Dispatch {active[0]} is in progress")
    if owner and owner not in REPO_OWNERS:
        return verdict("not_ready", f"Owner is {owner}; only repo-owned papercuts are fixed by a PR")
    if not passed:
        return verdict("not_ready", "Not enough evidence yet")

    response = jev(jev_state(papercut), jev_questions(ask_owner=owner is None))
    answers = response["answers"]
    inputs["jev"] = answers
    assessment["model"] = response.get("model")
    fixability = answers["fixability"]
    level = max(range(len(FIXABILITY_LEVELS)), key=lambda index: fixability["probabilities"].get(str(index), 0))
    assessment["fixability_score"] = round(fixability["score"], 3)
    assessment["fixability_confidence"] = round(fixability["confidence"], 3)
    actionable, plausible = answers["actionable"]["noul"], answers["still_plausible"]["noul"]
    unsure = []
    if owner is None:
        guess = answers["owner"]
        inputs["owner_guess"] = {"owner": guess["choice"], "confidence": guess["confidence"]}
        if guess["confidence"] < thresholds["owner_confidence"]:
            unsure.append(f"owner (guess {guess['choice']}, confidence {guess['confidence']:.2f})")
        elif guess["choice"] not in REPO_OWNERS:
            return verdict("not_ready", f"Jev places the fix in {guess['choice']} "
                                        f"(confidence {guess['confidence']:.2f}); only repo-owned papercuts are fixed")
    if fixability["confidence"] < thresholds["fixability_confidence"]:
        unsure.append(f"fixability (confidence {fixability['confidence']:.2f})")
    if unsure:
        return verdict("needs_human", "Evidence passes; low confidence in " + " and ".join(unsure))
    if plausible < thresholds["still_plausible"]:
        return verdict("not_ready", f"The text says it may already be fixed (still_plausible {plausible:.2f})")
    if level < SCOPED_CHANGE:
        return verdict("not_ready", f"Fix is '{FIXABILITY_LEVELS[level]}'")
    if actionable < thresholds["actionable"]:
        return verdict("not_ready", f"Not actionable enough (actionable {actionable:.2f})")
    return verdict("ready", f"Evidence: {', '.join(passed)}; fix is '{FIXABILITY_LEVELS[level]}' "
                            f"(confidence {fixability['confidence']:.2f}); actionable {actionable:.2f}")


RELATIONS = {
    "duplicate": "The same papercut: the same trap or mechanism, even if worded differently or seen from another "
                 "angle. One fix would remove both, so merging them loses nothing.",
    "related": "A different papercut worth reading alongside: the same tool, file or family of cause, but it needs its "
               "own fix.",
    "unrelated": "Different problems that only share words or a broad area.",
}
CANDIDATES = 12


def relation_state(papercut, candidates):
    """The papercut in full, as for assessment, and each candidate by its title, description and location."""
    def brief(candidate):
        location = ", ".join(value for value in (candidate.get("area"), candidate.get("path")) if value)
        return ({"title": candidate["title"], "description": candidate["description"][:MAX_EXCERPT]}
                | ({"location": location} if location else {}))

    subject = {key: value for key, value in jev_state(papercut).items() if key != "context"}
    return {"context": CONTEXT + " `papercut` is one papercut; each entry of `candidates` is another from the same "
                                 "repository, picked because it shares a path or words with it.",
            "papercut": subject, "candidates": {f"c{c['id']}": brief(c) for c in candidates}}


def relation_questions(candidates):
    return {f"c{c['id']}": {"type": "choice", "criteria": RELATIONS,
                            "instructions": f"How does `candidates.c{c['id']}` relate to `papercut`?"}
            for c in candidates}


def judge_relations(papercut, candidates, thresholds, jev):
    """The model and the suggestions to record for `papercut`. Jev only weighs each pair; which ones a person sees is
    decided here, by threshold."""
    if not candidates:
        return None, []
    response = jev(relation_state(papercut, candidates), relation_questions(candidates))
    suggestions = []
    for candidate in candidates:
        probabilities = response["answers"][f"c{candidate['id']}"]["probabilities"]
        for verdict in ("duplicate", "related"):
            if probabilities.get(verdict, 0) >= thresholds[verdict]:
                suggestions.append({"papercut_id": candidate["id"], "verdict": verdict,
                                    "score": round(probabilities[verdict], 3)})
                break
    return response.get("model"), suggestions


def text_digest(papercut):
    """What a relation judgment depends on. New reports don't change it, so they don't cost another Jev call."""
    text = "\0".join(papercut.get(key) or "" for key in ("title", "description", "path", "area"))
    return hashlib.sha256(text.encode()).hexdigest()[:16]


class Server:
    def __init__(self, url, token=None):
        self.url, self.token = url.rstrip("/"), token

    def request(self, method, route, payload=None):
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        data = json.dumps(payload).encode() if payload is not None else None
        with urlopen(Request(self.url + route, data=data, headers=headers, method=method), timeout=30) as response:
            return json.load(response)

    def changed(self, since=None, repository=None):
        """Every papercut changed after `since` (every live one without it), and the cursor to resume from. Reads
        all pages before anything is written, because assessing a papercut moves it within the change feed."""
        query = {"sort": "updated", "limit": 500}
        if since:
            query["since"] = since
        if repository:
            query["repository"] = repository
        papercuts, offset, cursor = [], 0, None
        while offset is not None:
            page = self.request("GET", "/api/papercuts?" + urlencode(query | {"offset": offset}))
            cursor = cursor or page["cursor"]
            papercuts.extend(page["papercuts"])
            offset = page["next_offset"]
        return papercuts, cursor or since


def load_state(path):
    try:
        return json.loads(Path(path).read_text())
    except FileNotFoundError:
        return {}


def up_to_date(papercut):
    """Nothing about the papercut changed since its latest assessment was recorded."""
    latest = papercut.get("assessment")
    return latest is not None and latest["at"] >= papercut["updated_at"]


def assess(server, jev, thresholds, since=None, repository=None, ids=None, dry_run=False, full=False, out=sys.stdout):
    """Assess changed papercuts. Returns the new cursor, or None when some papercut failed and the same window
    must be polled again."""
    if ids:
        candidates, cursor = [{"id": papercut_id} for papercut_id in ids], None
    else:
        candidates, cursor = server.changed(since, repository)
    papercuts = []
    for candidate in candidates:
        if candidate.get("merged_into") is not None:
            continue
        papercut = server.request("GET", f"/api/papercuts/{candidate['id']}?reports_limit=20")
        if papercut.get("merged_into") is None and (full or ids or not up_to_date(papercut)):
            papercuts.append(papercut)

    def attempt(papercut):
        try:
            return decide(papercut, thresholds, jev)
        except (JevError, KeyError) as error:
            return error

    # Connecting to Jev can stall for half a minute, so its requests run in parallel.
    with ThreadPoolExecutor(max_workers=JEV_WORKERS) as pool:
        results = list(pool.map(attempt, papercuts))
    failed, verdicts = False, {}
    for papercut, assessment in zip(papercuts, results):
        if isinstance(assessment, Exception):
            print(f"#{papercut['id']} jev failed: {assessment!r}", file=out, flush=True)
            failed = True
            continue
        if assessment is None:
            continue
        verdicts[assessment["verdict"]] = verdicts.get(assessment["verdict"], 0) + 1
        print(f"#{papercut['id']} {assessment['verdict']} evidence={assessment['evidence_score']} "
              f"fixability={assessment.get('fixability_score')} {papercut['title'][:80]} | {assessment['reason']}",
              file=out, flush=True)
        if not dry_run:
            server.request("POST", f"/api/papercuts/{papercut['id']}/assessments", assessment)
    print("verdicts: " + (json.dumps(verdicts) if verdicts else "none"), file=out)
    return None if failed else cursor


def relate(server, jev, thresholds, since=None, repository=None, ids=None, judged=None, dry_run=False, full=False,
           limit=CANDIDATES, out=sys.stdout):
    """Suggest duplicates and related papercuts for each changed papercut whose text changed since it was last judged.
    Returns the new cursor, or None when some papercut failed and the same window must be polled again, and the
    updated map of papercut id to the digest of the text judged."""
    judged = dict(judged or {})
    if ids:
        changed, cursor = [{"id": papercut_id} for papercut_id in ids], None
    else:
        changed, cursor = server.changed(since, repository)
    work = []
    for item in changed:
        if item.get("merged_into") is not None:
            continue
        papercut = server.request("GET", f"/api/papercuts/{item['id']}?reports_limit=20")
        digest = text_digest(papercut)
        if papercut.get("merged_into") is not None or (judged.get(str(papercut["id"])) == digest and not (full or ids)):
            continue
        candidates = server.request("GET", f"/api/papercuts/{papercut['id']}/candidates?limit={limit}")["candidates"]
        work.append((papercut, candidates, digest))

    def attempt(item):
        try:
            return judge_relations(item[0], item[1], thresholds, jev)
        except (JevError, KeyError) as error:
            return error

    with ThreadPoolExecutor(max_workers=JEV_WORKERS) as pool:
        results = list(pool.map(attempt, work))
    failed = False
    for (papercut, candidates, digest), result in zip(work, results):
        if isinstance(result, Exception):
            print(f"#{papercut['id']} jev failed: {result!r}", file=out, flush=True)
            failed = True
            continue
        model, suggestions = result
        found = ", ".join(f"#{s['papercut_id']} {s['verdict']} {s['score']:.2f}" for s in suggestions) or "nothing"
        print(f"#{papercut['id']} {papercut['title'][:70]} | {len(candidates)} candidates: {found}", file=out, flush=True)
        if not dry_run:
            server.request("POST", f"/api/papercuts/{papercut['id']}/suggestions",
                           {"model": model, "actor": ACTOR, "suggestions": suggestions,
                            # Only pairs with the candidates judged here are replaced, not ones another papercut's
                            # run suggested.
                            "judged": [candidate["id"] for candidate in candidates]})
            judged[str(papercut["id"])] = digest
    return None if failed else cursor, judged


class DispatchError(RuntimeError):
    pass


class Linear:
    def __init__(self, api_key, project_slug=LINEAR_PROJECT, label=LINEAR_LABEL):
        self.api_key, self.project_slug, self.label = api_key, project_slug, label
        self.project_id = self.team_id = self.label_id = None

    def graphql(self, query, variables=None):
        request = Request(LINEAR_URL, json.dumps({"query": query, "variables": variables or {}}).encode(),
                          {"Authorization": self.api_key, "Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=30) as response:
                body = json.load(response)
        except HTTPError as error:
            raise DispatchError(f"Linear: {error.code} {error.read()[:300].decode(errors='replace')}") from error
        if body.get("errors"):
            raise DispatchError(f"Linear: {body['errors']}")
        return body["data"]

    def connect(self):
        """Resolve the project, its team and the optional label once."""
        data = self.graphql("""query($id: String!, $label: String!) {
                                 project(id: $id) { id teams { nodes { id } } }
                                 issueLabels(filter: {name: {eq: $label}}) { nodes { id } } }""",
                            {"id": self.project_slug, "label": self.label})
        self.project_id = data["project"]["id"]
        self.team_id = data["project"]["teams"]["nodes"][0]["id"]
        labels = data["issueLabels"]["nodes"]
        self.label_id = labels[0]["id"] if labels else None
        return self

    def find_issue(self, marker):
        data = self.graphql("""query($project: ID!, $marker: String!) {
                                 issues(filter: {project: {id: {eq: $project}}, description: {contains: $marker}}) {
                                   nodes { id identifier url } } }""",
                            {"project": self.project_id, "marker": marker})
        nodes = data["issues"]["nodes"]
        return nodes[0] if nodes else None

    def create_issue(self, title, description, marker):
        """Create the issue, or return the one an interrupted earlier attempt created."""
        if existing := self.find_issue(marker):
            return existing
        issue = {"teamId": self.team_id, "projectId": self.project_id, "title": title,
                 "description": f"{description}\n\n`{marker}`"}
        if self.label_id:
            issue["labelIds"] = [self.label_id]
        data = self.graphql("""mutation($input: IssueCreateInput!) {
                                 issueCreate(input: $input) { issue { id identifier url } } }""", {"input": issue})
        return data["issueCreate"]["issue"]

    def comment(self, issue_id, body):
        self.graphql("mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }",
                     {"input": {"issueId": issue_id, "body": body}})


def run(args, cwd, env=None, timeout=600):
    result = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise DispatchError(f"{' '.join(args[:3])}: {(result.stderr or result.stdout).strip()[-400:]}")
    return result.stdout.strip()


def with_retries(job, tries=3):
    for attempt in range(tries):
        try:
            return job()
        except (DispatchError, subprocess.TimeoutExpired):
            if attempt == tries - 1:
                raise
            time.sleep(5)


def slug(text, length=40):
    result = ""
    for word in re.findall(r"[a-z0-9]+", text.lower()):
        if len(result) + len(word) + 1 > length:
            break
        result = f"{result}-{word}" if result else word
    return result or "fix"


def fixer_message(papercut):
    """The papercut as the fixer sees it: its text, distinct reports, related papercuts and the assessment."""
    lines = [f"# Papercut #{papercut['id']}: {papercut['title']}", "", papercut["description"], ""]
    for label, key in (("Area", "area"), ("Path", "path"), ("Owner", "owner"), ("Severity", "severity")):
        if papercut.get(key):
            lines.append(f"{label}: {papercut[key]}")
    seen, reports = {papercut["description"]}, []
    for report in papercut.get("reports", []):
        if report["description"] and report["description"] not in seen:
            seen.add(report["description"])
            where = "".join((f" by {report['agent']}" if report.get("agent") else "",
                             f" on {report['branch']}" if report.get("branch") else ""))
            reports.append(f"- Seen {report.get('observed_at') or report['received_at']}{where}:\n  "
                           + report["description"][:MAX_EXCERPT].replace("\n", "\n  "))
    if reports:
        lines += ["", "## Other reports", *reports[:5]]
    if papercut.get("related"):
        lines += ["", "## Related papercuts", *(f"- #{r['id']} [{r['status']}] {r['title']}" for r in papercut["related"])]
    if (papercut.get("assessment") or {}).get("reason"):
        lines += ["", "## Why it was judged fixable", papercut["assessment"]["reason"]]
    return "\n".join(lines) + "\n"


def issue_description(papercut, server_url):
    assessment = papercut.get("assessment") or {}
    return "\n".join([
        papercut["description"],
        "",
        f"- Papercut: {server_url}/papercuts/{papercut['id']}",
        f"- Evidence: {papercut['report_count']} reports from {papercut['reporter_count']} reporters, "
        f"{papercut['cost_minutes'] or 0} minutes lost",
        f"- Owner: {papercut.get('owner') or 'unknown'}; severity: {papercut.get('severity') or 'unknown'}",
        f"- Assessment: {assessment.get('reason') or 'none'}",
        "",
        "A headless Claude Code fixer is working on this papercut. It opens a draft PR or explains here why not.",
    ])


def pr_body(result):
    checked = "x" if result["tests"] else " "
    return (f"### Description\n\n{result['problem']}\n\n{result['solution']}\n\n"
            f"### How to verify\n\n{result['how_to_verify']}\n\n"
            f"### Checklist\n\n- [{checked}] Tests have been added/updated to cover changes in this PR\n")


def fixer_env():
    return {key: value for key, value in os.environ.items() if not SCRUBBED_ENV.match(key)}


class Fixer:
    """Runs the headless Claude Code fixer in a worktree, and turns its result into a commit and a draft PR."""

    def __init__(self, repo, worktrees, model="opus", budget_usd=10.0, timeout_minutes=40, base="master"):
        self.repo, self.worktrees = Path(repo), Path(worktrees)
        self.model, self.budget_usd, self.timeout_minutes, self.base = model, budget_usd, timeout_minutes, base
        self.claude = os.environ.get("CLAUDE_BIN") or shutil.which("claude")

    def prepare(self, branch, name):
        worktree = self.worktrees / name
        with_retries(lambda: run(["git", "fetch", "-q", "origin", self.base], self.repo, os.environ | GIT_SSH))
        if worktree.exists():
            run(["git", "worktree", "remove", "--force", str(worktree)], self.repo)
        self.worktrees.mkdir(parents=True, exist_ok=True)
        run(["git", "worktree", "add", "-q", "-B", branch, str(worktree), f"origin/{self.base}"], self.repo)
        (worktree / "target").mkdir(exist_ok=True)
        return worktree

    def launch(self, worktree, message, log_path):
        """Run the agent until it finishes or times out. Returns its final `result` message, or None."""
        if not self.claude:
            raise DispatchError("claude is not on PATH; set CLAUDE_BIN")
        args = [self.claude, "-p", message,
                "--append-system-prompt-file", str(FIXER_DIR / "prompt.md"),
                "--json-schema", (FIXER_DIR / "result.schema.json").read_text(),
                "--output-format", "stream-json", "--verbose",
                "--model", self.model, "--max-budget-usd", str(self.budget_usd),
                "--tools", "Read,Edit,Write,Grep,Glob,Bash",
                "--allowedTools", *FIXER_BASH,
                "--permission-mode", "acceptEdits", "--permission-prompts", "none",
                "--strict-mcp-config", "--setting-sources", "project,local", "--no-session-persistence"]
        with open(log_path, "w") as log:
            child = subprocess.Popen(args, cwd=worktree, env=fixer_env(), stdin=subprocess.DEVNULL, stdout=log,
                                     stderr=subprocess.STDOUT, start_new_session=True)
            try:
                child.wait(timeout=self.timeout_minutes * 60)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGTERM)
                child.wait()
            except KeyboardInterrupt:
                # The fixer runs in its own session, so Ctrl-C doesn't reach it.
                os.killpg(child.pid, signal.SIGTERM)
                raise
        result = None
        for line in Path(log_path).read_text().splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(event, dict) and event.get("type") == "result":
                result = event
        return result

    def changed(self, worktree):
        return bool(run(["git", "status", "--porcelain"], worktree))

    def commit(self, worktree, title):
        run(["git", "add", "-A"], worktree)
        run(["git", "rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", ".claude", ".bot"], worktree)
        if not run(["git", "diff", "--cached", "--name-only"], worktree):
            raise DispatchError("The fixer changed only local state (.claude or .bot)")
        # Signing can need a passphrase prompt that nobody answers.
        run(["git", "-c", "commit.gpgsign=false", "commit", "-q", "-m", title], worktree)

    def open_pr(self, worktree, branch, title, body):
        with_retries(lambda: run(["git", "push", "-q", "-u", "origin", branch], worktree, os.environ | GIT_SSH))
        return run(["gh", "pr", "create", "--draft", "--base", self.base, "--head", branch, "--title", title,
                    "--body", body], worktree)

    def remove(self, worktree):
        run(["git", "worktree", "remove", "--force", str(worktree)], self.repo)


def claim(server, papercut):
    """Claim a papercut, or None when another dispatcher got there first or it is no longer open."""
    payload = {"actor": ACTOR}
    if assessment := papercut.get("assessment"):
        payload["assessment_id"] = assessment["id"]
    try:
        return server.request("POST", f"/api/papercuts/{papercut['id']}/dispatch", payload)
    except HTTPError as error:
        if error.code == 409:
            return None
        raise


class Dispatcher:
    def __init__(self, server, linear, fixer, runs_dir=RUNS_DIR, out=sys.stdout):
        self.server, self.linear, self.fixer, self.runs_dir, self.out = server, linear, fixer, Path(runs_dir), out

    def log(self, message):
        print(message, file=self.out, flush=True)

    def update(self, dispatch, **changes):
        return self.server.request("PATCH", f"/api/dispatches/{dispatch['id']}", {"actor": ACTOR, **changes})

    def run(self, papercut, dispatch):
        """Take one claimed dispatch to a final state. A step an earlier attempt finished is skipped, and any
        failure ends the dispatch as `failed`."""
        run_dir = self.runs_dir / str(dispatch["id"])
        run_dir.mkdir(parents=True, exist_ok=True)
        try:
            if dispatch["state"] == "claimed":
                issue = self.linear.create_issue(papercut["title"], issue_description(papercut, self.server.url),
                                                 f"papercut-dispatch:{papercut['id']}:{dispatch['id']}")
                dispatch = self.update(dispatch, state="linear_created", linear_issue_id=issue["identifier"],
                                       linear_url=issue["url"])
                self.log(f"#{papercut['id']} Linear issue {issue['url']}")
            return self.fix(papercut, dispatch, run_dir)
        except Exception as error:
            self.log(f"#{papercut['id']} dispatch {dispatch['id']} failed: {error!r}")
            dispatch = self.update(dispatch, state="failed", reason=f"{type(error).__name__}: {error}"[:2000])
            self.notify(dispatch, f"Fixer outcome: **failed**\n\n{error}")
            return dispatch

    def fix(self, papercut, dispatch, run_dir):
        branch = f"{dispatch['linear_issue_id'].lower()}-papercut-{slug(papercut['title'])}"
        worktree = self.fixer.prepare(branch, f"papercut-{papercut['id']}-{dispatch['id']}")
        message = fixer_message(papercut)
        (run_dir / "message.md").write_text(message)
        log_path = run_dir / "agent.jsonl"
        dispatch = self.update(dispatch, state="running", branch=branch, run_log=str(log_path))
        self.log(f"#{papercut['id']} fixer running on {branch} in {worktree}")
        final = self.fixer.launch(worktree, message, log_path) or {}
        (run_dir / "result.json").write_text(json.dumps(final, indent=2) + "\n")
        costs = {"cost_usd": round(final["total_cost_usd"], 4)} if final.get("total_cost_usd") is not None else {}
        result = final.get("structured_output")
        if not result:
            why = f"The fixer stopped without a result ({final.get('subtype', 'timed out or crashed')})"
            return self.finish(dispatch, worktree, "failed", why, costs, keep=True)
        if result["outcome"] != "fixed":
            return self.finish(dispatch, worktree, result["outcome"], result["reason"] or result["outcome"], costs,
                               keep=self.fixer.changed(worktree))
        if not self.fixer.changed(worktree):
            return self.finish(dispatch, worktree, "failed", "The fixer reported a fix but changed nothing", costs)
        title = result["title"].splitlines()[0][:70]
        self.fixer.commit(worktree, title)
        if not result["tests_passed"]:
            return self.finish(dispatch, worktree, "needs_human",
                               f"The fix is committed on local branch {branch}, but its tests did not pass: "
                               f"{', '.join(result['tests'])}", costs, keep=True)
        pr_url = self.fixer.open_pr(worktree, branch, title, pr_body(result))
        return self.finish(dispatch, worktree, "pr_opened", f"{title}\n\n{result['solution']}",
                           costs | {"pr_url": pr_url})

    def finish(self, dispatch, worktree, state, reason, changes, keep=False):
        """Record the final state, tell Linear, and remove the worktree unless someone needs to look at it."""
        dispatch = self.update(dispatch, state=state, reason=reason[:2000], **changes)
        self.log(f"#{dispatch['papercut_id']} dispatch {dispatch['id']} {state}: {reason.splitlines()[0][:160]}")
        link = f"\n\nDraft PR: {dispatch['pr_url']}" if dispatch.get("pr_url") else ""
        where = f"\n\nWork kept in {worktree}" if keep else ""
        self.notify(dispatch, f"Fixer outcome: **{state}**\n\n{reason}{link}{where}")
        if not keep:
            self.fixer.remove(worktree)
        return dispatch

    def notify(self, dispatch, body):
        if not dispatch.get("linear_issue_id"):
            return
        try:
            self.linear.comment(dispatch["linear_issue_id"], body)
        except DispatchError as error:
            self.log(f"Linear comment on {dispatch['linear_issue_id']} failed: {error}")

    def pending(self):
        """Dispatches waiting for a dispatcher, oldest first: queued claims, and ones interrupted before the fixer
        started. Claims come from the web view or `dispatch --id`, whoever made them."""
        active = self.server.request("GET", "/api/dispatches?state=active")
        return sorted((d for d in active if d["state"] in ("claimed", "linear_created")), key=lambda d: d["id"])

    def process_pending(self):
        done = []
        for dispatch in self.pending():
            papercut = self.server.request("GET", f"/api/papercuts/{dispatch['papercut_id']}?reports_limit=20")
            self.log(f"#{papercut['id']} dispatch {dispatch['id']} ({dispatch['state']}, from {dispatch['actor']}): "
                     f"{papercut['title'][:90]}")
            done.append(self.run(papercut, dispatch))
        return done

    def watch(self, interval=5):
        """Work through dispatches as they are queued, one at a time, until interrupted. Run one watcher per server:
        two would both pick up the same claim."""
        self.log(f"Watching {self.server.url} for dispatches")
        while True:
            self.process_pending()
            time.sleep(interval)

    def dispatch(self, ids, live=False):
        """Claim these papercuts whatever their verdict and work through them, or with `live` off, only write the
        messages the fixer would get."""
        papercuts = [self.server.request("GET", f"/api/papercuts/{i}?reports_limit=20") for i in ids]
        if not live:
            self.runs_dir.mkdir(parents=True, exist_ok=True)
            for papercut in papercuts:
                path = self.runs_dir / f"dry-run-{papercut['id']}.md"
                path.write_text(fixer_message(papercut))
                self.log(f"would dispatch #{papercut['id']} {papercut['title'][:90]}; fixer message in {path}")
            return []
        for papercut in papercuts:
            if dispatch := claim(self.server, papercut):
                self.log(f"#{papercut['id']} claimed as dispatch {dispatch['id']}")
            else:
                self.log(f"#{papercut['id']} was not claimed: it is not open, or a dispatch is already in progress")
        return self.process_pending()


REPO_ROOT = Path(__file__).resolve().parents[1]
KEY_SOURCES = "the environment, mise.local.toml, .env or .lein-env"
# Runs from REPO_ROOT, where bb.edn puts mage on the classpath.
RESOLVE_ENV = "(require 'mage.bot.env) (some-> (mage.bot.env/resolve-env (first *command-line-args*)) print)"


def resolve_env(name):
    """The value of environment variable `name`, or else the one mage finds in mise.local.toml, .env or .lein-env.

    Asking mage keeps the dispatcher and the transcript scanner agreeing on where keys live."""
    if value := os.environ.get(name):
        return value
    # bin/bb is gitignored and installed by bin/mage, so a fresh checkout may only have Babashka on PATH.
    bundled = REPO_ROOT / "bin" / "bb"
    bb = str(bundled) if os.access(bundled, os.X_OK) else shutil.which("bb")
    if not bb:
        print(f"Can't look {name} up in {KEY_SOURCES}: Babashka isn't installed; run ./bin/mage once to install it",
              file=sys.stderr)
        return None
    try:
        result = subprocess.run([bb, "-e", RESOLVE_ENV, name], cwd=REPO_ROOT, capture_output=True, text=True,
                                timeout=60)
    except (OSError, subprocess.TimeoutExpired) as error:
        print(f"Can't look {name} up in {KEY_SOURCES}: {error}", file=sys.stderr)
        return None
    if result.returncode != 0:
        print(f"Can't look {name} up in {KEY_SOURCES}: {result.stderr.strip()[-300:]}", file=sys.stderr)
        return None
    return result.stdout.strip() or None


def jev_key():
    key = resolve_env("JEV_API_KEY") or resolve_env("TYPESAFE_API_KEY")
    if not key:
        sys.exit(f"Set JEV_API_KEY or TYPESAFE_API_KEY in {KEY_SOURCES}")
    return key


def parse_overrides(pairs):
    thresholds = dict(THRESHOLDS)
    for pair in pairs:
        key, _, value = pair.partition("=")
        if key not in thresholds:
            sys.exit(f"Unknown threshold {key}; one of: {', '.join(thresholds)}")
        thresholds[key] = type(thresholds[key])(value)
    return thresholds


def dispatch_main(server, args):
    live = args.command == "watch" or args.live
    repo = Path(args.repo)
    fixer = Fixer(repo, args.worktrees or repo.parent / "papercut-worktrees", model=args.model,
                  budget_usd=args.budget_usd, timeout_minutes=args.timeout_minutes, base=args.base)
    linear = None
    if live:
        linear_key = resolve_env("LINEAR_API_KEY")
        if not linear_key:
            sys.exit(f"Set LINEAR_API_KEY in {KEY_SOURCES}")
        linear = Linear(linear_key).connect()
        if not linear.label_id:
            print(f"No Linear label named {LINEAR_LABEL}; issues are created without it", file=sys.stderr)
    dispatcher = Dispatcher(server, linear, fixer)
    try:
        if args.command == "watch":
            dispatcher.watch(args.interval)
        else:
            dispatcher.dispatch(args.ids, args.live)
    except KeyboardInterrupt:
        print("Stopped", file=sys.stderr)


def add_fixer_arguments(command):
    command.add_argument("--repo", default=Path(__file__).resolve().parent.parent,
                         help="The Metabase checkout that worktrees are made from")
    command.add_argument("--worktrees", help="Where fixer worktrees go (default: papercut-worktrees next to --repo)")
    command.add_argument("--base", default="master")
    command.add_argument("--model", default="opus")
    command.add_argument("--budget-usd", type=float, default=10.0, help="Spending cap for each fixer run")
    command.add_argument("--timeout-minutes", type=int, default=40)


def relate_main(server, args, thresholds, jev, state):
    # Kept apart from the assess cursor, since each command follows the change feed at its own pace.
    name = f"relate {server.url}"
    saved = state.get(name, {})
    cursor, judged = relate(server, jev, thresholds, since=None if args.full else saved.get("cursor"),
                            repository=args.repository, ids=args.ids, judged=saved.get("judged"),
                            dry_run=args.dry_run, full=args.full, limit=args.candidates)
    if args.dry_run:
        return
    if cursor is None and not args.ids:
        print("Some papercuts failed; the cursor was not advanced", file=sys.stderr)
    Path(args.state).write_text(json.dumps(
        state | {name: {"cursor": cursor if cursor and not args.ids else saved.get("cursor"), "judged": judged}},
        indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    assess_command = commands.add_parser("assess", help="Assess papercuts that changed since the last run")
    dispatch_command = commands.add_parser("dispatch", help="Claim papercuts by id and run the fixer for them")
    watch_command = commands.add_parser("watch", help="Run the fixer for each dispatch queued from the web view")
    relate_command = commands.add_parser("relate", help="Suggest duplicates and related papercuts for changed ones")
    for command in (assess_command, dispatch_command, watch_command, relate_command):
        command.add_argument("--server", default=os.environ.get("PAPERCUTS_SERVER", "http://10.193.193.227:8765"))
    for command in (assess_command, relate_command):
        command.add_argument("--repository")
        command.add_argument("--state", default=Path(__file__).with_name("dispatcher-state.json"),
                             help="Where the change cursor is kept between runs")
        command.add_argument("--full", action="store_true", help="Ignore the cursor and judge every live papercut")
        command.add_argument("--dry-run", action="store_true", help="Print verdicts without recording them or the cursor")
        command.add_argument("--id", type=int, action="append", dest="ids", help="Judge only this papercut")
        command.add_argument("--model", default="jev-latest")
        command.add_argument("--set", action="append", default=[], metavar="KEY=VALUE", help="Override a threshold")
    relate_command.add_argument("--candidates", type=int, default=CANDIDATES,
                                help="How many similar papercuts Jev compares each one with")
    dispatch_command.add_argument("--live", action="store_true",
                                  help="Claim, create Linear issues, run the fixer and open draft PRs; otherwise only print")
    dispatch_command.add_argument("--id", type=int, action="append", dest="ids", required=True,
                                  help="Dispatch this papercut whatever its verdict")
    watch_command.add_argument("--interval", type=int, default=5, help="Seconds between checks for new dispatches")
    for command in (dispatch_command, watch_command):
        add_fixer_arguments(command)
    args = parser.parse_args()

    server = Server(args.server, os.environ.get("PAPERCUTS_TOKEN"))
    if args.command in ("dispatch", "watch"):
        return dispatch_main(server, args)
    thresholds = parse_overrides(args.set)
    key = jev_key()
    state = load_state(args.state)
    if args.command == "relate":
        return relate_main(server, args, thresholds, lambda s, q: ask_jev(s, q, key, args.model), state)
    since = None if args.full else state.get(server.url)
    cursor = assess(server, lambda s, q: ask_jev(s, q, key, args.model), thresholds, since=since,
                    repository=args.repository, ids=args.ids, dry_run=args.dry_run, full=args.full)
    if cursor and not args.dry_run and not args.ids:
        Path(args.state).write_text(json.dumps(state | {server.url: cursor}, indent=2) + "\n")
    elif cursor is None and not args.ids:
        print("Some papercuts failed; the cursor was not advanced", file=sys.stderr)


if __name__ == "__main__":
    main()
