(ns metabase-enterprise.workspaces.models.workspace-access-key-log
  "Audit row written every time a workspace access key is used from a public
   endpoint. Both `workspace_id` and `workspace_access_key_id` are nullable FKs
   with `ON DELETE SET NULL` so the audit trail survives deletion of either
   parent.

   `:workspace` and `:workspace_access_key` are auto-hydratable via the
   per-foreign-key automagic hydration in toucan2 — callers ask for them via
   `(t2/hydrate logs :workspace :workspace_access_key)`."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceAccessKeyLog [_model]
  :workspace_access_key_log)

(doto :model/WorkspaceAccessKeyLog
  (derive :metabase/model))

(t2/deftransforms :model/WorkspaceAccessKeyLog
  ;; `:context` is a keyword identifying the call site (e.g. `:config`). Stored
  ;; as a string in the DB; round-tripped to a keyword for in-process code.
  {:context mi/transform-keyword})

(methodical/defmethod t2/model-for-automagic-hydration
  [:model/WorkspaceAccessKeyLog :workspace]
  [_model _k]
  :model/Workspace)

(methodical/defmethod t2/model-for-automagic-hydration
  [:model/WorkspaceAccessKeyLog :workspace_access_key]
  [_model _k]
  :model/WorkspaceAccessKey)

(defn log-access-key-usage!
  "Insert a row recording that `access-key` was used for `context`. `context` is
  a keyword tag identifying the call site (e.g. `:config`)."
  [access-key context]
  (t2/insert! :model/WorkspaceAccessKeyLog
              {:workspace_id            (:workspace_id access-key)
               :workspace_access_key_id (:id access-key)
               :context                 context}))
