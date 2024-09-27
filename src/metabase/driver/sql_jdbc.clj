(ns metabase.driver.sql-jdbc
  "Shared code for drivers for SQL databases using their respective JDBC drivers under the hood."
  (:require
   [clojure.java.jdbc :as jdbc]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.metadata :as sql-jdbc.metadata]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sync :as driver.s]
   [metabase.query-processor.writeback :as qp.writeback]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(comment sql-jdbc.actions/keep-me)

(driver/register! :sql-jdbc, :parent :sql, :abstract? true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Run a Query                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - Seems like this is only used in a handful of places, consider moving to util namespace
(defn query
  "Execute a `honeysql-form` query against `database`, `driver`, and optionally `table`."
  ([driver database honeysql-form]
   (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
               (sql.qp/format-honeysql driver honeysql-form)))

  ([driver database table honeysql-form]
   (let [table-identifier (sql.qp/->honeysql driver (h2x/identifier :table (:schema table) (:name table)))]
     (query driver database (merge {:from [[table-identifier]]}
                                   honeysql-form)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Default SQL JDBC metabase.driver impls                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/can-connect? :sql-jdbc
  [driver details]
  (sql-jdbc.conn/can-connect? driver details))

(defmethod driver/table-rows-seq :sql-jdbc
  [driver database table]
  (query driver database table {:select [:*]}))

(defn- has-method? [driver multifn]
  {:pre [(keyword? driver)]}
  (when-let [driver-method (get-method multifn driver)]
    (and driver-method
         (not (identical? driver-method (get-method multifn :sql-jdbc)))
         (not (identical? driver-method (get-method multifn :default))))))

;; TODO - this implementation should itself be deprecated! And have drivers implement it directly instead.
(defmethod driver/database-supports? [:sql-jdbc :set-timezone]
  [driver _feature _db]
  (boolean (seq (sql-jdbc.execute/set-timezone-sql driver))))

(defmethod driver/db-default-timezone :sql-jdbc
  [driver database]
  ;; if the driver has a non-default implementation of [[sql-jdbc.sync/db-default-timezone]], use that.
  #_{:clj-kondo/ignore [:deprecated-var]}
  (if (has-method? driver sql-jdbc.sync/db-default-timezone)
    (sql-jdbc.sync/db-default-timezone driver (sql-jdbc.conn/db->pooled-connection-spec database))
    ;; otherwise fall back to the default implementation.
    ((get-method driver/db-default-timezone :metabase.driver/driver) driver database)))

(defmethod driver/execute-reducible-query :sql-jdbc
  [driver query context respond]
  (sql-jdbc.execute/execute-reducible-query driver query context respond))

(defmethod driver/notify-database-updated :sql-jdbc
  [_ database]
  (sql-jdbc.conn/invalidate-pool-for-db! database))

(defmethod driver/dbms-version :sql-jdbc
  [driver database]
  (sql-jdbc.sync/dbms-version driver (sql-jdbc.conn/db->pooled-connection-spec database)))

(defmethod driver/describe-database :sql-jdbc
  [driver database]
  (sql-jdbc.sync/describe-database driver database))

(defmethod driver/describe-table :sql-jdbc
  [driver database table]
  (sql-jdbc.sync/describe-table driver database table))

(defmethod driver/describe-fields :sql-jdbc
  [driver database & {:as args}]
  (sql-jdbc.sync/describe-fields driver database args))

#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod driver/describe-table-fks :sql-jdbc
  [driver database table]
  (sql-jdbc.sync/describe-table-fks driver database table))

(defmethod driver/describe-fks :sql-jdbc
  [driver database & {:as args}]
  (sql-jdbc.sync/describe-fks driver database args))

(defmethod driver/describe-table-indexes :sql-jdbc
  [driver database table]
  (sql-jdbc.sync/describe-table-indexes driver database table))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/ISO8601->DateTime]
  [_driver _semantic_type expr]
  (h2x/->timestamp expr))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/ISO8601->Date]
  [_driver _semantic_type expr]
  (h2x/->date expr))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/ISO8601->Time]
  [_driver _semantic_type expr]
  (h2x/->time expr))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _semantic_type expr]
  (h2x/->timestamp expr))

(defmacro ^:private with-quoting [driver & body]
  `(binding [sql/*dialect* (sql/get-dialect (sql.qp/quote-style ~driver))
             sql/*quoted*  true]
     ~@body))

(defn- quote-identifier [ref]
  [:raw (sql/format-entity ref)])

(defn- create-table!-sql
  [driver table-name column-definitions & {:keys [primary-key]}]
  (with-quoting driver
    (first (sql/format {:create-table (keyword table-name)
                        :with-columns (cond-> (mapv (fn [[col-name type-spec]]
                                                         (vec (cons (quote-identifier col-name) type-spec)))
                                                       column-definitions)
                                           primary-key (conj [(into [:primary-key] primary-key)]))}
                       :quoted true
                       :dialect (sql.qp/quote-style driver)))))

(defmethod driver/create-table! :sql-jdbc
  [driver database-id table-name column-definitions & {:keys [primary-key]}]
  (let [sql (create-table!-sql driver table-name column-definitions :primary-key primary-key)]
    (qp.writeback/execute-write-sql! database-id sql)))

(defmethod driver/drop-table! :sql-jdbc
  [driver db-id table-name]
  (let [sql (first (sql/format {:drop-table [:if-exists (keyword table-name)]}
                               :quoted true
                               :dialect (sql.qp/quote-style driver)))]
    (qp.writeback/execute-write-sql! db-id sql)))

(defmethod driver/truncate! :sql-jdbc
  [driver db-id table-name]
  (let [table-name (keyword table-name)
        sql        (sql/format {:truncate table-name}
                               :quoted true
                               :dialect (sql.qp/quote-style driver))]
    (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db-id)]
      (jdbc/execute! conn sql))))

(defmethod driver/insert-into! :sql-jdbc
  [driver db-id table-name column-names values]
  (let [;; We need to partition the insert into multiple statements for both performance and correctness.
        ;;
        ;; On Postgres with a large file, 100 (3.76m) was significantly faster than 50 (4.03m) and 25 (4.27m). 1,000 was a
        ;; little faster but not by much (3.63m), and 10,000 threw an error:
        ;;     PreparedStatement can have at most 65,535 parameters
        ;; One imagines that `(long (/ 65535 (count columns)))` might be best, but I don't trust the 65K limit to apply
        ;; across all drivers. With that in mind, 100 seems like a safe compromise.
        ;; There's nothing magic about 100, but it felt good in testing. There could well be a better number.
        chunks     (partition-all (or driver/*insert-chunk-rows* 100) values)
        dialect    (sql.qp/quote-style driver)
        sqls       (map #(sql/format {:insert-into (keyword table-name)
                                      :columns     (sql-jdbc.common/quote-columns dialect column-names)
                                      :values      %}
                                     :quoted true
                                     :dialect dialect)
                        chunks)]
    (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db-id)]
      (doseq [sql sqls]
        (jdbc/execute! conn sql)))))

(defmethod driver/add-columns! :sql-jdbc
  [driver db-id table-name column-definitions & {:keys [primary-key]}]
  (mu/validate-throw [:maybe [:cat :keyword]] primary-key) ; we only support adding a single primary key column for now
  (with-quoting driver
    (let [primary-key-column (first primary-key)
          sql                (first (sql/format {:alter-table (keyword table-name)
                                                 :add-column  (map (fn [[column-name type-and-constraints]]
                                                                     (cond-> (vec (cons (quote-identifier column-name) type-and-constraints))
                                                                       (= primary-key-column column-name)
                                                                       (conj :primary-key)))
                                                                   column-definitions)}
                                                :quoted true
                                                :dialect (sql.qp/quote-style driver)))]
      (qp.writeback/execute-write-sql! db-id sql))))

(defmethod driver/alter-columns! :sql-jdbc
  [driver db-id table-name column-definitions]
  (qp.writeback/execute-write-sql! db-id (sql-jdbc.sync/alter-columns-sql driver table-name column-definitions)))

(defmethod driver/syncable-schemas :sql-jdbc
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   nil
   (fn [^java.sql.Connection conn]
     (let [[inclusion-patterns
            exclusion-patterns] (driver.s/db-details->schema-filter-patterns database)]
       (into #{} (sql-jdbc.sync/filtered-syncable-schemas driver conn (.getMetaData conn) inclusion-patterns exclusion-patterns))))))

(defmethod driver/set-role! :sql-jdbc
  [driver conn role]
  (let [sql (driver.sql/set-role-statement driver role)]
    (with-open [stmt (.createStatement ^Connection conn)]
      (.execute stmt sql))))

(defmethod driver/current-user-table-privileges :sql-jdbc
  [driver database & {:as args}]
  (sql-jdbc.sync/current-user-table-privileges
   driver
   (sql-jdbc.conn/db->pooled-connection-spec database)
   args))

(defmethod driver/query-result-metadata :sql-jdbc
  [driver query]
  (sql-jdbc.metadata/query-result-metadata driver query))
