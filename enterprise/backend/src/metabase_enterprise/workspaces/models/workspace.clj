(ns metabase-enterprise.workspaces.models.workspace
  "Model for workspaces. A workspace is a self-contained checkout of a git branch: its content lives
  in the same tables as the main app, tagged with a `workspace_id`, and is synced with the workspace's `branch`.

  Workspaces are superuser-only: read, write, and create all require admin."
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

;;; --------------------------------------------- Permission predicates ---------------------------------------------

(defmethod mi/can-read? :model/Workspace
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-write? :model/Workspace
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-create? :model/Workspace
  [_model _instance]
  api/*is-superuser?*)

;;; -------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Workspace :creator]
  [_model k workspaces]
  (mi/instances-with-hydrated-data
   workspaces k
   (fn []
     (when-let [ids (seq (distinct (keep :creator_id workspaces)))]
       (u/index-by :id
                   (t2/select [:model/User :id :first_name :last_name :email
                               :date_joined :last_login :is_superuser :is_qbnewb :is_active]
                              :id [:in ids]))))
   :creator_id))

(methodical/defmethod t2/batched-hydrate [:model/Workspace :users]
  [_model k workspaces]
  (mi/instances-with-hydrated-data
   workspaces k
   (fn []
     (when-let [ids (seq (map :id workspaces))]
       (group-by :workspace_id
                 (t2/select [:model/User :id :first_name :last_name :email
                             :date_joined :last_login :is_superuser :is_qbnewb :is_active :workspace_id]
                            :workspace_id [:in ids] :is_active true))))
   :id
   {:default []}))
