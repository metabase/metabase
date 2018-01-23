(ns metabase.driver.bigqueryjdbc
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.util
             [honeysql-extensions :as hx]]))
(:import java.util.Date)

(def ^:private ^:const pattern->type
  [[#"BOOL"        :type/Boolean]
   [#"FLOAT"       :type/Float]
   [#"INT64"       :type/BigInteger]
   [#"RECORD"      :type/Dictionary]
   [#"STRING"      :type/Text]
   [#"TIME"        :type/Time]
   [#"DATE"        :type/Date]
   [#"DATETIME"    :type/DateTime]
   [#"TIMESTAMP"   :type/DateTime]])

(defn- remove-rownum-column
"Remove the `:__rownum__` column from results, if present."
[{:keys [columns rows], :as results}]
(if-not (contains? (set columns) :__rownum__)
  results
  ;; if we added __rownum__ it will always be the last column and value so we can just remove that
  {:columns (butlast columns)
    :rows    (for [row rows]
              (butlast row))}))
  
(defn- connection-details->spec
  "Setup settings to connect to a BigQuery project. Opts should include
  keys for :project, :json-path, and :service-account"
  [{:keys [project json-path service-account additional-projects],
    :as   opts}]
  (merge {:read-only? true
          :auto-commit? true
          :classname   "com.simba.googlebigquery.jdbc42.Driver" ; must be in classpath
          :subprotocol "bigquery"
          :subname     (str "//https://www.googleapis.com/bigquery/v2:443;ProjectId=" project ";OAuthType=0;OAuthPvtKeyPath=" json-path ";OAuthServiceAcctEmail=" service-account ";AdditionalProjects=" additional-projects)}
         (dissoc opts :project :json-path :service-account :additional-projects)))

(defrecord BigQueryJDBCDriver []
  clojure.lang.Named
  (getName [_] "BigQuery JDBC Driver"))

(def ^:private bigquery-date-formatter (driver/create-db-time-formatter "yyyy-MM-dd HH:mm:ss.SSSSSS"))
(def ^:private bigquery-db-time-query "select CAST(CURRENT_TIMESTAMP() AS STRING)")

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds (hsql/call :sec_to_timestamp expr)
    :milliseconds (hsql/call :msec_to_timestamp expr)))

(defn- date-interval [unit amount]
  (hsql/raw (format "(DATE_ADD(NOW(), %d, '%s'))" (int amount) (name unit))))

(defn- date-add [unit timestamp interval]
  (hsql/call :date_add timestamp interval (hx/literal unit)))

(def ^:private ->microseconds (partial hsql/call :timestamp_to_usec))

(defn- microseconds->str [format-str µs]
  (hsql/call :strftime_utc_usec µs (hx/literal format-str)))

(defn- trunc-with-format [format-str timestamp]
  (hx/->timestamp (microseconds->str format-str (->microseconds timestamp))))

(defn- date [unit expr]
  {:pre [expr]}
  (case unit
    :default expr
    :minute (trunc-with-format "%Y-%m-%d %H:%M:00" expr)
    :minute-of-hour (hx/minute expr)
    :hour (trunc-with-format "%Y-%m-%d %H:00:00" expr)
    :hour-of-day (hx/hour expr)
    :day (hx/->timestamp (hsql/call :date expr))
    :day-of-week (hsql/call :dayofweek expr)
    :day-of-month (hsql/call :day expr)
    :day-of-year (hsql/call :dayofyear expr)
    :week (date-add :day (date :day expr) (hx/- 1 (date :day-of-week expr)))
    :week-of-year (hx/week expr)
    :month (trunc-with-format "%Y-%m-01" expr)
    :month-of-year (hx/month expr)
    :quarter (date-add :month
                       (trunc-with-format "%Y-01-01" expr)
                       (hx/* (hx/dec (date :quarter-of-year expr))
                             3))
    :quarter-of-year (hx/quarter expr)
    :year (hx/year expr)))


(u/strict-extend BigQueryJDBCDriver
                 driver/IDriver
                 (merge (sql/IDriverSQLDefaultsMixin)
                        {:date-interval   (u/drop-first-arg date-interval)
                         :execute-query   (comp remove-rownum-column sqlqp/execute-query)
                         :details-fields  (constantly [{:name         "project"
                                                        :display-name "Project ID"
                                                        :placeholder  "sample-project-1"}
                                                       {:name         "json-path"
                                                        :display-name "Path to JSON key file"
                                                        :placeholder  "/app/metabase/bigquery-key.json"}
                                                       {:name         "service-account"
                                                        :display-name "Service Account Email Address"
                                                        :placeholder  "some-user@sample-project-1.iam.gserviceaccount.com"}
                                                       {:name         "additional-projects"
                                                        :display-name "Additional Projects"
                                                        :placeholder  "nyc-tlc, lookerdata, bigquery-public-data"}])
                         :features        (constantly (set/union #{:basic-aggregations
                                                                   :standard-deviation-aggregations
                                                                   :native-parameters
                                                                   :expression-aggregations
                                                                   :binning}
                                                                 (when-not config/is-test?
                                                                   ;; during unit tests don't treat bigquery as having FK
                                                                   ;; support
                                                                   #{:foreign-keys})))
                         :current-db-time (driver/make-current-db-time-fn bigquery-date-formatter bigquery-db-time-query)})

                 sql/ISQLDriver
                 (merge (sql/ISQLDriverDefaultsMixin)
                        {:column->base-type         (sql/pattern-based-column->base-type pattern->type)
                         :connection-details->spec  (u/drop-first-arg connection-details->spec)
                         :current-datetime-fn       (constantly :%current_timestamp)
                         :date                      (u/drop-first-arg date)
                         :set-timezone-sql          (constantly nil)
                         :string-length-fn          (u/drop-first-arg string-length-fn)
                         :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(defn -init-driver
  "Register the simba google bigquery driver when the JAR is found on the classpath"
  []
  ;; only register the BigQuery driver if the JDBC driver is available
  (when (u/ignore-exceptions
          (Class/forName "com.simba.googlebigquery.jdbc42.Driver"))
    (driver/register-driver! :bigqueryjdbc (BigQueryJDBCDriver.))))
