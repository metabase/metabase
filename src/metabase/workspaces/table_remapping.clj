(ns metabase.workspaces.table-remapping
  "The OSS namespace for workspace table remapping."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise workspace-remap-schema+name
  "The `{:db :schema :name}` of the workspace copy a TableRemapping records for the canonical `from-spec` on the
  Database with `db-id`, with nil for a level the driver does not emit, or nil; the OSS fallback is always nil."
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
