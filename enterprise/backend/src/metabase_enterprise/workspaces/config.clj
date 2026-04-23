(ns metabase-enterprise.workspaces.config
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(defn- database-entry [wsd db]
  {:name    (:name db)
   :engine  (:engine db)
   :details (merge (:details db)
                   (:database_details wsd)
                   {:schema-filters-type     "inclusion"
                    :schema-filters-patterns (str/join "," (:input_schemas wsd))})})

(defn- workspace-database-entry [wsd db]
  [(:name db) {:input_schemas (vec (:input_schemas wsd))
               :output_schema (:output_schema wsd)}])

(defn build-workspace-config
  "Return a downloadable config map for `workspace-id`, merging each
  WorkspaceDatabase's override credentials on top of the underlying
  `metabase_database.details` and appending `schema-filters-*` keys derived
  from `:input_schemas`. Returns nil when the workspace does not exist.
  Throws a 409 `ex-info` if any of the workspace's databases is not
  `:provisioned` — the config can only be built once every row has live
  credentials."
  [workspace-id]
  (when-let [ws (workspace/get-workspace workspace-id)]
    (let [wsds (:databases ws)]
      (when (some #(not= :provisioned (:status %)) wsds)
        (throw (ex-info "Cannot build config while workspace has databases that are not :provisioned"
                        {:status-code  409
                         :workspace_id workspace-id})))
      (let [dbs-by-id (if-let [ids (seq (map :database_id wsds))]
                        (into {} (map (juxt :id identity))
                              (t2/select :model/Database :id [:in ids]))
                        {})
            pairs     (for [wsd wsds
                            :let [db (get dbs-by-id (:database_id wsd))]]
                        [wsd db])]
        {:databases (mapv (fn [[wsd db]] (database-entry wsd db)) pairs)
         :workspace {:name      (:name ws)
                     :databases (into {} (map (fn [[wsd db]] (workspace-database-entry wsd db))) pairs)}}))))

(defn config->yaml
  "Render a workspace config map as a pretty-printed YAML string."
  [config]
  (yaml/generate-string config :dumper-options {:flow-style :block}))
