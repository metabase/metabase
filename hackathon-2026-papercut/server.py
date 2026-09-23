#!/usr/bin/env python3
"""Small SQLite-backed inbox for papercut reports."""

import argparse
import hashlib
import hmac
import html
import json
import os
import re
import sqlite3
import sys
import threading
import time
import traceback
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

SOURCE_VERSION = Path(__file__).stat().st_mtime_ns


CATEGORIES = ("agent-trap", "code-smell", "flaky-test", "tooling", "documentation", "other")
STATUSES = ("open", "investigating", "resolved", "wontfix")
# Version 2 had no rejected relations; its schema must stay as it was.
V2_RELATION_SOURCES = ("suggested", "manual")
# A rejected relation is hidden, and stops the pair from being suggested again.
RELATION_SOURCES = ("suggested", "manual", "rejected")
V3_EVENT_KINDS = ("status", "category", "title", "description", "path", "area", "reopened", "merged", "absorbed",
                  "related", "unrelated", "fingerprint", "comment")
EVENT_KINDS = (*V3_EVENT_KINDS, "owner", "severity", "assessed", "dispatched", "dispatch_updated")
# Where a papercut's fix would go, and how bad it is: the transcript scanner's values (mage/src/mage/papercuts/drill.clj).
OWNERS = ("repo-code", "repo-tooling", "personal-tooling", "third-party", "harness", "agent-practice")
SEVERITIES = ("low", "medium", "high")
VERDICTS = ("not_ready", "ready", "needs_human")
ACTIVE_DISPATCH_STATES = ("claimed", "linear_created", "running")
FINAL_DISPATCH_STATES = ("pr_opened", "already_fixed", "needs_human", "not_reproducible", "failed")
DISPATCH_STATES = (*ACTIVE_DISPATCH_STATES, *FINAL_DISPATCH_STATES)
DISPATCH_TRANSITIONS = {
    "claimed": {"linear_created", "failed"},
    "linear_created": {"running", "failed"},
    "running": set(FINAL_DISPATCH_STATES),
}
# The papercut status a final dispatch state leaves behind, applied only while the papercut is still `investigating`.
STATUS_AFTER_DISPATCH = {"already_fixed": "resolved", "needs_human": "open", "not_reproducible": "open", "failed": "open"}
DISPATCH_FIELDS = ("linear_issue_id", "linear_url", "branch", "pr_url", "run_log")
# The dispatcher's evidence rule: 2+ reporters, 3+ reports, an hour lost, or high severity.
IMPORTANT = """(COALESCE(s.reporter_count, 0) >= 2 OR COALESCE(s.report_count, 0) >= 3
               OR COALESCE(s.cost_minutes, 0) >= 60 OR p.severity IS 'high')"""
SORTS = {
    "important": f"{IMPORTANT} DESC, p.last_seen DESC, p.id DESC",
    "recent": "p.last_seen DESC, p.id DESC",
    "oldest": "p.first_seen ASC, p.id ASC",
    "reports": "report_count DESC, p.last_seen DESC, p.id DESC",
    "reporters": "reporter_count DESC, report_count DESC, p.id DESC",
    "agents": "agent_count DESC, report_count DESC, p.id DESC",
    "cost": "cost_minutes DESC, report_count DESC, p.id DESC",
    "updated": "p.updated_at DESC, p.id DESC",
}
# Other fields are kept in the report's stored request body and named in the response's `extra_fields`,
# so a reporter can spot a misspelled field.
REPORT_FIELDS = {"repository", "reporter", "machine_id", "machine", "report_id", "fingerprint", "category", "title",
                 "description", "path", "area", "agent", "session", "cost_minutes", "observed_at", "source_type",
                 "source_ref", "branch", "commit_sha", "commit_source", "repository_url", "owner", "severity"}
# How a reporter knows the commit a papercut was hit on. Anything but `exact` is reconstructed after the fact:
# from the branch reflog at the observed time, the last commit on the branch before it, or the commit the
# session started on.
COMMIT_SOURCES = ("exact", "reflog", "before-timestamp", "session-start")
MAX_BODY = 64 * 1024
MAX_FIELD = 10_000
# A reporter's clock may run a little ahead of the server's.
CLOCK_SKEW = timedelta(hours=1)
# Word overlap of title and description. On the local archive, known duplicates scored 0.49 or more and
# the closest distinct pair 0.27.
SUGGEST_THRESHOLD = 0.35
STOP_WORDS = set("""a an and are as at be but by does for from has have in into is it its not of on only or same so
                    that the their then this to was were when which while with without agent agents user""".split())
# Version 1 imports recorded their source writeup only as this last line of the description.
LOCAL_SOURCE_TRAILER = re.compile(r"\nSource: local-papercuts/(\S+)$")


class ConflictError(ValueError):
    """The request contradicts data already recorded."""


class NotFound(LookupError):
    """The papercut does not exist."""


class UnsupportedMediaType(ValueError):
    """The request body is not JSON."""


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def precise_now():
    # Change cursors need sub-second precision, so polling clients do not miss edits made in the same second.
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def normalized(value):
    # Letters and digits in any script; on ASCII this matches the original [a-z0-9]. Text with none of them keeps
    # its own case-folded form, so distinct titles in symbols or emoji don't share a fingerprint.
    return " ".join(re.findall(r"[^\W_]+", value.casefold())) or value.strip().casefold()


def parse_observed_at(value):
    """Normalize an optional ISO date or timestamp to a UTC timestamp."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("observed_at must be an ISO 8601 date or timestamp") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    if parsed > datetime.now(timezone.utc) + CLOCK_SKEW:
        raise ValueError("observed_at is in the future")
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")


def reopens(observed, resolved_at):
    """True when a report observed at `observed` counts as coming after a resolution at `resolved_at`."""
    if not resolved_at:
        return True
    # observed_at is kept to the second and resolutions to the microsecond, so a report from the resolution's own
    # second can't be ordered. Count it as after: a missed reopen hides a regression, a spurious one costs a click.
    return datetime.fromisoformat(observed) >= datetime.fromisoformat(resolved_at).replace(microsecond=0)


def parse_since(value):
    """Normalize a change cursor to the UTC, microsecond form of stored updated_at values, so they compare as strings."""
    # Query-string decoding turns an unencoded "+00:00" into " 00:00"; put the plus back.
    cursor = re.sub(r" (\d{2}:\d{2})$", r"+\1", value.strip())
    cursor = re.sub(r"Z$", "+00:00", cursor)
    try:
        parsed = datetime.fromisoformat(cursor)
    except ValueError:
        parsed = None
    if parsed is None or parsed.tzinfo is None or "T" not in cursor:
        raise ValueError("since must be a cursor returned by a previous list")
    return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds")


def public_url(url):
    """`url` without the user info and query an HTTPS remote can carry credentials in. Other forms pass through."""
    match = re.fullmatch(r"(?i)([a-z][a-z0-9+.-]*://)(?:[^/@?#]*@)?([^?#]*).*", url)
    return match[1] + match[2] if match else url


def words(text):
    found = set()
    for word in re.findall(r"[^\W_]+", text.casefold()):
        if len(word) < 3 or word in STOP_WORDS:
            continue
        found.add(word[:-1] if word.endswith("s") and len(word) > 4 else word)
    return found


def similarity(a, b):
    left, right = words(a), words(b)
    return len(left & right) / len(left | right) if left and right else 0.0


def computed_fingerprint(title, path):
    return hashlib.sha256(f"{normalized(path)}\0{normalized(title)}".encode()).hexdigest()


def text_field(payload, key, required=False):
    value = payload.get(key)
    if value is None:
        if required:
            raise ValueError(f"{key} must be a nonempty string")
        return None
    if not isinstance(value, str):
        raise ValueError(f"{key} must be a string")
    if len(value) > MAX_FIELD:
        raise ValueError(f"{key} is longer than {MAX_FIELD} characters")
    if required and not value.strip():
        raise ValueError(f"{key} must be a nonempty string")
    return value.strip()


def git_fields(payload):
    """The branch and commit a report was hit on, validated. Missing fields are None."""
    branch, commit_sha, commit_source, repository_url = (
        text_field(payload, key) or None for key in ("branch", "commit_sha", "commit_source", "repository_url"))
    if commit_sha:
        commit_sha = commit_sha.lower()
        if not re.fullmatch(r"[0-9a-f]{7,40}", commit_sha):
            raise ValueError("commit_sha must be 7 to 40 hex characters")
    if commit_source and commit_source not in COMMIT_SOURCES:
        raise ValueError(f"commit_source must be one of: {', '.join(COMMIT_SOURCES)}")
    # A commit without its source would read as exact.
    if bool(commit_source) != bool(commit_sha):
        raise ValueError("commit_sha and commit_source must be sent together")
    return {"branch": branch, "commit_sha": commit_sha, "commit_source": commit_source,
            "repository_url": repository_url and public_url(repository_url)}


def int_param(params, key, default, low, high=None):
    value = params.get(key)
    if value in (None, ""):
        return default
    if not re.fullmatch(r"\d+", str(value)) or int(value) < low or (high is not None and int(value) > high):
        raise ValueError(f"{key} must be an integer from {low}{f' to {high}' if high is not None else ' up'}")
    return int(value)


def detail_field(payload, key, values):
    """A report's `key`: top-level, where a bad value is an error, or else from the transcript scanner's free-form
    `details`, where a bad value is ignored."""
    if payload.get(key) is not None:
        if payload[key] not in values:
            raise ValueError(f"{key} must be one of: {', '.join(values)}")
        return payload[key]
    details = payload.get("details")
    value = details.get(key) if isinstance(details, dict) else None
    return value if value in values else None


def number_field(payload, key, low=None, high=None):
    value = payload.get(key)
    if value is None:
        return None
    if type(value) not in (int, float) or (low is not None and value < low) or (high is not None and value > high):
        raise ValueError(f"{key} must be a number" + (f" from {low}" if low is not None else "")
                         + (f" to {high}" if high is not None else ""))
    return value


def assessment_json(row):
    return dict(row) | {"inputs": json.loads(row["inputs"]) if row["inputs"] else None}


def actor_of(payload):
    return text_field(payload, "actor") or "anonymous"


def run_script(db, script):
    # sqlite3's executescript commits first, which would end the migration transaction.
    for statement in script.split(";"):
        if statement.strip():
            db.execute(statement)


def create_v1(db):
    """Version 1: the original schema, including the later `observed_at` column."""
    run_script(db, """
        CREATE TABLE IF NOT EXISTS issues (
            id INTEGER PRIMARY KEY,
            repository TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            path TEXT NOT NULL,
            category TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            UNIQUE(repository, fingerprint)
        );
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY,
            issue_id INTEGER NOT NULL REFERENCES issues(id),
            repository TEXT NOT NULL,
            machine_id TEXT NOT NULL,
            report_id TEXT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            path TEXT NOT NULL,
            received_at TEXT NOT NULL,
            observed_at TEXT,
            UNIQUE(repository, machine_id, report_id)
        );
        CREATE INDEX IF NOT EXISTS reports_issue ON reports(issue_id);
        CREATE TABLE IF NOT EXISTS relations (
            issue_a INTEGER NOT NULL REFERENCES issues(id),
            issue_b INTEGER NOT NULL REFERENCES issues(id),
            source TEXT NOT NULL,
            score REAL,
            PRIMARY KEY(issue_a, issue_b),
            CHECK(issue_a < issue_b)
        )
    """)
    columns = {row["name"] for row in db.execute("PRAGMA table_info(reports)")}
    if "observed_at" not in columns:
        db.execute("ALTER TABLE reports ADD COLUMN observed_at TEXT")


def one_of(values):
    return ", ".join(f"'{value}'" for value in values)


SCHEMA_V2 = f"""
    CREATE TABLE issues (
        id INTEGER PRIMARY KEY,
        repository TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        path TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ({one_of(CATEGORIES)})),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ({one_of(STATUSES)})),
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        UNIQUE (id, repository)
    );
    CREATE TABLE issue_fingerprints (
        repository TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        issue_id INTEGER NOT NULL,
        PRIMARY KEY (repository, fingerprint),
        FOREIGN KEY (issue_id, repository) REFERENCES issues (id, repository)
    );
    CREATE INDEX issue_fingerprints_issue ON issue_fingerprints (issue_id);
    CREATE TABLE reports (
        id INTEGER PRIMARY KEY,
        issue_id INTEGER NOT NULL,
        repository TEXT NOT NULL,
        reporter TEXT NOT NULL,
        machine TEXT,
        report_id TEXT,
        fingerprint TEXT NOT NULL,
        submitted_fingerprint TEXT,
        submitted_category TEXT CHECK (submitted_category IN ({one_of(CATEGORIES)})),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        path TEXT NOT NULL,
        source_type TEXT,
        source_ref TEXT,
        payload TEXT,
        received_at TEXT NOT NULL,
        observed_at TEXT,
        UNIQUE (repository, reporter, report_id),
        FOREIGN KEY (issue_id, repository) REFERENCES issues (id, repository)
    );
    CREATE INDEX reports_issue ON reports (issue_id);
    CREATE TABLE relations (
        repository TEXT NOT NULL,
        issue_a INTEGER NOT NULL,
        issue_b INTEGER NOT NULL,
        source TEXT NOT NULL CHECK (source IN ({one_of(V2_RELATION_SOURCES)})),
        score REAL,
        PRIMARY KEY (issue_a, issue_b),
        CHECK (issue_a < issue_b),
        FOREIGN KEY (issue_a, repository) REFERENCES issues (id, repository),
        FOREIGN KEY (issue_b, repository) REFERENCES issues (id, repository)
    );
    CREATE INDEX relations_issue_b ON relations (issue_b)
"""


def migrate_to_v2(db):
    """Move fingerprints into their own table and record what each report submitted.

    Backfills only what version 1 data proves; `payload` and `submitted_category` stay NULL.
    """
    for table in ("issues", "reports", "relations"):
        db.execute(f"ALTER TABLE {table} RENAME TO v1_{table}")
    db.execute("DROP INDEX reports_issue")
    run_script(db, SCHEMA_V2)
    db.execute("""INSERT INTO issues (id, repository, title, description, path, category, status, first_seen, last_seen)
                  SELECT id, repository, title, description, path, category, status, first_seen, last_seen
                  FROM v1_issues""")
    db.execute("""INSERT INTO issue_fingerprints (repository, fingerprint, issue_id)
                  SELECT repository, fingerprint, id FROM v1_issues""")
    # Version 1 grouped by exact fingerprint only, so each report carried its issue's fingerprint.
    # A fingerprint other than the server's hash of the report's path and title must have been submitted.
    reports = db.execute("""SELECT r.*, i.fingerprint AS issue_fingerprint
                            FROM v1_reports r JOIN v1_issues i ON i.id = r.issue_id""").fetchall()
    for row in reports:
        computed = computed_fingerprint(row["title"], row["path"])
        source = LOCAL_SOURCE_TRAILER.search(row["description"])
        db.execute(
            """INSERT INTO reports
               (id, issue_id, repository, reporter, report_id, fingerprint, submitted_fingerprint,
                title, description, path, source_type, source_ref, received_at, observed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (row["id"], row["issue_id"], row["repository"], row["machine_id"], row["report_id"],
             row["issue_fingerprint"], None if row["issue_fingerprint"] == computed else row["issue_fingerprint"],
             row["title"], row["description"], row["path"],
             "local-papercuts" if source else None, source[1] if source else None,
             row["received_at"], row["observed_at"]),
        )
    db.execute("""INSERT INTO relations (repository, issue_a, issue_b, source, score)
                  SELECT i.repository, rel.issue_a, rel.issue_b, rel.source, rel.score
                  FROM v1_relations rel JOIN v1_issues i ON i.id = rel.issue_a""")
    for table in ("relations", "reports", "issues"):
        db.execute(f"DROP TABLE v1_{table}")


SCHEMA_V3 = f"""
    CREATE TABLE papercuts (
        id INTEGER PRIMARY KEY,
        repository TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        path TEXT NOT NULL,
        area TEXT NOT NULL DEFAULT '',
        category TEXT CHECK (category IN ({one_of(CATEGORIES)})),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ({one_of(STATUSES)})),
        status_changed_at TEXT,
        merged_into INTEGER REFERENCES papercuts (id),
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (id, repository),
        CHECK (merged_into IS NULL OR merged_into != id)
    );
    CREATE INDEX papercuts_updated ON papercuts (updated_at);
    CREATE TABLE papercut_fingerprints (
        repository TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        papercut_id INTEGER NOT NULL,
        PRIMARY KEY (repository, fingerprint),
        FOREIGN KEY (papercut_id, repository) REFERENCES papercuts (id, repository)
    );
    CREATE INDEX papercut_fingerprints_papercut ON papercut_fingerprints (papercut_id);
    CREATE TABLE reports (
        id INTEGER PRIMARY KEY,
        papercut_id INTEGER NOT NULL,
        repository TEXT NOT NULL,
        reporter TEXT NOT NULL,
        machine TEXT,
        agent TEXT,
        session TEXT,
        report_id TEXT,
        fingerprint TEXT NOT NULL,
        submitted_fingerprint TEXT,
        submitted_category TEXT CHECK (submitted_category IN ({one_of(CATEGORIES)})),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        path TEXT NOT NULL,
        area TEXT NOT NULL DEFAULT '',
        cost_minutes REAL CHECK (cost_minutes >= 0),
        source_type TEXT,
        source_ref TEXT,
        payload TEXT,
        received_at TEXT NOT NULL,
        observed_at TEXT,
        UNIQUE (repository, reporter, report_id),
        FOREIGN KEY (papercut_id, repository) REFERENCES papercuts (id, repository)
    );
    CREATE INDEX reports_papercut ON reports (papercut_id);
    CREATE TABLE relations (
        repository TEXT NOT NULL,
        papercut_a INTEGER NOT NULL,
        papercut_b INTEGER NOT NULL,
        source TEXT NOT NULL CHECK (source IN ({one_of(RELATION_SOURCES)})),
        score REAL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (papercut_a, papercut_b),
        CHECK (papercut_a < papercut_b),
        FOREIGN KEY (papercut_a, repository) REFERENCES papercuts (id, repository),
        FOREIGN KEY (papercut_b, repository) REFERENCES papercuts (id, repository)
    );
    CREATE INDEX relations_papercut_b ON relations (papercut_b);
    CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        papercut_id INTEGER NOT NULL REFERENCES papercuts (id),
        at TEXT NOT NULL,
        actor TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ({one_of(V3_EVENT_KINDS)})),
        old_value TEXT,
        new_value TEXT,
        body TEXT
    );
    CREATE INDEX events_papercut ON events (papercut_id)
"""


def migrate_to_v3(db):
    """Rename issues to papercuts, and add reporter details, triage history, merges and rejected relations.

    As in version 2, backfills only what the old data proves.
    """
    migrated_at = precise_now()
    for index in ("reports_issue", "issue_fingerprints_issue", "relations_issue_b"):
        db.execute(f"DROP INDEX {index}")
    for table in ("issues", "issue_fingerprints", "reports", "relations"):
        db.execute(f"ALTER TABLE {table} RENAME TO v2_{table}")
    run_script(db, SCHEMA_V3)
    # The importer put each writeup's free-text area in `path`.
    local = "EXISTS (SELECT 1 FROM v2_reports r WHERE r.issue_id = i.id AND r.source_type = 'local-papercuts')"
    # A category is the server's keyword guess when no report sent one and every report's request body is
    # recorded. Version 1 reports have no recorded body, so their categories stay.
    guessed = """NOT EXISTS (SELECT 1 FROM v2_reports r WHERE r.issue_id = i.id
                             AND (r.submitted_category IS NOT NULL OR r.payload IS NULL))"""
    db.execute(f"""INSERT INTO papercuts (id, repository, title, description, path, area, category, status,
                                          status_changed_at, first_seen, last_seen, updated_at)
                   SELECT id, repository, title, description,
                          CASE WHEN {local} THEN '' ELSE path END,
                          CASE WHEN {local} THEN path ELSE '' END,
                          CASE WHEN {guessed} THEN NULL ELSE category END,
                          status, CASE WHEN status = 'open' THEN NULL ELSE ? END,
                          first_seen, last_seen, ?
                   FROM v2_issues i""", (migrated_at, migrated_at))
    db.execute("""INSERT INTO papercut_fingerprints (repository, fingerprint, papercut_id)
                  SELECT repository, fingerprint, issue_id FROM v2_issue_fingerprints""")
    for row in db.execute("SELECT * FROM v2_reports").fetchall():
        reporter, agent, session, path, area = row["reporter"], None, None, row["path"], ""
        if row["source_type"] == "local-papercuts":
            # The importer set the reporter to <user>.<agent> and sent the transcript in the request body.
            if match := re.fullmatch(r"([^.]+)\.([^.]+)", reporter):
                reporter, agent = match.groups()
            transcript = (json.loads(row["payload"]) if row["payload"] else {}).get("transcript")
            session = Path(transcript).stem if transcript else None
            path, area = "", row["path"]
        db.execute(
            """INSERT INTO reports
               (id, papercut_id, repository, reporter, machine, agent, session, report_id, fingerprint,
                submitted_fingerprint, submitted_category, title, description, path, area, source_type,
                source_ref, payload, received_at, observed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (row["id"], row["issue_id"], row["repository"], reporter, row["machine"], agent, session,
             row["report_id"], row["fingerprint"], row["submitted_fingerprint"], row["submitted_category"],
             row["title"], row["description"], path, area, row["source_type"], row["source_ref"], row["payload"],
             row["received_at"], row["observed_at"]),
        )
    db.execute("""INSERT INTO relations (repository, papercut_a, papercut_b, source, score, updated_at)
                  SELECT repository, issue_a, issue_b, source, score, ? FROM v2_relations""", (migrated_at,))
    for table in ("relations", "reports", "issue_fingerprints", "issues"):
        db.execute(f"DROP TABLE v2_{table}")


def migrate_to_v4(db):
    """Record the git branch and commit each report was hit on.

    Earlier servers kept these fields only in the stored request body, so they are copied from there when sent.
    """
    sources = ", ".join(f"'{source}'" for source in COMMIT_SOURCES)
    run_script(db, f"""
        ALTER TABLE reports ADD COLUMN branch TEXT;
        ALTER TABLE reports ADD COLUMN commit_sha TEXT
            CHECK (commit_sha IS NULL OR (length(commit_sha) BETWEEN 7 AND 40 AND commit_sha NOT GLOB '*[^0-9a-f]*'));
        ALTER TABLE reports ADD COLUMN commit_source TEXT CHECK (commit_source IN ({sources}));
        ALTER TABLE reports ADD COLUMN repository_url TEXT;
        CREATE INDEX reports_branch ON reports (branch);
    """)
    for row in db.execute("SELECT id, payload FROM reports WHERE payload IS NOT NULL").fetchall():
        payload = json.loads(row["payload"])
        try:
            git = git_fields(payload)
        except ValueError:
            continue
        if any(git.values()):
            db.execute("UPDATE reports SET branch = ?, commit_sha = ?, commit_source = ?, repository_url = ? WHERE id = ?",
                       (*git.values(), row["id"]))


SCHEMA_V5 = f"""
    ALTER TABLE papercuts ADD COLUMN owner TEXT CHECK (owner IN ({one_of(OWNERS)}));
    ALTER TABLE papercuts ADD COLUMN severity TEXT CHECK (severity IN ({one_of(SEVERITIES)}));
    CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        papercut_id INTEGER NOT NULL REFERENCES papercuts (id),
        at TEXT NOT NULL,
        actor TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ({one_of(EVENT_KINDS)})),
        old_value TEXT,
        new_value TEXT,
        body TEXT
    );
    CREATE INDEX events_papercut ON events (papercut_id);
    CREATE TABLE assessments (
        id INTEGER PRIMARY KEY,
        papercut_id INTEGER NOT NULL REFERENCES papercuts (id),
        at TEXT NOT NULL,
        actor TEXT NOT NULL,
        verdict TEXT NOT NULL CHECK (verdict IN ({one_of(VERDICTS)})),
        evidence_score REAL,
        fixability_score REAL,
        fixability_confidence REAL,
        inputs TEXT,
        model TEXT,
        reason TEXT
    );
    CREATE INDEX assessments_papercut ON assessments (papercut_id);
    CREATE TABLE dispatches (
        id INTEGER PRIMARY KEY,
        papercut_id INTEGER NOT NULL REFERENCES papercuts (id),
        assessment_id INTEGER REFERENCES assessments (id),
        state TEXT NOT NULL CHECK (state IN ({one_of(DISPATCH_STATES)})),
        actor TEXT NOT NULL,
        linear_issue_id TEXT,
        linear_url TEXT,
        branch TEXT,
        pr_url TEXT,
        run_log TEXT,
        cost_usd REAL CHECK (cost_usd >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX dispatches_active ON dispatches (papercut_id) WHERE state IN ({one_of(ACTIVE_DISPATCH_STATES)});
    CREATE INDEX dispatches_state ON dispatches (state)
"""


def first_detail(field, values):
    """SQL for the earliest report's `field`, sent top-level or in the transcript scanner's `details`."""
    return f"""(SELECT COALESCE(json_extract(r.payload, '$.{field}'), json_extract(r.payload, '$.details.{field}'))
                FROM reports r WHERE r.papercut_id = p.id
                AND COALESCE(json_extract(r.payload, '$.{field}'), json_extract(r.payload, '$.details.{field}'))
                    IN ({one_of(values)})
                ORDER BY COALESCE(r.observed_at, r.received_at), r.id LIMIT 1)"""


def migrate_to_v5(db):
    """Add owner and severity, assessments and dispatches, and the event kinds that record them.

    Owner and severity are backfilled from the earliest report whose stored request body carries a valid value.
    """
    db.execute("DROP INDEX events_papercut")
    db.execute("ALTER TABLE events RENAME TO v4_events")
    run_script(db, SCHEMA_V5)
    db.execute("INSERT INTO events SELECT * FROM v4_events")
    db.execute("DROP TABLE v4_events")
    db.execute(f"UPDATE papercuts AS p SET owner = {first_detail('owner', OWNERS)}, "
               f"severity = {first_detail('severity', SEVERITIES)}")


# Each entry upgrades the database by one `user_version`.
MIGRATIONS = (create_v1, migrate_to_v2, migrate_to_v3, migrate_to_v4, migrate_to_v5)

STATS = """SELECT papercut_id, COUNT(*) AS report_count, COUNT(DISTINCT reporter) AS reporter_count,
                  COUNT(DISTINCT agent) AS agent_count, COUNT(cost_minutes) AS cost_reports,
                  COALESCE(SUM(cost_minutes), 0) AS cost_minutes
           FROM reports GROUP BY papercut_id"""
# A papercut that was merged away has no reports left.
COUNTS = """COALESCE(s.report_count, 0) AS report_count, COALESCE(s.reporter_count, 0) AS reporter_count,
            COALESCE(s.agent_count, 0) AS agent_count, COALESCE(s.cost_reports, 0) AS cost_reports,
            COALESCE(s.cost_minutes, 0) AS cost_minutes"""


class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.migrate()

    def migrate(self):
        db = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            # Rebuilding a table breaks references until the rebuild finishes; foreign_key_check verifies the end state.
            db.execute("PRAGMA foreign_keys = OFF")
            db.execute("PRAGMA journal_mode = WAL")
            db.execute("BEGIN IMMEDIATE")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > len(MIGRATIONS):
                raise RuntimeError(f"Database schema version {version} is newer than this server supports")
            for number, step in enumerate(MIGRATIONS[version:], version + 1):
                step(db)
                db.execute(f"PRAGMA user_version = {number}")
            if broken := db.execute("PRAGMA foreign_key_check").fetchall():
                raise RuntimeError(f"Migration left {len(broken)} broken foreign key references")
            db.execute("COMMIT")
        except BaseException:
            if db.in_transaction:
                db.execute("ROLLBACK")
            raise
        finally:
            db.close()

    @contextmanager
    def connect(self, write=False):
        """A connection holding one transaction: the write lock when `write`, otherwise a consistent snapshot."""
        db = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            db.execute("PRAGMA foreign_keys = ON")
            db.execute("PRAGMA busy_timeout = 5000")
            db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield db
            db.execute("COMMIT")
        except BaseException:
            if db.in_transaction:
                db.execute("ROLLBACK")
            raise
        finally:
            db.close()

    # --- reports ---

    def ingest(self, payload):
        if not isinstance(payload, dict):
            raise ValueError("Expected a JSON object")
        extra_fields = sorted(set(payload) - REPORT_FIELDS)
        repository = text_field(payload, "repository", required=True)
        title = text_field(payload, "title", required=True)
        # `machine_id` is the version 1 name for the reporter. Clients that support both servers send both.
        if "reporter" in payload and "machine_id" in payload and payload["reporter"] != payload["machine_id"]:
            raise ValueError("reporter and machine_id must match when both are sent")
        reporter = text_field(payload, "reporter" if "reporter" in payload else "machine_id", required=True)
        report_id = text_field(payload, "report_id", required=True)
        description = text_field(payload, "description") or ""
        path = text_field(payload, "path") or ""
        area = text_field(payload, "area") or ""
        machine, agent, session, source_type, source_ref = (
            text_field(payload, key) or None for key in ("machine", "agent", "session", "source_type", "source_ref"))
        submitted_fingerprint = text_field(payload, "fingerprint") or None
        submitted_category = text_field(payload, "category") or None
        if submitted_category and submitted_category not in CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(CATEGORIES)}")
        owner, severity = (detail_field(payload, key, values) for key, values in (("owner", OWNERS), ("severity", SEVERITIES)))
        cost = payload.get("cost_minutes")
        if cost is not None and (type(cost) not in (int, float) or not 0 <= cost <= 100_000):
            raise ValueError("cost_minutes must be a number from 0 to 100000")
        observed_at = parse_observed_at(text_field(payload, "observed_at"))
        git = git_fields(payload)
        # The stored request body is served too, so it keeps the cleaned URL, not the one sent.
        if git["repository_url"]:
            payload = {**payload, "repository_url": git["repository_url"]}
        fingerprint = submitted_fingerprint or computed_fingerprint(title, path)

        with self.connect(write=True) as db:
            received_at = now()
            stamp = precise_now()
            seen = observed_at or received_at
            prior = db.execute(
                "SELECT id, papercut_id, fingerprint FROM reports WHERE repository = ? AND reporter = ? AND report_id = ?",
                (repository, reporter, report_id),
            ).fetchone()
            if prior:
                if prior["fingerprint"] != fingerprint:
                    raise ConflictError(f"report_id {report_id} was already recorded with a different fingerprint")
                return self._ingest_result(db, prior["id"], prior["papercut_id"], extra_fields,
                                           created=False, replay=True)

            routed = db.execute(
                "SELECT papercut_id FROM papercut_fingerprints WHERE repository = ? AND fingerprint = ?",
                (repository, fingerprint),
            ).fetchone()
            created, reopened = routed is None, False
            if created:
                papercut_id = db.execute(
                    """INSERT INTO papercuts (repository, title, description, path, area, category, owner, severity,
                                              first_seen, last_seen, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (repository, title, description, path, area, submitted_category, owner, severity, seen, seen, stamp),
                ).lastrowid
                db.execute("INSERT INTO papercut_fingerprints (repository, fingerprint, papercut_id) VALUES (?, ?, ?)",
                           (repository, fingerprint, papercut_id))
            else:
                papercut_id = routed["papercut_id"]
                papercut = db.execute("SELECT * FROM papercuts WHERE id = ?", (papercut_id,)).fetchone()
                # A report dated after the fix means the fix didn't hold, or a stale copy of the trap remains.
                reopened = papercut["status"] == "resolved" and reopens(observed_at or stamp, papercut["status_changed_at"])
                db.execute(
                    """UPDATE papercuts SET first_seen = MIN(first_seen, ?), last_seen = MAX(last_seen, ?),
                              category = COALESCE(category, ?), owner = COALESCE(owner, ?),
                              severity = COALESCE(severity, ?), updated_at = ? WHERE id = ?""",
                    (seen, seen, submitted_category, owner, severity, stamp, papercut_id),
                )
            report_row = db.execute(
                """INSERT INTO reports
                   (papercut_id, repository, reporter, machine, agent, session, report_id, fingerprint,
                    submitted_fingerprint, submitted_category, title, description, path, area, cost_minutes,
                    source_type, source_ref, payload, received_at, observed_at,
                    branch, commit_sha, commit_source, repository_url)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (papercut_id, repository, reporter, machine, agent, session, report_id, fingerprint,
                 submitted_fingerprint, submitted_category, title, description, path, area, cost,
                 source_type, source_ref, json.dumps(payload, ensure_ascii=False), received_at, observed_at,
                 *git.values()),
            ).lastrowid
            if created:
                self._suggest_relations(db, papercut_id, stamp)
            if reopened:
                self._set(db, papercut_id, "status", "open", "server", stamp, kind="reopened",
                          body=f"New report {report_id} from {reporter}, seen {seen}")
            return self._ingest_result(db, report_row, papercut_id, extra_fields,
                                       created=created, replay=False, reopened=reopened)

    def _ingest_result(self, db, report_row, papercut_id, extra_fields, created, replay, reopened=False):
        papercut = db.execute(
            f"""SELECT p.id, p.status, s.report_count, s.reporter_count
                FROM papercuts p JOIN ({STATS}) s ON s.papercut_id = p.id WHERE p.id = ?""",
            (papercut_id,),
        ).fetchone()
        return {"report": {"id": report_row}, "papercut": dict(papercut),
                "created": created, "replay": replay, "reopened": reopened, "extra_fields": extra_fields}

    # --- reading ---

    def list_papercuts(self, filters=None, max_limit=500):
        filters = filters or {}
        clauses, params = [], []
        for key in ("repository", "status"):
            if filters.get(key):
                clauses.append(f"p.{key} = ?")
                params.append(filters[key])
        # A comma-separated list; `unclassified` matches papercuts without a category.
        if filters.get("category"):
            categories = filters["category"].split(",")
            named = [category for category in categories if category != "unclassified"]
            either = [f"p.category IN ({', '.join('?' * len(named))})"] if named else []
            if "unclassified" in categories:
                either.append("p.category IS NULL")
            clauses.append(f"({' OR '.join(either)})")
            params.extend(named)
        if filters.get("q"):
            clauses.append("(p.title LIKE ? OR p.description LIKE ? OR p.path LIKE ? OR p.area LIKE ?)")
            params.extend([f"%{filters['q']}%"] * 4)
        if filters.get("fingerprint"):
            clauses.append("EXISTS (SELECT 1 FROM papercut_fingerprints f WHERE f.papercut_id = p.id AND f.fingerprint = ?)")
            params.append(filters["fingerprint"])
        if filters.get("branch"):
            clauses.append("EXISTS (SELECT 1 FROM reports r WHERE r.papercut_id = p.id AND r.branch = ?)")
            params.append(filters["branch"])
        # A change feed must also say which papercuts were merged away, so clients can drop them.
        if filters.get("since"):
            clauses.append("p.updated_at > ?")
            params.append(parse_since(filters["since"]))
        else:
            clauses.append("p.merged_into IS NULL")
        sort = filters.get("sort") or "recent"
        if sort not in SORTS:
            raise ValueError(f"sort must be one of: {', '.join(SORTS)}")
        limit = int_param(filters, "limit", 50, 1, max_limit)
        offset = int_param(filters, "offset", 0, 0)
        # A change feed returns every change: its cursor is the newest change of all, so a partial page would skip rows.
        if filters.get("since"):
            limit, offset = -1, 0
        where = " AND ".join(clauses)
        with self.connect() as db:
            total = db.execute(f"SELECT COUNT(*) FROM papercuts p WHERE {where}", params).fetchone()[0]
            rows = db.execute(
                f"""SELECT p.*, {COUNTS}, {IMPORTANT} AS important,
                           (SELECT json_group_array(fingerprint) FROM papercut_fingerprints f
                            WHERE f.papercut_id = p.id) AS fingerprints,
                           COALESCE((SELECT d.state FROM dispatches d WHERE d.papercut_id = p.id ORDER BY d.id DESC LIMIT 1),
                                    (SELECT 'pr_opened' FROM events e WHERE e.papercut_id = p.id AND e.kind = 'comment'
                                     AND e.body LIKE '%https://github.com/%/pull/%')) AS fix_state
                    FROM papercuts p LEFT JOIN ({STATS}) s ON s.papercut_id = p.id
                    WHERE {where} ORDER BY {SORTS[sort]} LIMIT ? OFFSET ?""",
                [*params, limit, offset],
            ).fetchall()
            # Commits are serialized and stamp updated_at under the write lock, so this is a safe resume point.
            cursor = db.execute("SELECT MAX(updated_at) FROM papercuts").fetchone()[0]
        # Clients that reuse an existing grouping, such as the transcript scanner, read fingerprints from the list.
        papercuts = [dict(row) | {"fingerprints": sorted(json.loads(row["fingerprints"]))} for row in rows]
        return {"papercuts": papercuts, "total": total, "limit": limit if limit > 0 else None, "offset": offset,
                "next_offset": offset + limit if 0 < offset + limit < total else None, "cursor": cursor}

    def repositories(self):
        with self.connect() as db:
            return [row[0] for row in db.execute(
                "SELECT DISTINCT repository FROM papercuts WHERE merged_into IS NULL ORDER BY repository"
            )]

    def resolve(self, papercut_id):
        """The live papercut that `papercut_id` was merged into, or `papercut_id` itself; None if it doesn't exist."""
        with self.connect() as db:
            return self._resolve(db, papercut_id)

    @staticmethod
    def _resolve(db, papercut_id):
        seen = set()
        while papercut_id not in seen:
            seen.add(papercut_id)
            row = db.execute("SELECT merged_into FROM papercuts WHERE id = ?", (papercut_id,)).fetchone()
            if row is None:
                return None
            if row["merged_into"] is None:
                return papercut_id
            papercut_id = row["merged_into"]
        raise RuntimeError(f"Merge cycle at papercut {papercut_id}")

    def get_papercut(self, papercut_id, reports_limit=50):
        with self.connect() as db:
            row = db.execute(
                f"""SELECT p.*, {COUNTS}, {IMPORTANT} AS important
                    FROM papercuts p LEFT JOIN ({STATS}) s ON s.papercut_id = p.id WHERE p.id = ?""",
                (papercut_id,),
            ).fetchone()
            if row is None:
                return None
            papercut = dict(row)
            papercut["fingerprints"] = [r["fingerprint"] for r in db.execute(
                "SELECT fingerprint FROM papercut_fingerprints WHERE papercut_id = ? ORDER BY fingerprint",
                (papercut_id,))]
            papercut["category_votes"] = {r["submitted_category"]: r["votes"] for r in db.execute(
                """SELECT submitted_category, COUNT(*) AS votes FROM reports
                   WHERE papercut_id = ? AND submitted_category IS NOT NULL
                   GROUP BY submitted_category ORDER BY votes DESC""", (papercut_id,))}
            papercut["reports"] = []
            for report in db.execute(
                """SELECT * FROM reports WHERE papercut_id = ?
                   ORDER BY COALESCE(observed_at, received_at) DESC, id DESC LIMIT ?""",
                (papercut_id, reports_limit),
            ):
                report = dict(report)
                report["payload"] = json.loads(report["payload"]) if report["payload"] else None
                papercut["reports"].append(report)
            papercut["related"] = [dict(r) for r in db.execute(
                """SELECT p.id, p.title, p.status, rel.source, rel.score FROM relations rel
                   JOIN papercuts p ON p.id = CASE WHEN rel.papercut_a = ? THEN rel.papercut_b ELSE rel.papercut_a END
                   WHERE (rel.papercut_a = ? OR rel.papercut_b = ?) AND rel.source != 'rejected'
                   ORDER BY rel.source = 'suggested', rel.score DESC""",
                (papercut_id, papercut_id, papercut_id),
            )]
            papercut["events"] = [dict(r) for r in db.execute(
                "SELECT * FROM events WHERE papercut_id = ? ORDER BY id", (papercut_id,))]
            latest = db.execute("SELECT * FROM assessments WHERE papercut_id = ? ORDER BY id DESC LIMIT 1",
                                (papercut_id,)).fetchone()
            papercut["assessment"] = assessment_json(latest) if latest else None
            papercut["dispatches"] = [dict(r) for r in db.execute(
                "SELECT * FROM dispatches WHERE papercut_id = ? ORDER BY id DESC", (papercut_id,))]
            return papercut

    # --- triage ---

    def _live(self, db, papercut_id):
        row = db.execute("SELECT * FROM papercuts WHERE id = ?", (papercut_id,)).fetchone()
        if row is None:
            raise NotFound(f"Papercut {papercut_id} not found")
        if row["merged_into"] is not None:
            raise ConflictError(f"Papercut {papercut_id} was merged into {self._resolve(db, papercut_id)}")
        return row

    @staticmethod
    def _event(db, papercut_id, kind, actor, at, old=None, new=None, body=None):
        db.execute("""INSERT INTO events (papercut_id, at, actor, kind, old_value, new_value, body)
                      VALUES (?, ?, ?, ?, ?, ?, ?)""",
                   (papercut_id, at, actor, kind, None if old is None else str(old),
                    None if new is None else str(new), body))
        db.execute("UPDATE papercuts SET updated_at = ? WHERE id = ?", (at, papercut_id))

    def _set(self, db, papercut_id, field, value, actor, at, kind=None, body=None):
        """Change one triage field and record it. Does nothing when the value is unchanged."""
        old = db.execute(f"SELECT {field} FROM papercuts WHERE id = ?", (papercut_id,)).fetchone()[0]
        if old == value:
            return False
        db.execute(f"UPDATE papercuts SET {field} = ? WHERE id = ?", (value, papercut_id))
        if field == "status":
            db.execute("UPDATE papercuts SET status_changed_at = ? WHERE id = ?", (at, papercut_id))
        self._event(db, papercut_id, kind or field, actor, at, old, value, body)
        return True

    def update_papercut(self, papercut_id, changes):
        editable = {"status", "category", "owner", "severity", "title", "description", "path", "area"}
        if not isinstance(changes, dict) or not set(changes) & editable or set(changes) - editable - {"actor", "reason"}:
            raise ValueError(f"Send at least one of: {', '.join(sorted(editable))}; optionally actor and reason")
        if "status" in changes and changes["status"] not in STATUSES:
            raise ValueError(f"status must be one of: {', '.join(STATUSES)}")
        # A null category, owner or severity sends the papercut back to unknown.
        for key, values in (("category", CATEGORIES), ("owner", OWNERS), ("severity", SEVERITIES)):
            if key in changes and changes[key] is not None and changes[key] not in values:
                raise ValueError(f"{key} must be null or one of: {', '.join(values)}")
        for key in ("title", "description", "path", "area"):
            if key in changes:
                if changes[key] is None:
                    raise ValueError(f"{key} must be a string; send an empty string to clear it")
                text_field(changes, key, required=key == "title")
        actor, reason = actor_of(changes), text_field(changes, "reason")
        with self.connect(write=True) as db:
            self._live(db, papercut_id)
            at = precise_now()
            changed = [key for key in sorted(set(changes) & editable)
                       if self._set(db, papercut_id, key,
                                    changes[key].strip() if isinstance(changes[key], str) else changes[key],
                                    actor, at, body=reason)]
            if {"title", "description"} & set(changed):
                self._suggest_relations(db, papercut_id, at)
        return self.get_papercut(papercut_id)

    def comment(self, papercut_id, payload):
        if not isinstance(payload, dict) or set(payload) - {"author", "body"}:
            raise ValueError("Send body and optionally author")
        body = text_field(payload, "body", required=True)
        with self.connect(write=True) as db:
            self._live(db, papercut_id)
            self._event(db, papercut_id, "comment", text_field(payload, "author") or "anonymous", precise_now(),
                        body=body)
        return self.get_papercut(papercut_id)

    def add_fingerprint(self, papercut_id, payload):
        if not isinstance(payload, dict) or set(payload) - {"fingerprint", "actor"}:
            raise ValueError("Send fingerprint and optionally actor")
        fingerprint = text_field(payload, "fingerprint", required=True)
        with self.connect(write=True) as db:
            papercut = self._live(db, papercut_id)
            owner = db.execute("SELECT papercut_id FROM papercut_fingerprints WHERE repository = ? AND fingerprint = ?",
                               (papercut["repository"], fingerprint)).fetchone()
            if owner and owner["papercut_id"] != papercut_id:
                raise ConflictError(f"Fingerprint already routes to papercut {owner['papercut_id']}; merge instead")
            if not owner:
                db.execute("INSERT INTO papercut_fingerprints (repository, fingerprint, papercut_id) VALUES (?, ?, ?)",
                           (papercut["repository"], fingerprint, papercut_id))
                self._event(db, papercut_id, "fingerprint", actor_of(payload), precise_now(), new=fingerprint)
        return self.get_papercut(papercut_id)

    def merge(self, source_id, payload):
        """Move every report and fingerprint of `source_id` into `into`, in one transaction.

        Triage carries over only when both papercuts agree on status and category; otherwise the merged
        papercut goes back to `open`. Old values stay in the event history.
        """
        if not isinstance(payload, dict) or type(payload.get("into")) is not int or set(payload) - {"into", "actor", "reason"}:
            raise ValueError("Send into (a papercut id) and optionally actor and reason")
        actor, reason = actor_of(payload), text_field(payload, "reason")
        with self.connect(write=True) as db:
            source = self._live(db, source_id)
            target_id = self._resolve(db, payload["into"])
            if target_id is None:
                raise NotFound(f"Papercut {payload['into']} not found")
            if target_id == source_id:
                raise ValueError("A papercut cannot be merged into itself")
            target = self._live(db, target_id)
            if source["repository"] != target["repository"]:
                raise ValueError("Merged papercuts must be in the same repository")
            if all(self._active_dispatch(db, papercut_id) for papercut_id in (source_id, target_id)):
                raise ConflictError(f"Papercuts {source_id} and {target_id} both have a dispatch in progress")
            at = precise_now()
            db.execute("UPDATE reports SET papercut_id = ? WHERE papercut_id = ?", (target_id, source_id))
            # An agent already working on the source is now working on the target.
            db.execute(f"UPDATE dispatches SET papercut_id = ? WHERE papercut_id = ? AND state IN ({one_of(ACTIVE_DISPATCH_STATES)})",
                       (target_id, source_id))
            db.execute("UPDATE papercut_fingerprints SET papercut_id = ? WHERE papercut_id = ?", (target_id, source_id))
            self._move_relations(db, source_id, target_id, at)
            if (source["status"], source["category"]) != (target["status"], target["category"]):
                self._set(db, target_id, "status", "open", actor, at, body=f"Merged #{source_id}; triage again")
            if target["category"] is None and source["category"] is not None:
                self._set(db, target_id, "category", source["category"], actor, at, body=f"From merged #{source_id}")
            db.execute(
                """UPDATE papercuts SET
                       first_seen = (SELECT MIN(COALESCE(observed_at, received_at)) FROM reports WHERE papercut_id = ?),
                       last_seen = (SELECT MAX(COALESCE(observed_at, received_at)) FROM reports WHERE papercut_id = ?)
                   WHERE id = ?""",
                (target_id, target_id, target_id),
            )
            db.execute("UPDATE papercuts SET merged_into = ? WHERE id = ?", (target_id, source_id))
            self._event(db, source_id, "merged", actor, at, new=target_id, body=reason)
            self._event(db, target_id, "absorbed", actor, at, new=source_id, body=reason)
            self._suggest_relations(db, target_id, at)
        return self.get_papercut(target_id)

    @staticmethod
    def _move_relations(db, source_id, target_id, at):
        rows = db.execute("SELECT * FROM relations WHERE papercut_a = ? OR papercut_b = ?",
                          (source_id, source_id)).fetchall()
        db.execute("DELETE FROM relations WHERE papercut_a = ? OR papercut_b = ?", (source_id, source_id))
        for row in rows:
            other = row["papercut_b"] if row["papercut_a"] == source_id else row["papercut_a"]
            if other == target_id:
                continue
            # Its relation now points at the target, or is gone; either way polling clients must refetch it.
            db.execute("UPDATE papercuts SET updated_at = ? WHERE id = ?", (at, other))
            pair = (min(other, target_id), max(other, target_id))
            existing = db.execute("SELECT source FROM relations WHERE papercut_a = ? AND papercut_b = ?", pair).fetchone()
            # The target's own decision wins, unless it was only a suggestion and the source's was a person's.
            if existing and (existing["source"] != "suggested" or row["source"] == "suggested"):
                continue
            db.execute(
                """INSERT INTO relations (repository, papercut_a, papercut_b, source, score, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT (papercut_a, papercut_b) DO UPDATE
                   SET source = excluded.source, score = excluded.score, updated_at = excluded.updated_at""",
                (row["repository"], *pair, row["source"], row["score"], at),
            )

    def _suggest_relations(self, db, papercut_id, at):
        """Recompute suggested relations for one papercut. Manual and rejected relations are kept."""
        papercut = db.execute("SELECT * FROM papercuts WHERE id = ?", (papercut_id,)).fetchone()
        dropped = db.execute(
            """SELECT CASE WHEN papercut_a = ? THEN papercut_b ELSE papercut_a END FROM relations
               WHERE source = 'suggested' AND (papercut_a = ? OR papercut_b = ?)""",
            (papercut_id, papercut_id, papercut_id)).fetchall()
        db.execute("DELETE FROM relations WHERE source = 'suggested' AND (papercut_a = ? OR papercut_b = ?)",
                   (papercut_id, papercut_id))
        # The other side lists this relation too, so polling clients must refetch it.
        db.executemany("UPDATE papercuts SET updated_at = ? WHERE id = ?", [(at, row[0]) for row in dropped])
        decided = {r["other"] for r in db.execute(
            """SELECT CASE WHEN papercut_a = ? THEN papercut_b ELSE papercut_a END AS other FROM relations
               WHERE papercut_a = ? OR papercut_b = ?""", (papercut_id, papercut_id, papercut_id))}
        text = f"{papercut['title']} {papercut['description']}"
        for row in db.execute(
            "SELECT id, title, description FROM papercuts WHERE repository = ? AND id != ? AND merged_into IS NULL",
            (papercut["repository"], papercut_id),
        ).fetchall():
            if row["id"] in decided:
                continue
            score = similarity(text, f"{row['title']} {row['description']}")
            if score >= SUGGEST_THRESHOLD:
                db.execute(
                    """INSERT INTO relations (repository, papercut_a, papercut_b, source, score, updated_at)
                       VALUES (?, ?, ?, 'suggested', ?, ?)""",
                    (papercut["repository"], min(papercut_id, row["id"]), max(papercut_id, row["id"]), score, at),
                )
                db.execute("UPDATE papercuts SET updated_at = ? WHERE id = ?", (at, row["id"]))

    def relate(self, papercut_id, payload):
        return self._decide_relation(papercut_id, payload, "manual")

    def unrelate(self, papercut_id, other_id, payload):
        return self._decide_relation(papercut_id, {**(payload or {}), "papercut_id": other_id}, "rejected")

    def _decide_relation(self, papercut_id, payload, source):
        if not isinstance(payload, dict) or type(payload.get("papercut_id")) is not int or set(payload) - {"papercut_id", "actor"}:
            raise ValueError("Send papercut_id (an integer) and optionally actor")
        other_id = payload["papercut_id"]
        if papercut_id == other_id:
            raise ValueError("A papercut cannot be related to itself")
        with self.connect(write=True) as db:
            this, other = self._live(db, papercut_id), self._live(db, other_id)
            if this["repository"] != other["repository"]:
                raise ValueError("Related papercuts must be in the same repository")
            at = precise_now()
            db.execute(
                """INSERT INTO relations (repository, papercut_a, papercut_b, source, score, updated_at)
                   VALUES (?, ?, ?, ?, NULL, ?)
                   ON CONFLICT (papercut_a, papercut_b) DO UPDATE
                   SET source = excluded.source, score = NULL, updated_at = excluded.updated_at""",
                (this["repository"], min(papercut_id, other_id), max(papercut_id, other_id), source, at),
            )
            kind = "related" if source == "manual" else "unrelated"
            for one, two in ((papercut_id, other_id), (other_id, papercut_id)):
                self._event(db, one, kind, actor_of(payload), at, new=two)
        return self.get_papercut(papercut_id)

    # --- assessment and dispatch ---

    def assess(self, papercut_id, payload):
        """Record a readiness assessment. Only a change of verdict is an event, so re-assessing a papercut whose
        verdict holds does not put it back in the change feed."""
        fields = {"verdict", "evidence_score", "fixability_score", "fixability_confidence", "inputs", "model",
                  "reason", "actor"}
        if not isinstance(payload, dict) or set(payload) - fields:
            raise ValueError(f"Send verdict and optionally: {', '.join(sorted(fields - {'verdict'}))}")
        if payload.get("verdict") not in VERDICTS:
            raise ValueError(f"verdict must be one of: {', '.join(VERDICTS)}")
        scores = {key: number_field(payload, key) for key in ("evidence_score", "fixability_score")}
        confidence = number_field(payload, "fixability_confidence", 0, 1)
        inputs = payload.get("inputs")
        if inputs is not None and not isinstance(inputs, dict):
            raise ValueError("inputs must be an object")
        model, reason, actor = text_field(payload, "model"), text_field(payload, "reason"), actor_of(payload)
        with self.connect(write=True) as db:
            self._live(db, papercut_id)
            previous = db.execute("SELECT verdict FROM assessments WHERE papercut_id = ? ORDER BY id DESC LIMIT 1",
                                  (papercut_id,)).fetchone()
            at = precise_now()
            row_id = db.execute(
                """INSERT INTO assessments (papercut_id, at, actor, verdict, evidence_score, fixability_score,
                                            fixability_confidence, inputs, model, reason)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (papercut_id, at, actor, payload["verdict"], scores["evidence_score"], scores["fixability_score"],
                 confidence, None if inputs is None else json.dumps(inputs), model, reason),
            ).lastrowid
            if previous is None or previous["verdict"] != payload["verdict"]:
                self._event(db, papercut_id, "assessed", actor, at,
                            old=previous["verdict"] if previous else None, new=payload["verdict"], body=reason)
            return assessment_json(db.execute("SELECT * FROM assessments WHERE id = ?", (row_id,)).fetchone())

    @staticmethod
    def _active_dispatch(db, papercut_id):
        return db.execute(f"SELECT * FROM dispatches WHERE papercut_id = ? AND state IN ({one_of(ACTIVE_DISPATCH_STATES)})",
                          (papercut_id,)).fetchone()

    def claim(self, papercut_id, payload):
        """Start a dispatch on an open papercut, which moves it to `investigating`. At most one dispatch per papercut
        is in progress."""
        if not isinstance(payload, dict) or set(payload) - {"actor", "reason", "assessment_id"}:
            raise ValueError("Send optionally actor, reason and assessment_id")
        assessment_id = payload.get("assessment_id")
        if assessment_id is not None and type(assessment_id) is not int:
            raise ValueError("assessment_id must be an integer")
        actor, reason = actor_of(payload), text_field(payload, "reason")
        with self.connect(write=True) as db:
            papercut = self._live(db, papercut_id)
            if active := self._active_dispatch(db, papercut_id):
                raise ConflictError(f"Papercut {papercut_id} already has dispatch {active['id']} in progress")
            if papercut["status"] != "open":
                raise ConflictError(f"Papercut {papercut_id} is {papercut['status']}; only open papercuts are dispatched")
            if assessment_id is not None and not db.execute(
                    "SELECT 1 FROM assessments WHERE id = ? AND papercut_id = ?", (assessment_id, papercut_id)).fetchone():
                raise ValueError(f"Assessment {assessment_id} is not an assessment of papercut {papercut_id}")
            at = precise_now()
            dispatch_id = db.execute(
                """INSERT INTO dispatches (papercut_id, assessment_id, state, actor, created_at, updated_at)
                   VALUES (?, ?, 'claimed', ?, ?, ?)""",
                (papercut_id, assessment_id, actor, at, at),
            ).lastrowid
            self._event(db, papercut_id, "dispatched", actor, at, new=dispatch_id, body=reason)
            self._set(db, papercut_id, "status", "investigating", actor, at, body=f"Dispatch {dispatch_id}")
            return dict(db.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone())

    def update_dispatch(self, dispatch_id, payload):
        """Move a dispatch forward and record its links. A final state hands the papercut back: `already_fixed`
        resolves it, and the other outcomes except `pr_opened` reopen it, unless someone has already changed its status."""
        fields = {"state", *DISPATCH_FIELDS, "cost_usd", "actor", "reason"}
        if not isinstance(payload, dict) or not set(payload) & (fields - {"actor", "reason"}) or set(payload) - fields:
            raise ValueError(f"Send at least one of: {', '.join(sorted(fields - {'actor', 'reason'}))}; "
                             "optionally actor and reason")
        links = {key: text_field(payload, key) for key in DISPATCH_FIELDS if key in payload}
        cost_usd = number_field(payload, "cost_usd", 0)
        actor, reason, state = actor_of(payload), text_field(payload, "reason"), payload.get("state")
        with self.connect(write=True) as db:
            dispatch = db.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
            if dispatch is None:
                raise NotFound(f"Dispatch {dispatch_id} not found")
            if state is not None and state != dispatch["state"]:
                if state not in DISPATCH_STATES:
                    raise ValueError(f"state must be one of: {', '.join(DISPATCH_STATES)}")
                if state not in DISPATCH_TRANSITIONS.get(dispatch["state"], ()):
                    raise ValueError(f"Dispatch {dispatch_id} cannot move from {dispatch['state']} to {state}")
            else:
                state = dispatch["state"]
            changes = {**links, **({"cost_usd": cost_usd} if "cost_usd" in payload else {})}
            changed = {key: value for key, value in changes.items() if dispatch[key] != value}
            if state == dispatch["state"] and not changed:
                return dict(dispatch)
            at = precise_now()
            assignments = ", ".join(f"{key} = ?" for key in ("state", *changed, "updated_at"))
            db.execute(f"UPDATE dispatches SET {assignments} WHERE id = ?", (state, *changed.values(), at, dispatch_id))
            papercut_id = dispatch["papercut_id"]
            details = "; ".join(f"{key}: {value}" for key, value in changed.items())
            self._event(db, papercut_id, "dispatch_updated", actor, at, old=dispatch["state"], new=state,
                        body="\n".join(part for part in (reason, details) if part) or None)
            status = db.execute("SELECT status FROM papercuts WHERE id = ?", (papercut_id,)).fetchone()["status"]
            if state != dispatch["state"] and state in STATUS_AFTER_DISPATCH and status == "investigating":
                self._set(db, papercut_id, "status", STATUS_AFTER_DISPATCH[state], actor, at,
                          body=f"Dispatch {dispatch_id}: {state}")
            return dict(db.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone())

    def get_dispatch(self, dispatch_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM dispatches WHERE id = ?", (dispatch_id,)).fetchone()
        if row is None:
            raise NotFound(f"Dispatch {dispatch_id} not found")
        return dict(row)

    def list_dispatches(self, filters=None):
        filters = filters or {}
        clauses, params = [], []
        if state := filters.get("state"):
            if state == "active":
                clauses.append(f"d.state IN ({one_of(ACTIVE_DISPATCH_STATES)})")
            elif state in DISPATCH_STATES:
                clauses.append("d.state = ?")
                params.append(state)
            else:
                raise ValueError(f"state must be active or one of: {', '.join(DISPATCH_STATES)}")
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self.connect() as db:
            return [dict(r) for r in db.execute(
                f"""SELECT d.*, p.title, p.repository FROM dispatches d JOIN papercuts p ON p.id = d.papercut_id
                    {where} ORDER BY d.id DESC""", params)]


STYLE = """<style>
:root {
  color-scheme: light;
  --background: #f5f6f8; --surface: #fff; --text: #202b36;
  --muted: #607181; --link: #215ca4; --border: #dce3e9;
  --control-border: #b8c5d0; --pill: #edf2f6; --hover: #f1f5f9;
  --accent: #245fa8; --accent-text: #fff; --shadow: 0 8px 28px rgba(29, 48, 66, .045);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark; --background: #101820; --surface: #1b2732;
    --text: #e8edf2; --muted: #aab8c5; --link: #99c5ff;
    --border: #354554; --control-border: #6a7e8f; --pill: #2b3c4b;
    --hover: #263849; --accent: #9ac7ff; --accent-text: #10202e;
    --shadow: none;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark; --background: #101820; --surface: #1b2732;
  --text: #e8edf2; --muted: #aab8c5; --link: #99c5ff;
  --border: #354554; --control-border: #6a7e8f; --pill: #2b3c4b;
  --hover: #263849; --accent: #9ac7ff; --accent-text: #10202e;
  --shadow: none;
}
* {box-sizing: border-box}
body {font: 15px/1.5 system-ui, sans-serif; max-width: 1180px; margin: 0 auto; padding: 0 1.5rem 4rem; color: var(--text); background: var(--background)}
a {color: var(--link); text-decoration: none}
a:hover {text-decoration: underline}
button, input, select {font: inherit}
button, select {cursor: pointer}
button, input, select {color: var(--text); background: var(--surface); border: 1px solid var(--control-border); border-radius: 8px; min-height: 42px; padding: .55rem .7rem}
button:hover, select:hover {background: var(--hover)}
button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible {outline: 3px solid var(--accent); outline-offset: 2px}
.site-header {display: flex; justify-content: space-between; align-items: center; gap: 1rem; min-height: 76px; border-bottom: 1px solid var(--border)}
.brand {font-weight: 760; font-size: 1.18rem; letter-spacing: -.025em; color: var(--text)}
.brand:hover {text-decoration: none}
.header-actions {display: flex; align-items: center; gap: .55rem; flex-wrap: wrap}
.header-actions button {font-size: .86rem; min-height: 36px}
.muted, .eyebrow {color: var(--muted)}
.eyebrow {font-size: .73rem; font-weight: 750; letter-spacing: .12em; text-transform: uppercase}
.intro {padding: 2.1rem 0 1.45rem}
.intro h1 {font-size: clamp(1.8rem, 4vw, 2.65rem); letter-spacing: -.045em; line-height: 1.1; margin: .35rem 0}
.intro p {margin: 0; color: var(--muted)}
.toolbar {display: grid; grid-template-columns: minmax(180px, 2fr) repeat(3, minmax(105px, 1fr)) minmax(145px, 1.2fr) minmax(75px, .65fr) auto; align-items: end; gap: .75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1rem; box-shadow: var(--shadow)}
.toolbar.single-repository {grid-template-columns: minmax(230px, 2.2fr) repeat(2, minmax(120px, 1fr)) minmax(155px, 1.25fr) minmax(75px, .65fr) auto}
.filter-field {display: flex; flex-direction: column; gap: .3rem; min-width: 0}
.filter-field label {font-size: .79rem; font-weight: 700; color: var(--muted)}
.filter-field input, .filter-field select {width: 100%; margin: 0}
.filter-actions {display: flex; align-items: center; justify-content: end; min-height: 42px; white-space: nowrap}
.primary {background: var(--accent); color: var(--accent-text); border-color: var(--accent); font-weight: 700}
.primary:hover {filter: brightness(.94); background: var(--accent)}
.results-heading {display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin: 1.6rem 0 .7rem}
.results-heading h2 {font-size: 1.15rem; margin: 0}
.results-heading p {margin: 0; font-size: .85rem}
.issue-list {list-style: none; padding: 0; margin: 0; display: grid; gap: .7rem}
.card {background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.15rem 1.3rem; box-shadow: var(--shadow)}
.issue-card {display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .35rem 1rem}
.issue-card:hover {border-color: var(--control-border)}
.issue-card h3 {font-size: 1.09rem; line-height: 1.35; letter-spacing: -.015em; margin: .15rem 0 .45rem}
.issue-card .issue-number {font-size: .85rem; font-weight: 600; color: var(--muted); margin-right: .35rem}
.issue-card .location {grid-column: 1 / -1; margin: 0; color: var(--muted); font-size: .86rem; overflow-wrap: anywhere}
.issue-summary {grid-column: 1 / -1; color: var(--text); margin: 0; line-height: 1.48}
.issue-facts {grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: .35rem .6rem; margin: .35rem 0 0}
.issue-facts div {display: flex; align-items: baseline; gap: .35rem; padding: .22rem .55rem; background: var(--pill); border-radius: 6px; font-size: .78rem}
.issue-facts dt {color: var(--muted); font-weight: 650}
.issue-facts dd {margin: 0; font-weight: 650}
.issue-stats {grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .6rem; padding-top: .8rem; margin-top: .35rem; border-top: 1px solid var(--border)}
.issue-stats div {display: flex; flex-direction: column; min-width: 0}
.issue-stats strong {font-size: .92rem; font-weight: 700; color: var(--text)}
.issue-stats span {font-size: .76rem; color: var(--muted)}
.badges {display: flex; align-items: start; flex-wrap: wrap; justify-content: end; gap: .35rem}
.pill {display: inline-block; background: var(--pill); border-radius: 1rem; padding: .16rem .65rem; font-size: .78rem; font-weight: 650; white-space: nowrap}
.status-open {background: #e7f4ec; color: #175d32}
.status-investigating {background: #fff0d7; color: #805100}
.status-resolved {background: #e7edfa; color: #294d91}
.status-wontfix {background: #f0eaf3; color: #6b467b}
:root[data-theme="dark"] .status-open {background: #214a35; color: #baf0ca}
:root[data-theme="dark"] .status-investigating {background: #5b431b; color: #ffe0a1}
:root[data-theme="dark"] .status-resolved {background: #2b416a; color: #c9dcff}
:root[data-theme="dark"] .status-wontfix {background: #493750; color: #e8c6f2}
.empty {text-align: center; padding: 3rem 1rem; background: var(--surface); border: 1px dashed var(--border); border-radius: 12px; color: var(--muted)}
.pagination {display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 1.2rem; color: var(--muted)}
.pagination-links {display: flex; gap: .5rem}
.pagination a {display: inline-block; padding: .45rem .75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px}
.detail-head {padding: 1.7rem 0 1.2rem}
.detail-head h1 {font-size: clamp(1.7rem, 3vw, 2.3rem); line-height: 1.2; letter-spacing: -.035em; margin: .5rem 0}
.detail-meta {display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .7rem}
.detail-layout {display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 1rem; align-items: start}
.detail-layout section {margin-bottom: 1rem}
.detail-layout h2 {font-size: 1.02rem; margin: 0 0 .8rem}
.detail-layout p, .detail-layout pre {margin: .45rem 0}
.detail-layout pre {white-space: pre-wrap; overflow-wrap: anywhere; font: inherit}
.markdown p:first-child {margin-top: 0}
.markdown p:last-child {margin-bottom: 0}
.markdown ul, .markdown ol {padding-left: 1.4rem}
.markdown li {margin: .25rem 0}
.markdown code {font: .88em ui-monospace, SFMono-Regular, monospace; padding: .1em .28em; background: var(--pill); border-radius: 4px}
.markdown pre {padding: .8rem; overflow-x: auto; background: var(--pill); border-radius: 8px; white-space: pre}
.markdown pre code {padding: 0; background: none}
.markdown blockquote {border-left: 3px solid var(--border); padding-left: 1rem; margin: .8rem 0; color: var(--muted)}
.markdown .table-wrap {overflow-x: auto; margin: 1rem 0}
.markdown table {border-collapse: collapse; width: 100%; min-width: 560px; font-size: .88rem}
.markdown th, .markdown td {border: 1px solid var(--border); padding: .5rem .65rem; vertical-align: top; text-align: left}
.markdown th {background: var(--pill)}
.markdown tr:nth-child(even) td {background: var(--hover)}
.detail-sidebar dl {margin: 0; display: grid; gap: .7rem}
.detail-sidebar dt {font-size: .77rem; font-weight: 700; color: var(--muted)}
.detail-sidebar dd {margin: 0; overflow-wrap: anywhere}
.fact-grid {display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; margin: 0}
.fact-grid dt {font-size: .78rem; font-weight: 700; color: var(--muted)}
.fact-grid dd {margin: .1rem 0 0; overflow-wrap: anywhere}
.suggested-fix {border-left: 4px solid var(--accent)}
.plain-list {list-style: none; margin: 0; padding: 0}
.plain-list li {padding: .55rem 0; border-top: 1px solid var(--border)}
.plain-list li:first-child {border-top: 0}
.report-card {margin: .65rem 0}
.report-card h3 {font-size: .95rem; margin: 0}
.report-card p {margin: .4rem 0}
.report-card summary {cursor: pointer; font-weight: 650; margin-top: .4rem}
@media (max-width: 930px) {.toolbar, .toolbar.single-repository {grid-template-columns: repeat(3, minmax(0, 1fr))} .detail-layout {grid-template-columns: 1fr}}
@media (max-width: 600px) {body {padding: 0 .85rem 2rem} .site-header {align-items: flex-start; padding: 1rem 0} .header-actions {justify-content: end} .toolbar, .toolbar.single-repository {grid-template-columns: repeat(2, minmax(0, 1fr))} .toolbar .filter-field:first-child {grid-column: 1 / -1} .fact-grid {grid-template-columns: 1fr} .issue-card {grid-template-columns: 1fr} .issue-stats {grid-template-columns: repeat(2, minmax(0, 1fr))} .badges {justify-content: start} .results-heading, .pagination {align-items: flex-start; flex-direction: column}}
</style>"""

THEME_INIT = """<script>
try {
  const theme = localStorage.getItem('papercuts-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (_) {}
</script>"""

ICONS = {
    "system": "<rect x='2' y='3' width='20' height='14' rx='2'/><path d='M8 21h8M12 17v4'/>",
    "light": "<circle cx='12' cy='12' r='4'/><path d='M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2"
             "M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41'/>",
    "dark": "<path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'/>",
    "flame": "<path d='M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5"
             "a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z'/>",
    "chevron": "<path d='m6 9 6 6 6-6'/>",
}


def icon(name):
    return f"<svg class='icon' viewBox='0 0 24 24' aria-hidden='true'>{ICONS[name]}</svg>"


THEME_SWITCH = ("<div class='theme-switch' role='group' aria-label='Color theme'>" + "".join(
    f"<button type='button' data-theme-choice='{theme}' title='{label}' aria-label='{label}'>{icon(theme)}</button>"
    for theme, label in (("system", "Theme follows your OS"), ("light", "Light theme"), ("dark", "Dark theme"))) + "</div>")

THEME_CONTROL = """<script>
const themeButtons = document.querySelectorAll('[data-theme-choice]');
function showTheme() {
  const chosen = document.documentElement.dataset.theme || 'system';
  for (const button of themeButtons) button.setAttribute('aria-pressed', button.dataset.themeChoice === chosen);
}
for (const button of themeButtons) {
  button.addEventListener('click', () => {
    const choice = button.dataset.themeChoice;
    if (choice === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
    try { localStorage.setItem('papercuts-theme', choice); } catch (_) {}
    showTheme();
  });
}
showTheme();
</script>"""

LIVE_REFRESH = """<script>
const refreshButton = document.getElementById('refresh-now');
const liveStatus = document.getElementById('live-status');
const filterForm = document.getElementById('filters');
let refreshSerial = 0;
let filterTimer;
async function refreshPage(url = window.location.href) {
  if (document.hidden || filterTimer) return;
  const serial = ++refreshSerial;
  liveStatus.textContent = 'Checking for updates…';
  try {
    const response = await fetch(url, {cache: 'no-store'});
    if (serial !== refreshSerial) return;
    if (!response.ok) throw new Error('Refresh failed');
    if (new URL(response.url).pathname !== window.location.pathname) {
      window.location.assign(response.url);
      return;
    }
    const next = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (serial !== refreshSerial) return;
    if (next.body.dataset.build !== document.body.dataset.build) {
      window.location.reload();
      return;
    }
    const currentMain = document.querySelector('main');
    const nextMain = next.querySelector('main');
    if (!nextMain) throw new Error('Missing page content');
    const currentResults = document.getElementById('results');
    const nextResults = next.getElementById('results');
    if (currentResults && nextResults) {
      if (currentResults.innerHTML !== nextResults.innerHTML) currentResults.replaceWith(nextResults);
    } else if (currentMain.innerHTML !== nextMain.innerHTML) {
      currentMain.replaceWith(nextMain);
    }
    liveStatus.textContent = 'Live · just checked';
  } catch (_) {
    if (serial === refreshSerial) liveStatus.textContent = 'Connection lost · retrying';
  }
}
if (filterForm) {
  function applyFilters() {
    filterTimer = undefined;
    const params = new URLSearchParams(new FormData(filterForm));
    for (const key of [...params.keys()]) if (!params.get(key)) params.delete(key);
    const url = '/' + (params.size ? '?' + params.toString() : '');
    history.replaceState(null, '', url);
    refreshPage(url);
  }
  filterForm.addEventListener('input', event => {
    clearTimeout(filterTimer);
    ++refreshSerial;
    filterTimer = setTimeout(applyFilters, event.target.matches('input') ? 300 : 0);
  });
  filterForm.addEventListener('change', () => {
    clearTimeout(filterTimer);
    ++refreshSerial;
    applyFilters();
  });
  filterForm.addEventListener('submit', event => {
    event.preventDefault();
    clearTimeout(filterTimer);
    ++refreshSerial;
    applyFilters();
  });
}
refreshButton.addEventListener('click', () => refreshPage());
setInterval(refreshPage, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPage(); });
</script>"""

DARK_STATES = ("--important: #fb923c; --danger-bg: #5a2727; --danger-text: #ffc9c9; --warning-bg: #5b431b; --warning-text: #ffe0a1; "
               "--success-bg: #214a35; --success-text: #baf0ca; --info-bg: #2b416a; --info-text: #c9dcff")

UI_STYLE = """<style>
:root {--important: #c2410c; --danger-bg: #fde7e7; --danger-text: #9f1d1d; --warning-bg: #fff0d7; --warning-text: #805100;
       --success-bg: #e7f4ec; --success-text: #175d32; --info-bg: #e7edfa; --info-text: #294d91}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {""" + DARK_STATES + """}
  :root:not([data-theme="light"]) .status-open {background: #214a35; color: #baf0ca}
  :root:not([data-theme="light"]) .status-investigating {background: #5b431b; color: #ffe0a1}
  :root:not([data-theme="light"]) .status-resolved {background: #2b416a; color: #c9dcff}
  :root:not([data-theme="light"]) .status-wontfix {background: #493750; color: #e8c6f2}
}
:root[data-theme="dark"] {""" + DARK_STATES + """}
.icon {width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round}
.theme-switch {display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface)}
.header-actions .theme-switch button {display: grid; place-items: center; width: 32px; min-height: 30px; padding: 0; border: 0; border-radius: 7px;
                                      background: none; color: var(--muted)}
.header-actions .theme-switch button:hover {color: var(--text); background: var(--hover)}
.header-actions .theme-switch button[aria-pressed=true] {color: var(--text); background: var(--pill)}
@media (min-width: 931px) {
  .toolbar {grid-template-columns: minmax(180px, 2fr) repeat(2, minmax(105px, 1fr)) minmax(145px, 1.2fr) minmax(75px, .65fr) auto}
  .toolbar.single-repository {grid-template-columns: minmax(230px, 2.2fr) minmax(120px, 1fr) minmax(155px, 1.25fr) minmax(75px, .65fr) auto}
}
.dropdown {position: relative}
.dropdown-button {display: flex; align-items: center; justify-content: space-between; gap: .5rem; width: 100%; text-align: left}
.dropdown-button .icon {color: var(--muted)}
.dropdown-menu {display: none; position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; min-width: 100%; padding: 6px;
                background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 32px rgba(16, 24, 32, .18)}
.dropdown.open .dropdown-menu {display: block}
.dropdown-menu button {display: flex; justify-content: space-between; gap: 1.5rem; width: 100%; min-height: 0; padding: .45rem .6rem; border: 0;
                       border-radius: 8px; background: none; text-align: left; white-space: nowrap}
.dropdown-menu button:hover {background: var(--hover)}
.dropdown-menu button[aria-selected=true] {font-weight: 700}
.dropdown-menu button[aria-selected=true]::after {content: "✓"; color: var(--accent)}
.chips {display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-top: 1.3rem}
.chips .eyebrow {margin-right: .3rem}
.chip {display: inline-flex; align-items: center; gap: .45rem; min-height: 34px; padding: 0 .85rem; border: 1px dashed var(--control-border);
       border-radius: 999px; background: none; color: var(--muted); font-size: .86rem}
.chip::before {content: ""; width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--dot, var(--muted))}
.chip .count {font-size: .78rem; color: var(--muted); font-variant-numeric: tabular-nums}
.chip[aria-pressed=true] {border-style: solid; border-color: var(--border); background: var(--surface); color: var(--text); font-weight: 650;
                          box-shadow: var(--shadow)}
.chip[aria-pressed=true]::before {background: var(--dot, var(--muted))}
.chip.none {opacity: .55}
.chip[data-value=agent-trap] {--dot: #8b5cf6}
.chip[data-value=code-smell] {--dot: #d99a2b}
.chip[data-value=flaky-test] {--dot: #e25c5c}
.chip[data-value=tooling] {--dot: #14a3a3}
.chip[data-value=documentation] {--dot: #4f86e0}
.chips .link {min-height: 0; padding: 0 .2rem; border: 0; background: none; color: var(--link)}
.issue-card.important {border-left: 4px solid var(--important)}
.pill.important {display: inline-flex; align-items: center; gap: .3rem; color: var(--important); background: none; box-shadow: inset 0 0 0 1px currentColor}
.pill.important .icon {width: 12px; height: 12px; fill: currentColor; stroke-width: 1.5}
.severity-high, .fix-failed {background: var(--danger-bg); color: var(--danger-text)}
.report-card summary {display: inline-flex; align-items: center; gap: .45rem; list-style: none}
.report-card summary::-webkit-details-marker {display: none}
.report-card summary::before {content: ""; width: 6px; height: 6px; border: solid var(--muted); border-width: 0 2px 2px 0;
                              transform: rotate(-45deg); transition: transform .15s}
.report-card details[open] > summary::before {transform: rotate(45deg)}
.severity-medium, .fix-needs_human {background: var(--warning-bg); color: var(--warning-text)}
.fix-pr_opened, .fix-already_fixed {background: var(--success-bg); color: var(--success-text)}
.fix-claimed, .fix-linear_created, .fix-running {background: var(--info-bg); color: var(--info-text)}
</style>"""

UI_SCRIPT = """<script>
(() => {
  const form = document.getElementById('filters');
  if (!form) return;
  const dropdowns = [];
  const close = (except) => dropdowns.forEach((dropdown) => dropdown !== except && dropdown.classList.remove('open'));
  for (const select of form.querySelectorAll('.filter-field select')) {
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown';
    dropdown.innerHTML = `<button type='button' class='dropdown-button' id='${select.id}-menu'><span></span>CHEVRON</button>` +
      "<div class='dropdown-menu' role='listbox'></div>";
    const [button, menu] = dropdown.children;
    const labels = [...new Set([...select.options].reverse().map((option) => option.textContent))].reverse();
    for (const label of labels) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'option');
      item.textContent = label;
      item.addEventListener('click', () => {
        select.value = [...select.options].find((option) => option.textContent === label).value;
        select.dispatchEvent(new Event('change', {bubbles: true}));
        dropdown.classList.remove('open');
        show();
      });
      menu.append(item);
    }
    function show() {
      const chosen = select.selectedOptions[0]?.textContent ?? '';
      button.firstChild.textContent = chosen;
      for (const item of menu.children) item.setAttribute('aria-selected', item.textContent === chosen);
    }
    button.addEventListener('click', () => {
      close(dropdown);
      dropdown.classList.toggle('open');
    });
    select.closest('.filter-field').querySelector('label').htmlFor = button.id;
    select.hidden = true;
    select.after(dropdown);
    dropdowns.push(dropdown);
    show();
  }
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.dropdown')) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  const category = form.elements.category;
  document.addEventListener('click', (event) => {
    const target = event.target.closest('.chip, [data-chips]');
    if (!target || !category) return;
    const chips = [...document.querySelectorAll('.chip')];
    const chosen = new Set(chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true').map((chip) => chip.dataset.value));
    if (target.dataset.chips === 'all') chips.forEach((chip) => chosen.add(chip.dataset.value));
    else if (target.dataset.chips === 'none') chosen.clear();
    else if (chosen.has(target.dataset.value)) chosen.delete(target.dataset.value);
    else chosen.add(target.dataset.value);
    for (const chip of chips) chip.setAttribute('aria-pressed', chosen.has(chip.dataset.value));
    category.value = chosen.size === chips.length ? '' : [...chosen].join(',') || 'none';
    category.dispatchEvent(new Event('change', {bubbles: true}));
  });
})();
</script>""".replace("CHEVRON", icon("chevron"))

FIX_LABELS = {"claimed": "claimed", "linear_created": "ticket filed", "running": "fixing", "pr_opened": "PR opened",
              "already_fixed": "already fixed", "needs_human": "needs a human", "not_reproducible": "not reproducible",
              "failed": "fix failed"}


def fix_pill(state):
    return f"<span class='pill fix-{state}'>{html.escape(FIX_LABELS.get(state, state))}</span>" if state else ""


def severity_pill(severity):
    return f"<span class='pill severity-{severity}'>severity: {html.escape(severity)}</span>" if severity else ""


def important_pill(papercut):
    return (f"<span class='pill important' title='2+ reporters, 3+ reports, an hour lost or high severity'>{icon('flame')}"
            "important</span>") if papercut["important"] else ""


def category_chips(chosen, counts):
    categories = (*CATEGORIES, "unclassified")
    picked = set(chosen.split(",")) if chosen else set(categories)
    chips = "".join(
        f"<button type='button' class='chip{'' if counts.get(category) else ' none'}' data-value='{category}' "
        f"aria-pressed='{str(category in picked).lower()}'>{category}<span class='count'>{counts.get(category, 0)}</span></button>"
        for category in categories)
    return (f"<div class='chips' role='group' aria-label='Category'><span class='eyebrow'>Category</span>{chips}"
            "<button type='button' class='link' data-chips='all'>All</button><span class='muted'>·</span>"
            "<button type='button' class='link' data-chips='none'>None</button></div>")


def page(title, body):
    return (f"<!doctype html><html><head><meta charset='utf-8'><title>{html.escape(title)}</title>"
            "<meta name='viewport' content='width=device-width, initial-scale=1'>"
            f"{THEME_INIT}{STYLE}{UI_STYLE}</head><body data-build='{SOURCE_VERSION}'>"
            "<header class='site-header'>"
            "<a class='brand' href='/'>✳ Papercuts</a><div class='header-actions'>"
            "<span id='live-status' class='muted' role='status' aria-live='polite'>Live · updates every 15s</span>"
            "<button id='refresh-now' type='button'>Refresh now</button>"
            f"{THEME_SWITCH}</div></header><main>{body}</main>{THEME_CONTROL}{LIVE_REFRESH}{UI_SCRIPT}</body></html>")


def cost(minutes):
    return f" · {minutes:g} min lost" if minutes else ""


def pill(value):
    return f"<span class='pill'>{html.escape(value)}</span>"


def linked(text):
    """Escape `text`, turning each http(s) URL in it into a link."""
    parts = re.split(r"(https?://[^\s<>\"'`()\[\]]*[^\s<>\"'`()\[\].,;:!?])", text)
    return "".join(f"<a href='{html.escape(part)}'>{html.escape(part)}</a>" if i % 2 else html.escape(part)
                   for i, part in enumerate(parts))


def status_pill(value):
    return f"<span class='pill status-{value}'>{html.escape(value)}</span>"


def select(name, options, chosen, blank):
    return (f"<select id='{name}' name='{name}'><option value=''>{html.escape(blank)}</option>" + "".join(
        f"<option value='{html.escape(value, quote=True)}' {'selected' if chosen == value else ''}>"
        f"{html.escape(value.replace('-', ' ').title())}</option>" for value in options
    ) + "</select>")


def filter_field(name, label, control):
    return f"<div class='filter-field'><label for='{name}'>{label}</label>{control}</div>"


def short_date(value):
    return html.escape(value[:10]) if value else 'unknown'


def cost_label(papercut):
    return f"{papercut['cost_minutes']:g} min" if papercut["cost_reports"] else "Not estimated"


DESCRIPTION_FIELDS = ("Kind", "Impact", "Severity", "Source status", "Area", "Source", "Classification")
INLINE_MARKDOWN = re.compile(r"(`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)")


def inline_markdown(value):
    """Render a small, safe Markdown subset used by report prose."""
    value = value.replace("\\|", "|")
    rendered, previous = [], 0
    for match in INLINE_MARKDOWN.finditer(value):
        rendered.append(linked(value[previous:match.start()]))
        token = match.group()
        if token.startswith("`"):
            rendered.append(f"<code>{html.escape(token[1:-1])}</code>")
        elif token.startswith("["):
            label, target = token[1:].split("](", 1)
            target = target[:-1]
            scheme = urlsplit(target).scheme.lower()
            if scheme in ("http", "https", "mailto"):
                rendered.append(f"<a href='{html.escape(target, quote=True)}' rel='noopener noreferrer'>{html.escape(label)}</a>")
            else:
                rendered.append(html.escape(label))
        elif token.startswith("**"):
            rendered.append(f"<strong>{html.escape(token[2:-2])}</strong>")
        else:
            rendered.append(f"<em>{html.escape(token[1:-1])}</em>")
        previous = match.end()
    rendered.append(linked(value[previous:]))
    return "".join(rendered)


def table_cells(line):
    line = line.strip()
    if not line.startswith("|") or not line.endswith("|"):
        return None
    return [cell.strip() for cell in re.split(r"(?<!\\)\|", line[1:-1])]


def legacy_table_lines(paragraph):
    """Restore rows flattened by older local imports, when column boundaries are unambiguous."""
    if "|---|" not in paragraph or "\n" in paragraph:
        return paragraph
    pipes = [match.start() for match in re.finditer(r"(?<!\\)\|", paragraph)]
    if len(pipes) < 6:
        return paragraph
    start, end = pipes[0], pipes[-1]
    cells = [cell.strip() for cell in re.split(r"(?<!\\)\|", paragraph[start:end + 1]) if cell.strip()]
    columns = next((i for i, cell in enumerate(cells) if re.fullmatch(r":?-{3,}:?", cell)), 0)
    if columns < 2 or len(cells) < columns * 3 or len(cells) % columns:
        return paragraph
    if not all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells[columns:columns * 2]):
        return paragraph
    rows = ["| " + " | ".join(cells[i:i + columns]) + " |"
            for i in range(0, len(cells), columns)]
    return paragraph[:start].rstrip() + "\n\n" + "\n".join(rows) + "\n\n" + paragraph[end + 1:].strip()


def markdown_html(value):
    """Render paragraphs, lists, headings, quotes and fenced code without accepting raw HTML."""
    value = "\n\n".join(legacy_table_lines(paragraph) for paragraph in value.split("\n\n"))
    blocks, paragraph, items, quote, code = [], [], [], [], []
    list_kind = None
    in_code = False

    def flush_paragraph():
        if paragraph:
            blocks.append("<p>" + "<br>".join(inline_markdown(line) for line in paragraph) + "</p>")
            paragraph.clear()

    def flush_list():
        nonlocal list_kind
        if items:
            blocks.append(f"<{list_kind}>" + "".join(f"<li>{inline_markdown(item)}</li>" for item in items)
                          + f"</{list_kind}>")
            items.clear()
            list_kind = None

    def flush_quote():
        if quote:
            blocks.append("<blockquote>" + markdown_html("\n".join(quote)) + "</blockquote>")
            quote.clear()

    lines = value.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        index += 1
        if line.lstrip().startswith("```"):
            flush_paragraph(); flush_list(); flush_quote()
            if in_code:
                blocks.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
                code.clear()
            in_code = not in_code
            continue
        if in_code:
            code.append(line)
            continue
        headers = table_cells(line)
        separators = table_cells(lines[index]) if index < len(lines) else None
        if (headers and separators and len(headers) == len(separators)
                and all(re.fullmatch(r":?-{3,}:?", cell) for cell in separators)):
            flush_paragraph(); flush_list(); flush_quote()
            index += 1
            rows = []
            while index < len(lines):
                cells = table_cells(lines[index])
                if cells is None or len(cells) != len(headers):
                    break
                rows.append(cells)
                index += 1
            head = "".join(f"<th>{inline_markdown(cell)}</th>" for cell in headers)
            body = "".join("<tr>" + "".join(f"<td>{inline_markdown(cell)}</td>" for cell in row) + "</tr>"
                           for row in rows)
            blocks.append(f"<div class='table-wrap'><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>")
            continue
        if not line.strip():
            flush_paragraph(); flush_list(); flush_quote()
            continue
        if line.startswith("> "):
            flush_paragraph(); flush_list()
            quote.append(line[2:])
            continue
        flush_quote()
        if heading := re.match(r"^(#{1,6})\s+(.+)$", line):
            flush_paragraph(); flush_list()
            level = len(heading[1])
            blocks.append(f"<h{level}>{inline_markdown(heading[2])}</h{level}>")
            continue
        if item := re.match(r"^\s*(?:([-*+])|(\d+)\.)\s+(.+)$", line):
            flush_paragraph()
            kind = "ol" if item[2] else "ul"
            if list_kind and list_kind != kind:
                flush_list()
            list_kind = kind
            items.append(item[3])
            continue
        flush_list()
        paragraph.append(line)
    if in_code:
        blocks.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
    flush_paragraph(); flush_list(); flush_quote()
    return "<div class='markdown'>" + "".join(blocks) + "</div>"


def description_parts(description):
    """Recognize the trailing labels written by the local importer without changing stored reports."""
    narrative, suggested_fix, facts = [], None, {}
    for paragraph in description.strip().split("\n\n"):
        lines = paragraph.splitlines()
        labeled = [line.partition(": ") for line in lines]
        if paragraph.startswith("Suggested fix:\n"):
            suggested_fix = paragraph.removeprefix("Suggested fix:\n")
        elif len(lines) == 1 and paragraph.startswith("Suggested fix: "):
            suggested_fix = paragraph.removeprefix("Suggested fix: ")
        elif lines and all(separator and label in DESCRIPTION_FIELDS for label, separator, _ in labeled):
            facts.update({label: value for label, _, value in labeled})
        else:
            narrative.append(paragraph)
    return "\n\n".join(narrative), suggested_fix, facts


def facts_html(facts):
    return "<dl class='fact-grid'>" + "".join(
        f"<div><dt>{html.escape(label)}</dt><dd>{inline_markdown(value)}</dd></div>"
        for label in DESCRIPTION_FIELDS if (value := facts.get(label))
    ) + "</dl>"


def excerpt(value, length=220):
    value = " ".join(value.split())
    if len(value) <= length:
        return value
    return value[:length].rsplit(" ", 1)[0] + "…"


def short_title(title):
    for separator in (": ", " — ", " -- ", "; "):
        if separator in title:
            lead = title.split(separator, 1)[0]
            if 18 <= len(lead) <= 78:
                return lead
    return excerpt(title, 78)


def list_card_html(p):
    esc = html.escape
    description, _, facts = description_parts(p["description"])
    visible_facts = ("Kind", "Impact", "Severity", "Source status")
    fact_chips = "".join(
        f"<div title='{esc(facts[label], quote=True)}'><dt>{esc(label)}</dt><dd>{esc(excerpt(facts[label], 55))}</dd></div>"
        for label in visible_facts if facts.get(label)
    )
    return (f"<li><article class='card issue-card{' important' if p['important'] else ''}'>"
            f"<div><span class='eyebrow'>{esc(p['repository'])}</span>"
            f"<h3><span class='issue-number'>#{p['id']}</span><a href='/papercuts/{p['id']}' title='{esc(p['title'], quote=True)}'>{esc(short_title(p['title']))}</a></h3></div>"
            f"<div class='badges'>{important_pill(p)}{status_pill(p['status'])}{pill(p['category'] or 'unclassified')}"
            f"{severity_pill(p['severity'])}{fix_pill(p['fix_state'])}</div>"
            f"<p class='issue-summary'>{esc(excerpt(description))}</p>"
            f"{'<dl class=\"issue-facts\">' + fact_chips + '</dl>' if fact_chips else ''}"
            f"<p class='location' title='{esc(p['path'] or p['area'] or '', quote=True)}'>"
            f"{esc(excerpt(p['path'] or p['area'] or 'No location recorded', 150))}</p>"
            f"<div class='issue-stats'><div><strong>{p['report_count']}</strong><span>Reports</span></div>"
            f"<div><strong>{p['reporter_count']}</strong><span>Reporters</span></div>"
            f"<div><strong>{cost_label(p)}</strong><span>Time lost</span></div>"
            f"<div><strong><time datetime='{esc(p['last_seen'], quote=True)}'>{short_date(p['last_seen'])}</time></strong><span>Last seen</span></div></div>"
            f"</article></li>")


def papercut_list_html(result, filters, repositories=(), category_counts=None):
    esc = html.escape
    search = filter_field("q", "Search terms", f"<input id='q' type='search' name='q' placeholder='Search terms…' value='{esc(filters.get('q', ''), quote=True)}'>")
    available_repositories = list(repositories)
    if filters.get("repository") and filters["repository"] not in available_repositories:
        available_repositories.append(filters["repository"])
    show_repository = len(available_repositories) > 1
    repository = (filter_field("repository", "Repository",
                               select("repository", available_repositories, filters.get("repository"), "All repositories"))
                  if show_repository else "")
    status = filter_field("status", "Status", select("status", STATUSES, filters.get("status"), "All statuses"))
    category = f"<input type='hidden' name='category' value='{esc(filters.get('category', ''), quote=True)}'>"
    counts = category_counts or Counter(p["category"] or "unclassified" for p in result["papercuts"])
    sort = filter_field("sort", "Sort by", select("sort", [key for key in SORTS if key != "important"], filters.get("sort"),
                                                  "Important first"))
    limit = filter_field("limit", "Per page", select("limit", ("25", "50", "100"), filters.get("limit", "50"), "50"))
    cards = "".join(list_card_html(p) for p in result["papercuts"])
    if cards:
        cards = f"<ol class='issue-list'>{cards}</ol>"
    else:
        cards = "<div class='empty'><strong>No papercuts found</strong><p>Try clearing a filter or changing the search.</p></div>"
    paging_filters = {key: value for key, value in filters.items() if key != "offset"}
    pages = []
    if result["offset"]:
        pages.append(f"<a href='/?{urlencode({**paging_filters, 'offset': max(0, result['offset'] - result['limit'])})}'>← Previous</a>")
    if result["next_offset"] is not None:
        pages.append(f"<a href='/?{urlencode({**paging_filters, 'offset': result['next_offset']})}'>Next →</a>")
    start = result["offset"] + 1 if result["papercuts"] else 0
    end = result["offset"] + len(result["papercuts"])
    body = ("<div class='intro'><span class='eyebrow'>Issue tracker</span><h1>Papercuts</h1>"
            "<p>Small friction, collected across reports and agents.</p></div>"
            f"<form id='filters' class='toolbar{' single-repository' if not show_repository else ''}' method='get' action='/'>{search}{repository}{status}{category}{sort}{limit}"
            "<div class='filter-actions'><a href='/'>Clear filters</a></div></form>"
            f"<div id='results'>{category_chips(filters.get('category', ''), counts)}<div class='results-heading'><h2>{result['total']} papercuts</h2>"
            f"<p class='muted'>Showing {start}–{end} of {result['total']}</p></div>{cards}"
            f"<nav class='pagination' aria-label='Pages'><span>Page {result['offset'] // result['limit'] + 1}</span>"
            f"<div class='pagination-links'>{''.join(pages)}</div></nav></div>")
    return page("Papercuts", body)


def git_label(report):
    """` · on branch @ abc1234 (reflog)`, naming how the commit was worked out unless the reporter knew it."""
    if not (report["branch"] or report["commit_sha"]):
        return ""
    label = " · on " + html.escape(report["branch"] or "?")
    if report["commit_sha"]:
        label += " @ " + html.escape(report["commit_sha"][:10])
        if report["commit_source"] and report["commit_source"] != "exact":
            label += f" ({html.escape(report['commit_source'])})"
    return label


PR_URL = re.compile(r"https://github\.com/[\w.-]+/[\w.-]+/pull/\d+")


def pr_control(papercut):
    """On a Metabot papercut, the PR link from its comments, or a button that asks the fixer for a PR."""
    if not any(fingerprint.startswith("metabot:") for fingerprint in papercut["fingerprints"]):
        return ""
    urls = [url for e in papercut["events"] if e["kind"] == "comment" for url in PR_URL.findall(e["body"] or "")]
    if urls:
        return f"<p>PR: <a href='{html.escape(urls[-1])}'>{html.escape(urls[-1])}</a></p>"
    return ("<p><button type='button' class='primary' onclick=\"this.disabled = true; "
            f"fetch('/api/papercuts/{papercut['id']}/comments', {{method: 'POST', headers: {{'Content-Type': 'application/json'}}, "
            "body: JSON.stringify({author: 'andrei', body: '/pr'})}).then((r) => r.ok ? location.reload() "
            ": this.textContent = 'Failed: HTTP ' + r.status, (e) => this.textContent = 'Failed: ' + e.message)\">"
            "Open PR</button></p>")


def report_card_html(report, papercut_description, expanded=False):
    esc = html.escape
    same_description = report["description"] == papercut_description
    description, suggested_fix, facts = description_parts(report["description"]) if not same_description else ("", None, {})
    return (f"<article class='card report-card'><h3>{esc(report['reporter'])}"
            f"{' via ' + esc(report['agent']) if report['agent'] else ''}"
            f"{' on ' + esc(report['machine']) if report['machine'] else ''}</h3>"
            f"<p class='muted'>{esc(report['observed_at'] or report['received_at'])}"
            f"{' · ' + linked(report['source_ref']) if report['source_ref'] else ''}"
            f"{' · session ' + esc(report['session']) if report['session'] else ''}"
            f"{git_label(report)}{cost(report['cost_minutes'])}</p>"
            f"<details{' open' if expanded else ''}><summary>Report details</summary><p>{esc(report['title'])}</p>"
            f"{'<p class=\"muted\">Same description as above.</p>' if same_description else markdown_html(description)}"
            f"{'<div class=\"suggested-fix\"><strong>Suggested fix</strong>' + markdown_html(suggested_fix) + '</div>' if suggested_fix else ''}"
            f"{facts_html(facts) if facts else ''}</details></article>")


def papercut_html(papercut):
    esc = html.escape
    description, suggested_fix, facts = description_parts(papercut["description"])
    # Only the latest report starts expanded.
    reports = "".join(report_card_html(r, papercut["description"], expanded=i == 0)
                      for i, r in enumerate(papercut["reports"]))
    if papercut["report_count"] > len(papercut["reports"]):
        reports += f"<p class='muted'>Showing the latest {len(papercut['reports'])} of {papercut['report_count']} reports.</p>"
    related = "".join(
        f"<li><a href='/papercuts/{r['id']}'>#{r['id']} {esc(r['title'])}</a> "
        f"<span class='muted'>({esc(r['source'])}{', %.0f%%' % (100 * r['score']) if r['score'] is not None else ''})</span></li>"
        for r in papercut["related"]
    ) or "<li class='muted'>None yet</li>"
    history = "".join(
        f"<li><span class='muted'>{esc(e['at'][:19])} {esc(e['actor'])}</span> {esc(e['kind'])}"
        f"{': ' + esc(e['old_value'] or '∅') + ' → ' + esc(e['new_value'] or '∅') if e['kind'] in ('status', 'category', 'owner', 'severity', 'reopened', 'assessed', 'dispatch_updated') else ''}"
        f"{' #' + esc(e['new_value']) if e['kind'] in ('merged', 'absorbed', 'related', 'unrelated', 'dispatched') else ''}"
        f"{markdown_html(e['body']) if e['body'] else ''}</li>"
        for e in papercut["events"]
    ) or "<li class='muted'>No triage yet</li>"
    votes = ", ".join(f"{esc(category)} ×{count}" for category, count in papercut["category_votes"].items())
    assessment = papercut["assessment"]
    readiness = ("<section class='card'><h2>Readiness</h2>"
                 f"<p>{pill(assessment['verdict'])}"
                 + "".join(f" {label} {assessment[key]:.2f}" for key, label in (
                     ("evidence_score", "evidence"), ("fixability_score", "fixability"),
                     ("fixability_confidence", "confidence")) if assessment[key] is not None)
                 + f" <span class='muted'>{esc(assessment['at'][:19])} {esc(assessment['actor'])}"
                 f"{' · ' + esc(assessment['model']) if assessment['model'] else ''}</span></p>"
                 f"{markdown_html(assessment['reason']) if assessment['reason'] else ''}</section>") if assessment else ""
    def link(url, text):
        return f"<a href='{esc(url, quote=True)}'>{esc(text)}</a>" if url and url.startswith("https://") else esc(text or "")

    dispatches = "".join(
        f"<li>#{d['id']} {pill(d['state'])}<span class='muted'>{esc(d['updated_at'][:19])} {esc(d['actor'])}</span>"
        f"{' · ' + link(d['linear_url'], d['linear_issue_id'] or 'Linear') if d['linear_url'] or d['linear_issue_id'] else ''}"
        f"{' · ' + link(d['pr_url'], 'PR') if d['pr_url'] else ''}"
        f"{' · ' + esc(d['branch']) if d['branch'] else ''}</li>"
        for d in papercut["dispatches"]
    )
    body = (f"<div class='detail-head'><a href='/'>← All papercuts</a>"
            f"<h1><span class='muted'>#{papercut['id']}</span> {esc(papercut['title'])}</h1>"
            f"<div class='detail-meta'>{important_pill(papercut)}{status_pill(papercut['status'])}"
            f"{pill(papercut['category'] or 'unclassified')}"
            f"{pill('owner: ' + papercut['owner']) if papercut['owner'] else ''}{severity_pill(papercut['severity'])}"
            f"{fix_pill(papercut['dispatches'][0]['state'] if papercut['dispatches'] else None)}"
            f"<span class='muted'>{papercut['report_count']} reports · {papercut['reporter_count']} reporters · "
            f"Time lost: {cost_label(papercut)}</span></div>{pr_control(papercut)}</div>"
            "<div class='detail-layout'><div class='detail-content'>"
            f"<section class='card'><h2>Description</h2>{markdown_html(description) if description else '<p>No description recorded.</p>'}</section>"
            f"{'<section class=\"card suggested-fix\"><h2>Suggested fix</h2>' + markdown_html(suggested_fix) + '</section>' if suggested_fix else ''}"
            f"{'<section class=\"card\"><h2>Source details</h2>' + facts_html(facts) + '</section>' if facts else ''}"
            f"{readiness}"
            f"{'<section class=\"card\"><h2>Dispatches</h2><ul class=\"plain-list\">' + dispatches + '</ul></section>' if dispatches else ''}"
            f"<section class='card'><h2>Related papercuts</h2><ul class='plain-list'>{related}</ul></section>"
            f"<section class='card'><h2>History</h2><ul class='plain-list'>{history}</ul></section>"
            f"<section><h2>Reports</h2>{reports or '<p class=\"muted\">No reports yet.</p>'}</section></div>"
            "<aside class='detail-sidebar card'><h2>Details</h2><dl>"
            f"<div><dt>Repository</dt><dd>{esc(papercut['repository'])}</dd></div>"
            f"<div><dt>Path</dt><dd>{esc(papercut['path'] or 'Not recorded')}</dd></div>"
            f"<div><dt>Area</dt><dd>{esc(papercut['area'] or 'Not recorded')}</dd></div>"
            f"<div><dt>First seen</dt><dd><time datetime='{esc(papercut['first_seen'], quote=True)}'>{short_date(papercut['first_seen'])}</time></dd></div>"
            f"<div><dt>Last seen</dt><dd><time datetime='{esc(papercut['last_seen'], quote=True)}'>{short_date(papercut['last_seen'])}</time></dd></div>"
            f"{'<div><dt>Category votes</dt><dd>' + votes + '</dd></div>' if votes else ''}"
            "</dl></aside></div>")
    return page(papercut["title"], body)


class Handler(BaseHTTPRequestHandler):
    store = None
    # When set, requests that change data must send `Authorization: Bearer <token>`.
    token = None

    def respond(self, status, value, content_type="application/json", headers=None):
        body = (json.dumps(value).encode() if content_type == "application/json" else value.encode())
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for name, header in (headers or {}).items():
            self.send_header(name, header)
        self.end_headers()
        self.wfile.write(body)

    def input_json(self, optional=False):
        length = int(self.headers.get("Content-Length") or "0")
        if optional and length == 0:
            return {}
        if not 0 < length <= MAX_BODY:
            raise ValueError(f"Body must be between 1 and {MAX_BODY} bytes")
        # Another site's page can send text/plain or form bodies without a CORS preflight, but not JSON.
        # The server never answers a preflight, so this keeps web pages from writing to it.
        if self.headers.get_content_type() != "application/json":
            raise UnsupportedMediaType("Send the body as Content-Type: application/json")
        try:
            return json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("Invalid JSON") from error

    def authorized(self):
        if self.token is None or self.command == "GET":
            return True
        given = self.headers.get("Authorization", "")
        return hmac.compare_digest(given.encode(), f"Bearer {self.token}".encode())

    def redirect_if_merged(self, papercut_id, prefix, query):
        """Follow merges on GET, so old links keep working. Returns True when a response was sent."""
        live = self.store.resolve(papercut_id)
        if live is None:
            raise NotFound(f"Papercut {papercut_id} not found")
        if live == papercut_id:
            return False
        location = f"{prefix}/{live}" + (f"?{query}" if query else "")
        self.respond(301, {"merged_into": live}, headers={"Location": location})
        return True

    def route(self):
        if not self.authorized():
            return self.respond(401, {"error": "Missing or wrong bearer token"})
        url = urlsplit(self.path)
        path, query = url.path, parse_qs(url.query)
        params = {key: values[0] for key, values in query.items()}
        papercut = re.fullmatch(
            r"/api/papercuts/(\d+)(?:/(related|merge|comments|fingerprints|assessments|dispatch)(?:/(\d+))?)?", path)
        dispatch = re.fullmatch(r"/api/dispatches/(\d+)", path)
        html_match = re.fullmatch(r"/papercuts/(\d+)", path)
        command = self.command

        if command == "POST" and path == "/api/reports":
            result = self.store.ingest(self.input_json())
            return self.respond(200 if result["replay"] else 201, result)
        if command == "GET" and path == "/api/papercuts":
            return self.respond(200, self.store.list_papercuts(params))
        # Deprecated: the schema version 2 list, a plain array of every live papercut. The transcript scanner
        # in mage/src/mage/papercuts/scan.clj still reads it.
        if command == "GET" and path == "/api/issues":
            filters = {key: params[key] for key in ("repository", "status", "category", "q") if key in params}
            everything = self.store.list_papercuts({**filters, "limit": sys.maxsize}, max_limit=sys.maxsize)
            return self.respond(200, everything["papercuts"])
        if legacy := re.fullmatch(r"/api/issues/(\d+)", path):
            location = f"/api/papercuts/{legacy[1]}"
            return self.respond(308, {"moved_to": location}, headers={"Location": location})
        if papercut:
            papercut_id, action, other = int(papercut[1]), papercut[2], papercut[3]
            if command == "GET" and not action:
                if self.redirect_if_merged(papercut_id, "/api/papercuts", url.query):
                    return None
                limit = int_param(params, "reports_limit", 50, 0, 1000)
                return self.respond(200, self.store.get_papercut(papercut_id, reports_limit=limit))
            handlers = {
                ("PATCH", None, False): lambda: self.store.update_papercut(papercut_id, self.input_json()),
                ("POST", "merge", False): lambda: self.store.merge(papercut_id, self.input_json()),
                ("POST", "related", False): lambda: self.store.relate(papercut_id, self.input_json()),
                ("DELETE", "related", True): lambda: self.store.unrelate(papercut_id, int(other or 0),
                                                                         self.input_json(optional=True)),
                ("POST", "fingerprints", False): lambda: self.store.add_fingerprint(papercut_id, self.input_json()),
            }
            created = {
                "comments": lambda: self.store.comment(papercut_id, self.input_json()),
                "assessments": lambda: self.store.assess(papercut_id, self.input_json()),
                "dispatch": lambda: self.store.claim(papercut_id, self.input_json(optional=True)),
            }
            if command == "POST" and action in created and not other:
                return self.respond(201, created[action]())
            if handler := handlers.get((command, action, bool(other))):
                return self.respond(200, handler())
        if command == "GET" and path == "/api/dispatches":
            return self.respond(200, self.store.list_dispatches(params))
        if dispatch and command == "GET":
            return self.respond(200, self.store.get_dispatch(int(dispatch[1])))
        if dispatch and command == "PATCH":
            return self.respond(200, self.store.update_dispatch(int(dispatch[1]), self.input_json()))
        if command == "GET" and path == "/":
            # The page lists live papercuts; a change feed is for API clients.
            params.pop("since", None)
            others = {key: params[key] for key in ("q", "status", "repository") if params.get(key)}
            counted = self.store.list_papercuts({**others, "limit": sys.maxsize}, max_limit=sys.maxsize)["papercuts"]
            counts = Counter(p["category"] or "unclassified" for p in counted)
            return self.respond(200, papercut_list_html(self.store.list_papercuts({"sort": "important", **params}), params,
                                                        self.store.repositories(), counts), "text/html")
        if command == "GET" and html_match:
            if self.redirect_if_merged(int(html_match[1]), "/papercuts", url.query):
                return None
            return self.respond(200, papercut_html(self.store.get_papercut(int(html_match[1]))), "text/html")
        return self.respond(404, {"error": "Route not found"})

    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def do_PATCH(self):
        self.dispatch()

    def do_DELETE(self):
        self.dispatch()

    def dispatch(self):
        try:
            self.route()
        except NotFound as error:
            self.respond(404, {"error": str(error)})
        except ConflictError as error:
            self.respond(409, {"error": str(error)})
        except UnsupportedMediaType as error:
            self.respond(415, {"error": str(error)})
        except ValueError as error:
            self.respond(400, {"error": str(error)})
        except sqlite3.OperationalError as error:
            if "locked" in str(error) or "busy" in str(error):
                self.respond(503, {"error": "Database is busy; retry shortly"}, headers={"Retry-After": "1"})
            else:
                self.internal_error()
        except Exception:
            self.internal_error()

    def internal_error(self):
        traceback.print_exc(file=sys.stderr)
        try:
            self.respond(500, {"error": "Internal server error"})
        except OSError:
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="papercuts.sqlite3", help="SQLite database path")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--token", default=os.environ.get("PAPERCUTS_TOKEN"),
                        help="Require this bearer token on requests that change data (default: $PAPERCUTS_TOKEN)")
    parser.add_argument("--reload", action="store_true",
                        help="Restart in place, on the same port, when server.py changes")
    args = parser.parse_args()
    Handler.store = Store(args.db)
    Handler.token = args.token or None
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Papercuts at http://{args.host}:{server.server_port}/ (database: {args.db}"
          f"{', writes need a token' if Handler.token else ''}{', reloading on change' if args.reload else ''})",
          flush=True)
    changed = threading.Event()
    if args.reload:
        threading.Thread(target=watch_source, args=(server, changed), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    if changed.is_set():
        # The listening socket is closed and not inherited, so the new process binds the same port.
        os.execv(sys.executable, [sys.executable, *sys.argv])


def watch_source(server, changed):
    """Stop `server` once this file changes and still compiles. A broken edit keeps the running code."""
    source = Path(__file__)
    seen = source.stat().st_mtime
    while True:
        time.sleep(1)
        try:
            modified = source.stat().st_mtime
            if modified == seen:
                continue
            seen = modified
            compile(source.read_text(), str(source), "exec")
        except (OSError, SyntaxError) as error:
            print(f"Not reloading: {error}", file=sys.stderr, flush=True)
            continue
        print("server.py changed; reloading", flush=True)
        changed.set()
        server.shutdown()
        return


if __name__ == "__main__":
    main()
