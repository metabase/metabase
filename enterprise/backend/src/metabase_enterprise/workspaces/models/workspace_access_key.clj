(ns metabase-enterprise.workspaces.models.workspace-access-key
  "Per-workspace access key used for unauthenticated 
   `/api/ee/workspace-public/:key` endpoints. The plaintext `key` is generated
   at creation time and returned to the caller exactly once; thereafter only an
   encrypted form is stored at rest."
  (:require
   [metabase.util.encryption :as encryption]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceAccessKey [_model] :workspace_access_key)

(doto :model/WorkspaceAccessKey
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/WorkspaceAccessKey
  {:key {:in  encryption/maybe-encrypt
         :out encryption/maybe-decrypt}})
