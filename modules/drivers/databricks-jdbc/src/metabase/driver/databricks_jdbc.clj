(ns metabase.driver.databricks-jdbc
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util :as sql.u]
            [metabase.driver.sql.util.unprepare :as unprepare]
            #_[metabase.mbql.util :as mbql.u]
            [metabase.query-processor.util :as qp.util])
  (:import [java.sql Connection ResultSet]))

(set! *warn-on-reflection* true)

(driver/register! :databricks-jdbc, :parent :sql-jdbc)

(defmethod sql-jdbc.conn/connection-details->spec :databricks-jdbc
  [_ {:keys [host http-path token catalog schema]}]
  {:classname        "com.databricks.client.jdbc.Driver"
   :subprotocol      "databricks"
   :subname          (str "//" host ":443/" schema)
   :transportMode    "http"
   :ssl              1
   :AuthMech         3
   :httpPath         http-path
   :uid              "token"
   :pwd              token
   "ConnCatalog" catalog
   ;; TODO: Remove when logging exceptions are handled.
   "LogLevel" 0})

(defmethod sql-jdbc.conn/data-warehouse-connection-pool-properties :databricks-jdbc
  [driver database]
  (merge
   ((get-method sql-jdbc.conn/data-warehouse-connection-pool-properties :sql-jdbc) driver database)
   {"preferredTestQuery" "SELECT 1"}))

(defmethod sql-jdbc.sync/database-type->base-type :databricks-jdbc
  [_ database-type]
  (condp re-matches (str/lower-case (name database-type))
    #"boolean"          :type/Boolean
    #"tinyint"          :type/Integer
    #"smallint"         :type/Integer
    #"int"              :type/Integer
    #"bigint"           :type/BigInteger
    #"float"            :type/Float
    #"double"           :type/Float
    #"double precision" :type/Double
    #"decimal.*"        :type/Decimal
    #"char.*"           :type/Text
    #"varchar.*"        :type/Text
    #"string.*"         :type/Text
    #"binary*"          :type/*
    #"date"             :type/Date
    #"time"             :type/Time
    #"timestamp"        :type/DateTime
    #"interval"         :type/*
    #"array.*"          :type/Array
    #"map"              :type/Dictionary
    #".*"               :type/*))

(defmethod driver/describe-database :databricks-jdbc
  [_ database]
  {:tables
   (with-open [conn (jdbc/get-connection (sql-jdbc.conn/db->pooled-connection-spec database))]
     (set
      (for [{:keys [database tablename], table-namespace :namespace} (jdbc/query {:connection conn} ["show tables"])]
        {:name   tablename
         :schema (or (not-empty database)
                     (not-empty table-namespace))})))})

(defn- valid-describe-table-row? [{:keys [col_name data_type]}]
  (every? (every-pred (complement str/blank?)
                      (complement #(str/starts-with? % "#")))
          [col_name data_type]))

(defn- dash-to-underscore [s]
  (when s
    (str/replace s #"-" "_")))

(defmethod driver/describe-table :databricks-jdbc
  [driver database {table-name :name, schema :schema}]
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
        (for [[idx {col-name :col_name, data-type :data_type, :as result}] (m/indexed results)
              :while (valid-describe-table-row? result)]
          {:name              col-name
           :database-type     data-type
           :base-type         (sql-jdbc.sync/database-type->base-type :databricks-jdbc (keyword data-type))
           :database-position idx}))))})

(def ^:dynamic *param-splice-style*
  "How we should splice params into SQL (i.e. 'unprepare' the SQL). Either `:friendly` (the default) or `:paranoid`.
  `:friendly` makes a best-effort attempt to escape strings and generate SQL that is nice to look at, but should not
  be considered safe against all SQL injection -- use this for 'convert to SQL' functionality. `:paranoid` hex-encodes
  strings so SQL injection is impossible; this isn't nice to look at, so use this for actually running a query."
  :friendly)

;; bound variables are not supported in Spark SQL (maybe not Hive either, haven't checked)
(defmethod driver/execute-reducible-query :databricks-jdbc
  [driver {{sql :query, :keys [params], :as inner-query} :native, :as outer-query} context respond]
  (let [inner-query (-> (assoc inner-query
                               :remark (qp.util/query->remark :databricks-jdbc outer-query)
                               :query  (if (seq params)
                                         (binding [*param-splice-style* :paranoid]
                                           (unprepare/unprepare driver (cons sql params)))
                                         sql)
                               ;; TODO: mbql u inaccessible, resolve!
                               :max-rows 1000 #_(mbql.u/query->max-rows-limit outer-query))
                        (dissoc :params))
        query       (assoc outer-query :native inner-query)]
    ((get-method driver/execute-reducible-query :sql-jdbc) driver query context respond)))

(defmethod sql-jdbc.execute/connection-with-timezone :databricks-jdbc
  [driver database _timezone-id]
  (let [conn (.getConnection (sql-jdbc.execute/datasource-with-diagnostic-info! driver database))]
    (try
      (.setTransactionIsolation conn Connection/TRANSACTION_READ_UNCOMMITTED)
      conn
      (catch Throwable e
        (.close conn)
        (throw e)))))

(defmethod sql-jdbc.execute/prepared-statement :databricks-jdbc
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

(defmethod sql-jdbc.execute/statement-supported? :databricks-jdbc [_] false)

(doseq [[feature supported?] {:basic-aggregations              true
                              :binning                         true
                              :expression-aggregations         true
                              :expressions                     true
                              :native-parameters               true
                              :nested-queries                  true
                              :standard-deviation-aggregations true
                              :test/jvm-timezone-setting       false}]
  (defmethod driver/database-supports? [:databricks-jdbc feature] [_driver _feature _db] supported?))

(when-not (get (methods driver/database-supports?) [:databricks-jdbc :foreign-keys])
  (defmethod driver/database-supports? [:databricks-jdbc :foreign-keys] [_driver _feature _db] true))

(defmethod sql.qp/quote-style :databricks-jdbc
  [_driver]
  :mysql)
