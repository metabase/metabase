(ns metabase-enterprise.workspaces.models.workspace-instance
  "Parent-side registry of pre-booted dev (child) Metabase instances in the provisioning
   pool. A row with `workspace_id` null is free; a non-null `workspace_id` means the
   instance is currently bound to that workspace. `workspace_id` is set only by the
   automatic deployment on workspace creation, never by CRUD.

   Distinct from the child-side `instance-workspace` setting (see
   `metabase-enterprise.workspaces.api.workspace-instance`)."
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util.encryption :as encryption]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceInstance [_model] :workspace_instance)

(doto :model/WorkspaceInstance
  (derive :metabase/model)
  (derive :hook/timestamped?))

;; `api_key` is a bare string, so we encrypt it directly rather than via
;; `transform-encrypted-json` (which JSON-serializes its input and only round-trips
;; collections — `json-in` passes strings through unquoted, so the JSON `:out` then
;; fails to parse the decrypted scalar). A no-op when `MB_ENCRYPTION_SECRET_KEY` is unset.
(def ^:private transform-encrypted-string
  {:in  encryption/maybe-encrypt
   :out encryption/maybe-decrypt})

(t2/deftransforms :model/WorkspaceInstance
  {:api_key transform-encrypted-string})

;;; --------------------------------------- Permission predicates ---------------------------------------
;;;
;;; Mirrors `:model/Workspace`:
;;; - read:          Data Analyst.
;;; - write/create:  Data Analyst + `:perms/workspaces :yes` on any database.

(defn- can-manage-instances? []
  (and (api/is-data-analyst?)
       (perms/has-any-workspaces-permission? api/*current-user-id*)))

(defmethod mi/can-read? :model/WorkspaceInstance
  ([_instance] (api/is-data-analyst?))
  ([_model _pk] (api/is-data-analyst?)))

(defmethod mi/can-write? :model/WorkspaceInstance
  ([_instance] (can-manage-instances?))
  ([_model _pk] (can-manage-instances?)))

(defmethod mi/can-create? :model/WorkspaceInstance
  [_model _m]
  (can-manage-instances?))
