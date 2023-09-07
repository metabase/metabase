(ns metabase.driver.sql-jdbc
  "Shared code for drivers for SQL databases using their respective JDBC drivers under the hood."
  (:require
   [clojure.java.jdbc :as jdbc]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sync :as driver.s]
   [metabase.query-processor.writeback :as qp.writeback]
   #_{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.util.honeysql-extensions :as hx])
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
   (let [table-identifier (sql.qp/with-driver-honey-sql-version driver
                            (->> (hx/identifier :table (:schema table) (:name table))
                                 (sql.qp/->honeysql driver)
                                 sql.qp/maybe-wrap-unaliased-expr))]
     (query driver database (merge {:from [table-identifier]}
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
  [driver query chans respond]
  (sql-jdbc.execute/execute-reducible-query driver query chans respond))

(defmethod driver/notify-database-updated :sql-jdbc
  [_ database]
  (sql-jdbc.conn/notify-database-updated database))

(defmethod driver/dbms-version :sql-jdbc
  [driver database]
  (sql-jdbc.sync/dbms-version driver (sql-jdbc.conn/db->pooled-connection-spec database)))

(defmethod driver/describe-database :sql-jdbc
  [driver database]
  (sql-jdbc.sync/describe-database driver database))

(defmethod driver/describe-table :sql-jdbc
  [driver database table]
  (sql-jdbc.sync/describe-table driver database table))

(defmethod driver/describe-table-fks :sql-jdbc
  [driver database table]
  (sql-jdbc.sync/describe-table-fks driver database table))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/ISO8601->DateTime]
  [_driver _semantic_type expr]
  (hx/->timestamp expr))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/ISO8601->Date]
  [_driver _semantic_type expr]
  (hx/->date expr))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/ISO8601->Time]
  [_driver _semantic_type expr]
  (hx/->time expr))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _semantic_type expr]
  (hx/->timestamp expr))

(defn- create-table-sql
  [driver table-name col->type]
  (first (sql/format {:create-table (keyword table-name)
                      :with-columns (map (fn [[name type-spec]]
                                           (vec (cons name type-spec)))
                                         col->type)}
                     :quoted true
                     :dialect (sql.qp/quote-style driver))))

(defmethod driver/create-table! :sql-jdbc
  [driver db-id table-name col->type]
  (let [sql (create-table-sql driver table-name col->type)]
    (qp.writeback/execute-write-sql! db-id sql)))

(defmethod driver/drop-table! :sql-jdbc
  [driver db-id table-name]
  (let [sql (first (sql/format {:drop-table [:if-exists (keyword table-name)]}
                               :quoted true
                               :dialect (sql.qp/quote-style driver)))]
    (qp.writeback/execute-write-sql! db-id sql)))

(defmethod driver/insert-into! :sql-jdbc
  [driver db-id table-name column-names values]
  (let [table-name (keyword table-name)
        columns    (map keyword column-names)
        sqls       (map #(sql/format {:insert-into table-name
                                      :columns     columns
                                      :values      %}
                                     :quoted true
                                     :dialect (sql.qp/quote-style driver))
                        (partition-all 100 values))]
    ;; We need to partition the insert into multiple statements for both performance and correctness.
    ;;
    ;; On Postgres with a large file, 100 (3.76m) was significantly faster than 50 (4.03m) and 25 (4.27m). 1,000 was a
    ;; little faster but not by much (3.63m), and 10,000 threw an error:
    ;;     PreparedStatement can have at most 65,535 parameters
    ;; One imagines that `(long (/ 65535 (count columns)))` might be best, but I don't trust the 65K limit to apply
    ;; across all drivers. With that in mind, 100 seems like a safe compromise.
    (doseq [sql sqls]
      (qp.writeback/execute-write-sql! db-id sql))))

(defmethod driver/pk-options :sql-jdbc
  [_driver]
  [:auto-increment [:not nil]])

(defmethod driver/syncable-schemas :sql-jdbc
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   nil
   (fn [^java.sql.Connection conn]
     (let [[inclusion-patterns
            exclusion-patterns] (driver.s/db-details->schema-filter-patterns database)]
       (into #{} (sql-jdbc.sync.interface/filtered-syncable-schemas driver conn (.getMetaData conn) inclusion-patterns exclusion-patterns))))))

(defmethod driver/set-role! :sql-jdbc
  [driver conn role]
  (let [sql (driver.sql/set-role-statement driver role)]
    (with-open [stmt (.createStatement ^Connection conn)]
      (.execute stmt sql))))
