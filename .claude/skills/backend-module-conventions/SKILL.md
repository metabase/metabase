---
name: backend-module-conventions
description: Where Metabase backend code goes and how it reaches the app DB. Covers module layout, the `<module>.db` rule, `[:auto/param]` value binding, module config, and pre-handoff checks. Use when adding or moving backend namespaces, writing app-DB queries, or touching module boundaries. Preloaded by every `*-backend-expert` agent.
---

# Backend module conventions

This skill decides where a line of backend code lives and how it reaches the app DB. Project `AGENTS.md`
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
| `<module>.models.*` | Toucan 2 model definitions: `methodical/defmethod t2/table-name`, hooks, transforms, and the `Writes` section with the model's write functions (see `backend-model-rules`). |
| `<module>.settings` | `defsetting`s. |
| `<module>.init` | Requires the namespaces that register things as a side effect: settings, tasks, event handlers, and every model file that implements a multimethod or defines hooks. `metabase.core.init` or `metabase-enterprise.core.init` requires it. |
| `<module>.api`, or the nested `<module>.rest` module (`:ns-prefix "metabase.<module>-rest"`, dir `<module>_rest/`) | HTTP endpoints. Domain logic stays in the base module. The `.rest` child calls the parent's `.core`. |
| `enterprise/<module>` | The EE companion of an OSS module. It nests under the OSS module, which exports it automatically. |

If a setting, task, event handler, hook or multimethod implementation never takes effect, look for a missing link in
the `.init` chain. A namespace that implements a multimethod of another namespace (`defmethod`, a Toucan hook, a
`<feature>/spec`) takes effect only once it is loaded, so its module's `init.clj` requires it; do not rely on some
other namespace happening to load it first. A test that depends on such an implementation requires that namespace.

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
- A `db` function that inserts, updates or deletes a model is called only from that model's write functions, and it writes only models of its own module. To write another module's model, call that model's write function from its model namespace, which `fix-modules-config` then records in the owner's `:api`; a kondo rule reports a Toucan write on a model of another module. Write statements use `t2/insert-returning-instances!` and its counterparts, so the write function has the rows it publishes.
- A statement count must not grow with the number of rows: a `db` function takes the ids or rows of a whole batch.

### Bind values with `[:auto/param v]`

Funny SQL (`metabase.funnysql.core`) binds a value written as `[:auto/param v]` as a SQL parameter. The
`:metabase/unsafe-app-db-query` lint is off globally. `.clj-kondo/config.edn` turns it on per namespace
under `:config-in-ns`, one converted `db.clj` at a time. Follow these rules in every `db.clj`, whether or
not the lint covers it yet:

1. Mark a value that comes from a variable when it sits in a **value slot**. Value slots are the right-hand side of `:=`, `:in`, `:like`, ..., and kv-arg values used as filters.
2. Never mark a literal. A literal cannot carry a request value.
3. Never mark a value in an **identifier slot** (`:select`, `:from`, joins, aliases, and similar). There it throws at compile time or fails at the database. In `:order-by` and `:group-by` a marker compiles to `ORDER BY ?`, which is useless but does not throw. Don't write one there either.
4. A marked empty collection in `:in` compiles to `FALSE`, like an unmarked one.
5. Leave values that `t2/update!` *writes* unmarked. Model hooks such as encryption must still see them.
6. Keep kv-arg style (`:engine engine`) for a column with a Toucan type transform. If you move a keyword value into a raw `{:where ...}` map, the transform is skipped. HoneySQL then formats the keyword as an identifier, and the query returns wrong rows without failing.

## Add app-DB migrations

Follow the `app-db-migrations` skill (`.claude/skills/app-db-migrations/SKILL.md`): changesets are version-less, live
in year directories like `resources/migrations/2026/` (`./bin/mage new-migration <name>`), and are backported by
cherry-picking the same file to each release branch. `./bin/lint-migrations-file.sh` enforces the rules. The versioned
layout (`0NN/` directories, `vNN.` ids) only holds changesets that already shipped.

Custom migrations (`metabase.app-db.custom-migrations*`) are exempt from the `<module>.db` rule (the
`app-db-namespaces` group in `.clj-kondo/config.edn`), since they use table names frozen at the version they shipped
in. The rest of the `app-db` module follows it and runs its queries in `metabase.app-db.db`.

## Cross module boundaries through `:api`

- `.clj-kondo/config/modules/config.edn` declares `:api`, `:uses`, `:model-exports`, and `:model-imports` per module. Run `./bin/mage fix-modules-config` after you add or remove a namespace, a cross-module require, or a cross-module `:model/X` reference. If nothing drifted, it does nothing.
- `./bin/mage modules-tree` prints the hierarchy. The `dev.deps-graph` and `dev.module-score` namespaces show who uses a module externally.
- If a module needs something outside another module's `:api`, choose the first fix that works:
  1. Call something that is already public.
  2. Add the var to that module's `.core` (a model's write functions are called from its model namespace instead, which becomes part of `:api`).
  3. Invert the dependency: a multimethod in the namespace that needs the answer, implemented by the other side in its own namespace, or an event (`metabase.events`). Never `requiring-resolve`.

  Don't add a `:clj-kondo/ignore`.
- If you change a suppression or a module escape hatch, run `./bin/mage kondo-ratchets`.

## Verify before handing work back

1. Load each changed namespace in the REPL (`clojure-eval` skill). If no REPL is available, run `./bin/test-agent :only '[the.ns-test]'`.
2. Run the narrowest tests that cover the change. Use `./bin/test-agent :module <module>` to check blast radius.
3. Run `./bin/mage kondo-updated` on the changed files.
4. If a boundary moved, run `./bin/mage fix-modules-config`.

Report which of these steps ran, and what each one showed.
