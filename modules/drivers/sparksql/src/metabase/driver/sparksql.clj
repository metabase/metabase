(ns metabase.driver.sparksql
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.java.jdbc :as jdbc]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase.driver :as driver]
            [metabase.driver.hive-like :as hive-like]
            [metabase.driver.sql
             [query-processor :as sql.qp]
             [util :as sql.u]]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor
             [store :as qp.store]
             [util :as qputil]]
            [metabase.util.honeysql-extensions :as hx]))

(driver/register! :sparksql, :parent :hive-like)

;;; ------------------------------------------ Custom HoneySQL Clause Impls ------------------------------------------

(def ^:private source-table-alias
  "Default alias for all source tables. (Not for source queries; those still use the default SQL QP alias of `source`.)"
  "t1")

;; use `source-table-alias` for the source Table, e.g. `t1.field` instead of the normal `schema.table.field`
(defmethod sql.qp/->honeysql [:sparksql (class Field)]
  [driver field]
  (binding [sql.qp/*table-alias* (or sql.qp/*table-alias* source-table-alias)]
    ((get-method sql.qp/->honeysql [:hive-like (class Field)]) driver field)))

(defmethod sql.qp/apply-top-level-clause [:sparksql :page] [_ _ honeysql-form {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can simply use limit
      (h/limit honeysql-form items)
      ;; if we need to do an offset we have to do nesting to generate a row number and where on that
      (let [over-clause (format "row_number() OVER (%s)"
                                (first (hsql/format (select-keys honeysql-form [:order-by])
                                                    :allow-dashed-names? true
                                                    :quoting :mysql)))]
        (-> (apply h/select (map last (:select honeysql-form)))
            (h/from (h/merge-select honeysql-form [(hsql/raw over-clause) :__rownum__]))
            (h/where [:> :__rownum__ offset])
            (h/limit items))))))

(defmethod sql.qp/apply-top-level-clause [:sparksql :source-table]
  [driver _ honeysql-form {source-table-id :source-table}]
  (let [{table-name :name, schema :schema} (qp.store/table source-table-id)]
    (h/from honeysql-form [(sql.qp/->honeysql driver (hx/identifier :table schema table-name))
                           (sql.qp/->honeysql driver (hx/identifier :table-alias source-table-alias))])))


;;; ------------------------------------------- Other Driver Method Impls --------------------------------------------

(defn- sparksql
  "Create a database specification for a Spark SQL database."
  [{:keys [host port db jdbc-flags]
    :or   {host "localhost", port 10000, db "", jdbc-flags ""}
    :as   opts}]
  (merge
   {:classname   "metabase.driver.FixedHiveDriver"
    :subprotocol "hive2"
    :subname     (str "//" host ":" port "/" db jdbc-flags)}
   (dissoc opts :host :port :jdbc-flags)))

(defmethod sql-jdbc.conn/connection-details->spec :sparksql [_ details]
  (-> details
      (update :port (fn [port]
                      (if (string? port)
                        (Integer/parseInt port)
                        port)))
      (set/rename-keys {:dbname :db})
      sparksql
      (sql-jdbc.common/handle-additional-options details)))

(defn- dash-to-underscore [s]
  (when s
    (str/replace s #"-" "_")))

;; workaround for SPARK-9686 Spark Thrift server doesn't return correct JDBC metadata
(defmethod driver/describe-database :sparksql
  [_ {:keys [details] :as database}]
  {:tables
   (with-open [conn (jdbc/get-connection (sql-jdbc.conn/db->pooled-connection-spec database))]
     (set
      (for [{:keys [database tablename tab_name]} (jdbc/query {:connection conn} ["show tables"])]
        {:name   (or tablename tab_name) ; column name differs depending on server (SparkSQL, hive, Impala)
         :schema (when (seq database)
                   database)})))})

;; Hive describe table result has commented rows to distinguish partitions
(defn- valid-describe-table-row? [{:keys [col_name data_type]}]
  (every? (every-pred (complement str/blank?)
                      (complement #(str/starts-with? % "#")))
          [col_name data_type]))

;; workaround for SPARK-9686 Spark Thrift server doesn't return correct JDBC metadata
(defmethod driver/describe-table :sparksql
  [driver {:keys [details] :as database} {table-name :name, schema :schema, :as table}]
  {:name   table-name
   :schema schema
   :fields
   (with-open [conn (jdbc/get-connection (sql-jdbc.conn/db->pooled-connection-spec database))]
     (let [results (jdbc/query {:connection conn} [(format
                                                    "describe %s"
                                                    (sql.u/quote-name driver :table
                                                      (dash-to-underscore schema)
                                                      (dash-to-underscore table-name)))])]
       (set
        (for [{col-name :col_name, data-type :data_type, :as result} results
              :when                                                  (valid-describe-table-row? result)]
          {:name          col-name
           :database-type data-type
           :base-type     (sql-jdbc.sync/database-type->base-type :hive-like (keyword data-type))}))))})

;; we need this because transactions are not supported in Hive 1.2.1
;; bound variables are not supported in Spark SQL (maybe not Hive either, haven't checked)
(defmethod driver/execute-query :sparksql
  [driver {:keys [database settings], query :native, :as outer-query}]
  (let [query (-> (assoc query
                    :remark (qputil/query->remark outer-query)
                    :query  (if (seq (:params query))
                              (unprepare/unprepare driver (cons (:query query) (:params query)))
                              (:query query))
                    :max-rows (mbql.u/query->max-rows-limit outer-query))
                  (dissoc :params))]
    (sql-jdbc.execute/do-with-try-catch
      (fn []
        (let [db-connection (sql-jdbc.conn/db->pooled-connection-spec database)]
          (hive-like/run-query-without-timezone driver settings db-connection query))))))

(defmethod driver/supports? [:sparksql :basic-aggregations]              [_ _] true)
(defmethod driver/supports? [:sparksql :binning]                         [_ _] true)
(defmethod driver/supports? [:sparksql :expression-aggregations]         [_ _] true)
(defmethod driver/supports? [:sparksql :expressions]                     [_ _] true)
(defmethod driver/supports? [:sparksql :native-parameters]               [_ _] true)
(defmethod driver/supports? [:sparksql :nested-queries]                  [_ _] true)
(defmethod driver/supports? [:sparksql :standard-deviation-aggregations] [_ _] true)

(defmethod driver/supports? [:sparksql :foreign-keys] [_ _] true)

(defmethod sql.qp/quote-style :sparksql [_] :mysql)
