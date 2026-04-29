(ns metabase-enterprise.workspaces.api.workspace-instance
  "EE API endpoints for the workspace loaded on this (child) instance, served under
   `/api/ee/workspace-instance`. Read-only — see [[metabase-enterprise.workspaces.api.workspace-manager]]
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
   [:name          ms/NonBlankString]
   [:input_schemas [:sequential ms/NonBlankString]]
   [:output_schema :string]])

(def ^:private WorkspaceInstance
  [:map
   [:name             ms/NonBlankString]
   [:databases        [:map-of ms/PositiveInt WorkspaceInstanceDatabase]]
   [:remappings_count ms/IntGreaterThanOrEqualToZero]])

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/remappings"
  "Return all table remappings."
  []
  (api/check-superuser)
  (ws/list-remappings))

(api.macros/defendpoint :get "/current" :- [:maybe WorkspaceInstance]
  "Read-only summary of the workspace loaded on this (child) instance."
  []
  (api/check-superuser)
  (when-let [workspace (->> (ws/list-workspaces)
                            (sort-by :created_at)
                            reverse
                            (some (fn [w] (when (seq (:databases w)) w))))]
    (let [db-ids    (mapv :database_id (:databases workspace))
          dbs-by-id (when (seq db-ids)
                      (into {} (map (juxt :id identity))
                            (t2/select [:model/Database :id :name] :id [:in db-ids])))]
      {:name             (:name workspace)
       :remappings_count (count (ws/list-remappings))
       :databases        (into {}
                               (map (fn [wsd]
                                      [(:database_id wsd)
                                       {:name          (get-in dbs-by-id [(:database_id wsd) :name] "")
                                        :input_schemas (vec (:input_schemas wsd))
                                        :output_schema (or (:output_schema wsd) "")}]))
                               (:databases workspace))})))
