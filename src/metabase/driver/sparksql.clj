(ns metabase.driver.sparksql
  (:require [clojure
             [set :as set]
             [string :as s]]
            [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver
             [generic-sql :as sql]
             [hive-like :as hive-like]]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor
             [store :as qp.store]
             [util :as qputil]]
            [metabase.util
             [honeysql-extensions :as hx]
             [i18n :refer [trs tru]]])
  (:import clojure.lang.Reflector
           java.sql.DriverManager))

(defrecord SparkSQLDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "Spark SQL"))


;;; ------------------------------------------ Custom HoneySQL Clause Impls ------------------------------------------

(def ^:private source-table-alias
  "Default alias for all source tables. (Not for source queries; those still use the default SQL QP alias of `source`.)"
  "t1")

(defmethod sqlqp/->honeysql [SparkSQLDriver (class Field)]
  [driver field]
  (let [table            (qp.store/table (:table_id field))
        table-name       (if (:alias? table)
                           (:name table)
                           source-table-alias)
        field-identifier (keyword (hx/qualify-and-escape-dots table-name (:name field)))]
    (sqlqp/cast-unix-timestamp-field-if-needed driver field field-identifier)))

(defn- apply-page-using-row-number-for-offset
  "Apply `page` clause to HONEYSQL-FROM, using row_number() for drivers that do not support offsets"
  [honeysql-form {{:keys [items page]} :page}]
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

(defn- apply-source-table
  [honeysql-form {source-table-id :source-table}]
  (let [{table-name :name, schema :schema} (qp.store/table source-table-id)]
    (h/from honeysql-form [(hx/qualify-and-escape-dots schema table-name) source-table-alias])))


;;; ------------------------------------------- Other Driver Method Impls --------------------------------------------

(defn- sparksql
  "Create a database specification for a Spark SQL database."
  [{:keys [host port db jdbc-flags]
    :or   {host "localhost", port 10000, db "", jdbc-flags ""}
    :as   opts}]
  (merge {:classname   "metabase.driver.FixedHiveDriver"
          :subprotocol "hive2"
          :subname     (str "//" host ":" port "/" db jdbc-flags)}
         (dissoc opts :host :port :jdbc-flags)))

(defn- connection-details->spec [details]
  (-> details
      (update :port (fn [port]
                      (if (string? port)
                        (Integer/parseInt port)
                        port)))
      (set/rename-keys {:dbname :db})
      sparksql
      (sql/handle-additional-options details)))

(defn- dash-to-underscore [s]
  (when s
    (s/replace s #"-" "_")))

;; workaround for SPARK-9686 Spark Thrift server doesn't return correct JDBC metadata
(defn- describe-database [_ {:keys [details] :as database}]
  {:tables (with-open [conn (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
             (set (for [result (jdbc/query {:connection conn}
                                           ["show tables"])]
                    {:name   (:tablename result)
                     :schema (when (> (count (:database result)) 0)
                               (:database result))})))})

;; workaround for SPARK-9686 Spark Thrift server doesn't return correct JDBC metadata
(defn- describe-table [_ {:keys [details] :as database} table]
  (with-open [conn (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
    {:name   (:name table)
     :schema (:schema table)
     :fields (set (for [result (jdbc/query {:connection conn}
                                           [(if (:schema table)
                                              (format "describe `%s`.`%s`"
                                                      (dash-to-underscore (:schema table))
                                                      (dash-to-underscore (:name table)))
                                              (str "describe " (dash-to-underscore (:name table))))])]
                    {:name          (:col_name result)
                     :database-type (:data_type result)
                     :base-type     (hive-like/column->base-type (keyword (:data_type result)))}))}))

;; we need this because transactions are not supported in Hive 1.2.1
;; bound variables are not supported in Spark SQL (maybe not Hive either, haven't checked)
(defn- execute-query
  "Process and run a native (raw SQL) QUERY."
  [driver {:keys [database settings], query :native, :as outer-query}]
  (let [query (-> (assoc query :remark (qputil/query->remark outer-query))
                  (assoc :query (if (seq (:params query))
                                  (hive-like/unprepare (cons (:query query) (:params query)))
                                  (:query query)))
                  (dissoc :params))]
    (sqlqp/do-with-try-catch
     (fn []
       (let [db-connection (sql/db->jdbc-connection-spec database)]
         (hive-like/run-query-without-timezone driver settings db-connection query))))))


(u/strict-extend SparkSQLDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval      (u/drop-first-arg hive-like/date-interval)
          :describe-database  describe-database
          :describe-table     describe-table
          :describe-table-fks (constantly #{})
          :details-fields     (constantly [driver/default-host-details
                                           (assoc driver/default-port-details :default 10000)
                                           (assoc driver/default-dbname-details :placeholder (tru "default"))
                                           driver/default-user-details
                                           driver/default-password-details
                                           (assoc driver/default-additional-options-details
                                             :name        "jdbc-flags"
                                             :placeholder ";transportMode=http")])
          :execute-query      execute-query
          :features           (constantly (set/union #{:basic-aggregations
                                                       :binning
                                                       :expression-aggregations
                                                       :expressions
                                                       :native-parameters
                                                       :native-query-params
                                                       :nested-queries
                                                       :standard-deviation-aggregations}
                                                     (when-not config/is-test?
                                                       ;; during unit tests don't treat Spark SQL as having FK support
                                                       #{:foreign-keys})))})
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-page                (u/drop-first-arg apply-page-using-row-number-for-offset)
          :apply-source-table        (u/drop-first-arg apply-source-table)
          :column->base-type         (u/drop-first-arg hive-like/column->base-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg hive-like/date)
          :field->identifier         (u/drop-first-arg hive-like/field->identifier)
          :quote-style               (constantly :mysql)
          :current-datetime-fn       (u/drop-first-arg (constantly hive-like/now))
          :string-length-fn          (u/drop-first-arg hive-like/string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg hive-like/unix-timestamp->timestamp)}))

(defn- register-hive-jdbc-driver! [& {:keys [remaining-tries], :or {remaining-tries 5}}]
  ;; manually register our FixedHiveDriver with java.sql.DriverManager
  (DriverManager/registerDriver
   (Reflector/invokeConstructor
    (Class/forName "metabase.driver.FixedHiveDriver")
    (into-array [])))
  ;; now make sure it's the only driver returned
  ;; for jdbc:hive2, since we do not want to use the driver registered by the super class of our FixedHiveDriver.
  (when-let [driver (u/ignore-exceptions
                      (DriverManager/getDriver "jdbc:hive2://localhost:10000"))]
    (let [registered? (instance? (Class/forName "metabase.driver.FixedHiveDriver") driver)]
      (cond
        registered?
        true

        ;; if it's not the registered driver, deregister the current driver (if applicable) and try a couple more times
        ;; before giving up :(
        (and (not registered?)
             (> remaining-tries 0))
        (do
          (when driver
            (DriverManager/deregisterDriver driver))
          (recur {:remaining-tries (dec remaining-tries)}))

        :else
        (log/error
         (trs "Error: metabase.driver.FixedHiveDriver is registered, but JDBC does not seem to be using it."))))))

(defn -init-driver
  "Register the SparkSQL driver if the SparkSQL dependencies are available."
  []
  (when (u/ignore-exceptions (Class/forName "metabase.driver.FixedHiveDriver"))
    (log/info (trs "Found metabase.driver.FixedHiveDriver."))
    (when (u/ignore-exceptions (register-hive-jdbc-driver!))
      (log/info (trs "Successfully registered metabase.driver.FixedHiveDriver with JDBC."))
      (driver/register-driver! :sparksql (SparkSQLDriver.)))))
