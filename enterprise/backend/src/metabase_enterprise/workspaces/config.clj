(ns metabase-enterprise.workspaces.config
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver :as driver]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(defn- schema-filter-entries
  "Build `:schema-filters-*` keys for the workspace's input scope, or `{}`
   for engines that don't have schemas at all (MySQL, ClickHouse-as-1-DB).

   On schema-having drivers (Postgres, Redshift, SQL Server, Snowflake), the
   filter is what scopes sync to the workspace's input schemas. On no-schema
   drivers, JDBC reports `TABLE_SCHEM` as null for every row — and
   `metabase.driver.sync/schema-patterns->filter-fn*` documents that
   inclusion patterns NEVER match a `nil` schema. Emitting an inclusion
   filter on those drivers makes sync silently produce zero Tables.

   Scoping on no-schema drivers is already enforced by the connection's
   bound database (`:details.db`), which itself maps 1-to-1 with the
   workspace's input. Nothing more to filter."
  [{:keys [engine] :as db} wsd]
  (if (driver/database-supports? engine :schemas db)
    {:schema-filters-type     "inclusion"
     :schema-filters-patterns (str/join "," (:input_schemas wsd))}
    {}))

(defn- database-entry [wsd db]
  {:name    (:name db)
   :engine  (:engine db)
   :details (merge (:details db)
                   (:database_details wsd)
                   (schema-filter-entries db wsd))})

(defn- table-namespace
  "Build a wire `::table-namespace` map (`{:db ?, :schema ?}`) for `database`
   given `ns-name` — the warehouse-side namespace string above the table
   (e.g. `\"public\"` on Postgres, the database name on MySQL).

   The slot the value lands in is dictated by the driver's
   `qualified-name-components`:

   - schema-having drivers (Postgres, Redshift, Snowflake, SQL Server,
     ClickHouse) put `ns-name` in `:schema`.
   - schema-less drivers that emit the database name as the qualifier
     (MySQL has `qualified-name-components` `[:db]`) put `ns-name` in
     `:db`.

   For 3-slot drivers (Snowflake, SQL Server, BigQuery) the canonical
   connection's `:db` slot is also populated alongside `:schema`. For
   MySQL only `:db` is populated.

   A slot is present iff its value is a non-blank string; storage `\"\"`
   becomes a missing key, since the wire format reserves `\"\"` for storage
   rows only."
  [database ns-name]
  (let [components   (set (driver/qualified-name-components (:engine database)))
        db-slot      (when (:db components) (ws.table-remapping/db-position-value database))
        ;; If the driver has a schema slot, ns-name lives there. If it doesn't
        ;; but does have a db slot, ns-name IS the db name (= what JDBC
        ;; reports as TABLE_CAT). MySQL is the latter case.
        ns-in-schema (boolean (:schema components))
        ns-in-db     (and (not ns-in-schema) (:db components))]
    (cond-> {}
      (and ns-in-schema (not (str/blank? ns-name)))   (assoc :schema ns-name)
      (and ns-in-db     (not (str/blank? ns-name)))   (assoc :db ns-name)
      (and ns-in-schema (not (str/blank? db-slot)))   (assoc :db db-slot))))

(defn- workspace-database-entry [wsd db]
  [(:name db) {:input_schemas (vec (:input_schemas wsd))
               :output        (table-namespace db (:output_namespace wsd))}])

(defn build-workspace-config
  "Return a downloadable config.yml-shaped map for `workspace-id`:

    {:version 1
     :config  {:databases [...]
               :workspace {:name      <ws-name>
                           :databases {<db-name> {:input_schemas [<schema-name> ...]
                                                  :output        {:db ?, :schema ?}}}}}}

  Each database entry merges the underlying `metabase_database.details` with the
  WorkspaceDatabase's override credentials and adds `schema-filters-*` keys
  derived from `:input_schemas`. Per-database workspace entries carry plain
  schema-name strings for `:input_schemas` (the 3-slot driver catalog is read
  from `Database.details` at use time, not duplicated on each row), and a
  driver-aware `::table-namespace` map for `:output`. Returns nil when the
  workspace does not exist. Throws a 409 `ex-info` if any of the workspace's
  databases is not `:provisioned`."
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
