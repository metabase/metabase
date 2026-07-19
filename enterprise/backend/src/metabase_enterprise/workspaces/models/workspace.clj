(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase-enterprise.workspaces.models.workspace-database :as workspace-database]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Workspace
  {:status         mi/transform-keyword
   :status_details mi/transform-encrypted-text})

;;; --------------------------------------- Permission predicates ---------------------------------------
;;;
;;; Workspaces are superuser-only: read, write, and create all require admin.

(defmethod mi/can-read? :model/Workspace
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-create? :model/Workspace
  [_model _instance]
  api/*is-superuser?*)

(defmethod mi/can-write? :model/Workspace
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(methodical/defmethod t2/batched-hydrate [:model/Workspace :databases]
  [_model k workspaces]
  (mi/instances-with-hydrated-data
   workspaces k
   (fn []
     (when-let [ids (seq (map :id workspaces))]
       (group-by :workspace_id
                 (t2/select :model/WorkspaceDatabase :workspace_id [:in ids]))))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/Workspace :creator]
  [_model k workspaces]
  (mi/instances-with-hydrated-data
   workspaces k
   (fn []
     (when-let [ids (seq (distinct (keep :creator_id workspaces)))]
       (u/index-by :id
                   (t2/select [:model/User :id :first_name :last_name :email :common_name]
                              :id [:in ids]))))
   :creator_id))

(defn- with-workspace-database-defaults
  "Fill server-managed columns that are NOT NULL in the DB with their defaults when callers omit them."
  [wsd workspace-id]
  (merge {:database_details {}
          :output_namespace ""}
         wsd
         {:workspace_id workspace-id}))

(defn- assert-database-eligible-for-workspaces [database]
  (when-not (workspace-database/database-eligible-for-workspaces? database)
    (throw (ex-info "Workspaces are not enabled for this database"
                    {:status-code 400 :database_id (:id database)}))))

(defn workspace-databases
  "Build the WorkspaceDatabase param maps for `database-ids` — each database must
   exist (404) and be eligible for workspaces (400) — with all of its known
   schemas as `input_schemas`. Fetches the databases and their schemas with one
   query each instead of per-id lookups."
  [database-ids]
  (let [dbs-by-id     (when (seq database-ids)
                        (t2/select-pk->fn identity :model/Database :id [:in database-ids]))
        schemas-by-id (workspace-database/database-input-schemas-by-id (keys dbs-by-id))]
    (mapv (fn [db-id]
            (let [database (or (get dbs-by-id db-id)
                               (throw (ex-info "Database not found"
                                               {:status-code 404 :database_id db-id})))]
              (assert-database-eligible-for-workspaces database)
              {:database_id   db-id
               :input_schemas (get schemas-by-id db-id [])}))
          database-ids)))

(defn create-workspace!
  "Create a Workspace and its nested WorkspaceDatabase rows in a single transaction.
  The param map must supply `:creator_id`. Returns the created Workspace row."
  [{:keys [name creator_id databases]}]
  (t2/with-transaction [_conn]
    (let [workspace (t2/insert-returning-instance! :model/Workspace
                                                   {:name       name
                                                    :creator_id creator_id})]
      (when (seq databases)
        (t2/insert! :model/WorkspaceDatabase
                    (map #(with-workspace-database-defaults % (:id workspace)) databases)))
      workspace)))
