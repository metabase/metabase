(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/define-before-delete :model/Workspace
  [{:keys [id] :as workspace}]
  (when (ws.db/workspace-has-active-databases? id)
    (throw (ex-info (tru "Cannot delete a workspace with databases that are not :unprovisioned; they must be torn down first")
                    {:status-code  409
                     :workspace_id id})))
  workspace)

;;; --------------------------------------- Permission predicates ---------------------------------------
;;;
;;; Workspaces are superuser-only: read, write, and create all require admin.

(methodical/defmethod t2/simple-hydrate [:model/Workspace :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean api/*is-superuser?*)))

(defmethod mi/can-create? :model/Workspace
  [_model _instance]
  api/*is-superuser?*)

(methodical/defmethod t2/simple-hydrate [:model/Workspace :can_write]
  [_model k instance]
  (assoc instance k (boolean api/*is-superuser?*)))

(methodical/defmethod t2/batched-hydrate [:model/Workspace :databases]
  [_model k workspaces]
  (mi/instances-with-hydrated-data
   workspaces k
   (fn []
     (when-let [ids (seq (map :id workspaces))]
       (group-by :workspace_id
                 (ws.db/workspace-databases-of-workspaces ids))))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/Workspace :creator]
  [_model k workspaces]
  (mi/instances-with-hydrated-data
   workspaces k
   (fn []
     (when-let [ids (seq (distinct (keep :creator_id workspaces)))]
       (u/index-by :id (ws.db/creators ids))))
   :creator_id))

(defn list-workspaces
  "Return every Workspace with its `:databases` (each with its `:database`) and
  `:creator` hydrated."
  []
  (t2/hydrate (ws.db/workspaces) :creator [:databases :database]))

(defn get-workspace
  "Return the Workspace with the given id and its `:databases` (each with its
  `:database`) + `:creator` hydrated, or nil if none exists."
  [id]
  (when-let [workspace (ws.db/workspace id)]
    (t2/hydrate workspace :creator [:databases :database])))

(defn get-workspace-by-name
  "Return the Workspace with the given name and its `:databases` + `:creator` hydrated,
  or nil if none exists. Workspace names are not unique at the schema level, so this
  returns the lowest-id match."
  [workspace-name]
  (when-let [workspace (ws.db/workspace-by-name workspace-name)]
    (t2/hydrate workspace :creator :databases)))

(defn- with-workspace-database-defaults
  "Fill `updated_at` with this instance's current time, the clock the busy window of a delete uses."
  [wsd workspace-id]
  (merge {:updated_at (mi/current-timestamp)}
         wsd
         {:workspace_id workspace-id}))

(defn create-workspace!
  "Create a Workspace and its nested WorkspaceDatabase rows in a single transaction.
  The param map must supply `:creator_id`; `:idempotency_key` is optional. Throws a
  duplicate-key error, inserting nothing, when the creator already has a Workspace
  with that `:idempotency_key`. Returns the created Workspace with `:databases` and
  `:creator` hydrated."
  [{:keys [name creator_id idempotency_key databases]}]
  (t2/with-transaction [_conn]
    (let [workspace-id (ws.db/insert-workspace! name creator_id idempotency_key)]
      (when (seq databases)
        (ws.db/insert-workspace-databases!
         (mapv #(with-workspace-database-defaults % workspace-id) databases)))
      (get-workspace workspace-id))))

(defn delete-workspace!
  "Delete a Workspace, whose before-delete hook refuses with a 409 while a WorkspaceDatabase is not `:unprovisioned`."
  [id]
  (ws.db/delete-workspace! id))

;;; ----------------------------------------------- Specs -----------------------------------------------

(defmethod app-db-copy/spec :model/Workspace [_model]
  {:skip? false})
