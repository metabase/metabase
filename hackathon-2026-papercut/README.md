# Papercuts server proof of concept

A small inbox for reports from developer machines or agents. It preserves every
report, groups exact matches into a papercut, counts reports and distinct reporters,
suggests related papercuts, and gives each papercut a category and triage status.
The browser view is read-only; the JSON API supports triage and manual relations.

Python 3 and SQLite are the only requirements. Run from this directory:

```sh
python3 server.py --db papercuts.sqlite3
```

Open <http://127.0.0.1:8765/>. To accept reports from other machines on a trusted
network, pass `--host 0.0.0.0`. This proof of concept has no authentication, so do
not expose it to the public internet.

Submit a report:

```sh
curl -sS http://127.0.0.1:8765/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"repository":"metabase","reporter":"chris.claude","report_id":"run-123", "title":"Agent misses hidden build step","description":"Mage must run before tests","path":"mage/src/mage/build.clj"}'
```

`repository`, `reporter`, and `title` are required. `machine_id` is accepted as an
older name for `reporter`. Send a stable `report_id` per reporter to make retries
idempotent. Replaying a `report_id` returns the existing papercut; replaying it with a
different fingerprint is rejected with 409. An optional `fingerprint` lets reporters define
exact matching; otherwise the server hashes normalized title and path within the
repository. Reports with different fingerprints remain separate even if they look
similar. Similar titles and paths within one repository create *suggested* related
links, which never merge counts. An optional `category` can override the server's
small keyword classifier. Categories are `agent-trap`, `code-smell`, `flaky-test`,
`tooling`, `documentation`, and `other`. Optional `machine`, `source_type`, and
`source_ref` fields record where a report came from. The server keeps each report's
full request body, including fields it does not know, and records the fingerprint and
category the reporter sent separately from the ones it computed.

The schema and the reasons for it are in
[`slop/chris/reports/schema.server.final.md`](slop/chris/reports/schema.server.final.md).
The server migrates an older database in place when it starts.

Read and triage:

```sh
curl -sS 'http://127.0.0.1:8765/api/issues?status=open&repository=metabase'
curl -sS http://127.0.0.1:8765/api/issues/1
curl -sS -X PATCH http://127.0.0.1:8765/api/issues/1 \
  -H 'Content-Type: application/json' -d '{"category":"tooling","status":"investigating"}'
curl -sS -X POST http://127.0.0.1:8765/api/issues/1/related \
  -H 'Content-Type: application/json' -d '{"issue_id":2}'
```

The issue list also accepts `category` and `q` filters. A Mage task can submit the
same JSON over HTTP; it need not share the server's implementation language.

Run tests with `python3 -m unittest discover -s . -p 'test_*.py'`.

For a populated demo, start the server and run `python3 seed_demo.py`. It records
four papercuts under `demo/metabase`, including a duplicate report and related
issues. The seed is safe to run again: stable report IDs prevent double counting.

To view real, source-backed papercuts, point the importer at the local archive:
`python3 import_local.py slop/chris/papercuts/claude slop/chris/papercuts/codex`. It accepts files or directories. Each
transcript occurrence a writeup records becomes one report under a per-writeup
fingerprint, so report counts show how often a papercut was hit. The report's
`reporter` is the file's `<user>.<agent>` prefix, its `source_ref` is the file name,
its payload keeps the transcript and lines, and `observed_at` is the
occurrence date. Writeups marked `fixed` or `wontfix` are imported, then set to
`resolved` or `wontfix`. Stable report IDs make repeat imports a no-op.

Reports may carry an optional `observed_at` (ISO 8601 date or timestamp) for when
the papercut was hit. It sets the papercut's first and last seen dates instead of
the time the server received the report.
