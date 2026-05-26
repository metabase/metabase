(ns metabase.workspaces.table-remapping
  "The OSS namespace for workspace table remapping."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise workspace-remap-schema+name
  "In workspace mode, a Table at the canonical identity `from-spec` may be backed
  by a physically-different warehouse table recorded in `table_remapping`. Returns
  a `{:db :schema :name}` map for the workspace destination when a remapping
  exists so sync asks the driver about the isolated warehouse location; returns
  nil otherwise (OSS fallback) so the driver is queried at the logical identity.

  Both input and output are the same `{:db :schema :name}` shape — symmetric so
  call sites don't have to translate between vector tuples and maps. Slot values
  are normalized to the form `:model/Table` rows actually carry: a string for
  engines that emit that AST position; `nil` for engines that don't. For MySQL,
  both `:db` and `:schema` are `nil` on a Table row (the connection's bound DB
  serves as the implicit catalog; MySQL has no schemas)."
  metabase-enterprise.workspaces.table-remapping
  [_db-id _from-spec]
  nil)

(defenterprise filter-workspace-side-tables
  "Drop tuples from a `describe-database` result whose `(schema, name)` matches
  the to-side of any active TableRemapping for `db-id`. The workspace's physical
  isolation tables are surfaced by the warehouse driver but must not become
  `:model/Table` rows in app-db -- they back canonical Tables via remap, not
  their own identity. OSS fallback is identity (no filtering). See DEV-1898."
  metabase-enterprise.workspaces.table-remapping
  [tuples _db-id]
  tuples)

(defenterprise expand-schema-names-with-workspace
  "Augment a list of `:schema-names` with workspace-isolation schemas
  (`to_schema` values) for any remap whose `from_schema` appears in the input.
  Lets sync's FK fetch reach the warehouse tables that physically back canonical
  Tables on a workspace child. OSS fallback is identity."
  metabase-enterprise.workspaces.table-remapping
  [schema-names _db-id]
  schema-names)

(defenterprise inject-workspace-canonical-tuples
  "Augment a `describe-database` result with synthetic canonical-side tuples for
  any `from_*` remap row whose to-side is materialized in the warehouse. The
  canonical name doesn't physically exist on a workspace child (only the
  isolation-schema copy does), so without this it'd be diffed against app-db's
  Table rows and silently retired. OSS fallback is identity."
  metabase-enterprise.workspaces.table-remapping
  [tuples _db-id]
  tuples)

(defenterprise rewrite-fk-result-canonical
  "Translate workspace-side identifiers in a `describe-fks` result back to canonical
  names. When sync redirects FK lookups to the workspace warehouse table, the
  returned rows reference workspace-side `(schema, name)` on both sides; app-db's
  view needs them in canonical terms so subsequent FK resolution finds the
  matching `:model/Table`. OSS fallback is identity (no rewriting)."
  metabase-enterprise.workspaces.table-remapping
  [rows _db-id]
  rows)

(defenterprise call-with-display-context
  "Invoke `thunk` with workspace remapping suppressed. Used by display-only paths
  (the QB's `POST /api/dataset/native` SQL preview, anywhere we surface compiled
  SQL to the user) so users see canonical-schema SQL instead of the workspace
  isolation schema. The query still executes against the isolation schema at
  warehouse time -- this only affects what the user *sees* in the SQL preview.

  OSS fallback: just calls the thunk. EE impl binds
  `ws.remapping/*skip-remapping?*` true around it, which short-circuits both
  Phase 1 (metadata override) and Phase 2 (SQLGlot rewrite).

  Use [[with-display-context]] for the macro form."
  metabase-enterprise.workspaces.table-remapping
  [thunk]
  (thunk))

(defmacro with-display-context
  "Suppress workspace remapping inside `body` so compiled SQL surfaces in canonical
  vocabulary instead of isolation-schema vocabulary. Wrapper around
  [[call-with-display-context]]."
  [& body]
  `(call-with-display-context (fn [] ~@body)))

(defenterprise call-with-fk-probe-iso-dbs
  "Invoke `f` once per iso-`:db` slot the FK probe needs to visit on a workspaced
  database. `f` is called with no arguments inside a `with-swapped-connection-details`
  scope (or no swap if iso-`:db` equals the canonical bound `:db`). Callers collect
  results across invocations and merge.

  On MySQL workspaces with a cross-DB swap, the iso table lives in a different
  bound database than the canonical one; describe-fks must run with the JDBC
  connection pointed at the iso DB to discover its FKs.

  OSS fallback: just calls `f` once with no swap -- the warehouse FK probe runs
  against the canonical connection only."
  metabase-enterprise.workspaces.table-remapping
  [_db-id f]
  [(f)])

(defenterprise canonical-schema+name
  "Inverse of `workspace-remap-schema+name`. Given an isolation-side
  `to-spec` (`{:db :schema :name}` for the workspace destination), return a
  `{:db :schema :name}` map for the canonical table if a `TableRemapping` row
  records that pair as the workspace destination of a canonical table; return
  nil otherwise.

  Use at write-side `:model/Table` lookups where the transform pipeline has
  already mutated `:target.schema` to the workspace output schema, but the
  app-db Table row lives at the canonical schema. OSS fallback is nil so
  callers fall through to the unchanged identity.

  Both input and output are the same `{:db :schema :name}` shape — symmetric
  with `workspace-remap-schema+name` and matches `:model/Table` row vocabulary.
  Slot values are driver-normalized: a string for engines that emit that AST
  position; `nil` for engines that don't. For MySQL, both `:db` and `:schema`
  are `nil` because that's what `:model/Table` rows on MySQL store, and a
  Table-row predicate on `:schema \"\"` will not match a row stored as
  `:schema nil`.

  Caveats (tracked separately):
  - Trusts the active `TableRemapping` row set. If a `WorkspaceDatabase`
    deprovision leaves stale rows behind, this hook will still translate
    against them. See the deprovision-clears-remappings cleanup in
    `workspaces-v2.md` worklog.
  - The H7 second half (cross-DB workspaces on BigQuery) needs
    callers to thread `:db` through the spec end-to-end. Both this hook and
    `add-transform-target-mapping!` now carry the slot."
  metabase-enterprise.workspaces.table-remapping
  [_db-id _to-spec]
  nil)
