(ns metabase-enterprise.workspaces.models.workspace-instance
  "Parent-side registry of dev (child) Metabase instances. A row with `workspace_id`
   null is free; a non-null `workspace_id` means the instance is currently bound to
   that workspace.

   Distinct from the child-side `instance-workspace` setting (see
   `metabase-enterprise.workspaces.api.workspace-instance`)."
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util.encryption :as encryption]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceInstance [_model] :workspace_instance)

(doto :model/WorkspaceInstance
  (derive :metabase/model)
  (derive :hook/timestamped?))

(def ^:private transform-encrypted-string
  {:in  encryption/maybe-encrypt
   :out encryption/maybe-decrypt})

(t2/deftransforms :model/WorkspaceInstance
  {:api_key transform-encrypted-string})

;;; --------------------------------------- Permission predicates ---------------------------------------
;;;
;;; WorkspaceInstances are superuser-only, like the other workspace models.

(defmethod mi/can-read? :model/WorkspaceInstance
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-write? :model/WorkspaceInstance
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-create? :model/WorkspaceInstance
  [_model _instance]
  api/*is-superuser?*)
