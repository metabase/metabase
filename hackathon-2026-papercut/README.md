# Papercuts server proof of concept

A small inbox for reports from developer machines or agents. It keeps every report,
groups reports with the same fingerprint into a papercut, and counts reports,
reporters and time lost. It suggests related papercuts, supports merging duplicates,
and records every triage decision. The browser view is read-only; the JSON API
handles triage.

Python 3 and SQLite are the only requirements. Run from this directory:

```sh
python3 server.py --db papercuts.sqlite3
```

During development, add `--reload`. Edits to `server.py` restart the process on
the same port, and open browser pages pick up the new version on their next
refresh check.

Open <http://127.0.0.1:8765/>. To accept reports from other machines on a trusted
network, pass `--host 0.0.0.0` and set a token with `--token` or `PAPERCUTS_TOKEN`.
Requests that change data must then send `Authorization: Bearer <token>`; reads stay
open. Anyone with the token can still claim any reporter name, so keep the server
off the public internet.

The schema and the reasons for it are in
[`slop/chris/reports/schema.server.final.md`](slop/chris/reports/schema.server.final.md).
Schema version 3 renames issues to papercuts and adds the merge, history and
reporter fields described below. Schema version 4 adds each report's git branch
and commit. Schema version 5 adds owner, severity, readiness assessments and fix
dispatches. The server migrates an older database in place when it starts.

## Reporting

```sh
curl -sS http://127.0.0.1:8765/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"repository":"metabase","reporter":"chris","agent":"claude","report_id":"run-123",
       "title":"Agent misses hidden build step","description":"Mage must run before tests",
       "path":"mage/src/mage/build.clj","cost_minutes":15}'
```

- **Required:** `repository`, `reporter`, `report_id` and `title`. `machine_id` is
  an older name for `reporter`; a client may send both if they match.
- **Idempotent:** `report_id` is unique per reporter. Sending it again returns the
  existing report with `"replay": true` and status 200. Sending it with a different
  fingerprint is rejected with 409. A new report returns 201.
- **Grouping:** `fingerprint` picks the papercut. Without one, the server hashes the
  normalized title and path. Several fingerprints can route to one papercut.
- **Who and where:** `agent`, `session` and `machine` say who hit the papercut.
  `path` is a file or symbol location; `area` is free text such as
  "bb.edn (mage task definitions)".
- **Cost and time:** `cost_minutes` is the time lost, if known. `observed_at` (ISO
  8601, not in the future) is when the papercut was hit; it sets first and last
  seen instead of the time the server received the report.
- **Git:** `branch`, `commit_sha` (7 to 40 hex characters) and `repository_url`
  say which code the papercut was hit on. It matters whether the trap was in shared
  code or in code the agent had just written on its own branch. `commit_source`
  says how the reporter knows the commit: `exact`, or reconstructed from the branch
  `reflog`, the `session-start` commit, or the last commit `before-timestamp`.
  `GET /api/papercuts?branch=...` lists papercuts hit on a branch.
- **Category:** `category` is the reporter's guess: `agent-trap`, `code-smell`,
  `flaky-test`, `tooling`, `documentation` or `other`. A papercut takes the first
  category a report sends and stays unclassified until then. Later guesses are
  shown as votes.
- **Owner and severity:** `owner` says where the fix would go: `repo-code`,
  `repo-tooling`, `personal-tooling`, `third-party`, `harness` or `agent-practice`.
  `severity` is `low`, `medium` or `high`. Either may be sent top-level, or inside
  the transcript scanner's `details`, where an unknown value is ignored. As with
  category, the first report that sends one sets the papercut's value.
- **Other fields** are kept in the report's stored request body, and named in the
  response's `extra_fields` so a reporter can spot a misspelled field.

The response is small: the report id, the papercut's id, status and counts, and
whether the report created the papercut, was a replay, or reopened it.

A report seen after its papercut was resolved reopens the papercut, and the history
records why. A report dated before the resolution does not. `wontfix` papercuts
stay closed.

## Reading

```sh
curl -sS 'http://127.0.0.1:8765/api/papercuts?repository=metabase&status=open&sort=reports&limit=20'
curl -sS 'http://127.0.0.1:8765/api/papercuts/1?reports_limit=10'
```

- **Filters:** `repository`, `status`, `category` (`unclassified` for none), `q`
  and `fingerprint`.
- **Sorting:** `sort` is one of `recent` (the default), `oldest`, `reports`,
  `reporters`, `cost` or `updated`.
- **Paging:** `limit` (1 to 500, default 50) and `offset`. The response carries
  `total` and `next_offset`.
- **Polling:** each response has a `cursor`. Pass it back as `since` to get only
  papercuts that changed after it, including ones merged away, which carry
  `merged_into`.

A papercut's detail includes its fingerprints, category votes, the latest reports,
related papercuts, its history, its latest readiness assessment and its dispatches. Asking for a merged papercut redirects to the one
it was merged into.

The browser list applies search, status, category, repository (when there is more than
one) and sort changes automatically, and shows every matching papercut on one page.
Search waits 300 ms after typing.
The list and detail pages check for updates every 15 seconds while visible, and have
a manual refresh button. Report prose, suggested fixes and source fields are shown
separately; Markdown tables, lists, code and links are rendered as safe HTML. Time
lost shows "Not estimated" until a report includes `cost_minutes`.

`GET /api/issues` is the old list route, kept for the transcript scanner in
`mage/src/mage/papercuts/`: a plain array of every live papercut, with fingerprints.

## Triage

Every change takes an optional `actor`, and records who changed what, when, and why.

```sh
# Change status, category (null to unclassify), title, description, path or area
curl -sS -X PATCH http://127.0.0.1:8765/api/papercuts/1 -H 'Content-Type: application/json' \
  -d '{"status":"investigating","category":"tooling","actor":"chris","reason":"Repro on master"}'
# Merge papercut 2 into 1
curl -sS -X POST http://127.0.0.1:8765/api/papercuts/2/merge -H 'Content-Type: application/json' \
  -d '{"into":1,"actor":"chris","reason":"Same trap"}'
# Link, or reject a suggested link
curl -sS -X POST http://127.0.0.1:8765/api/papercuts/1/related -H 'Content-Type: application/json' -d '{"papercut_id":3}'
curl -sS -X DELETE http://127.0.0.1:8765/api/papercuts/1/related/3
# Route another fingerprint here, or comment
curl -sS -X POST http://127.0.0.1:8765/api/papercuts/1/fingerprints -H 'Content-Type: application/json' -d '{"fingerprint":"old-slug"}'
curl -sS -X POST http://127.0.0.1:8765/api/papercuts/1/comments -H 'Content-Type: application/json' -d '{"author":"chris","body":"Hit again"}'
```

- **Merging** moves every report and fingerprint into the target, so later reports
  with the old fingerprint land there too. Status and category carry over only when
  both papercuts agree; otherwise the target goes back to `open`. A target with no
  category takes the source's.
- **Suggestions** compare the words in titles and descriptions. They are recomputed
  when a papercut is created, merged into, or has its title or description edited.
  A rejected pair is never suggested again.

PATCH also accepts `owner` and `severity`, or null for either.

## Assessment and dispatch

A dispatcher assesses whether a papercut is ready to be fixed, and then runs a fix
for it. See [`papercuts/plan.md`](../papercuts/plan.md).

Dispatch is manual. Every open papercut with no dispatch in progress has a
**Dispatch** button, highlighted when its latest assessment is `ready`. The button
only claims the papercut. The work is done by a watcher, which files the Linear
issue, runs the fixer and opens the draft PR:

```sh
set -a && . ../.env && set +a   # LINEAR_API_KEY, PAPERCUTS_TOKEN
python3 dispatcher.py watch --server http://127.0.0.1:8765
```

Run one watcher per server. Until one runs, a dispatch shows as `queued` and can
be cancelled. Its Linear issue and draft PR links show on the papercut's card and
page. When the server has a token, enter it under **API token** in the header. The
page keeps it in the browser's local storage.

### Running the dispatcher

Prerequisites on the machine that runs `watch`:

- `claude` on the `PATH`, or its path in `CLAUDE_BIN`.
- `gh` signed in as an account that can push branches to `metabase/metabase`.
- `LINEAR_API_KEY` in the repository root's `.env`. Issues go to the Hackathon
  2026: Papercut Tracker project.
- `PAPERCUTS_TOKEN` in `.env` when the server has a token.
- A Metabase checkout to make worktrees from. The default is the one this directory
  is in. For frontend fixes, `bun` too, because the fixer runs
  `bun install --frozen-lockfile` in its worktree.

`--server` must be the server whose page has the Dispatch button you pressed. The
default is `$PAPERCUTS_SERVER`, or `http://127.0.0.1:8765`.

For each queued dispatch, `watch` does four things:

1. Files the Linear issue.
2. Makes a worktree of `origin/master` in `../papercut-worktrees/`, on branch
   `<linear-id>-papercut-<slug>`.
3. Runs `claude -p` with `fixer/prompt.md`. The fixer can edit files, run
   `./bin/test-agent`, run `bun install --frozen-lockfile` and
   `bun run test-unit-keep-cljs`, and use read-only git. It cannot commit or push.
4. Commits and pushes the fix, and opens a draft PR, but only when the fixer
   reports that its tests pass.

| Option | Default | |
|---|---|---|
| `--budget-usd` | 10 | Spending cap for each fixer run |
| `--timeout-minutes` | 40 | The fixer is stopped after this |
| `--model` | `opus` | |
| `--repo`, `--worktrees`, `--base` | this checkout, `../papercut-worktrees`, `master` | |
| `--interval` | 5 | Seconds between checks for queued dispatches |

`python3 dispatcher.py dispatch --id N --live` does the same work for one papercut
from the command line. Without `--live`, it only writes the message the fixer would
get to `runs/dry-run-N.md`.

**Following a run:** the watcher's terminal prints each step: the claim it picked
up, the Linear issue, the branch, and the outcome. Everything else for dispatch
`<id>` is in `runs/<id>/`:

- `message.md`: what the fixer was given.
- `agent.jsonl`: the fixer's session, written as it runs.
- `result.json`: its final result and cost.

To follow the fixer live:

```sh
tail -f runs/<id>/agent.jsonl | jq -r 'select(.type=="assistant") | .message.content[]
  | if .type=="tool_use" then "→ \(.name) \(.input.command // .input.file_path // .input.pattern // "")"
    elif .type=="text" then "  \(.text[0:200])" else empty end'
```

**Outcomes:**

| Outcome | What it leaves behind |
|---|---|
| `pr_opened` | A draft PR. The worktree is removed. The papercut stays `investigating` |
| `already_fixed` | The papercut is resolved, with the fixer's evidence as the reason |
| `not_reproducible`, `needs_human` | The papercut reopens. A worktree with changes is kept |
| `needs_human` because tests failed | The fix is committed on a local branch, and the worktree is kept |
| `failed` | Timeout, crash or error. The worktree is kept for a look |

Ctrl-C stops the watcher and the fixer it is running. A dispatch interrupted
before the fixer started is resumed by the next `watch`. One interrupted while
`running` has to be cancelled by hand: PATCH it to `failed`.

**Assessing readiness** (optional, for the `ready` highlight):
`python3 dispatcher.py assess --server <server>` asks Jev about papercuts that
changed since its last run. It needs `TYPESAFE_API_KEY` or `JEV_API_KEY`. Add
`--dry-run` to print verdicts without recording them, or `--full` to reassess every
open papercut.

```sh
# Record a readiness assessment: not_ready, ready or needs_human
curl -sS -X POST http://127.0.0.1:8765/api/papercuts/1/assessments -H 'Content-Type: application/json' \
  -d '{"verdict":"ready","evidence_score":0.8,"fixability_score":2.6,"fixability_confidence":0.9,
       "inputs":{"reporter_count":3},"model":"jev-1.13.0","reason":"Three reporters; local change","actor":"dispatcher"}'
# Claim an open papercut: 201, or 409 when it isn't open or a dispatch is in progress
curl -sS -X POST http://127.0.0.1:8765/api/papercuts/1/dispatch -H 'Content-Type: application/json' \
  -d '{"actor":"dispatcher","assessment_id":1}'
# Move a dispatch forward and record links
curl -sS -X PATCH http://127.0.0.1:8765/api/dispatches/1 -H 'Content-Type: application/json' \
  -d '{"state":"linear_created","linear_issue_id":"HACK-12","linear_url":"https://linear.app/metabase/issue/HACK-12"}'
curl -sS 'http://127.0.0.1:8765/api/dispatches?state=active'
```

- **Assessments** are all kept. Only a change of verdict is recorded as an event,
  so re-assessing a papercut whose verdict holds does not put it back in the
  `since` feed.
- **A claim** moves the papercut to `investigating`. Each papercut has at most one
  dispatch in progress, and concurrent claims start only one.
- **Dispatch states** only move forward: `claimed` → `linear_created` → `running`
  → one of `pr_opened`, `already_fixed`, `needs_human`, `not_reproducible` or
  `failed`. An active dispatch can also go straight to `failed`. Resending the
  current state does nothing. Links (`linear_issue_id`, `linear_url`, `branch`,
  `pr_url`, `run_log`) and `cost_usd` can be updated at any time.
- **A finished dispatch hands the papercut back:** `already_fixed` resolves it,
  `pr_opened` leaves it `investigating` for a human to take over, and the other
  outcomes reopen it. Nothing changes when someone has already moved the papercut
  out of `investigating`.
- **Merging** moves an active dispatch to the target. It is refused when both
  papercuts have a dispatch in progress.

Errors are JSON: 400 for bad input, 401 for a missing token, 404, 409 for conflicts
such as editing a merged papercut, 503 when the database is busy, and 500 otherwise.

## Scripts

Run tests with `python3 -m unittest discover -s . -p 'test_*.py'`.

For a populated demo, start the server and run `python3 seed_demo.py`. It records
four papercuts under `demo/metabase`, including a duplicate report and related
papercuts. The seed is safe to run again: stable report IDs prevent double counting.

To view real, source-backed papercuts, point the importer at the local archive:
`python3 import_local.py slop/chris/papercuts/claude slop/chris/papercuts/codex`. It
accepts files or directories. Each transcript occurrence a writeup records becomes
one report under a per-writeup fingerprint, so report counts show how often a
papercut was hit. The report's `reporter` and `agent` come from the file's
`<user>.<agent>` prefix, its `session` from the transcript, its `source_ref` is the
file name, and `observed_at` is the occurrence date. Writeups marked `fixed` or
`wontfix` are imported, then set to `resolved` or `wontfix`. Each slug in a writeup's
`merged_from` becomes another fingerprint of its papercut; a papercut already created
under that slug is merged in. A Claude writeup's `severity` is sent as the report's
severity. Stable report IDs make repeat imports a no-op. The
importer sends `PAPERCUTS_TOKEN` when it is set.
