(ns metabase-enterprise.workspaces.models.workspace-access-key-log
  "Audit row written every time a workspace access key is used from a public
   endpoint. Both `workspace_id` and `workspace_access_key_id` are nullable FKs
   with `ON DELETE SET NULL` so the audit trail survives deletion of either
   parent."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceAccessKeyLog [_model]
  :workspace_access_key_log)

(doto :model/WorkspaceAccessKeyLog
  (derive :metabase/model))

(defn log-access-key-usage!
  "Insert a row recording that `access-key` was used for `context`. `context` is
  a short tag identifying the call site (e.g. `\"config\"`)."
  [access-key context]
  (t2/insert! :model/WorkspaceAccessKeyLog
              {:workspace_id            (:workspace_id access-key)
               :workspace_access_key_id (:id access-key)
               :context                 context}))
