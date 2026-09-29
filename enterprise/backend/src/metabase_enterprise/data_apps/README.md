# Data apps (backend)

A **data app** is a JS bundle, authored in a git repository, that Metabase serves and runs inside a
Near Membrane sandbox in the browser. This README covers the backend half: how apps are stored, created,
serialized, and served. The sandbox, the app runtime, and the host
iframe live on the frontend and are out of scope here.

## What an app is

`:model/DataApp` is a regular serdes entity. A row holds the app's manifest fields — `name` (the
slug, served at `/apps/<slug>`), `display_name`, `description`, the data app contract `version`, the
`bundle_path`, and the `allowed_hosts` its sandboxed bundle may `fetch`/XHR — plus the bundle bytes
themselves, cached in the app DB so serving never reads a repository.

The model's hooks hold its invariants: every write is normalized and validated against the column
schemas in `schema.clj`, `bundle_hash` always matches `bundle`, an inserted app gets the collection
and permission group it owns (see Permissions), and a deleted one loses them. Its default fields
leave the bundle out, so listing apps never drags bundles out of the DB; `db.clj`'s
`data-app-bundle` reads it explicitly.

An app with a lower `version` than this Metabase serves is outdated — badged for admins, hidden
from everyone else, and a 409 to open.

## Serialization

A serialized app is a `data_app.yaml` in its own directory under `data_apps/`, with its bundle as a
plain file next to it at its `path`:

```
data_apps/
  sales/
    data_app.yaml          # serdes/meta, entity_id, slug, name, description, version, path, allowed_hosts
    dist/index.js          # the bundle
```

The YAML keeps the keys a hand-written manifest uses: `slug` is the `name` column, `name` the
`display_name`, and `path` the `bundle_path`. The bundle travels as a serdes *resource file*: the
entity carries it in `:serdes/resources` on export, the storage writers put it next to the YAML,
and ingestion reads the paths `serdes/resource-paths` returns back in. A resource path must stay
inside the entity's directory.

Only the manifest is serialized. `enabled` is admin-owned and never leaves the instance; the
collection, permission group, and `table_ids` are server-managed; `bundle_hash` is recomputed from
the bundle on import. Drafts are not exported.

An import matches an app by `entity_id`, falling back to its slug so it takes over a draft, and
reasserts the app's resources. It is a no-op without the `:data-apps` feature.

Remote sync treats data apps like any other entity, globally rather than per collection. Because
the bundle is a separate file, a pull that changes only a bundle, or an export that touches an app,
takes the full rather than the incremental path. An app's directory also holds its source, which
serialization doesn't own, so exports replace only the YAML and resource files in `data_apps/`.

## Serving

Routes are mounted at `/api/apps` (`api.clj`). Not `/app/*` — the server reserves that for static
assets (`metabase.server.routes/static-files-handler`).

- `GET /api/apps` — list; `?available=true` filters to enabled apps that aren't drafts.
- `GET /api/apps/:slug` — metadata for one enabled app.
- `GET /api/apps/:slug/bundle` — the cached bytes, with a content-hash ETag and `If-None-Match`
  → 304. Carries `X-Metabase-Data-App-Allowed-Hosts`, which the iframe reads to configure its
  sandbox fetch allowlist.
- `GET /api/apps/sandbox-host` — the empty document loaded as the Near-Membrane realm iframe,
  carrying the CSP that confines `'unsafe-eval'` to that realm.
- `POST /api/apps` — create an app from its manifest fields and bundle text, filling a draft with
  the same slug (superuser).
- `PUT /api/apps/:slug` — update manifest fields or the bundle, or toggle `enabled` (superuser).
- `DELETE /api/apps/:slug` — drop a row, its bundle, and its owned resources (superuser).
- `GET /api/apps/repo-status` — whether a repo is connected (superuser).

Responses are field-filtered by role: superusers get full metadata, everyone else gets `name` and
`display_name` only. The bundle blob is never serialized into JSON, and metadata reads go through
the model's default fields, which leave the bundle out, so listing apps doesn't drag the bundles out of the DB.

`csp.clj` exposes an app's `allowed_hosts` to the core security middleware through a `defenterprise`
hook, which drives the `connect-src` of the iframe document's CSP. It's a separate namespace so the
middleware's lookup doesn't pull in route code.

## Permissions

Each app owns two server-managed resources (`resources.clj`), created with the app (or its draft)
and reasserted on every import: a **collection** holding the copies the app is served from (saved
questions, actions, table-sourced metrics) and a **permissions group** its users belong to.

The group is set database-level `view-data :blocked` on every database, so it grants **no data
access of its own** (which cascades `create-queries`/`download-results` to `:no`); every group but
admins is revoked from the collection before the app group gets read access. Deleting an app deletes
both resources and everything in the collection.

**Viewing an app** requires read access to its resource collection. You have to be a member in
the app's group or be an admin. An app without a linked resource collection is considered _unpublished_.
The app's metadata and bundle endpoint returns HTTP 409 for all signed-in users. The frontend
shows the error "This data app isn’t published yet".

**A viewer sees an app's data only through access they already hold.** The app group grants no
view-data of its own, so a viewer without access to an app's tables (e.g. a sandboxed user) sees no
data from it — their own groups' permissions and sandboxes apply unchanged. Because the group grants
nothing, it can never lift another group's sandbox, so sandboxing needs no data-app special-casing.

**Managing is superuser-only** — enabling, disabling, deleting, and repo status.

## Namespace map

| Namespace             | Responsibility                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `apps.clj`            | Creating apps and drafts; the connected repository's URL.                                           |
| `config.clj`          | The serialized layout and data app contract version constants.                                     |
| `schema.clj`          | Column schemas, with the normalization and validation every write goes through.                     |
| `api.clj`             | The `/api/apps` endpoints, bundle serving, ETag handling.                                           |
| `resources.clj`       | Lifecycle of the app-owned collection and permission group: creation, view-data blocking, deletion. |
| `models/data_app.clj` | The `:model/DataApp` Toucan model: hooks, permissions, default fields, serialization.               |
| `csp.clj`             | `allowed_hosts` lookup for the core CSP middleware.                                                 |
| `init.clj`            | Loads the above so endpoints, models, and hooks register.                                           |
