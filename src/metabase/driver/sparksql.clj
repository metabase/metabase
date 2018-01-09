(ns metabase.driver.sparksql
  (:require [clojure.java.jdbc :as jdbc]
            (clojure [set :as set]
                     [string :as s])
            (honeysql [core :as hsql]
                      [helpers :as h])
            [metabase.db.spec :as dbspec]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as qp]
            [metabase.driver.hive-like :as hive-like]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]))

(defn- sparksql
  "Create a database specification for a Spark SQL database. Opts should include
  keys for :db, :user, and :password. You can also optionally set host,
  port, and additional JDBC connection string options."
  [{:keys [host port db jdbc-flags]
    :or {host "localhost", port 10000, db "", jdbc-flags ""}
    :as opts}]
  ;; manually register our FixedHiveDriver with java.sql.DriverManager
  ;; and make sure it's the only driver returned for jdbc:hive2,
  ;; since we do not want to use the driver registered by the super class
  ;; of our FixedHiveDriver.
  ;;
  ;; Class/forName and invokeConstructor is required to make this compile,
  ;; but it may be possible to solve this with the right project.clj magic
  (java.sql.DriverManager/registerDriver
   (clojure.lang.Reflector/invokeConstructor
    (Class/forName "metabase.driver.FixedHiveDriver")
    (into-array [])))
  (loop []
    (when-let [driver (try
                        (java.sql.DriverManager/getDriver "jdbc:hive2://localhost:10000")
                        (catch java.sql.SQLException _
                          nil))]
      (when-not (instance? (Class/forName "metabase.driver.FixedHiveDriver") driver)
        (java.sql.DriverManager/deregisterDriver driver)
        (recur))))
  (merge {:classname "metabase.driver.FixedHiveDriver"
          :subprotocol "hive2"
          :subname (str "//" host ":" port "/" db jdbc-flags)}
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
(defn- describe-database [driver {:keys [details] :as database}]
  {:tables (with-open [conn (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
             (set (for [result (jdbc/query {:connection conn}
                                 ["show tables"])]
                    {:name (:tablename result)
                     :schema (when (> (count (:database result)) 0)
                               (:database result))})))})

;; workaround for SPARK-9686 Spark Thrift server doesn't return correct JDBC metadata
(defn- describe-table [driver {:keys [details] :as database} table]
  (with-open [conn (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
    {:name (:name table)
     :schema (:schema table)
     :fields (set (for [result (jdbc/query {:connection conn}
                                 [(if (:schema table)
                                    (format "describe `%s`.`%s`"
                                            (dash-to-underscore (:schema table))
                                            (dash-to-underscore (:name table)))
                                    (str "describe " (dash-to-underscore (:name table))))])]
                    {:name (:col_name result)
                     :database-type (:data_type result)
                     :base-type (hive-like/column->base-type (keyword (:data_type result)))}))}))

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
    (qp/do-with-try-catch
     (fn []
       (let [db-connection (sql/db->jdbc-connection-spec database)]
         (hive-like/run-query-without-timezone driver settings db-connection query))))))

(defrecord SparkSQLDriver []
  clojure.lang.Named
  (getName [_] "Spark SQL"))

(u/strict-extend SparkSQLDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval (u/drop-first-arg hive-like/date-interval)
          :describe-database describe-database
          :describe-table describe-table
          :describe-table-fks (constantly #{})
          :details-fields (constantly [{:name "host"
                                        :display-name "Host"
                                        :default "localhost"}
                                       {:name "port"
                                        :display-name "Port"
                                        :type :integer
                                        :default 10000}
                                       {:name "dbname"
                                        :display-name "Database name"
                                        :placeholder "default"}
                                       {:name "user"
                                        :display-name "Database username"
                                        :placeholder "What username do you use to login to the database?"}
                                       {:name "password"
                                        :display-name "Database password"
                                        :type :password
                                        :placeholder "*******"}
                                       {:name "jdbc-flags"
                                        :display-name "Additional JDBC settings, appended to the connection string"
                                        :placeholder ";transportMode=http"}])
          :execute-query execute-query
          :features (constantly #{:basic-aggregations
                                  :expression-aggregations
                                  :expressions
                                  ;;:foreign-keys
                                  :native-parameters
                                  :nested-queries
                                  :standard-deviation-aggregations})})
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-page qp/apply-page-using-row-number-for-offset
          :column->base-type (u/drop-first-arg hive-like/column->base-type)
          :connection-details->spec (u/drop-first-arg connection-details->spec)
          :date (u/drop-first-arg hive-like/date)
          :field->identifier (u/drop-first-arg hive-like/field->identifier)
          :quote-style (constantly :mysql)
          :current-datetime-fn (u/drop-first-arg (constantly hive-like/now))
          :string-length-fn (u/drop-first-arg hive-like/string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg hive-like/unix-timestamp->timestamp)}))

(driver/register-driver! :sparksql (SparkSQLDriver.))
