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
  "Migration id is picked by use, hence no serial"
  [[:version :bigint [:primary-key]]
   [:finished_at :timestamp [:default [:NOW]]]
   [:status [:varchar 32]]])

(def migration-table-hsql
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
  [tx]
  (or (:migration/version
       (jdbc/execute-one! tx (sql/format {:select [:version]
                                          :from [:migration]
                                          :order-by [[:version :desc]]
                                          :limit 1})))
      -1))

(defn- write-successful-migration!
  [tx]
  (jdbc/execute-one! tx (sql/format (-> (sql.helpers/insert-into :migration)
                                        (sql.helpers/values [{:version semantic.db.migration.impl/code-version
                                                              :status "success"}])))))

(defn maybe-migrate-schema!
  [tx opts]
  (let [db-version (db-version tx)]
    (cond
      (= db-version semantic.db.migration.impl/code-version)
      (log/info "Migration already performed, skipping.")

      (< db-version semantic.db.migration.impl/code-version)
      (do
        (log/infof "Starting migration from version %d to %d."
                   db-version semantic.db.migration.impl/code-version)
        (semantic.db.migration.impl/migrate-schema! tx opts)
        (write-successful-migration! tx))

      :else
      (log/infof "Database schema version (%d) is newer than code version (%d). Not performing migration."
                 db-version semantic.db.migration.impl/code-version)))
  nil)

(defn- lowest-dynamic-db-version
  [tx]
  (or (:index_metadata/index_version
       (jdbc/execute-one! tx (sql/format {:select [:index_version]
                                          :from [:index_metadata]
                                          :order-by [[:index_version :asc]]
                                          :limit 1})))
      0))

(defn maybe-migrate-dynamic-schema!
  [tx opts]
  ;; currently noop
  (let [db-version (lowest-dynamic-db-version tx)]
    (cond
      (= db-version semantic.db.migration.impl/dynamic-code-version)
      (log/info "Dynamic tables migration already performed, skipping.")

      (< db-version semantic.db.migration.impl/dynamic-code-version)
      (do
        (log/infof "Starting dynamic tables migration from version %d to %d."
                   db-version semantic.db.migration.impl/code-version)
        (semantic.db.migration.impl/migrate-dynamic-schema! tx opts))

      :else
      (log/infof "Dynamic tables database schema version (%d) is newer than code version (%d). Not performing migration."
                 db-version semantic.db.migration.impl/dynamic-code-version)))
  nil)

(defn maybe-migrate!
  [tx opts]
  (ensure-migration-table! tx)
  (maybe-migrate-schema! tx opts)
  (maybe-migrate-dynamic-schema! tx opts)
  nil)
