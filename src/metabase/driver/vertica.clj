
(ns metabase.driver.vertica
  ;; TODO - rework this to be like newer-style namespaces that use `u/drop-first-arg`
  (:require [clojure.java.jdbc :as jdbc]
            (clojure [set :refer [rename-keys], :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.db.spec :as dbspec]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]))

(defn- column->base-type
  "Map of Vertica column types -> Field base types.
   Add more mappings here as you come across them."
  [column-type]
  ({:Boolean        :type/Boolean
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
    (keyword "Long Varchar")    :type/Text
    (keyword "Long Varbinary")  :type/*}
   column-type))

(defn- connection-details->spec [{:keys [ssl] :as details-map}]
  (-> details-map
      (update :port (fn [port]
                      (if (string? port) (Integer/parseInt port)
                          port)))
      (dissoc :ssl)               ; remove :ssl in case it's false; DB will still try (& fail) to connect if the key is there
      (rename-keys {:dbname :db})
      dbspec/vertica))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :to_timestamp expr)
    :milliseconds (recur (hx// expr 1000) :seconds)))

(defn- date-trunc [unit expr] (hsql/call :date_trunc (hx/literal unit) expr))
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
    :week            (hx/- (date-trunc :week (hx/+ expr one-day))
                           one-day)
    :week-of-year    (extract-integer :week (hx/+ expr one-day))
    :month           (date-trunc :month expr)
    :month-of-year   (extract-integer :month expr)
    :quarter         (date-trunc :quarter expr)
    :quarter-of-year (extract-integer :quarter expr)
    :year            (extract-integer :year expr)))

(defn- date-interval [unit amount]
  (hsql/raw (format "(NOW() + INTERVAL '%d %s')" (int amount) (name unit))))

(defn- humanize-connection-error-message [message]
  (condp re-matches message
    #"^FATAL: database \".*\" does not exist$"
    (driver/connection-error-messages :database-name-incorrect)

    #"^No suitable driver found for.*$"
    (driver/connection-error-messages :invalid-hostname)

    #"^Connection refused. Check that the hostname and port are correct and that the postmaster is accepting TCP/IP connections.$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^FATAL: role \".*\" does not exist$"
    (driver/connection-error-messages :username-incorrect)

    #"^FATAL: password authentication failed for user.*$"
    (driver/connection-error-messages :password-incorrect)

    #"^FATAL: .*$" ; all other FATAL messages: strip off the 'FATAL' part, capitalize, and add a period
    (let [[_ message] (re-matches #"^FATAL: (.*$)" message)]
      (str (s/capitalize message) \.))

    #".*" ; default
    message))

(defn- prepare-value [{value :value, {:keys [base-type]} :field}]
  (if (and (= base-type :UUIDField)
           value)
    (java.util.UUID/fromString value)
    value))


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
  clojure.lang.Named
  (getName [_] "Vertica"))

(def VerticaISQLDriverMixin
  "Implementations of `ISQLDriver` methods for `VerticaDriver`."
  (merge (sql/ISQLDriverDefaultsMixin)
         {:column->base-type         (u/drop-first-arg column->base-type)
          ;; :column->special-type      (u/drop-first-arg column->special-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :prepare-value             (u/drop-first-arg prepare-value)
          :set-timezone-sql          (constantly "SET TIME ZONE TO ?;")
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(u/strict-extend VerticaDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval                     (u/drop-first-arg date-interval)
          :describe-database                 describe-database
          :details-fields                    (constantly [{:name         "host"
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
                                                          {:name         "ssl"
                                                           :display-name "Use a secure connection (SSL)?"
                                                           :type         :boolean
                                                           :default      false}])
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)})
  sql/ISQLDriver
  VerticaISQLDriverMixin)


;; only register the Vertica driver if the JDBC driver is available
(when (u/ignore-exceptions
        (Class/forName "com.vertica.jdbc.Driver"))
  (driver/register-driver! :vertica (VerticaDriver.)))


