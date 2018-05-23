(ns metabase.driver.vertica
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]
             [ssh :as ssh]]))

(def ^:private ^:const column->base-type
  "Map of Vertica column types -> Field base types. Add more mappings here as you come across them."
  {:Boolean        :type/Boolean
   :Integer        :type/Integer
   :Bigint         :type/BigInteger
   :Varbinary      :type/*
   :Binary         :type/*
   :Char           :type/Text
   :Varchar        :type/Text
   :Money          :type/Decimal
   :Numeric        :type/Decimal
   :Double         :type/Decimal
   :Float          :type/Float
   :Date           :type/Date
   :Time           :type/Time
   :TimeTz         :type/Time
   :Timestamp      :type/DateTime
   :TimestampTz    :type/DateTime
   :AUTO_INCREMENT :type/Integer
   (keyword "Long Varchar")   :type/Text
   (keyword "Long Varbinary") :type/*})

(defn- connection-details->spec [{:keys [host port db dbname]
                                  :or   {host "localhost", port 5433, db ""}
                                  :as   details}]
  (-> (merge {:classname   "com.vertica.jdbc.Driver"
              :subprotocol "vertica"
              :subname     (str "//" host ":" port "/" (or dbname db))}
             (dissoc details :host :port :dbname :db :ssl))
      (sql/handle-additional-options details)))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :to_timestamp expr)
    :milliseconds (recur (hx// expr 1000) :seconds)))

(defn- cast-timestamp
  "Vertica requires stringified timestamps (what Date/DateTime/Timestamps are converted to) to be cast as timestamps
  before date operations can be performed. This function will add that cast if it is a timestamp, otherwise this is a
  noop."
  [expr]
  (if (du/is-temporal? expr)
    (hx/cast :timestamp expr)
    expr))

(defn- date-trunc [unit expr] (hsql/call :date_trunc (hx/literal unit) (cast-timestamp expr)))
(defn- extract    [unit expr] (hsql/call :extract    unit              expr))

(def ^:private extract-integer (comp hx/->integer extract))

(def ^:private ^:const one-day (hsql/raw "INTERVAL '1 day'"))

(defn- date [unit expr]
  (case unit
    :default         expr
    :minute          (date-trunc :minute expr)
    :minute-of-hour  (extract-integer :minute expr)
    :hour            (date-trunc :hour expr)
    :hour-of-day     (extract-integer :hour expr)
    :day             (hx/->date expr)
    :day-of-week     (hx/inc (extract-integer :dow expr))
    :day-of-month    (extract-integer :day expr)
    :day-of-year     (extract-integer :doy expr)
    :week            (hx/- (date-trunc :week (hx/+ (cast-timestamp expr)
                                                   one-day))
                           one-day)
    ;:week-of-year    (extract-integer :week (hx/+ expr one-day))
    :week-of-year    (hx/week expr)
    :month           (date-trunc :month expr)
    :month-of-year   (extract-integer :month expr)
    :quarter         (date-trunc :quarter expr)
    :quarter-of-year (extract-integer :quarter expr)
    :year            (extract-integer :year expr)))

(defn- date-interval [unit amount]
  (hsql/raw (format "(NOW() + INTERVAL '%d %s')" (int amount) (name unit))))

(defn- materialized-views
  "Fetch the Materialized Views for a Vertica DATABASE.
   These are returned as a set of maps, the same format as `:tables` returned by `describe-database`."
  [database]
  (try (set (jdbc/query (sql/db->jdbc-connection-spec database)
                        ["SELECT TABLE_SCHEMA AS \"schema\", TABLE_NAME AS \"name\" FROM V_CATALOG.VIEWS;"]))
       (catch Throwable e
         (log/error "Failed to fetch materialized views for this database:" (.getMessage e)))))

(defn- describe-database
  "Custom implementation of `describe-database` for Vertica."
  [driver database]
  (update (sql/describe-database driver database) :tables (u/rpartial set/union (materialized-views database))))

(defn- string-length-fn [field-key]
  (hsql/call :char_length (hx/cast :Varchar field-key)))


(defrecord VerticaDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "Vertica"))

(def ^:private vertica-date-formatters (driver/create-db-time-formatters "yyyy-MM-dd HH:mm:ss z"))
(def ^:private vertica-db-time-query "select to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS TZ')")

(u/strict-extend VerticaDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval     (u/drop-first-arg date-interval)
          :describe-database describe-database
          :details-fields    (constantly (ssh/with-tunnel-config
                                           [{:name         "host"
                                             :display-name "Host"
                                             :default      "localhost"}
                                            {:name         "port"
                                             :display-name "Port"
                                             :type         :integer
                                             :default      5433}
                                            {:name         "dbname"
                                             :display-name "Database name"
                                             :placeholder  "birds_of_the_word"
                                             :required     true}
                                            {:name         "user"
                                             :display-name "Database username"
                                             :placeholder  "What username do you use to login to the database?"
                                             :required     true}
                                            {:name         "password"
                                             :display-name "Database password"
                                             :type         :password
                                             :placeholder  "*******"}
                                            {:name         "additional-options"
                                             :display-name "Additional JDBC connection string options"
                                             :placeholder  "ConnectionLoadBalance=1"}]))
          :current-db-time   (driver/make-current-db-time-fn vertica-db-time-query vertica-date-formatters)})
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:column->base-type         (u/drop-first-arg column->base-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :set-timezone-sql          (constantly "SET TIME ZONE TO %s;")
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(defn -init-driver
  "Register the Vertica driver when found on the classpath"
  []
  ;; only register the Vertica driver if the JDBC driver is available
  (when (u/ignore-exceptions
         (Class/forName "com.vertica.jdbc.Driver"))
    (driver/register-driver! :vertica (VerticaDriver.))))
