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
import traceback
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit


CATEGORIES = ("agent-trap", "code-smell", "flaky-test", "tooling", "documentation", "other")
STATUSES = ("open", "investigating", "resolved", "wontfix")
# Version 2 had no rejected relations; its schema must stay as it was.
V2_RELATION_SOURCES = ("suggested", "manual")
# A rejected relation is hidden, and stops the pair from being suggested again.
RELATION_SOURCES = ("suggested", "manual", "rejected")
EVENT_KINDS = ("status", "category", "title", "description", "path", "area", "reopened", "merged", "absorbed",
               "related", "unrelated", "fingerprint", "comment")
SORTS = {
    "recent": "p.last_seen DESC, p.id DESC",
    "oldest": "p.first_seen ASC, p.id ASC",
    "reports": "report_count DESC, p.last_seen DESC, p.id DESC",
    "reporters": "reporter_count DESC, report_count DESC, p.id DESC",
    "cost": "cost_minutes DESC, report_count DESC, p.id DESC",
    "updated": "p.updated_at DESC, p.id DESC",
}
# Other fields are kept in the report's stored request body and named in the response's `extra_fields`,
# so a reporter can spot a misspelled field.
REPORT_FIELDS = {"repository", "reporter", "machine_id", "machine", "report_id", "fingerprint", "category", "title",
                 "description", "path", "area", "agent", "session", "cost_minutes", "observed_at", "source_type",
                 "source_ref", "branch", "commit_sha", "commit_source", "repository_url"}
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


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def precise_now():
    # Change cursors need sub-second precision, so polling clients do not miss edits made in the same second.
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def normalized(value):
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


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


def words(text):
    found = set()
    for word in re.findall(r"[a-z0-9]+", text.lower()):
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
    if commit_source and not commit_sha:
        raise ValueError("commit_source needs a commit_sha")
    return {"branch": branch, "commit_sha": commit_sha, "commit_source": commit_source,
            "repository_url": repository_url}


def int_param(params, key, default, low, high=None):
    value = params.get(key)
    if value in (None, ""):
        return default
    if not re.fullmatch(r"\d+", str(value)) or int(value) < low or (high is not None and int(value) > high):
        raise ValueError(f"{key} must be an integer from {low}{f' to {high}' if high is not None else ' up'}")
    return int(value)


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
        kind TEXT NOT NULL CHECK (kind IN ({one_of(EVENT_KINDS)})),
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


# Each entry upgrades the database by one `user_version`.
MIGRATIONS = (create_v1, migrate_to_v2, migrate_to_v3, migrate_to_v4)

STATS = """SELECT papercut_id, COUNT(*) AS report_count, COUNT(DISTINCT reporter) AS reporter_count,
                  COUNT(DISTINCT agent) AS agent_count, COALESCE(SUM(cost_minutes), 0) AS cost_minutes
           FROM reports GROUP BY papercut_id"""
# A papercut that was merged away has no reports left.
COUNTS = """COALESCE(s.report_count, 0) AS report_count, COALESCE(s.reporter_count, 0) AS reporter_count,
            COALESCE(s.agent_count, 0) AS agent_count, COALESCE(s.cost_minutes, 0) AS cost_minutes"""


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
        cost = payload.get("cost_minutes")
        if cost is not None and (type(cost) not in (int, float) or not 0 <= cost <= 100_000):
            raise ValueError("cost_minutes must be a number from 0 to 100000")
        observed_at = parse_observed_at(text_field(payload, "observed_at"))
        git = git_fields(payload)
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
                    """INSERT INTO papercuts (repository, title, description, path, area, category,
                                              first_seen, last_seen, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (repository, title, description, path, area, submitted_category, seen, seen, stamp),
                ).lastrowid
                db.execute("INSERT INTO papercut_fingerprints (repository, fingerprint, papercut_id) VALUES (?, ?, ?)",
                           (repository, fingerprint, papercut_id))
            else:
                papercut_id = routed["papercut_id"]
                papercut = db.execute("SELECT * FROM papercuts WHERE id = ?", (papercut_id,)).fetchone()
                # A report dated after the fix means the fix didn't hold, or a stale copy of the trap remains.
                # Compare at the precision status changes are stamped with.
                reopened = papercut["status"] == "resolved" and (observed_at or stamp) > (papercut["status_changed_at"] or "")
                db.execute(
                    """UPDATE papercuts SET first_seen = MIN(first_seen, ?), last_seen = MAX(last_seen, ?),
                              category = COALESCE(category, ?), updated_at = ? WHERE id = ?""",
                    (seen, seen, submitted_category, stamp, papercut_id),
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
        if filters.get("category") == "unclassified":
            clauses.append("p.category IS NULL")
        elif filters.get("category"):
            clauses.append("p.category = ?")
            params.append(filters["category"])
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
            params.append(filters["since"])
        else:
            clauses.append("p.merged_into IS NULL")
        sort = filters.get("sort") or "recent"
        if sort not in SORTS:
            raise ValueError(f"sort must be one of: {', '.join(SORTS)}")
        limit = int_param(filters, "limit", 50, 1, max_limit)
        offset = int_param(filters, "offset", 0, 0)
        where = " AND ".join(clauses)
        with self.connect() as db:
            total = db.execute(f"SELECT COUNT(*) FROM papercuts p WHERE {where}", params).fetchone()[0]
            rows = db.execute(
                f"""SELECT p.*, {COUNTS},
                           (SELECT json_group_array(fingerprint) FROM papercut_fingerprints f
                            WHERE f.papercut_id = p.id) AS fingerprints
                    FROM papercuts p LEFT JOIN ({STATS}) s ON s.papercut_id = p.id
                    WHERE {where} ORDER BY {SORTS[sort]} LIMIT ? OFFSET ?""",
                [*params, limit, offset],
            ).fetchall()
            # Commits are serialized and stamp updated_at under the write lock, so this is a safe resume point.
            cursor = db.execute("SELECT MAX(updated_at) FROM papercuts").fetchone()[0]
        # Clients that reuse an existing grouping, such as the transcript scanner, read fingerprints from the list.
        papercuts = [dict(row) | {"fingerprints": sorted(json.loads(row["fingerprints"]))} for row in rows]
        return {"papercuts": papercuts, "total": total, "limit": limit, "offset": offset,
                "next_offset": offset + limit if offset + limit < total else None, "cursor": cursor}

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
                f"""SELECT p.*, {COUNTS} FROM papercuts p LEFT JOIN ({STATS}) s ON s.papercut_id = p.id
                    WHERE p.id = ?""",
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
        editable = {"status", "category", "title", "description", "path", "area"}
        if not isinstance(changes, dict) or not set(changes) & editable or set(changes) - editable - {"actor", "reason"}:
            raise ValueError(f"Send at least one of: {', '.join(sorted(editable))}; optionally actor and reason")
        if "status" in changes and changes["status"] not in STATUSES:
            raise ValueError(f"status must be one of: {', '.join(STATUSES)}")
        # A null category sends the papercut back to unclassified.
        if "category" in changes and changes["category"] is not None and changes["category"] not in CATEGORIES:
            raise ValueError(f"category must be null or one of: {', '.join(CATEGORIES)}")
        for key in ("title", "description", "path", "area"):
            if key in changes:
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
            at = precise_now()
            db.execute("UPDATE reports SET papercut_id = ? WHERE papercut_id = ?", (target_id, source_id))
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
        db.execute("DELETE FROM relations WHERE source = 'suggested' AND (papercut_a = ? OR papercut_b = ?)",
                   (papercut_id, papercut_id))
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


STYLE = """<style>
:root {
  color-scheme: light;
  --background: #f7f8fa;
  --surface: #fff;
  --text: #263238;
  --muted: #526170;
  --link: #1453a6;
  --border: #dce2e8;
  --control-border: #a9b4be;
  --pill: #e8eef5;
  --hover: #e8eef5;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --background: #111820;
    --surface: #1d2731;
    --text: #e8edf2;
    --muted: #aab7c4;
    --link: #8bbcff;
    --border: #354454;
    --control-border: #64778a;
    --pill: #2d3d4d;
    --hover: #354454;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --background: #111820;
  --surface: #1d2731;
  --text: #e8edf2;
  --muted: #aab7c4;
  --link: #8bbcff;
  --border: #354454;
  --control-border: #64778a;
  --pill: #2d3d4d;
  --hover: #354454;
}
body {font: 16px system-ui; max-width: 1000px; margin: 2rem auto; padding: 0 1rem; color: var(--text); background: var(--background)}
a {color: var(--link)}
header {display: flex; justify-content: space-between; align-items: center; gap: 1rem}
header .actions {display: flex; align-items: center; gap: .75rem}
.card {background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin: .7rem 0}
.muted {color: var(--muted)}
.pill {display: inline-block; background: var(--pill); border-radius: 1rem; padding: .15rem .6rem; margin-right: .3rem}
input, select, button {font: inherit; padding: .35rem; margin: .2rem; color: var(--text); background: var(--surface); border: 1px solid var(--control-border); border-radius: 4px}
button {cursor: pointer}
button:hover {background: var(--hover)}
pre {white-space: pre-wrap; overflow-wrap: anywhere}
@media (max-width: 600px) {header {align-items: flex-start} header .actions {flex-wrap: wrap; justify-content: flex-end}}
</style>"""

THEME_INIT = """<script>
try {
  const theme = localStorage.getItem('papercuts-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (_) {}
</script>"""

THEME_CONTROL = """<script>
const themeToggle = document.getElementById('theme-toggle');
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
function darkThemeActive() {
  const chosen = document.documentElement.dataset.theme;
  return chosen === 'dark' || (!chosen && systemTheme.matches);
}
function updateThemeToggle() {
  themeToggle.textContent = darkThemeActive() ? 'Light mode' : 'Dark mode';
}
themeToggle.addEventListener('click', () => {
  const theme = darkThemeActive() ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('papercuts-theme', theme); } catch (_) {}
  updateThemeToggle();
});
systemTheme.addEventListener('change', updateThemeToggle);
updateThemeToggle();
</script>"""

def page(title, body):
    return (f"<!doctype html><html><head><meta charset='utf-8'><title>{html.escape(title)}</title>"
            f"{THEME_INIT}{STYLE}</head><body><header><h1><a href='/'>Papercuts</a></h1>"
            "<div class='actions'><span class='muted'>SQLite inbox</span>"
            "<button id='theme-toggle' type='button' aria-label='Toggle color theme'>Dark mode</button></div>"
            f"</header>{body}{THEME_CONTROL}</body></html>")


def cost(minutes):
    return f" · {minutes:g} min lost" if minutes else ""


def pill(value):
    return f"<span class='pill'>{html.escape(value)}</span>"


def select(name, options, chosen, blank):
    return (f"<select name='{name}'><option value=''>{blank}</option>" + "".join(
        f"<option value='{value}' {'selected' if chosen == value else ''}>{value}</option>" for value in options
    ) + "</select>")


def papercut_list_html(result, filters):
    fields = "".join(
        f"<input name='{key}' placeholder='{key}' value='{html.escape(filters.get(key, ''), quote=True)}'>"
        for key in ("repository", "q")
    )
    fields += select("status", STATUSES, filters.get("status"), "all statuses")
    fields += select("category", (*CATEGORIES, "unclassified"), filters.get("category"), "all categories")
    fields += select("sort", SORTS, filters.get("sort"), "sort: recent")
    cards = "".join(
        f"<article class='card'><a href='/papercuts/{p['id']}'><strong>#{p['id']} {html.escape(p['title'])}</strong></a> "
        f"{pill(p['category'] or 'unclassified')}{pill(p['status'])}"
        f"<p class='muted'>{html.escape(p['repository'])} · {html.escape(p['path'] or p['area'] or 'no location')} · "
        f"{p['report_count']} reports from {p['reporter_count']} reporters"
        f"{cost(p['cost_minutes'])}"
        f" · last seen {html.escape(p['last_seen'])}</p></article>"
        for p in result["papercuts"]
    ) or "<p>No papercuts match these filters.</p>"
    pages = []
    if result["offset"]:
        pages.append(f"<a href='/?{urlencode({**filters, 'offset': max(0, result['offset'] - result['limit'])})}'>Previous</a>")
    if result["next_offset"] is not None:
        pages.append(f"<a href='/?{urlencode({**filters, 'offset': result['next_offset']})}'>Next</a>")
    shown = f"{result['offset'] + 1}–{result['offset'] + len(result['papercuts'])} of " if result["papercuts"] else ""
    return page("Papercuts", f"<form method='get'>{fields}<button>Filter</button></form>"
                             f"<p>{shown}{result['total']} papercuts</p>{cards}<p>{' · '.join(pages)}</p>")


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


def papercut_html(papercut):
    esc = html.escape
    reports = "".join(
        f"<div class='card'><strong>{esc(r['reporter'])}</strong>"
        f"{' via ' + esc(r['agent']) if r['agent'] else ''}{' on ' + esc(r['machine']) if r['machine'] else ''} "
        f"<span class='muted'>{esc(r['observed_at'] or r['received_at'])}"
        f"{' · ' + esc(r['source_ref']) if r['source_ref'] else ''}"
        f"{' · session ' + esc(r['session']) if r['session'] else ''}"
        f"{git_label(r)}"
        f"{cost(r['cost_minutes'])}</span>"
        f"<p>{esc(r['title'])}</p><pre>{esc(r['description'])}</pre></div>"
        for r in papercut["reports"]
    )
    if papercut["report_count"] > len(papercut["reports"]):
        reports += f"<p class='muted'>Showing the latest {len(papercut['reports'])} of {papercut['report_count']} reports.</p>"
    related = "".join(
        f"<li><a href='/papercuts/{r['id']}'>#{r['id']} {esc(r['title'])}</a> "
        f"<span class='muted'>({esc(r['source'])}{', %.0f%%' % (100 * r['score']) if r['score'] is not None else ''})</span></li>"
        for r in papercut["related"]
    ) or "<li>None yet</li>"
    history = "".join(
        f"<li><span class='muted'>{esc(e['at'][:19])} {esc(e['actor'])}</span> {esc(e['kind'])}"
        f"{': ' + esc(e['old_value'] or '∅') + ' → ' + esc(e['new_value'] or '∅') if e['kind'] in ('status', 'category', 'reopened') else ''}"
        f"{' #' + esc(e['new_value']) if e['kind'] in ('merged', 'absorbed', 'related', 'unrelated') else ''}"
        f"{'<pre>' + esc(e['body']) + '</pre>' if e['body'] else ''}</li>"
        for e in papercut["events"]
    ) or "<li>No triage yet</li>"
    votes = ", ".join(f"{esc(category)} ×{count}" for category, count in papercut["category_votes"].items())
    body = (f"<h2>#{papercut['id']} {esc(papercut['title'])}</h2>"
            f"<p>{pill(papercut['category'] or 'unclassified')}{pill(papercut['status'])} "
            f"{papercut['report_count']} reports from {papercut['reporter_count']} reporters"
            f"{cost(papercut['cost_minutes'])}</p>"
            f"<p class='muted'>{esc(papercut['repository'])} · {esc(papercut['path'] or 'no path')}"
            f"{' · ' + esc(papercut['area']) if papercut['area'] else ''}<br>"
            f"First seen {esc(papercut['first_seen'])}; last seen {esc(papercut['last_seen'])}"
            f"{'<br>Reporters suggested: ' + votes if votes else ''}</p>"
            f"<div class='card'><pre>{esc(papercut['description'])}</pre></div>"
            f"<h3>Related papercuts</h3><ul>{related}</ul><h3>History</h3><ul>{history}</ul>"
            f"<h3>Reports</h3>{reports}")
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
        papercut = re.fullmatch(r"/api/papercuts/(\d+)(?:/(related|merge|comments|fingerprints)(?:/(\d+))?)?", path)
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
            if command == "POST" and action == "comments" and not other:
                return self.respond(201, self.store.comment(papercut_id, self.input_json()))
            if handler := handlers.get((command, action, bool(other))):
                return self.respond(200, handler())
        if command == "GET" and path == "/":
            return self.respond(200, papercut_list_html(self.store.list_papercuts(params), params), "text/html")
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
    args = parser.parse_args()
    Handler.store = Store(args.db)
    Handler.token = args.token or None
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Papercuts at http://{args.host}:{server.server_port}/ (database: {args.db}"
          f"{', writes need a token' if Handler.token else ''})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
