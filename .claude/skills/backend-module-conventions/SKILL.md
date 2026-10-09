---
name: backend-module-conventions
description: Where Metabase backend code goes and how it reaches the app DB. Covers module layout, the `<module>.db` rule, `[:auto/param]` value binding, module config, and pre-handoff checks. Use when adding or moving backend namespaces, writing app-DB queries, or touching module boundaries. Preloaded by every `*-backend-expert` agent.
---

# Backend module conventions

This skill decides where a line of backend code lives and how it reaches the app DB. Project `CLAUDE.md`
covers the module config keys, nested modules, test commands, and ratchets. When the two disagree, the
source tree wins. Read the linter or test that enforces a rule before you trust any prose about it,
including this file.

## Split a module into standard namespaces

A module is `metabase.<module>` (OSS, `src/`) or `metabase-enterprise.<module>` (EE,
`enterprise/backend/src/`). Most modules split into these namespaces:

| Namespace | Holds |
|---|---|
| `<module>.core` | The public API. Other modules call only this (plus anything else listed in the module's `:api`). Often a `potemkin/import-vars` facade. |
| `<module>.db` | Every app-DB query the module makes. See the next section. |
| `<module>.models.*` | Toucan 2 model definitions: `methodical/defmethod t2/table-name`, hooks, transforms. |
| `<module>.settings` | `defsetting`s. |
| `<module>.init` | Requires the namespaces that register things as a side effect (settings, tasks, event handlers). `metabase.core.init` or `metabase-enterprise.core.init` requires it. |
| `<module>.api`, or the nested `<module>.rest` module (`:ns-prefix "metabase.<module>-rest"`, dir `<module>_rest/`) | HTTP endpoints. Domain logic stays in the base module. The `.rest` child calls the parent's `.core`. |
| `enterprise/<module>` | The EE companion of an OSS module. It nests under the OSS module, which exports it automatically. |

If a setting, task, or event handler never takes effect, look for a missing link in the `.init` chain.

## Keep app-DB access in `<module>.db`

Call Toucan 2 query functions (`t2/select*`, `t2/insert!`, `t2/update!`, `t2/delete!`, `t2/count`,
`t2/exists?`, `t2/query`, ...) and the `metabase.app-db.core` wrappers (`mdb/query`,
`mdb/update-or-insert!`, ...) only from `metabase[-enterprise].<module>.db`. Driver code uses
`metabase.driver.<driver>.db`. Every other namespace calls functions from its own module's `db`.
The kondo hook `hooks.metabase.toucan.db-ns` reports violations as `:metabase/t2-query-namespace`.
Test files are exempt.

Write `db` functions in the style of `src/metabase/settings/db.clj`:

- Make each function a thin `mu/defn` that wraps one query and adds no logic. Give it a docstring that says what it returns.
- Name functions after the domain question (`setting-value`, `delete-setting!`), not after SQL.
- Keep branching, permission checks, and data shaping in the caller. A `db` function that grows an `if` belongs somewhere else.
- Get cross-module data through the other module's `.core`, not its `db`. A few modules list their `db` in `:api` as legacy exceptions. Don't add more.

### Bind values with `[:auto/param v]`

`metabase.app-db.value-guard` binds a value written as `[:auto/param v]` as a SQL parameter. The
`:metabase/unsafe-app-db-query` lint is off globally. `.clj-kondo/config.edn` turns it on per namespace
under `:config-in-ns`, one converted `db.clj` at a time. Follow these rules in every `db.clj`, whether or
not the lint covers it yet:

1. Mark a value that comes from a variable when it sits in a **value slot**. Value slots are the right-hand side of `:=`, `:in`, `:like`, ..., and kv-arg values used as filters.
2. Never mark a literal. A literal cannot carry a request value.
3. Never mark a value in an **identifier slot** (`:select`, `:from`, joins, aliases, and similar). `value-guard` throws `::marker-outside-value-slot` at compile time. In `:order-by` and `:group-by` a marker compiles to `ORDER BY ?`, which is useless but does not throw. Don't write one there either.
4. Leave a possibly-empty collection unmarked. Toucan rewrites `[:in col []]` to `false` before the marker step.
5. Leave values that `t2/update!` *writes* unmarked. Model hooks such as encryption must still see them.
6. Keep kv-arg style (`:engine engine`) for a column with a Toucan type transform. If you move a keyword value into a raw `{:where ...}` map, the transform is skipped. HoneySQL then formats the keyword as an identifier, and the query returns wrong rows without failing.

The docstring of `metabase.app-db.value-guard` explains what the guard refuses without any marker.

## Add app-DB migrations as one file per change

`./bin/lint-migrations-file.sh` enforces these rules. Run it after every change.

- Create the file with `./bin/mage new-migration <NN> <snake_name>` (e.g. `./bin/mage new-migration 65 add_user_table`). It writes `resources/migrations/<NNN>/<yyyyMMdd>_<snake_name>.yaml` with a changeset stub; fill in the TODOs.
- Starting with v60, each change is its own file. `NNN` is the earliest release the change ships in. New work goes in the newest directory. Don't add to `001_update_migrations.yaml`; its footer describes the legacy format.
- Changeset IDs are `v<NN>.<suffix>`, where `NN` matches the directory and the suffix is a random 6-char lowercase alphanumeric string (e.g. `v65.m2xncr`). `new-migration` generates one for the first changeset; for extra changesets in the same file, make up a new suffix and grep `resources/migrations` to confirm it is unused. IDs are not ordered within a directory.
- Don't edit a shipped changeset. Add a new one. (Liquibase does recompute checksums and some edits are technically harmless, but the line between "cosmetic" and "ran instances now diverge from fresh installs" is easy to misjudge, so just add a new changeset.) Never delete a shipped changeset either: instances keep the row in `DATABASECHANGELOG` forever; removing the id makes Liquibase log "not rolled back" and any replacement that recreates the same object fails with a duplicate-object error. To retire one when you must, add a NEW changeset that does `DELETE FROM DATABASECHANGELOG WHERE id IN (...)` the retired ids. Put it in the same file as the retired changeset when it ships in the same release (`063/20260714_field_fk_target_field_id_fk.yaml::v63.2026-07-22T12:00:00`), or in the current release's file when it retires an older release's changeset (`059_update_migrations.yaml::v59.2026-01-09T11:30:00` retires `v58.2026-01-09T12:00:00`).
- To backport, copy the changesets into the older directory with `v<older>` IDs. Guard each copy with `preConditions: onFail: MARK_RAN` plus `not: changeSetExecuted` that points at the newer ID, so databases that already ran it skip it. `resources/migrations/064/20260911_glossary_entity_id.yaml` shows the pattern.
- Give every `indexExists`, `primaryKeyExists`, and `uniqueConstraintExists` precondition a `tableName`, and every `foreignKeyConstraintExists` a `foreignKeyTableName`. Without it, Liquibase snapshots the whole schema, which takes seconds per check.
- Prefer SQL changesets. A custom migration (`metabase.app-db.custom-migrations`, `define-migration` / `define-reversible-migration`) must use table names, never `:model/*` or other application code. Application code changes later, and then the migration breaks. Decrypt encrypted columns such as `metabase_database.details` and `setting.value` before reading them.
- The whole `metabase.app-db.*` module, custom migrations included, is exempt from the `<module>.db` rule (the `app-db-namespaces` group in `.clj-kondo/config.edn`).
- Test with the `test-migrations` macro (`metabase.app-db.schema-migrations-test.impl`) on H2 and Postgres. Add MySQL when the change touches DDL or JSON columns.

## Cross module boundaries through `:api`

- `.clj-kondo/config/modules/config.edn` declares `:api`, `:uses`, `:model-exports`, and `:model-imports` per module. Run `./bin/mage fix-modules-config` after you add or remove a namespace, a cross-module require, or a cross-module `:model/X` reference. If nothing drifted, it does nothing.
- `./bin/mage modules-tree` prints the hierarchy. The `dev.deps-graph` and `dev.module-score` namespaces show who uses a module externally.
- If a module needs something outside another module's `:api`, choose the first fix that works:
  1. Call something that is already public.
  2. Add the var to that module's `.core`.
  3. Invert the dependency with an event (`metabase.events`).

  Don't add a `:clj-kondo/ignore`.
- If you change a suppression or a module escape hatch, run `./bin/mage kondo-ratchets`.

## Verify before handing work back

1. Load each changed namespace in the REPL (`clojure-eval` skill). If no REPL is available, run `./bin/test-agent :only '[the.ns-test]'`.
2. Run the narrowest tests that cover the change. Use `./bin/test-agent :module <module>` to check blast radius.
3. Run `./bin/mage kondo-updated` on the changed files.
4. If a boundary moved, run `./bin/mage fix-modules-config`.

Report which of these steps ran, and what each one showed.
