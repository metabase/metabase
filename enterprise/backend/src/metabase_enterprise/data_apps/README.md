# Data apps (backend)

A **data app** is a JS bundle, authored in a git repository, that Metabase serves and runs inside a
Near Membrane sandbox in the browser. This README covers the backend half: how apps get from the
repository into the app DB, and how they're served. The sandbox, the app runtime, and the host
iframe live on the frontend and are out of scope here.

## Where apps come from

Apps are **not uploaded**. A single repository is connected to Metabase through remote-sync
(Admin → Settings → Remote sync), and each app lives in its own directory under `data_apps/` at the
repo root:

```
data_apps/
  sales/                   # the directory name is the slug: /apps/sales
    data_app.yaml
    dist/index.js          # the built bundle, committed
  ops/
    data_app.yaml
    dist/app.js
```

`data_app.yaml` declares the display name, the bundle path relative to the app's own directory, and
optionally the origins the sandboxed bundle may `fetch`/XHR. See `config.clj` for the format and its
validation.

**The directory name is the slug.** Nothing in the config declares it. This is what makes slug
collisions structurally impossible — a repo can't hold two `data_apps/sales` directories, and
discovery takes at most one config per directory.

## The sync pipeline

Data apps have no sync of their own; they ride the remote-sync import. Every pull — the manual
"Pull changes" button, the auto-import poll, or startup — ends in
`remote-sync.impl/materialize-data-apps!`, which adapts the imported snapshot to plain reader fns
and calls `data-apps.sync/sync-from-snapshot!`.

```
remote-sync import  →  snapshot  →  sync-from-snapshot!  →  discover configs
                                                         →  materialize each app
                                                         →  prune apps absent from the repo
```

`data_apps/` is deliberately **not** a serdes path, so apps are invisible to the serialization
layer and are counted separately in the pull summary (see `fold-data-app-changes` in
`remote_sync/impl.clj` — without it, a pull whose only change is a data app reports "no changes").

One import = one transaction. Discovery, upserts, and pruning all commit together.

## The repository is the source of truth

A sync **upserts every app it finds and deletes every row whose directory is gone.** The
consequences are worth stating explicitly, because they're the questions that come up:

| Event | What happens to apps |
|---|---|
| App directory removed from the repo | Row and cached bundle deleted on the next sync |
| Repo switched to a different one | Previous repo's apps are absent from the new snapshot, so they're dropped |
| Repo unlinked | Nothing — unlinking runs no sync, so apps survive |
| Repo has no `data_apps/` at all | All apps removed |
| Failed clone/fetch | Nothing — that throws before a snapshot exists, so deletion never fires |

Pruning is by **directory presence**, not by successful parse. An app whose directory is still
there but whose `data_app.yaml` is momentarily broken keeps its row and its last-good bundle, and is
marked with a `sync_error` — see failure isolation below. Local `enabled` state does not protect a
row: an app disabled in the admin UI and then deleted from the repo is still removed.

## Failure isolation

A sync must never take a working app offline, and one bad app must never abort the others. So
failures are recorded per app rather than thrown:

- **Malformed `data_app.yaml`** — collected into `:config-errors`. An app that already has a row is
  marked with `sync_error` (so the UI shows it as failed rather than silently presenting the
  last-good bundle as freshly synced); an app that has no row yet is simply not materialized.
- **Bundle missing or over the size cap** — the row's metadata is still upserted with `sync_error`
  set, and the previously cached bundle is kept.
- **Anything thrown at all** — `sync-from-snapshot!` catches and logs it, returning nil, so a
  data-app failure can't break the surrounding remote-sync import.

Because the bundle is cached in the app DB rather than read from the repo per request, a broken sync
degrades to "the app still serves its last good bundle, and the admin sees why it's stale."

## What survives a sync

`enabled` is admin-owned and is never written by a sync — an app disabled in the admin UI stays
disabled across pulls, and new rows get the DB default of true.

`:changed` accounting deliberately ignores `last_synced_sha` / `last_synced_at`: re-syncing
identical content at a new commit is not a change, so the pull summary reports real edits only.

## Serving

Routes are mounted at `/api/apps` (`api.clj`). Not `/app/*` — the server reserves that for static
assets (`metabase.server.routes/static-files-handler`).

- `GET /api/apps` — list; `?available=true` filters to enabled apps with no sync error.
- `GET /api/apps/:slug` — metadata for one enabled app.
- `GET /api/apps/:slug/bundle` — the cached bytes, with a content-hash ETag and `If-None-Match`
  → 304. Carries `X-Metabase-Data-App-Allowed-Hosts`, which the iframe reads to configure its
  sandbox fetch allowlist.
- `PUT /api/apps/:slug` — toggle `enabled` (superuser).
- `DELETE /api/apps/:slug` — drop a row and its bundle (superuser).
- `GET /api/apps/repo-status` — whether a repo is connected (superuser).

Responses are field-filtered by role: superusers get full metadata, everyone else gets `name` and
`display_name` only. The bundle blob is never serialized into JSON, and metadata reads go through
`select-non-blob` helpers so listing apps doesn't drag the bundles out of the DB.

`csp.clj` exposes an app's `allowed_hosts` to the core security middleware through a `defenterprise`
hook, which drives the `connect-src` of the iframe document's CSP. It's a separate namespace so the
middleware's lookup doesn't pull in route code.

## Permissions

**Viewing is not gated.** Any signed-in user may open any enabled app — `can-read?` is
unconditionally true, and the endpoints are `+auth`, so reaching a read check already implies
authentication. The data an app queries still runs through the QP under the viewing user's own
permissions, so a user without data access opens the app and sees no data.

**Managing is superuser-only** — enabling, disabling, deleting, and reading repo status.

## Namespace map

| Namespace | Responsibility |
|---|---|
| `sync.clj` | Discovery, materialization, pruning. The entry point remote-sync calls. |
| `config.clj` | `data_app.yaml` parsing and validation; the `data_apps/` layout constants. |
| `api.clj` | The `/api/apps` endpoints, bundle serving, ETag handling. |
| `models/data_app.clj` | The `:model/DataApp` Toucan model, permissions, blob coercion. |
| `csp.clj` | `allowed_hosts` lookup for the core CSP middleware. |
| `init.clj` | Loads the above so endpoints, models, and hooks register. |
