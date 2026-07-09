(ns metabase-enterprise.workspaces.models.workspace-instance
  "Manager-side registry row for a connected child Metabase instance. The parent
   stores the child's base `:url` plus encrypted `:details` holding the `:api-key`
   of an admin API key created on the child, and uses them to push a workspace's
   `config.yml` to the child. `:workspace_id` links the instance to the single
   workspace deployed on it (an instance hosts at most one workspace at a time).

   Not to be confused with `metabase-enterprise.workspaces.api.workspace-instance`,
   which is the API surface a child instance serves about its own workspace."
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/WorkspaceInstance [_model] :workspace_instance)

(doto :model/WorkspaceInstance
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/WorkspaceInstance
  {:details mi/transform-encrypted-json})

;;; --------------------------------------- Permission predicates ---------------------------------------
;;;
;;; WorkspaceInstances are superuser-only: read, write, and create all require admin.

(defmethod mi/can-read? :model/WorkspaceInstance
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-write? :model/WorkspaceInstance
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-create? :model/WorkspaceInstance
  [_model _instance]
  api/*is-superuser?*)

(methodical/defmethod t2/batched-hydrate [:model/Workspace :instance]
  [_model k workspaces]
  (mi/instances-with-hydrated-data
   workspaces k
   (fn []
     (when-let [ids (seq (map :id workspaces))]
       (t2/select-fn->fn :workspace_id identity :model/WorkspaceInstance :workspace_id [:in ids])))
   :id
   {:default nil}))
