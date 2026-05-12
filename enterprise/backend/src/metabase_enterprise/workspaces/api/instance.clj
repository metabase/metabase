(ns metabase-enterprise.workspaces.api.instance
  "EE API endpoints for the workspace loaded on this (child) instance, served under
   `/api/ee/workspace-instance`. Read-only — see [[metabase-enterprise.workspaces.api.manager]]
   for admin operations."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private WorkspaceInstanceDatabase
  [:map
   [:id            ms/PositiveInt]
   [:name          :string]
   [:input_schemas [:sequential :string]]
   [:output_schema :string]])

(def ^:private WorkspaceInstance
  [:map
   [:name      ms/NonBlankString]
   [:databases [:sequential WorkspaceInstanceDatabase]]])

(def ^:private TableRemapping
  [:map
   [:id              ms/PositiveInt]
   [:database_id     ms/PositiveInt]
   [:from_db         :string]
   [:from_schema     :string]
   [:from_table_name ms/NonBlankString]
   [:to_db           :string]
   [:to_schema       :string]
   [:to_table_name   ms/NonBlankString]
   [:created_at      :any]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-remapping [row]
  (select-keys row [:id :database_id
                    :from_db :from_schema :from_table_name
                    :to_db :to_schema :to_table_name
                    :created_at]))

(defn- present-workspace-instance-database [db-id wsd dbs-by-id]
  {:id            db-id
   :name          (get-in dbs-by-id [db-id :name] "")
   :input_schemas (vec (keep :schema (:input wsd)))
   :output_schema (or (:schema (:output wsd)) "")})

(defn- present-workspace-instance [workspace]
  (let [db-ids    (sort (keys (:databases workspace)))
        dbs-by-id (when (seq db-ids)
                    (into {} (map (juxt :id identity))
                          (t2/select [:model/Database :id :name] :id [:in db-ids])))]
    {:name      (:name workspace)
     :databases (mapv (fn [db-id]
                        (present-workspace-instance-database
                         db-id
                         (get-in workspace [:databases db-id])
                         dbs-by-id))
                      db-ids)}))

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/current" :- [:maybe WorkspaceInstance]
  "Read-only summary of the workspace loaded on this instance.

  Reads from the in-process atom populated at boot by the `:workspace` section of
  `config.yml`. Returns `nil` when no workspace was loaded — i.e. this is a manager-only
  instance, or no `config.yml` was present at boot."
  []
  (api/check-superuser)
  (when-let [workspace (ws/instance-workspace)]
    (present-workspace-instance workspace)))

(api.macros/defendpoint :get "/table-remappings" :- [:sequential TableRemapping]
  "Return all table remappings, ordered by id."
  []
  (api/check-superuser)
  (mapv present-remapping (ws/list-remappings)))
