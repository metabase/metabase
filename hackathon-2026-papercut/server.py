#!/usr/bin/env python3
"""Small SQLite-backed inbox for papercut reports."""

import argparse
import hashlib
import html
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


CATEGORIES = ("agent-trap", "code-smell", "flaky-test", "tooling", "documentation", "other")
STATUSES = ("open", "investigating", "resolved", "wontfix")
RELATION_SOURCES = ("suggested", "manual")
MAX_BODY = 64 * 1024
# Version 1 imports recorded their source writeup only as this last line of the description.
LOCAL_SOURCE_TRAILER = re.compile(r"\nSource: local-papercuts/(\S+)$")


class ConflictError(ValueError):
    """The request contradicts data already recorded."""


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


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
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")


def classify(title, description):
    words = set(normalized(f"{title} {description}").split())
    if words & {"flaky", "nondeterministic", "intermittent"}:
        return "flaky-test"
    if words & {"agent", "agents", "automation", "prompt"}:
        return "agent-trap"
    if words & {"docs", "documentation", "readme"}:
        return "documentation"
    if words & {"build", "mage", "lint", "ci", "tooling"}:
        return "tooling"
    return "code-smell"


def similarity(a, b):
    stop = {"a", "an", "and", "for", "in", "is", "of", "on", "the", "to", "with"}
    left = set(normalized(a).split()) - stop
    right = set(normalized(b).split()) - stop
    return len(left & right) / len(left | right) if left and right else 0.0


def computed_fingerprint(title, path):
    return hashlib.sha256(f"{normalized(path)}\0{normalized(title)}".encode()).hexdigest()


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
        source TEXT NOT NULL CHECK (source IN ({one_of(RELATION_SOURCES)})),
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


# Each entry upgrades the database by one `user_version`.
MIGRATIONS = (create_v1, migrate_to_v2)


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
    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            db.execute("PRAGMA foreign_keys = ON")
            db.execute("PRAGMA busy_timeout = 5000")
            db.execute("PRAGMA journal_mode = WAL")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def ingest(self, payload):
        if not isinstance(payload, dict):
            raise ValueError("Expected a JSON object")
        for key in ("repository", "title"):
            if not isinstance(payload.get(key), str) or not payload[key].strip():
                raise ValueError(f"{key} must be a nonempty string")
        # `machine_id` is the version 1 name for the reporter.
        reporter = payload.get("reporter", payload.get("machine_id"))
        if not isinstance(reporter, str) or not reporter.strip():
            raise ValueError("reporter must be a nonempty string")
        for key in ("description", "path", "fingerprint", "report_id", "category", "observed_at",
                    "machine", "source_type", "source_ref"):
            if key in payload and not isinstance(payload[key], str):
                raise ValueError(f"{key} must be a string")
        if any(len(value) > 10_000 for value in payload.values() if isinstance(value, str)):
            raise ValueError("Field is too long")
        submitted_category = payload.get("category") or None
        if submitted_category and submitted_category not in CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(CATEGORIES)}")

        repository = payload["repository"].strip()
        reporter = reporter.strip()
        title = payload["title"].strip()
        description = payload.get("description", "").strip()
        path = payload.get("path", "").strip()
        report_id = payload.get("report_id") or None
        submitted_fingerprint = payload.get("fingerprint") or None
        fingerprint = submitted_fingerprint or computed_fingerprint(title, path)
        category = submitted_category or classify(title, description)
        machine = payload.get("machine", "").strip() or None
        source_type = payload.get("source_type", "").strip() or None
        source_ref = payload.get("source_ref", "").strip() or None
        timestamp = now()
        observed_at = parse_observed_at(payload.get("observed_at"))
        seen = observed_at or timestamp

        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if report_id:
                prior = db.execute(
                    "SELECT issue_id, fingerprint FROM reports WHERE repository = ? AND reporter = ? AND report_id = ?",
                    (repository, reporter, report_id),
                ).fetchone()
                if prior:
                    if prior["fingerprint"] != fingerprint:
                        raise ConflictError(f"report_id {report_id} was already recorded with a different fingerprint")
                    return self.get_issue(prior["issue_id"]), False, True

            issue = db.execute(
                "SELECT issue_id FROM issue_fingerprints WHERE repository = ? AND fingerprint = ?",
                (repository, fingerprint),
            ).fetchone()
            created = issue is None
            if created:
                issue_id = db.execute(
                    """INSERT INTO issues
                       (repository, title, description, path, category, first_seen, last_seen)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (repository, title, description, path, category, seen, seen),
                ).lastrowid
                db.execute(
                    "INSERT INTO issue_fingerprints (repository, fingerprint, issue_id) VALUES (?, ?, ?)",
                    (repository, fingerprint, issue_id),
                )
                self._suggest_relations(db, issue_id, repository, title, path)
            else:
                issue_id = issue["issue_id"]
                db.execute(
                    "UPDATE issues SET first_seen = MIN(first_seen, ?), last_seen = MAX(last_seen, ?) WHERE id = ?",
                    (seen, seen, issue_id),
                )
            db.execute(
                """INSERT INTO reports
                   (issue_id, repository, reporter, machine, report_id, fingerprint, submitted_fingerprint,
                    submitted_category, title, description, path, source_type, source_ref, payload,
                    received_at, observed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (issue_id, repository, reporter, machine, report_id, fingerprint, submitted_fingerprint,
                 submitted_category, title, description, path, source_type, source_ref,
                 json.dumps(payload, ensure_ascii=False), timestamp, observed_at),
            )
        return self.get_issue(issue_id), created, False

    def _suggest_relations(self, db, issue_id, repository, title, path):
        rows = db.execute(
            "SELECT id, title, path FROM issues WHERE repository = ? AND id != ?",
            (repository, issue_id),
        )
        for row in rows:
            score = similarity(f"{title} {path}", f"{row['title']} {row['path']}")
            if score >= 0.45:
                db.execute(
                    """INSERT INTO relations (repository, issue_a, issue_b, source, score)
                       VALUES (?, ?, ?, 'suggested', ?)""",
                    (repository, min(issue_id, row["id"]), max(issue_id, row["id"]), score),
                )

    def list_issues(self, filters=None):
        filters = filters or {}
        clauses, params = [], []
        for key in ("repository", "status", "category"):
            if filters.get(key):
                clauses.append(f"i.{key} = ?")
                params.append(filters[key])
        if filters.get("q"):
            clauses.append("(i.title LIKE ? OR i.description LIKE ? OR i.path LIKE ?)")
            params.extend([f"%{filters['q']}%"] * 3)
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        with self.connect() as db:
            rows = db.execute(
                f"""SELECT i.*, COUNT(r.id) AS report_count,
                    COUNT(DISTINCT r.reporter) AS reporter_count
                    FROM issues i JOIN reports r ON r.issue_id = i.id
                    {where} GROUP BY i.id ORDER BY i.last_seen DESC, i.id DESC""",
                params,
            ).fetchall()
            return [dict(row) for row in rows]

    def get_issue(self, issue_id):
        with self.connect() as db:
            row = db.execute(
                """SELECT i.*, COUNT(r.id) AS report_count,
                   COUNT(DISTINCT r.reporter) AS reporter_count
                   FROM issues i LEFT JOIN reports r ON r.issue_id = i.id
                   WHERE i.id = ? GROUP BY i.id""",
                (issue_id,),
            ).fetchone()
            if row is None:
                return None
            issue = dict(row)
            issue["fingerprints"] = [r["fingerprint"] for r in db.execute(
                "SELECT fingerprint FROM issue_fingerprints WHERE issue_id = ? ORDER BY fingerprint", (issue_id,)
            )]
            issue["reports"] = []
            for report in db.execute("SELECT * FROM reports WHERE issue_id = ? ORDER BY id DESC", (issue_id,)):
                report = dict(report)
                report["payload"] = json.loads(report["payload"]) if report["payload"] else None
                issue["reports"].append(report)
            issue["related"] = [dict(r) for r in db.execute(
                """SELECT i.id, i.title, rel.source, rel.score FROM relations rel
                   JOIN issues i ON i.id = CASE WHEN rel.issue_a = ? THEN rel.issue_b ELSE rel.issue_a END
                   WHERE rel.issue_a = ? OR rel.issue_b = ? ORDER BY rel.score DESC""",
                (issue_id, issue_id, issue_id),
            )]
            return issue

    def update_issue(self, issue_id, changes):
        if not isinstance(changes, dict) or not changes or set(changes) - {"status", "category"}:
            raise ValueError("Only status and category can be updated")
        for key, choices in (("status", STATUSES), ("category", CATEGORIES)):
            if key in changes and changes[key] not in choices:
                raise ValueError(f"{key} must be one of: {', '.join(choices)}")
        with self.connect() as db:
            if not db.execute("SELECT 1 FROM issues WHERE id = ?", (issue_id,)).fetchone():
                return None
            for key, value in changes.items():
                db.execute(f"UPDATE issues SET {key} = ? WHERE id = ?", (value, issue_id))
        return self.get_issue(issue_id)

    def relate(self, issue_id, other_id):
        if issue_id == other_id:
            raise ValueError("An issue cannot be related to itself")
        with self.connect() as db:
            rows = db.execute("SELECT id, repository FROM issues WHERE id IN (?, ?)", (issue_id, other_id)).fetchall()
            if len(rows) != 2:
                return None
            if rows[0]["repository"] != rows[1]["repository"]:
                raise ValueError("Related issues must be in the same repository")
            db.execute(
                """INSERT INTO relations (repository, issue_a, issue_b, source, score)
                   VALUES (?, ?, ?, 'manual', NULL)
                   ON CONFLICT(issue_a, issue_b) DO UPDATE SET source = 'manual', score = NULL""",
                (rows[0]["repository"], min(issue_id, other_id), max(issue_id, other_id)),
            )
        return self.get_issue(issue_id)



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


def issue_list_html(issues, filters):
    fields = "".join(
        f"<input name='{key}' placeholder='{key}' value='{html.escape(filters.get(key, ''), quote=True)}'>"
        for key in ("repository", "q")
    )
    fields += "<select name='status'><option value=''>all statuses</option>" + "".join(
        f"<option value='{value}' {'selected' if filters.get('status') == value else ''}>{value}</option>"
        for value in STATUSES
    ) + "</select>"
    cards = "".join(
        f"<article class='card'><a href='/issues/{i['id']}'><strong>#{i['id']} {html.escape(i['title'])}</strong></a> "
        f"<span class='pill'>{html.escape(i['category'])}</span><span class='pill'>{html.escape(i['status'])}</span>"
        f"<p class='muted'>{html.escape(i['repository'])} · {html.escape(i['path'] or 'no path')} · "
        f"{i['report_count']} reports from {i['reporter_count']} reporters · last seen {html.escape(i['last_seen'])}</p></article>"
        for i in issues
    ) or "<p>No papercuts match these filters.</p>"
    return page("Papercuts", f"<form method='get'>{fields}<button>Filter</button></form><p>{len(issues)} papercuts</p>{cards}")


def issue_html(issue):
    esc = html.escape
    reports = "".join(
        f"<div class='card'><strong>{esc(r['reporter'])}</strong>{' on ' + esc(r['machine']) if r['machine'] else ''} "
        f"<span class='muted'>{esc(r['observed_at'] or r['received_at'])}"
        f"{' · ' + esc(r['source_ref']) if r['source_ref'] else ''}</span>"
        f"<p>{esc(r['title'])}</p><pre>{esc(r['description'])}</pre></div>"
        for r in issue["reports"]
    )
    related = "".join(
        f"<li><a href='/issues/{r['id']}'>#{r['id']} {esc(r['title'])}</a> "
        f"<span class='muted'>({esc(r['source'])}{', %.0f%%' % (100 * r['score']) if r['score'] is not None else ''})</span></li>"
        for r in issue["related"]
    ) or "<li>None yet</li>"
    body = (f"<h2>#{issue['id']} {esc(issue['title'])}</h2>"
            f"<p><span class='pill'>{esc(issue['category'])}</span><span class='pill'>{esc(issue['status'])}</span> "
            f"{issue['report_count']} reports from {issue['reporter_count']} reporters</p>"
            f"<p class='muted'>{esc(issue['repository'])} · {esc(issue['path'] or 'no path')}<br>"
            f"First seen {esc(issue['first_seen'])}; last seen {esc(issue['last_seen'])}</p>"
            f"<div class='card'><pre>{esc(issue['description'])}</pre></div>"
            f"<h3>Related papercuts</h3><ul>{related}</ul><h3>Reports</h3>{reports}")
    return page(issue["title"], body)


class Handler(BaseHTTPRequestHandler):
    store = None

    def respond(self, status, value, content_type="application/json"):
        body = (json.dumps(value).encode() if content_type == "application/json" else value.encode())
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def input_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= MAX_BODY:
            raise ValueError(f"Body must be between 1 and {MAX_BODY} bytes")
        try:
            return json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("Invalid JSON") from error

    def route(self):
        url = urlsplit(self.path)
        path = url.path
        issue_match = re.fullmatch(r"/api/issues/(\d+)", path)
        relation_match = re.fullmatch(r"/api/issues/(\d+)/related", path)
        html_match = re.fullmatch(r"/issues/(\d+)", path)
        if self.command == "GET" and path == "/api/issues":
            filters = {key: values[0] for key, values in parse_qs(url.query).items()}
            return self.respond(200, self.store.list_issues(filters))
        if self.command == "GET" and issue_match:
            issue = self.store.get_issue(int(issue_match[1]))
            return self.respond(200, issue) if issue else self.respond(404, {"error": "Issue not found"})
        if self.command == "POST" and path == "/api/reports":
            issue, created, replay = self.store.ingest(self.input_json())
            return self.respond(201 if created else 200, {"issue": issue, "created": created, "replay": replay})
        if self.command == "PATCH" and issue_match:
            issue = self.store.update_issue(int(issue_match[1]), self.input_json())
            return self.respond(200, issue) if issue else self.respond(404, {"error": "Issue not found"})
        if self.command == "POST" and relation_match:
            payload = self.input_json()
            if not isinstance(payload, dict) or type(payload.get("issue_id")) is not int:
                raise ValueError("issue_id must be an integer")
            issue = self.store.relate(int(relation_match[1]), payload["issue_id"])
            return self.respond(200, issue) if issue else self.respond(404, {"error": "Issue not found"})
        if self.command == "GET" and path == "/":
            filters = {key: values[0] for key, values in parse_qs(url.query).items()}
            return self.respond(200, issue_list_html(self.store.list_issues(filters), filters), "text/html")
        if self.command == "GET" and html_match:
            issue = self.store.get_issue(int(html_match[1]))
            return self.respond(200, issue_html(issue), "text/html") if issue else self.respond(404, "Not found", "text/plain")
        return self.respond(404, {"error": "Route not found"})

    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def do_PATCH(self):
        self.dispatch()

    def dispatch(self):
        try:
            self.route()
        except ConflictError as error:
            self.respond(409, {"error": str(error)})
        except ValueError as error:
            self.respond(400, {"error": str(error)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="papercuts.sqlite3", help="SQLite database path")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    Handler.store = Store(args.db)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Papercuts at http://{args.host}:{server.server_port}/ (database: {args.db})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
