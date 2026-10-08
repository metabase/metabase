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
plain file next to it at its `path`. Its resource collection is a collection of the `data-apps`
namespace, serialized like any collection under `collections/`:

```
data_apps/
  sales/
    data_app.yaml          # serdes/meta, entity_id, slug, name, description, version, path, allowed_hosts, collection
    dist/index.js          # the bundle
collections/
  data_apps/
    data_app__sales.yaml   # the app's resource collection (namespace: data-apps)
    data_app__sales/
      *.yaml               # the saved questions, metric copies, and action copies the app runs
```

Collections of the `data-apps` namespace are written under `collections/data_apps/`, as the
`transforms` and `snippets` namespaces have their folders.

The YAML keeps the keys a hand-written manifest uses: `slug` is the `name` column, `name` the
`display_name`, `path` the `bundle_path`, and `collection` the entity ID of the app's resource
collection, which the app depends on and so loads after. The bundle travels as a serdes *resource
file*: the entity carries it in `:serdes/resources` on export, the storage writers put it next to
the YAML, and ingestion reads the paths `serdes/resource-paths` returns back in. A resource path
must stay inside the entity's directory.

`enabled` is admin-owned and never leaves the instance; the permission group and `table_ids` are
server-managed; `bundle_hash` is recomputed from the bundle on import.
A targeted export of an app brings its collection and what it holds along (`serdes/descendants`).

An import matches an app by `entity_id` and reasserts the app's resources; a manifest whose slug an app
made on the instance holds is refused. A manifest that names a collection the repository lacks, or one
other than the collection the app already owns, fails to load. It is a no-op without the
`:data-apps` feature.

Remote sync treats data apps like any other entity, globally rather than per collection, and their
collections like any namespace's: in scope for import, cleanup and export by their namespace. Before
an import loads anything, `resource_validation.clj` checks every manifest with its collection and
the cards and actions in it, and fails the pull naming the file that a load couldn't take as the
author meant it. Because the bundle is a separate file, a pull that changes only a bundle, or an
export that touches an app, takes the full rather than the incremental path. An app's directory
also holds its source, which serialization doesn't own, so exports replace only the YAML and
resource files in `data_apps/`.

An author deletes an app by deleting its directory and its collection's files under
`collections/data_apps/` in one commit: the pull deletes the app, and the app's `before-delete`
hook deletes the collection with what it holds. A commit that deletes the directory but keeps the
collection's files still deletes the app and its collection; the next export removes the files,
and until then a full pull loads them back as a collection no app owns.

## Serving

Routes are mounted at `/api/apps` (`api.clj`). Not `/app/*` — the server reserves that for static
assets (`metabase.server.routes/static-files-handler`).

- `GET /api/apps` — list; `?available=true` filters to enabled apps.
- `GET /api/apps/:slug` — metadata for one enabled app.
- `GET /api/apps/:slug/bundle` — the cached bytes, with a content-hash ETag and `If-None-Match`
  → 304. Carries `X-Metabase-Data-App-Allowed-Hosts`, which the iframe reads to configure its
  sandbox fetch allowlist.
- `GET /api/apps/sandbox-host` — the empty document loaded as the Near-Membrane realm iframe,
  carrying the CSP that confines `'unsafe-eval'` to that realm.
- `POST /api/apps` — create an app from its manifest fields and bundle text (superuser).
- `PUT /api/apps/:slug` — update manifest fields or the bundle, or toggle `enabled` (superuser).
- `DELETE /api/apps/:slug` — drop a row, its bundle, and its owned resources (superuser).
- `GET /api/apps/repo-status` — whether a repo is connected (superuser).
- `POST /api/apps/generate/app` — a new app's `data_app.yaml` and its collection's file, each at its path
  from the repository root, with new entity IDs (`generate/app.clj`; superuser).
- `GET /api/apps/generate/schemas` — the TypeScript module an app's definitions are written against: the
  root libraries' tables and metrics, and the query actions that belong to no model
  (`generate/schemas.clj`; superuser).
- `POST /api/apps/generate/resources` — the files of an app's collection, each a file name and the YAML a
  remote-sync export writes: a saved question per `defineQuery` definition, a copy of each action, and a
  copy of each metric the queries aggregate (`generate/resources.clj`). An action must belong to no model
  (superuser).

Responses are field-filtered by role: superusers get full metadata, everyone else gets `name` and
`display_name` only. The bundle blob is never serialized into JSON, and metadata reads go through
the model's default fields, which leave the bundle out, so listing apps doesn't drag the bundles out of the DB.

`csp.clj` exposes an app's `allowed_hosts` to the core security middleware through a `defenterprise`
hook, which drives the `connect-src` of the iframe document's CSP. It's a separate namespace so the
middleware's lookup doesn't pull in route code.

## Permissions

Each app owns two server-managed resources, created with the app and reasserted on
every import: a **collection** holding the copies the app is served from (saved questions, actions,
table-sourced metrics) and a **permissions group** its users belong to. The collection is a root
collection of the `data-apps` namespace, created as the app's row is inserted unless an import names
one (`models/data_app.clj`), and can never be swapped for another; `resources.clj` keeps its name and
permissions in step and brings it out of the trash. Deleting the app deletes both, and the
collection's own hooks delete what it holds.

The group is set database-level `view-data :blocked` on every database, so it grants **no data
access of its own** (which cascades `create-queries`/`download-results` to `:no`); every group but
admins is revoked from the collection before the app group gets read access. Deleting an app deletes
both resources and everything in the collection.

**Viewing an app** requires read access to its resource collection. You have to be a member in
the app's group or be an admin.

**A viewer sees an app's data only through access they already hold.** The app group grants no
view-data of its own, so a viewer without access to an app's tables (e.g. a sandboxed user) sees no
data from it — their own groups' permissions and sandboxes apply unchanged. Because the group grants
nothing, it can never lift another group's sandbox, so sandboxing needs no data-app special-casing.

**Managing is superuser-only** — enabling, disabling, deleting, and repo status.
Exporting an app's resources also needs a superuser.

## Namespace map

| Namespace             | Responsibility                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `apps.clj`            | Creating apps; the connected repository's URL.                                                      |
| `core.clj`            | What other modules ask: resource file problems and table dependencies.                             |
| `config.clj`          | The serialized layout and data app contract version constants.                                     |
| `schema.clj`          | Column schemas, with the normalization and validation every write goes through.                     |
| `api.clj`             | The `/api/apps` endpoints, bundle serving, ETag handling.                                           |
| `resources.clj`       | Lifecycle of the app-owned collection and permission group: creation, view-data blocking, deletion. |
| `models/data_app.clj` | The `:model/DataApp` Toucan model: hooks, permissions, default fields, serialization.               |
| `generate.clj`        | The facade over what Metabase generates for an app's author: its files, its schema, its collection's files. |
| `generate/app.clj`    | A new app's `data_app.yaml` and collection file, each at its path with its YAML.                    |
| `generate/resources.clj` | The files of an app's collection: built queries, action copies, metric copies, each with its YAML. |
| `generate/schemas.clj` | The TypeScript schema of the root libraries' tables and metrics and the model-less query actions.  |
| `generate/schemas/`   | The schema's stages: data access (`source`), entities (`table`, `metric`, `action`, `common`), rendering (`render`, `javascript`). |
| `query_definition.clj`| The closed schema of a `defineQuery` definition the serialization accepts.                                 |
| `resource_validation.clj` | What the files of an app's collection may hold, checked on the whole snapshot before an import. |
| `resource_tables.clj` | The tables an app's resources read, recorded on the app after an import.                           |
| `db.clj`              | The module's application-database queries.                                                          |
| `csp.clj`             | `allowed_hosts` lookup for the core CSP middleware.                                                 |
| `init.clj`            | Loads the above so endpoints, models, and hooks register.                                           |
