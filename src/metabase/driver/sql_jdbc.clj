(ns metabase.driver.sql-jdbc
  "Shared code for drivers for SQL databases using their respective JDBC drivers under the hood."
  (:refer-clojure :exclude [mapv])
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.java.jdbc :as jdbc]
   [honey.sql :as sql]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.metadata :as sql-jdbc.metadata]
   [metabase.driver.sql-jdbc.quoting :refer [quote-columns quote-identifier
                                             quote-table with-quoting]]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sync :as driver.s]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv]])
  (:import
   (java.sql Connection SQLException SQLTimeoutException)))

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

(defmethod driver/database-supports? [:sql-jdbc :jdbc/statements] [_driver _feature _db] true)

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
  (sql-jdbc.conn/invalidate-pool-for-db! database)
  (memoize/memo-clear! driver-api/secret-value-as-file!))

(defmethod driver/dbms-version :sql-jdbc
  [driver database]
  (sql-jdbc.sync/dbms-version driver (sql-jdbc.conn/db->pooled-connection-spec database)))

(defmethod driver/describe-database* :sql-jdbc
  [driver database]
  (sql-jdbc.sync/describe-database driver database))

(defmethod driver/describe-table :sql-jdbc
  [driver database table]
  (sql-jdbc.sync/describe-table driver database table))

(defmethod driver/describe-fields :sql-jdbc
  [driver database & {:as args}]
  (sql-jdbc.sync/describe-fields driver database args))

(defmethod driver/describe-indexes :sql-jdbc
  [driver database & {:as args}]
  (sql-jdbc.sync/describe-indexes driver database args))

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

(defn- create-table!-sql
  [driver table-name column-definitions & {:keys [primary-key]}]
  (with-quoting driver
    (first (sql/format {:create-table (quote-table table-name)
                        :with-columns (cond-> (mapv (fn [[col-name type-spec]]
                                                      (vec (cons (quote-identifier col-name)
                                                                 (if (string? type-spec)
                                                                   [[:raw type-spec]]
                                                                   type-spec))))
                                                    column-definitions)
                                        primary-key (conj [(into [:primary-key] primary-key)]))}
                       :quoted true
                       :dialect (sql.qp/quote-style driver)))))

(defmethod driver/create-table! :sql-jdbc
  [driver database-id table-name column-definitions & {:keys [primary-key]}]
  (let [sql (create-table!-sql driver table-name column-definitions :primary-key primary-key)]
    (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec database-id)]
      (jdbc/execute! conn sql))))

(defmethod driver/drop-table! :sql-jdbc
  [driver db-id table-name]
  (let [sql (first (sql/format {:drop-table [:if-exists (keyword table-name)]}
                               :quoted true
                               :dialect (sql.qp/quote-style driver)))]
    (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db-id)]
      (jdbc/execute! conn sql))))

(defmulti create-index-sql
  "Implementing method to produce the SQL (string) that will create the secondary index."
  {:added "0.58.0", :arglists '([driver schema table-name index-name column-names & opts])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod create-index-sql :default
  [driver schema table-name index-name column-names & _]
  (with-quoting driver
    (let [index-spec (into [(keyword (if schema (str (name schema) "." (name table-name)) table-name))]
                           (map keyword)
                           column-names)]
      (first (sql/format {:create-index [(keyword index-name) index-spec]}
                         :quoted true
                         :dialect (sql.qp/quote-style driver))))))

(defmethod driver/create-index! :sql-jdbc
  [driver database-id schema table-name index-name column-names & _]
  (let [sql (create-index-sql driver schema table-name index-name column-names)]
    (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec database-id)]
      (jdbc/execute! conn sql))
    nil))

(defmulti drop-index-sql
  "Implementing method to produce the SQL (string) that will drop the index."
  {:added "0.58.0" :arglists '([driver schema table-name index-name])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod drop-index-sql :default
  [driver schema _table-name index-name]
  (first (sql/format {:drop-index [(keyword (if schema
                                              (str (name schema) "." (name index-name))
                                              (name index-name)))]}
                     :quoted true
                     :dialect (sql.qp/quote-style driver))))

(defmethod driver/drop-index! :sql-jdbc
  [driver database-id schema table-name index-name & _]
  (let [sql (drop-index-sql driver schema table-name index-name)]
    (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec database-id)]
      (jdbc/execute! conn sql))
    nil))

(defmethod driver/truncate! :sql-jdbc
  [driver db-id table-name]
  (let [table-name (keyword table-name)
        sql        (sql/format {:truncate table-name}
                               :quoted true
                               :dialect (sql.qp/quote-style driver))]
    (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db-id)]
      (jdbc/execute! conn sql))))

(defn- insert-into!-sqls [driver table-name column-names values inline?]
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
                                      :columns     (quote-columns driver column-names)
                                      :values      %}
                                     :inline inline?
                                     :quoted true
                                     :dialect dialect)
                        chunks)]
    sqls))

(defmethod driver/insert-into! :sql-jdbc
  [driver db-id table-name column-names values]
  (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db-id)]
    (doseq [sql (insert-into!-sqls driver table-name column-names values false)]
      (jdbc/execute! conn sql))))

(defmethod driver/insert-from-source! [:sql-jdbc :rows]
  [driver db-id {table-name :name :keys [columns]} {:keys [data]}]
  (driver/insert-into! driver db-id table-name (mapv :name columns) data))

(defmethod driver/add-columns! :sql-jdbc
  [driver db-id table-name column-definitions & {:keys [primary-key]}]
  (mu/validate-throw [:maybe [:cat :keyword]] primary-key) ; we only support adding a single primary key column for now
  (with-quoting driver
    (let [primary-key-column (first primary-key)
          sql                (first (sql/format {:alter-table (keyword table-name)
                                                 :add-column  (map (fn [[column-name type-and-constraints]]
                                                                     (cond-> (vec (cons (quote-identifier column-name)
                                                                                        (if (string? type-and-constraints)
                                                                                          [[:raw type-and-constraints]]
                                                                                          type-and-constraints)))
                                                                       (= primary-key-column column-name)
                                                                       (conj :primary-key)))
                                                                   column-definitions)}
                                                :quoted true
                                                :dialect (sql.qp/quote-style driver)))]
      (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db-id)]
        (jdbc/execute! conn sql)))))

;; kept for get-method driver compatibility
#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod driver/alter-columns! :sql-jdbc
  [driver db-id table-name column-definitions]
  (driver-api/execute-write-sql! db-id (sql-jdbc.sync/alter-columns-sql driver table-name column-definitions)))

#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod driver/alter-table-columns! :sql-jdbc
  [driver db-id table-name column-definitions & opts]
  (let [deprecated-default-method      (get-method driver/alter-columns! :sql-jdbc)
        deprecated-driver-method       (get-method driver/alter-columns! driver)
        deprecated-method-specialised? (not (identical? deprecated-default-method deprecated-driver-method))]
    ;; compatibility: continue to use the old method if it has been overridden
    (if deprecated-method-specialised?
      (deprecated-driver-method driver db-id table-name column-definitions)
      (->> (apply sql-jdbc.sync/alter-table-columns-sql driver table-name column-definitions opts)
           (driver-api/execute-write-sql! db-id)))))

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

(defn get-sql-state
  "Extract the first non-nil SQLState from a chain of sql exceptions. Return nil if SQLState is not set."
  [^SQLException e]
  (loop [exception e]
    (if-let [sql-state (.getSQLState exception)]
      sql-state
      (when-let [next-ex (.getNextException exception)]
        (recur next-ex)))))

(defn- extract-sql-exception
  "Examines the chain of exceptions to find the first SQLException error. Returns nil if no SQLException is found"
  ^SQLException [e]
  (loop [exception e]
    (if (instance? SQLException exception)
      exception
      (when-let [cause (ex-cause exception)]
        (recur cause)))))

(defmulti impl-query-canceled?
  "Implementing multimethod for is query canceled. Notes when a query is canceled due to user action,
  which can include using the `.setQueryTimeout` on a `PreparedStatement.` Use this instead of implementing
  driver/query-canceled so extracting the SQLException from an exception chain can happen once for jdbc-
  based drivers."
  {:added "0.53.12" :arglists '([driver ^SQLException e])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

;; For Dialects that do return a SQLTimeoutException
(defmethod impl-query-canceled? :sql-jdbc [_ e]
  (instance? SQLTimeoutException e))

(defmethod driver/query-canceled? :sql-jdbc [driver e]
  (if-let [sql-exception (extract-sql-exception e)]
    (impl-query-canceled? driver sql-exception)
    false))

(defmulti impl-table-known-to-not-exist?
  "Implementing multimethod for is table known to not exist. Use this instead of implementing
  driver/query-canceled so extracting the SQLException from an exception chain can happen once for jdbc-
  based drivers."
  {:added "0.54.10" :arglists '([driver ^SQLException e])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod impl-table-known-to-not-exist? ::driver/driver [_ _] false)

(defmethod driver/table-known-to-not-exist? :sql-jdbc [driver e]
  (if-let [sql-exception (extract-sql-exception e)]
    (impl-table-known-to-not-exist? driver sql-exception)
    false))

(defmethod driver/schema-exists? :sql-jdbc
  [driver db-id schema]
  (sql-jdbc.execute/do-with-connection-with-options
   driver db-id {}
   (fn [^Connection conn]
     (->> (.getMetaData conn)
          sql-jdbc.describe-database/all-schemas
          (m/find-first #(= % schema))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Workspace Isolation                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private perm-check-workspace-id "00000000-0000-0000-0000-000000000000")

(defmethod driver/check-isolation-permissions :sql-jdbc
  [driver database test-table]
  (let [test-workspace {:id   perm-check-workspace-id
                        :name "_mb_perm_check_"}]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database
     {:write? true}
     (fn [^Connection conn]
       (.setAutoCommit conn false)
       (try
         (let [init-result (try
                             (driver/init-workspace-isolation! driver database test-workspace)
                             (catch Exception e
                               (throw (ex-info (format "Failed to initialize workspace isolation (CREATE SCHEMA/USER): %s"
                                                       (ex-message e))
                                               {:step :init} e))))
               workspace-with-details (merge test-workspace init-result)]
           (when test-table
             (try
               (driver/grant-workspace-read-access! driver database workspace-with-details [test-table])
               (catch Exception e
                 (throw (ex-info (format "Failed to grant read access to table %s.%s: %s"
                                         (:schema test-table) (:name test-table) (ex-message e))
                                 {:step :grant :table test-table} e)))))
           (try
             (driver/destroy-workspace-isolation! driver database workspace-with-details)
             (catch Exception e
               (throw (ex-info (format "Failed to destroy workspace isolation (DROP SCHEMA/USER): %s"
                                       (ex-message e))
                               {:step :destroy} e)))))
         nil
         (catch Exception e
           (ex-message e))
         (finally
           (.rollback conn)))))))
