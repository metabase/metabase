(ns metabase-enterprise.workspaces.config
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(defn- schema-filter-entries
  "Build sync-filter keys for the workspace's input scope. Per-engine:

   - schema-having JDBC drivers (Postgres, Redshift, SQL Server)
     emit `:schema-filters-*` — `metabase.driver.sync` reads these to scope
     describe-database to the named schemas.
   - ClickHouse emits `:db-filters-*` — CH calls its top-level namespaces
     'databases' (= schemas in MB's vocabulary) and its describe-database
     impl reads `:db-filters-*`, not `:schema-filters-*`. The canonical
     CH details already carry `:db-filters-patterns <bound-db>`, which would
     otherwise leak through and restrict sync to the canonical DB the
     workspace user has no GRANTs on.
   - BigQuery emits `:dataset-filters-*` — its `list-datasets` reads these
     instead (BQ doesn't go through `metabase.driver.sync`).
   - No-schema engines (MySQL) emit `{}` — JDBC reports `TABLE_SCHEM` as null
     and `schema-patterns->filter-fn*` documents inclusion patterns NEVER
     match a `nil` schema. Scoping on those is enforced by the connection's
     bound database (`:details.db`)."
  [{:keys [engine] :as db} wsd]
  (let [patterns (str/join "," (:input_schemas wsd))]
    (cond
      (= engine :bigquery-cloud-sdk)
      {:dataset-filters-type     "inclusion"
       :dataset-filters-patterns patterns}

      (= engine :clickhouse)
      {:db-filters-type     "inclusion"
       :db-filters-patterns patterns}

      (driver.u/supports? engine :schemas db)
      {:schema-filters-type     "inclusion"
       :schema-filters-patterns patterns}

      :else
      {})))

(defn- database-entry [wsd db]
  {:name    (:name db)
   :engine  (:engine db)
   :details (merge (:details db)
                   (:database_details wsd)
                   (schema-filter-entries db wsd))})

(defn- expand-output
  "Expand a driver-opaque `output_namespace` string into the `{:db ?, :schema ?}`
   namespace map QP middleware, transform_hooks, and table_remapping consume.

   For 3-slot drivers (SQL Server, BigQuery) the `:db` slot is filled from
   `Database.details`. For 2-slot drivers the namespace string lands in the
   schema slot. For no-schema drivers (MySQL) it lands in the db slot.

   `output_namespace` blank → `:schema` is `nil`: the workspace database isn't
   provisioned yet and QP/transform consumers treat it as having no output
   mapping."
  [db output-namespace]
  (let [components (set (driver/qualified-name-components (:engine db)))
        positions  (ws/engine-namespace-positions db)
        schema     (when-not (str/blank? output-namespace) output-namespace)]
    (cond-> {}
      (:db components)     (assoc :db (:db positions))
      (:schema components) (assoc :schema schema)
      (and (:db components) (not (:schema components)))
      (assoc :db schema))))

(defn- workspace-database-entry [wsd db]
  [(:name db) {:input_schemas (vec (:input_schemas wsd))
               :output        (expand-output db (:output_namespace wsd))}])

(defn build-workspace-config
  "Return a downloadable config.yml-shaped map for `workspace-id`:

    {:version 1
     :config  {:databases [...]
               :workspace {:name      <ws-name>
                           :databases {<db-name> {:input_schemas [<schema-name> ...]
                                                  :output        {:db ? :schema ?}}}}}

  Each database entry merges the underlying `metabase_database.details` with the
  WorkspaceDatabase's override credentials and adds `schema-filters-*` keys
  derived from `:input_schemas`. Per-database workspace entries carry the
  expanded `{:db ?, :schema ?}` namespace map directly — the same shape the
  `workspace-instance` setting stores. Returns nil when the workspace does not
  exist. Throws a 409 `ex-info` if any of the workspace's databases is not
  `:provisioned`."
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
