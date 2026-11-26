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
