# Workspaces contract

> **Question this answers:** What exactly can a caller (MB Code desktop, CI) ask of the parent Metabase and of a sidecar Metabase to get an isolated warehouse login, what does it get back, and which parts are on master, in an open hardening PR, or only proposed?

A workspace is a warehouse login plus a scratch namespace. The login reads the database's input schemas and writes only to the scratch namespace. A local Metabase (the sidecar) redirects transform output, and later reads of it, into the scratch namespace.

This is the workspace layer. It is not the agent-facing API: "give me a safe place to run a transform", backed by a workspace or a staging database, is a layer above this and is not designed yet.

## Files

| File | Boundary | Format |
| --- | --- | --- |
| `parent.openapi.yaml` | caller -> parent: `/api/ee/workspace-manager` | OpenAPI 3.1 |
| `config.schema.json` | parent -> sidecar: the `config.yml` from `GET /{id}/config` | JSON Schema 2020-12 |
| `sidecar.openapi.yaml` | caller -> sidecar: `/api/ee/workspace-instance` | OpenAPI 3.1 |

## Status

Every operation and field that differs from master carries `x-status`:

| `x-status` | Meaning |
| --- | --- |
| `master` | On metabase/metabase master at `061dee78c2d`. |
| `hardening` | Changed by an open PR named in `x-pr`. True once it merges. |
| `proposed` | Needed by MB Code, not built. A sketch to argue about, not a commitment. |

`x-source` names the implementation. `EE/` is `enterprise/backend/src/metabase_enterprise/workspaces/`.

## Lifecycle

1. An admin enables workspaces on a database: driver supports `:workspace`, database-local setting `database-enable-workspaces` on, not a router database. Provisioning DDL uses the database's `:admin-details` overlay when configured.
2. `POST /api/ee/workspace-manager` `{name, database_ids}`. The parent records every schema with an active synced table as `input_schemas`, creates the scratch namespace and user, and grants read on the inputs. Blocks.
3. `GET /{id}/config` returns `config.yml` with the workspace login.
4. The sidecar boots from it (`MB_CONFIG_FILE_PATH`), or, already holding the databases, enters workspace mode with `POST /api/ee/workspace-instance/current`.
5. Transforms run on the sidecar write to the scratch namespace and record remap rows. Queries read remapped tables from scratch and everything else from production.
6. `DELETE /{id}` drops the warehouse objects and remap rows, then the workspace. Safe to retry.

## Rules a caller can rely on

- No manager response carries a credential. Only `GET /{id}/config` does.
- The warehouse enforces isolation: the workspace user has no write grant outside its scratch namespace. A sidecar bug cannot write production.
- `input_schemas` is fixed at create.
- Workspace names are not unique. For idempotent create, pick a unique name and find it with `GET /` after a lost response.
- master: a `200` from create can hide a failure. Treat any database not `provisioned` as failed and `DELETE` the workspace. With #86601 a failed create is never `200`; `cleanup_required: true` means the workspace was kept and must be deleted.
- `config.yml` supports `{{env VAR}}` in any value, so a caller can keep secrets out of the file and pass them as environment variables or JVM system properties.

## MB Code: what it needs

| Need | Covered by | Status |
| --- | --- | --- |
| A workspace per worktree | create, config, delete | master |
| Detect every failed create from the status code | #86601 | hardening |
| Delete a kept workspace without a name lookup | `workspace_id` in the create error | proposed |
| Read-only credentials for the main-branch instance, no remapping | Create a workspace, remove the `workspace:` section from its `config.yml` before boot. The instance is not in workspace mode, so nothing is remapped, and the warehouse refuses writes outside scratch. Requires #86588 on Postgres older than 15 (PUBLIC CREATE). | master; a strict `read_only` create option (no scratch) is not proposed yet |
| Read a schema created after the workspace | `POST /{id}/schemas` | proposed (ENG-14446) |
| Shadow or stop shadowing a table explicitly | `POST`/`DELETE /table-remappings` on the sidecar | proposed, design open |
| A database added to a live workspace | none; create a new workspace and restart the sidecar | not proposed |

## Engines

Master reports `:workspace` for Postgres, Redshift, MySQL, ClickHouse, SQL Server, Snowflake, BigQuery and H2. #86589 limits it to Postgres until each other engine is proven (ENG-14447 to ENG-14450).

## Verifying

The specs were written from the code, not generated. Until a test checks them:

- `parent.openapi.yaml` and `sidecar.openapi.yaml` should match what `bun run generate-openapi` produces for these routes. Master's checked-in `resources/openapi/openapi.json` has no workspace routes, although other `/api/ee` routes are there; why is not yet known.
- `config.schema.json` should validate the output of `metabase-enterprise.workspaces.config/build-workspace-config` in a test.
