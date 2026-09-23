#!/usr/bin/env python3
"""Import selected local-papercuts writeups as source-backed reports."""

import argparse
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen


CATEGORY_BY_KIND = {
    "codebase-trap": "code-smell",
    "doc-gap": "documentation",
    "misleading-signal": "agent-trap",
    "test-harness": "tooling",
    "tool-quirk": "tooling",
}


def parse_writeup(path):
    content = path.read_text()
    metadata = {}
    if content.startswith("---\n"):
        frontmatter, separator, content = content[4:].partition("\n---\n")
        if not separator:
            raise ValueError(f"{path}: missing closing frontmatter marker")
        for line in frontmatter.splitlines():
            if line and not line[0].isspace() and ":" in line:
                key, _, value = line.partition(":")
                metadata[key] = value.strip()
    title = metadata.get("title") or re.search(r"^# (.+)$", content, re.MULTILINE).group(1)
    slug = metadata.get("slug") or path.stem
    summary = re.search(r"^## Summary\s*\n(.*?)(?=^## |\Z)", content, re.MULTILINE | re.DOTALL)
    if not summary:
        raise ValueError(f"{path}: no Summary section")
    return metadata, title, slug, " ".join(summary.group(1).split())


def submit(server, report):
    request = Request(
        f"{server.rstrip('/')}/api/reports",
        data=json.dumps(report).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path, help="Individual Markdown writeups to import")
    parser.add_argument("--server", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    for path in args.paths:
        metadata, title, slug, summary = parse_writeup(path)
        if metadata.get("status") in {"fixed", "wontfix"}:
            print(f"Skipped {path.name}: source status is {metadata['status']}")
            continue
        context = "\n".join(
            f"{label}: {metadata[key]}"
            for key, label in (("kind", "Kind"), ("impact", "Impact"), ("severity", "Severity"),
                               ("status", "Source status"), ("area", "Area"))
            if metadata.get(key)
        )
        report = {
            "repository": "metabase",
            "machine_id": "local-papercuts-archive",
            "report_id": f"local-papercuts:{slug}",
            "fingerprint": f"local-papercuts:{slug}",
            "title": title,
            "description": f"{summary}\n\n{context}\nSource: local-papercuts/{path.name}",
            "category": CATEGORY_BY_KIND.get(metadata.get("kind"), "other"),
        }
        result = submit(args.server, report)
        print(f"#{result['issue']['id']} {title}: {'already present' if result['replay'] else 'recorded'}")


if __name__ == "__main__":
    main()
