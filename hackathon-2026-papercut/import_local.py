#!/usr/bin/env python3
"""Import local-papercuts writeups as source-backed reports, one report per recorded occurrence."""

import argparse
import json
import os
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


CATEGORY_BY_KIND = {
    "agent-behaviour": "agent-trap",
    "codebase-trap": "code-smell",
    "doc-gap": "documentation",
    "env-friction": "tooling",
    "misleading-signal": "agent-trap",
    "test-harness": "tooling",
    "tool-quirk": "tooling",
}
# Codex writeups have no kind; their closing "Classification:" line names the papercut type in prose.
CATEGORY_BY_CLASSIFICATION = (
    ("documentation", "documentation"),
    ("test", "tooling"),
    ("tool", "tooling"),
    ("lint", "tooling"),
    ("workflow", "tooling"),
    ("environment", "tooling"),
    ("code", "code-smell"),
    ("contract", "code-smell"),
    ("integration", "code-smell"),
    ("migration", "code-smell"),
)
STATUS_BY_SOURCE = {"fixed": "resolved", "wontfix": "wontfix"}
SEVERITIES = ("low", "medium", "high")
# Archive files that are not papercuts: an index of the Codex cases and known non-papercuts for a classifier.
# Slugs starting with an underscore are pipeline notes.
NOT_PAPERCUTS = {"index", "INDEX", "negative-controls"}
ACTOR = "import_local"


def reporter_and_slug(path):
    """`chris.claude.some-slug.md` was written by agent `claude` for user `chris`."""
    user, agent, slug = path.stem.split(".", 2)
    return user, agent, slug


def section(content, heading):
    match = re.search(rf"^## {heading}\s*\n(.*?)(?=^## |\Z)", content, re.MULTILINE | re.DOTALL)
    return match.group(1).strip() if match else None


def occurrences(content):
    """Collect `- transcript:` blocks from frontmatter and `## Additional occurrence` sections."""
    found, current = [], None
    for line in content.splitlines():
        start = re.match(r"^(\s*)- transcript:\s*(\S+)", line)
        if start:
            current = {"indent": len(start.group(1)), "transcript": start.group(2)}
            found.append(current)
            continue
        field = re.match(r"^(\s+)(\w+):\s*(.*?)\s*$", line)
        if current and field and len(field.group(1)) > current["indent"]:
            if field.group(2) in ("lines", "date"):
                current[field.group(2)] = field.group(3)
        else:
            current = None
    unique = {}
    for occurrence in found:
        unique.setdefault((occurrence["transcript"], occurrence.get("lines")), occurrence)
    return list(unique.values())


def transcript_start(transcript, writeup_dir):
    """First timestamp in a Claude or Codex transcript, when the transcript is still on disk.

    A relative path is read from the writeup's directory, not wherever the importer runs."""
    try:
        with open(writeup_dir / Path(transcript).expanduser()) as lines:
            for line in lines:
                match = re.search(r'"timestamp"\s*:\s*"([^"]+)"', line)
                if match:
                    return match.group(1)
    except OSError:
        pass
    return None


def observed_date(occurrence, writeup_dir):
    """Writeup dates are hand-written ("~2026-09-17", "2026-08-21..24", "2026-09 (approx)"); keep the first day."""
    written = occurrence.get("date") or ""
    if day := re.search(r"\d{4}-\d{2}-\d{2}", written):
        return day.group(0)
    if started := transcript_start(occurrence["transcript"], writeup_dir):
        return started
    if month := re.search(r"\d{4}-\d{2}", written):
        return f"{month.group(0)}-01"
    return None


def plain_links(text):
    return re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)


def parse_claude(path, content):
    metadata = {}
    if not content.startswith("---\n"):
        raise ValueError("no frontmatter")
    frontmatter, separator, body = content[4:].partition("\n---\n")
    if not separator:
        raise ValueError("missing closing frontmatter marker")
    for line in frontmatter.splitlines():
        if line and not line[0].isspace() and ":" in line:
            key, _, value = line.partition(":")
            metadata[key] = scalar(value)
    summary = section(body, "Summary")
    if not metadata.get("title") or not summary:
        raise ValueError("no title or Summary section")
    source_status = metadata.get("status", "")
    parts = [summary]
    if fix := section(body, "Suggested fix"):
        parts.append("Suggested fix:\n" + fix)
    parts.append("\n".join(
        f"{label}: {metadata[key]}"
        for key, label in (("kind", "Kind"), ("impact", "Impact"), ("severity", "Severity"),
                           ("status", "Source status"), ("area", "Area"))
        if metadata.get(key)
    ))
    return {
        "title": metadata["title"],
        "description": "\n\n".join(parts),
        "area": metadata.get("area", ""),
        # Writeups merged into this one; their slugs become extra fingerprints.
        "aliases": re.findall(r"[\w-]+", metadata.get("merged_from", "")),
        "category": CATEGORY_BY_KIND.get(metadata.get("kind"), "other"),
        "severity": metadata.get("severity", "").split("#")[0].strip(),
        "status": source_status.split("#")[0].strip(),
        "occurrences": [
            {"transcript": o["transcript"], "lines": o.get("lines"), "observed_at": observed_date(o, path.parent)}
            for o in occurrences(content)
        ],
    }


def scalar(value):
    """A frontmatter value: plain, 'single-quoted', or "double-quoted" with backslash escapes."""
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] == "'":
        return value[1:-1].replace("''", "'")
    if len(value) >= 2 and value[0] == value[-1] == '"':
        try:
            # The writeups use only the escapes YAML shares with JSON.
            return json.loads(value)
        except json.JSONDecodeError as error:
            raise ValueError(f"unsupported escape in frontmatter value {value}") from error
    return value


def parse_codex(path, content):
    title = re.search(r"^# (.+)$", content, re.MULTILINE)
    source = re.search(r"^Sources?: .*$", content, re.MULTILINE)
    if not title or not source:
        raise ValueError("no title or Source line")
    # A link fragment such as #L140 is the line the papercut was seen at.
    linked = [{"transcript": transcript, "lines": fragment.removeprefix("L") or None}
              for transcript, fragment in re.findall(r"\]\(([^)#]+\.jsonl)#?([^)]*)\)", source.group(0))]
    found = {}
    for occurrence in linked + occurrences(content):
        found.setdefault((occurrence["transcript"], occurrence.get("lines")), occurrence)
    if not found:
        raise ValueError("no transcript on the Source line")
    paragraphs = [p.strip() for p in content[source.end():].split("\n\n") if p.strip()]
    classification = next((p for p in paragraphs if p.startswith("Classification:")), "")
    lowered = classification.lower()
    category = next((cat for word, cat in CATEGORY_BY_CLASSIFICATION if word in lowered), None)
    return {
        "title": title.group(1).strip(),
        "description": plain_links("\n\n".join(p for p in paragraphs[1:2] + [classification] if p)),
        "area": "",
        "aliases": [],
        "category": category,
        "severity": "",
        "status": "open",
        "occurrences": [{"transcript": o["transcript"], "lines": o.get("lines"),
                         "observed_at": observed_date(o, path.parent)} for o in found.values()],
    }


def writeups(paths):
    for path in paths:
        if path.is_dir():
            yield from sorted(path.glob("*.md"))
        else:
            yield path


def request(server, method, route, payload=None):
    headers = {"Content-Type": "application/json"}
    if token := os.environ.get("PAPERCUTS_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = Request(f"{server.rstrip('/')}{route}", data=data, headers=headers, method=method)
    with urlopen(req, timeout=10) as response:
        return json.load(response)


def recorded_occurrences(server, repository, slugs):
    """Occurrences already recorded under any of `slugs`, as `{"<session>:<lines>": (report_id, fingerprint)}`.

    A writeup merged into another often shares occurrences with it. Resending such an occurrence under
    its original report_id and fingerprint makes it a replay instead of a second report.
    """
    recorded = {}
    for slug in slugs:
        query = urlencode({"repository": repository, "fingerprint": f"local-papercuts:{slug}"})
        for papercut in request(server, "GET", f"/api/papercuts?{query}")["papercuts"]:
            detail = request(server, "GET", f"/api/papercuts/{papercut['id']}?reports_limit=1000")
            for report in detail["reports"]:
                if (report["report_id"] or "").startswith("local-papercuts:"):
                    occurrence = report["report_id"].split(":", 2)[2]
                    recorded.setdefault(occurrence, (report["report_id"], report["fingerprint"]))
    return recorded


def register_aliases(server, repository, papercut_id, aliases):
    """Route each merged writeup's fingerprint to `papercut_id`, merging any papercut it already created."""
    for alias in aliases:
        fingerprint = f"local-papercuts:{alias}"
        query = urlencode({"repository": repository, "fingerprint": fingerprint})
        owners = request(server, "GET", f"/api/papercuts?{query}")["papercuts"]
        if not owners:
            request(server, "POST", f"/api/papercuts/{papercut_id}/fingerprints",
                    {"fingerprint": fingerprint, "actor": ACTOR})
        elif owners[0]["id"] != papercut_id:
            request(server, "POST", f"/api/papercuts/{owners[0]['id']}/merge",
                    {"into": papercut_id, "actor": ACTOR, "reason": f"Writeup {alias} was merged into this one"})
            print(f"  merged #{owners[0]['id']} ({alias})")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path, help="Markdown writeups, or directories of them")
    parser.add_argument("--server", default=os.environ.get("PAPERCUTS_SERVER", "http://10.193.193.227:8765"))
    parser.add_argument("--repository", default="metabase")
    args = parser.parse_args()
    for path in writeups(args.paths):
        user, agent, slug = reporter_and_slug(path)
        if slug in NOT_PAPERCUTS or slug.startswith("_"):
            continue
        content = path.read_text()
        try:
            writeup = (parse_codex if agent == "codex" else parse_claude)(path, content)
        except ValueError as error:
            print(f"Skipped {path.name}: {error}")
            continue
        recorded = recorded_occurrences(args.server, args.repository, writeup["aliases"]) if writeup["aliases"] else {}
        results = []
        # Every papercut keeps at least one report, even when the writeup lists no transcript.
        for occurrence in writeup["occurrences"] or [{"transcript": None, "lines": None, "observed_at": None}]:
            session = Path(occurrence["transcript"]).stem if occurrence["transcript"] else None
            report = {
                "repository": args.repository,
                "reporter": user,
                "agent": agent,
                "report_id": f"local-papercuts:{slug}:{session or 'writeup'}:{occurrence['lines'] or ''}",
                "fingerprint": f"local-papercuts:{slug}",
                "title": writeup["title"],
                "description": writeup["description"],
                "area": writeup["area"],
                "source_type": "local-papercuts",
                "source_ref": path.name,
                # Not columns on the server, but kept in the report's stored request body.
                "transcript": occurrence["transcript"],
                "lines": occurrence["lines"],
            }
            if session:
                report["session"] = session
            if earlier := recorded.get(report["report_id"].split(":", 2)[2]):
                report["report_id"], report["fingerprint"] = earlier
            if writeup["category"]:
                report["category"] = writeup["category"]
            if writeup["severity"] in SEVERITIES:
                report["severity"] = writeup["severity"]
            if occurrence["observed_at"]:
                report["observed_at"] = occurrence["observed_at"]
            try:
                results.append((report["fingerprint"], request(args.server, "POST", "/api/reports", report)))
            except HTTPError as error:
                print(f"Failed {path.name}: {error.read().decode()}")
                break
        else:
            # The writeup's papercut is the one its own fingerprint routes to. When every occurrence replayed a merged
            # writeup's report, it is the first of those, and the writeup's own slug is attached to it below.
            own = f"local-papercuts:{slug}"
            papercut_id = next((r["papercut"]["id"] for fingerprint, r in results if fingerprint == own),
                               results[0][1]["papercut"]["id"])
            # Aliases first: merging an open papercut in would reset the status set below. The writeup's own slug goes
            # through the same routing, so a papercut it created apart from the target is merged in too.
            register_aliases(args.server, args.repository, papercut_id, [slug, *writeup["aliases"]])
            if status := STATUS_BY_SOURCE.get(writeup["status"]):
                papercut = request(args.server, "PATCH", f"/api/papercuts/{papercut_id}",
                                   {"status": status, "actor": ACTOR, "reason": f"Source writeup is {writeup['status']}"})
            else:
                papercut = request(args.server, "GET", f"/api/papercuts/{papercut_id}?reports_limit=0")
            print(f"#{papercut_id} [{papercut['status']}] {papercut['report_count']}x {writeup['title'][:90]}")


if __name__ == "__main__":
    main()
