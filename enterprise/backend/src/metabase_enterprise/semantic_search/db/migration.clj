(ns metabase-enterprise.semantic-search.db.migration
  (:require
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.semantic-search.db.migration.impl :as semantic.db.migration.impl]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc])
  (:import
   [java.sql SQLException]))

(def ^:private columns
  ;; No serial -- ids are chosen by migration authors
  [[:version :bigint [:primary-key]]
   [:migrated_at :timestamp [:default [:NOW]]]
   [:status [:varchar 32]]])

(def ^:private migration-table-hsql
  (-> (sql.helpers/create-table :migration :if-not-exists)
      (sql.helpers/with-columns columns)))

(defn- migration-table-sql
  []
  (sql/format migration-table-hsql))

(defn- ensure-migration-table!
  [tx]
  (let [sql (migration-table-sql)]
    (try
      (jdbc/execute! tx sql)
      (catch SQLException e
        (throw (ex-info "Failed to create migration table."
                        {:type ::migration-table-creation-failed}
                        e))))
    nil))

(defn- db-version
  "Get database version of schema from migration table."
  [tx]
  (or (:max_version
       (jdbc/execute-one! tx
                          (sql/format {:select [[[:max :version] :max_version]]
                                       :from [:migration]})))
      -1))

(defn- write-successful-migration!
  [tx]
  (jdbc/execute-one! tx (sql/format (-> (sql.helpers/insert-into :migration)
                                        (sql.helpers/values [{:version semantic.db.migration.impl/schema-version
                                                              :status "success"}])))))

(defn maybe-migrate-schema!
  "Execute schema migration (control, meta, gate, ...) if appropriate."
  [tx opts]
  (let [db-version (db-version tx)]
    (cond
      (= db-version semantic.db.migration.impl/schema-version)
      (log/info "Migration already performed, skipping.")

      (< db-version semantic.db.migration.impl/schema-version)
      (do
        (log/infof "Starting migration from version %d to %d."
                   db-version semantic.db.migration.impl/schema-version)
        (semantic.db.migration.impl/migrate-schema! tx opts)
        (write-successful-migration! tx))

      :else
      (log/infof "Database schema version (%d) is newer than code version (%d). Not performing migration."
                 db-version semantic.db.migration.impl/schema-version)))
  nil)

(defn- index-metadata-table-exists?
  [tx]
  (jdbc/execute-one! tx
                     (sql/format {:select [[[:raw 1] :exists]]
                                  :from [:information_schema.tables]
                                  :where [[:= :information_schema.tables.table_name [:inline "index_metadata"]]]
                                  :limit 1})))

(defn- lowest-dynamic-db-version
  "Lowest index version. If there is lower than defined in code dynamic schema migration will be attempted."
  [tx]
  (or (when (index-metadata-table-exists? tx)
        (:min_index
         (jdbc/execute-one! tx
                            (sql/format {:select [[[:min :index_version] :min_index]]
                                         :from [:index_metadata]}))))
      0))

(defn maybe-migrate-dynamic-schema!
  "Migration for dynamic tables (index_table_xyzs) if appropriate."
  [tx opts]
  (let [db-version (lowest-dynamic-db-version tx)]
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
  [tx opts]
  (ensure-migration-table! tx)
  (maybe-migrate-schema! tx opts)
  (maybe-migrate-dynamic-schema! tx opts)
  nil)

(defn drop-migration-table!
  "Drop migration table."
  [connectable]
  (jdbc/execute! connectable (sql/format (sql.helpers/drop-table :if-exists :migration))))
