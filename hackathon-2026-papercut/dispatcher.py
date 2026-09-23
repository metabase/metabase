#!/usr/bin/env python3
"""Assess which papercuts are ready for an automated fix. See papercuts/plan.md, phase 2.

`assess` polls the papercuts server for papercuts that changed, decides a verdict for each open one and records it.
It never claims a papercut or launches a fixer."""

import argparse
import json
import os
import sys
import time
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
    failed, verdicts = False, {}
    for candidate in candidates:
        if candidate.get("merged_into") is not None:
            continue
        papercut = server.request("GET", f"/api/papercuts/{candidate['id']}?reports_limit=20")
        if papercut.get("merged_into") is not None or (not full and not ids and up_to_date(papercut)):
            continue
        try:
            assessment = decide(papercut, thresholds, jev)
        except (JevError, KeyError) as error:
            print(f"#{papercut['id']} jev failed: {error}", file=out)
            failed = True
            continue
        if assessment is None:
            continue
        verdicts[assessment["verdict"]] = verdicts.get(assessment["verdict"], 0) + 1
        print(f"#{papercut['id']} {assessment['verdict']} evidence={assessment['evidence_score']} "
              f"fixability={assessment.get('fixability_score')} {papercut['title'][:80]} | {assessment['reason']}",
              file=out)
        if not dry_run:
            server.request("POST", f"/api/papercuts/{papercut['id']}/assessments", assessment)
    print("verdicts: " + (json.dumps(verdicts) if verdicts else "none"), file=out)
    return None if failed else cursor


def jev_key():
    key = os.environ.get("JEV_API_KEY") or os.environ.get("TYPESAFE_API_KEY")
    if not key:
        sys.exit("Set JEV_API_KEY or TYPESAFE_API_KEY")
    return key


def parse_overrides(pairs):
    thresholds = dict(THRESHOLDS)
    for pair in pairs:
        key, _, value = pair.partition("=")
        if key not in thresholds:
            sys.exit(f"Unknown threshold {key}; one of: {', '.join(thresholds)}")
        thresholds[key] = type(thresholds[key])(value)
    return thresholds


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("assess", help="Assess papercuts that changed since the last run")
    command.add_argument("--server", default=os.environ.get("PAPERCUTS_SERVER", "http://127.0.0.1:8765"))
    command.add_argument("--repository")
    command.add_argument("--state", default=Path(__file__).with_name("dispatcher-state.json"),
                         help="Where the change cursor is kept between runs")
    command.add_argument("--full", action="store_true", help="Ignore the cursor and reassess every open papercut")
    command.add_argument("--dry-run", action="store_true", help="Print verdicts without recording them or the cursor")
    command.add_argument("--id", type=int, action="append", dest="ids", help="Assess only this papercut")
    command.add_argument("--model", default="jev-latest")
    command.add_argument("--set", action="append", default=[], metavar="KEY=VALUE", help="Override a threshold")
    args = parser.parse_args()

    server = Server(args.server, os.environ.get("PAPERCUTS_TOKEN"))
    thresholds = parse_overrides(args.set)
    key = jev_key()
    state = load_state(args.state)
    since = None if args.full else state.get(server.url)
    cursor = assess(server, lambda s, q: ask_jev(s, q, key, args.model), thresholds, since=since,
                    repository=args.repository, ids=args.ids, dry_run=args.dry_run, full=args.full)
    if cursor and not args.dry_run and not args.ids:
        Path(args.state).write_text(json.dumps(state | {server.url: cursor}, indent=2) + "\n")
    elif cursor is None and not args.ids:
        print("Some papercuts failed; the cursor was not advanced", file=sys.stderr)


if __name__ == "__main__":
    main()
