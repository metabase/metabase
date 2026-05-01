(ns metabase-enterprise.workspaces.models.workspace-access-key
  "Per-workspace access key used for unauthenticated
   `/api/ee/workspace-public/:key` endpoints. The plaintext `key` is generated
   at creation time and returned to the caller exactly once; thereafter only an
   encrypted form is stored at rest."
  (:require
   [metabase-enterprise.workspaces.models.workspace-access-key-log]
   [metabase.util.encryption :as encryption]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-access-key-log/keep-me)

(methodical/defmethod t2/table-name :model/WorkspaceAccessKey [_model] :workspace_access_key)

(doto :model/WorkspaceAccessKey
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/WorkspaceAccessKey
  {:key {:in  encryption/maybe-encrypt
         :out encryption/maybe-decrypt}})

(defn get-access-key
  "Look up an access-key row by its plaintext UUID. Returns the row (with `:key`
   decrypted by the toucan transform) or nil. Because the stored `key` column is
   encrypted with a non-deterministic cipher, we can't query by ciphertext —
   we fetch every row and let toucan decrypt them in-process, then match against
   `plaintext`. O(n) over the whole `workspace_access_key` table; if traffic
   grows, consider adding a deterministic `key_hash` column."
  [plaintext]
  (->> (t2/select :model/WorkspaceAccessKey)
       (filter #(= plaintext (:key %)))
       first))

(defn log-access-key-usage!
  "Insert a `workspace_access_key_log` row recording that `access-key` was used
   for `context`. `context` is a short tag identifying the call site (e.g.
   `\"config\"`)."
  [access-key context]
  (t2/insert! :model/WorkspaceAccessKeyLog
              {:workspace_id            (:workspace_id access-key)
               :workspace_access_key_id (:id access-key)
               :context                 context}))

