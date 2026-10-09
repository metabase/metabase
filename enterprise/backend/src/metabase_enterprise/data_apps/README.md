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
it owns (see Permissions), and deleting an app deletes its collection and group assignments while
preserving the assigned permission groups. Its default fields leave the bundle out, so listing apps
never drags bundles out of the DB; `db.clj`'s `data-app-bundle` reads it explicitly.

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
collection, which the app depends on and so loads after. The bundle travels as a serdes _resource
file_: the entity carries it in `:serdes/resources` on export, the storage writers put it next to
the YAML, and ingestion reads the paths `serdes/resource-paths` returns back in. A resource path
must stay inside the entity's directory.

`enabled` is admin-owned and never leaves the instance; group assignments also stay local to the
instance. `table_ids` are server-managed, and `bundle_hash` is recomputed from the bundle on import.
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

Each app owns a resource collection, created with the app in the `data-apps` namespace. The collection
is never swapped for another; `resources.clj` keeps its name and permissions in step and restores it from the trash.
Administrators assign existing internal permission groups through `/api/apps/:slug/groups`. Assignments live in
`data_app_group_assignment` and stay local to the instance. Repository sync preserves them while the app row exists.

Admins reuse existing permission groups through `/api/apps/:slug/groups`. Assignments are stored in
`data_app_group_assignment`: an app can have multiple groups, and a group can be assigned to multiple apps.

Membership in any assigned group grants app access. Administrators can access every app. The list API hides
unassigned apps from other users, and metadata, bundle, and HTML entry-point requests check the same assignment.
Collection access alone does not grant app access.

Every app owns a collection from insertion. If its collection is deleted separately, resource reconciliation recreates it.

Assignments grant read-only access to the resource collection. Sync restores these grants and removes collection
access from unassigned groups. Assignment changes never change data permissions. Deleting an app deletes its
collection and assignments, but preserves the assigned groups.

**A viewer sees an app's data only through access they already hold.** Assignment changes never change
View Data permissions; the viewer's other groups and sandboxes continue to determine data access.

**Managing is superuser-only** — assignments, enabling, disabling, deleting, and repo status.
Exporting an app's resources also needs a superuser.

The Data Apps feature is required for all app API endpoints, including group listing and removal.

## Namespace map

| Namespace                              | Responsibility                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps.clj`                             | Creating apps; the connected repository's URL.                                                  |
| `core.clj`                             | Public access checks, resource file problems, and table dependencies.                           |
| `config.clj`                           | The serialized layout and data app contract version constants.                                  |
| `schema.clj`                           | Column schemas, with the normalization and validation every write goes through.                 |
| `api.clj`                              | The `/api/apps` endpoints, bundle serving, ETag handling.                                       |
| `resources.clj`                        | Lifecycle of the app-owned collection and derived collection permissions.                       |
| `models/data_app.clj`                  | The `:model/DataApp` Toucan model: hooks, permissions, default fields, serialization.           |
| `generate.clj`                         | The facade over what Metabase generates for an app's author: its files, its schema, its collection's files. |
| `generate/app.clj`                     | A new app's `data_app.yaml` and collection file, each at its path with its YAML.                |
| `generate/resources.clj`               | The files of an app's collection: built queries, action copies, metric copies, each with its YAML. |
| `generate/schemas.clj`                 | The TypeScript schema of the root libraries' tables and metrics and the model-less query actions. |
| `generate/schemas/`                    | The schema's stages: data access (`source`), entities (`table`, `metric`, `action`, `common`), rendering (`render`, `javascript`). |
| `query_definition.clj`                 | The closed schema of a `defineQuery` definition the serialization accepts.                      |
| `resource_validation.clj`              | What the files of an app's collection may hold, checked on the whole snapshot before an import. |
| `resource_tables.clj`                  | The tables an app's resources read, recorded on the app after an import.                        |
| `access.clj`                           | App access through assigned groups.                                                             |
| `group_access.clj`                     | Assignment management and collection grant reconciliation.                                      |
| `models/data_app_group_assignment.clj` | App-to-group assignments.                                                                       |
| `db.clj`                               | The module's application-database queries.                                                      |
| `csp.clj`                              | `allowed_hosts` lookup for the core CSP middleware.                                             |
| `init.clj`                             | Loads the above so endpoints, models, and hooks register.                                       |

`group_access.clj` manages assignments. `models/data_app_group_assignment.clj` defines the local association model.
