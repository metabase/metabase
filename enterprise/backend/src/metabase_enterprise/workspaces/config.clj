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

(defn- db-position-value
  "Connection-side value for the `:db` AST slot of `database`, or nil for engines
   whose [[metabase.driver/qualified-name-components]] does not include `:db`
   (Postgres, MySQL, ClickHouse, Redshift, H2). Mirrors the per-engine logic in
   [[metabase-enterprise.workspaces.table-remapping/db-position-value]] until the
   planned driver multimethod subsumes both."
  [database]
  (case (:engine database)
    (:snowflake :sqlserver) (:db (:details database))
    :bigquery-cloud-sdk     (:project-id (:details database))
    nil))

(defn- table-namespace
  "Build a wire `::table-namespace` map (`{:db ?, :schema ?}`) for `database`
   with `:schema` slot `schema-name`. A slot is present iff its value is a
   non-blank string; storage `\"\"` becomes a missing key, since the wire format
   reserves `\"\"` for storage rows only."
  [database schema-name]
  (let [db-slot (db-position-value database)]
    (cond-> {}
      (not (str/blank? schema-name)) (assoc :schema schema-name)
      (not (str/blank? db-slot))     (assoc :db db-slot))))

(defn- workspace-database-entry [wsd db]
  [(:name db) {:input  (mapv #(table-namespace db %) (:input_schemas wsd))
               :output (table-namespace db (:output_schema wsd))}])

(defn build-workspace-config
  "Return a downloadable config.yml-shaped map for `workspace-id`:

    {:version 1
     :config  {:databases [...]
               :workspace {:name      <ws-name>
                           :databases {<db-name> {:input  [{:db ?, :schema ?} ...]
                                                  :output {:db ?, :schema ?}}}}}}

  Each database entry merges the underlying `metabase_database.details` with the
  WorkspaceDatabase's override credentials and adds `schema-filters-*` keys
  derived from `:input_schemas`. Per-database workspace entries carry
  driver-agnostic `::table-namespace` maps (the AST level above `:table`); the
  `:db` slot is populated only for 3-part engines (Snowflake, SQL Server,
  BigQuery), the `:schema` slot is always populated when the storage row has it.
  Returns nil when the workspace does not exist. Throws a 409 `ex-info` if any
  of the workspace's databases is not `:provisioned`."
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
        {:version 1
         :config  {:databases (mapv (fn [[wsd db]] (database-entry wsd db)) pairs)
                   :workspace {:name      (:name ws)
                               :databases (into {} (map (fn [[wsd db]] (workspace-database-entry wsd db))) pairs)}}}))))

(defn config->yaml
  "Render a workspace config map as a pretty-printed YAML string."
  [config]
  (yaml/generate-string config :dumper-options {:flow-style :block}))
