(ns metabase-enterprise.semantic-search.db.migration
  (:require
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.semantic-search.db.migration.impl :as semantic.db.migration.impl]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc])
  (:import
   [java.sql SQLException]))

(def ^:private columns
  ;; No serial -- ids are chosen by migration authors
  [[:version :bigint [:primary-key]]
   [:migrated_at :timestamp [:default [:NOW]]]
   [:status [:varchar 32]]])

(defn- migration-table-kw
  "The migration bookkeeping table: inside the module's schema when index-metadata carries one (shared
  app-db mode), bare `migration` otherwise."
  [index-metadata]
  (if-let [schema (:schema index-metadata)]
    (keyword (str schema ".migration"))
    :migration))

(defn- ensure-schema-exists!
  "Create the module's schema when index-metadata carries one.
  This is the first *persisted* write against the app db in app-db mode; insufficient privileges normally
  surface earlier, at the capability probe's rolled-back CREATE SCHEMA."
  [index-metadata tx]
  (when-let [schema (:schema index-metadata)]
    (try
      (jdbc/execute! tx [(str "CREATE SCHEMA IF NOT EXISTS " (semantic.util/quote-ident schema))])
      (catch SQLException e
        (throw (ex-info (format (str "Failed to create the %s schema on the application database. Grant"
                                     " CREATE on the database to the Metabase user, or set"
                                     " MB_PGVECTOR_DB_URL to use a dedicated pgvector database.")
                                schema)
                        {:type ::schema-creation-failed :schema schema}
                        e))))))

(defn- migration-table-sql
  [index-metadata]
  (-> (sql.helpers/create-table (migration-table-kw index-metadata) :if-not-exists)
      (sql.helpers/with-columns columns)
      (sql/format)))

(defn- ensure-migration-table!
  [index-metadata tx]
  (let [sql (migration-table-sql index-metadata)]
    (try
      (jdbc/execute! tx sql)
      (catch SQLException e
        (throw (ex-info "Failed to create migration table."
                        {:type ::migration-table-creation-failed}
                        e))))
    nil))

(defn- db-version
  "Get database version of schema from migration table."
  [index-metadata tx]
  (or (:max_version
       (jdbc/execute-one! tx
                          (sql/format {:select [[[:max :version] :max_version]]
                                       :from [(migration-table-kw index-metadata)]})))
      -1))

(defn- write-successful-migration!
  [index-metadata tx]
  (jdbc/execute-one! tx (sql/format (-> (sql.helpers/insert-into (migration-table-kw index-metadata))
                                        (sql.helpers/values [{:version semantic.db.migration.impl/schema-version
                                                              :status "success"}])))))

(defn maybe-migrate-schema!
  "Execute schema migration (control, meta, gate, ...) if appropriate."
  [tx {:keys [index-metadata] :as opts}]
  (let [db-version (db-version index-metadata tx)]
    (cond
      (= db-version semantic.db.migration.impl/schema-version)
      (log/info "Migration already performed, skipping.")

      (< db-version semantic.db.migration.impl/schema-version)
      (do
        (log/infof "Starting migration from version %d to %d."
                   db-version semantic.db.migration.impl/schema-version)
        (semantic.db.migration.impl/migrate-schema! tx opts)
        (write-successful-migration! index-metadata tx))

      :else
      (log/infof "Database schema version (%d) is newer than code version (%d). Not performing migration."
                 db-version semantic.db.migration.impl/schema-version)))
  nil)

(defn- index-metadata-table-exists?
  [index-metadata tx]
  (semantic.util/table-exists? tx (:metadata-table-name index-metadata)))

(defn- lowest-dynamic-db-version
  "Lowest index version. If there is lower than defined in code dynamic schema migration will be attempted."
  [index-metadata tx]
  (or (when (index-metadata-table-exists? index-metadata tx)
        (:min_index
         (jdbc/execute-one! tx
                            (sql/format {:select [[[:min :index_version] :min_index]]
                                         :from [(keyword (:metadata-table-name index-metadata))]}))))
      0))

(defn maybe-migrate-dynamic-schema!
  "Migration for dynamic tables (index_table_xyzs) if appropriate."
  [tx {:keys [index-metadata] :as opts}]
  (let [db-version (lowest-dynamic-db-version index-metadata tx)]
    (cond
      (= db-version semantic.db.migration.impl/dynamic-schema-version)
      (log/info "Dynamic tables migration already performed, skipping.")

      (< db-version semantic.db.migration.impl/dynamic-schema-version)
      (do
        (log/infof "Starting dynamic tables migration from version %d to %d."
                   db-version semantic.db.migration.impl/dynamic-schema-version)
        (semantic.db.migration.impl/migrate-dynamic-schema! tx opts))

      :else
      (log/infof "Dynamic tables database schema version (%d) is newer than code version (%d). Not performing migration."
                 db-version semantic.db.migration.impl/dynamic-schema-version)))
  nil)

(defn maybe-migrate!
  "Execute schema and dynamic schema migrations."
  [tx {:keys [index-metadata] :as opts}]
  (ensure-schema-exists! index-metadata tx)
  (ensure-migration-table! index-metadata tx)
  (maybe-migrate-schema! tx opts)
  (maybe-migrate-dynamic-schema! tx opts)
  nil)

(defn drop-migration-table!
  "Drop migration table."
  [index-metadata connectable]
  (jdbc/execute! connectable (sql/format (sql.helpers/drop-table :if-exists (migration-table-kw index-metadata)))))
