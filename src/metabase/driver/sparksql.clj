(ns metabase.driver.sparksql
  (:require [clojure.java.jdbc :as jdbc]
            (clojure [set :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            (honeysql [core :as hsql]
                      [helpers :as h])
            [metabase.db.spec :as dbspec]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.hive :as hive]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.query-processor.util :as qputil]))

(defn- connection-details->spec [details]
  (-> details
      (update :port (fn [port]
                      (if (string? port)
                        (Integer/parseInt port)
                        port)))
      (set/rename-keys {:dbname :db})
      dbspec/sparksql
      (sql/handle-additional-options details)))

(defn- humanize-connection-error-message [message]
  (condp re-matches message
    #"^FATAL: database \".*\" does not exist$"
    (driver/connection-error-messages :database-name-incorrect)

    #"^No suitable driver found for.*$"
    (driver/connection-error-messages :invalid-hostname)

    #"^Connection refused. Check that the hostname and port are correct and that the postmaster is accepting TCP/IP connections.$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^FATAL: .*$" ; all other FATAL messages: strip off the 'FATAL' part, capitalize, and add a period
    (let [[_ message] (re-matches #"^FATAL: (.*$)" message)]
      (str (s/capitalize message) \.))

    #".*" ; default
    message))

(defrecord SparkSQLDriver []
  clojure.lang.Named
  (getName [_] "Spark SQL"))

(u/strict-extend SparkSQLDriver
                 driver/IDriver
                 (merge (sql/IDriverSQLDefaultsMixin)
                        {:date-interval (u/drop-first-arg hive/date-interval)
                         :describe-database hive/describe-database
                         ;;:analyze-table hive/analyze-table
                         :describe-table hive/describe-table
                         :describe-table-fks hive/describe-table-fks
                         :details-fields (constantly [{:name "host"
                                                       :display-name "Host"
                                                       :default "localhost"}
                                                      {:name "port"
                                                       :display-name "Port"
                                                       :type :integer
                                                       :default 10000}
                                                      {:name "dbname"
                                                       :display-name "Database name"
                                                       :placeholder "default"
                                                       :required true}
                                                      {:name "user"
                                                       :display-name "Database username"
                                                       :placeholder "What username do you use to login to the database?"
                                                       :required true}
                                                      {:name "password"
                                                       :display-name "Database password"
                                                       :type :password
                                                       :placeholder "*******"}
                                                      ])
                         :execute-query hive/execute-query
                         :features hive/features
                         :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)})
                 sql/ISQLDriver
                 (merge (sql/ISQLDriverDefaultsMixin)
                        {:column->base-type (u/drop-first-arg hive/column->base-type)
                         :connection-details->spec (u/drop-first-arg connection-details->spec)
                         :date (u/drop-first-arg hive/date)
                         :quote-style (constantly :mysql)
                         :current-datetime-fn (u/drop-first-arg (constantly hive/now))
                         :string-length-fn (u/drop-first-arg hive/string-length-fn)
                         :unix-timestamp->timestamp (u/drop-first-arg hive/unix-timestamp->timestamp)}))

(driver/register-driver! :sparksql (SparkSQLDriver.))

(defn sparksql
  "Create a database specification for a Spark SQL database. Opts should include
  keys for :db, :user, and :password. You can also optionally set host and
  port."
  [opts]
  (hive/hive opts))
