(ns metabase.driver.sparksql
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.connection-pool :as connection-pool]
   [metabase.driver :as driver]
   [metabase.driver.hive-like :as hive-like]
   [metabase.driver.hive-like.fixed-hive-connection :as fixed-hive-connection]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util :as qp.util]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.util.honey-sql-2 :as h2x])
  (:import
   (java.sql Connection ResultSet)))

(set! *warn-on-reflection* true)

(driver/register! :sparksql, :parent :hive-like)

;;; ------------------------------------------ Custom HoneySQL Clause Impls ------------------------------------------

(def ^:private source-table-alias
  "Default alias for all source tables. (Not for source queries; those still use the default SQL QP alias of `source`.)"
  "t1")

(defmethod sql.qp/->honeysql [:sparksql :field]
  [driver [_ _ {::sql.params.substitution/keys [compiling-field-filter?]} :as field-clause]]
  ;; use [[source-table-alias]] instead of the usual `schema.table` to qualify fields e.g. `t1.field` instead of the
  ;; normal `schema.table.field`
  (let [parent-method (get-method sql.qp/->honeysql [:hive-like :field])
        field-clause  (mbql.u/update-field-options field-clause
                                                   update
                                                   ::add/source-table
                                                   (fn [source-table]
                                                     (cond
                                                       ;; DO NOT qualify fields from field filters with `t1`, that won't
                                                       ;; work unless the user-written SQL query is doing the same
                                                       ;; thing.
                                                       compiling-field-filter? ::add/none
                                                       ;; for all other fields from the source table qualify them with
                                                       ;; `t1`
                                                       (integer? source-table) source-table-alias
                                                       ;; no changes for anyone else.
                                                       :else                   source-table)))]
    (parent-method driver field-clause)))

(defn- format-over
  "e.g. ROW_NUMBER() OVER (ORDER BY field DESC) AS __rownum__"
  [_fn [expr partition]]
  (let [[expr-sql & expr-args]           (sql/format-expr expr      {:nested true})
        [partition-sql & partition-args] (sql/format-expr partition {:nested true})]
    (into [(format "%s OVER %s" expr-sql partition-sql)]
          cat
          [expr-args
           partition-args])))

(sql/register-fn! ::over #'format-over)

(defmethod sql.qp/apply-top-level-clause [:sparksql :page]
  [_driver _clause honeysql-form {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can simply use limit
      (sql.helpers/limit honeysql-form items)
      ;; if we need to do an offset we have to do nesting to generate a row number and where on that
      (let [over-clause [::over :%row_number (select-keys honeysql-form [:order-by])]]
        (-> (apply sql.helpers/select (map last (:select honeysql-form)))
            (sql.helpers/from (sql.helpers/select honeysql-form [over-clause :__rownum__]))
            (sql.helpers/where [:> :__rownum__ [:inline offset]])
            (sql.helpers/limit [:inline items]))))))

(defmethod sql.qp/apply-top-level-clause [:sparksql :source-table]
  [driver _ honeysql-form {source-table-id :source-table}]
  (let [{table-name :name, schema :schema} (lib.metadata/table (qp.store/metadata-provider) source-table-id)]
    (sql.helpers/from honeysql-form [(sql.qp/->honeysql driver (h2x/identifier :table schema table-name))
                                     [(sql.qp/->honeysql driver (h2x/identifier :table-alias source-table-alias))]])))


;;; ------------------------------------------- Other Driver Method Impls --------------------------------------------

(defrecord SparkSQLDataSource [url properties]
  javax.sql.DataSource
  (getConnection [_this]
    (fixed-hive-connection/fixed-hive-connection url properties)))

(defmethod sql-jdbc.conn/connection-details->spec :sparksql
  [_driver {:keys [host port db jdbc-flags dbname]
            :or   {host "localhost", port 10000, db "", jdbc-flags ""}
            :as   opts}]
  (let [port        (cond-> port
                      (string? port) Integer/parseInt)
        db          (or dbname db)
        url         (format "jdbc:hive2://%s:%s/%s%s" host port db jdbc-flags)
        properties  (connection-pool/map->properties (dissoc opts :host :port :jdbc-flags))
        data-source (->SparkSQLDataSource url properties)]
    {:datasource data-source}))

(defn- dash-to-underscore [s]
  (when s
    (str/replace s #"-" "_")))

;; workaround for SPARK-9686 Spark Thrift server doesn't return correct JDBC metadata
(defmethod driver/describe-database :sparksql
  [driver database]
  {:tables
   (sql-jdbc.execute/do-with-connection-with-options
    driver
    database
    nil
    (fn [^Connection conn]
      (set
       (for [{:keys [database tablename tab_name], table-namespace :namespace} (jdbc/query {:connection conn} ["show tables"])]
         {:name   (or tablename tab_name) ; column name differs depending on server (SparkSQL, hive, Impala)
          :schema (or (not-empty database)
                      (not-empty table-namespace))}))))})

;; Hive describe table result has commented rows to distinguish partitions
(defn- valid-describe-table-row? [{:keys [col_name data_type]}]
  (every? (every-pred (complement str/blank?)
                      (complement #(str/starts-with? % "#")))
          [col_name data_type]))

;; workaround for SPARK-9686 Spark Thrift server doesn't return correct JDBC metadata
(defmethod driver/describe-table :sparksql
  [driver database {table-name :name, schema :schema}]
  {:name   table-name
   :schema schema
   :fields
   (sql-jdbc.execute/do-with-connection-with-options
    driver
    database
    nil
    (fn [^Connection conn]
      (let [results (jdbc/query {:connection conn} [(format
                                                     "describe %s"
                                                     (sql.u/quote-name driver :table
                                                                       (dash-to-underscore schema)
                                                                       (dash-to-underscore table-name)))])]
        (set
         (for [[idx {col-name :col_name, data-type :data_type, :as result}] (m/indexed results)
               :when (valid-describe-table-row? result)]
           {:name              col-name
            :database-type     data-type
            :base-type         (sql-jdbc.sync/database-type->base-type :hive-like (keyword data-type))
            :database-position idx})))))})

;; bound variables are not supported in Spark SQL (maybe not Hive either, haven't checked)
(defmethod driver/execute-reducible-query :sparksql
  [driver {{sql :query, :keys [params], :as inner-query} :native, :as outer-query} context respond]
  (let [inner-query (-> (assoc inner-query
                               :remark (qp.util/query->remark :sparksql outer-query)
                               :query  (if (seq params)
                                         (binding [hive-like/*param-splice-style* :paranoid]
                                           (unprepare/unprepare driver (cons sql params)))
                                         sql)
                               :max-rows (mbql.u/query->max-rows-limit outer-query))
                        (dissoc :params))
        query       (assoc outer-query :native inner-query)]
    ((get-method driver/execute-reducible-query :sql-jdbc) driver query context respond)))

;; 1.  SparkSQL doesn't support `.supportsTransactionIsolationLevel`
;; 2.  SparkSQL doesn't support session timezones (at least our driver doesn't support it)
;; 3.  SparkSQL doesn't support making connections read-only
;; 4.  SparkSQL doesn't support setting the default result set holdability
(defmethod sql-jdbc.execute/do-with-connection-with-options :sparksql
  [driver db-or-id-or-spec options f]
  (sql-jdbc.execute/do-with-resolved-connection
   driver
   db-or-id-or-spec
   options
   (fn [^Connection conn]
     (when-not (sql-jdbc.execute/recursive-connection?)
       (.setTransactionIsolation conn Connection/TRANSACTION_READ_UNCOMMITTED))
     (f conn))))

;; 1.  SparkSQL doesn't support setting holdability type to `CLOSE_CURSORS_AT_COMMIT`
(defmethod sql-jdbc.execute/prepared-statement :sparksql
  [driver ^Connection conn ^String sql params]
  (let [stmt (.prepareStatement conn sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY)]
    (try
      (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
      (sql-jdbc.execute/set-parameters! driver stmt params)
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))

;; the current HiveConnection doesn't support .createStatement
(defmethod sql-jdbc.execute/statement-supported? :sparksql [_] false)

(doseq [[feature supported?] {:basic-aggregations              true
                              :binning                         true
                              :expression-aggregations         true
                              :expressions                     true
                              :native-parameters               true
                              :nested-queries                  true
                              :standard-deviation-aggregations true
                              :metadata/key-constraints        false
                              :test/jvm-timezone-setting       false
                              ;; disabled for now, see issue #40991 to fix this.
                              :window-functions/cumulative     false}]
  (defmethod driver/database-supports? [:sparksql feature] [_driver _feature _db] supported?))

;; only define an implementation for `:foreign-keys` if none exists already. In test extensions we define an alternate
;; implementation, and we don't want to stomp over that if it was loaded already
(when-not (get (methods driver/database-supports?) [:sparksql :foreign-keys])
  (defmethod driver/database-supports? [:sparksql :foreign-keys] [_driver _feature _db] true))

(defmethod sql.qp/quote-style :sparksql
  [_driver]
  :mysql)
