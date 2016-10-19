(ns metabase.driver.postgres
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
            [metabase.util.honeysql-extensions :as hx])
  ;; This is necessary for when NonValidatingFactory is passed in the sslfactory connection string argument,
  ;; e.x. when connecting to a Heroku Postgres database from outside of Heroku.
  (:import java.util.UUID
           org.postgresql.ssl.NonValidatingFactory))

(defn- column->base-type
  "Map of Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  [column-type]
  ({:bigint        :type/BigInteger
    :bigserial     :type/BigInteger
    :bit           :type/*
    :bool          :type/Boolean
    :boolean       :type/Boolean
    :box           :type/*
    :bpchar        :type/Text       ; "blank-padded char" is the internal name of "character"
    :bytea         :type/*          ; byte array
    :cidr          :type/Text       ; IPv4/IPv6 network address
    :circle        :type/*
    :date          :type/Date
    :decimal       :type/Decimal
    :float4        :type/Float
    :float8        :type/Float
    :geometry      :type/*
    :inet          :type/IPAddress
    :int           :type/Integer
    :int2          :type/Integer
    :int4          :type/Integer
    :int8          :type/BigInteger
    :interval      :type/*          ; time span
    :json          :type/Text
    :jsonb         :type/Text
    :line          :type/*
    :lseg          :type/*
    :macaddr       :type/Text
    :money         :type/Decimal
    :numeric       :type/Decimal
    :path          :type/*
    :pg_lsn        :type/Integer    ; PG Log Sequence #
    :point         :type/*
    :real          :type/Float
    :serial        :type/Integer
    :serial2       :type/Integer
    :serial4       :type/Integer
    :serial8       :type/BigInteger
    :smallint      :type/Integer
    :smallserial   :type/Integer
    :text          :type/Text
    :time          :type/Time
    :timetz        :type/Time
    :timestamp     :type/DateTime
    :timestamptz   :type/DateTime
    :tsquery       :type/*
    :tsvector      :type/*
    :txid_snapshot :type/*
    :uuid          :type/UUID
    :varbit        :type/*
    :varchar       :type/Text
    :xml           :type/Text
    (keyword "bit varying")                :type/*
    (keyword "character varying")          :type/Text
    (keyword "double precision")           :type/Float
    (keyword "time with time zone")        :type/Time
    (keyword "time without time zone")     :type/Time
    (keyword "timestamp with timezone")    :type/DateTime
    (keyword "timestamp without timezone") :type/DateTime} column-type))

(defn- column->special-type
  "Attempt to determine the special-type of a Field given its name and Postgres column type."
  [column-name column-type]
  ;; this is really, really simple right now.  if its postgres :json type then it's :type/SerializedJSON special-type
  (case column-type
    :json :type/SerializedJSON
    :inet :type/IPAddress
    nil))

(def ^:const ssl-params
  "Params to include in the JDBC connection spec for an SSL connection."
  {:ssl        true
   :sslmode    "require"
   :sslfactory "org.postgresql.ssl.NonValidatingFactory"})  ; HACK Why enable SSL if we disable certificate validation?

(def ^:const disable-ssl-params
  "Params to include in the JDBC connection spec to disable SSL."
  {:sslmode "disable"})

(defn- connection-details->spec [{:keys [ssl] :as details-map}]
  (-> details-map
      (update :port (fn [port]
                      (if (string? port) (Integer/parseInt port)
                          port)))
      (dissoc :ssl)               ; remove :ssl in case it's false; DB will still try (& fail) to connect if the key is there
      (merge (if ssl
               ssl-params
               disable-ssl-params))
      (rename-keys {:dbname :db})
      dbspec/postgres))

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
    ;; Postgres DOW is 0 (Sun) - 6 (Sat); increment this to be consistent with Java, H2, MySQL, and Mongo (1-7)
    :day-of-week     (hx/inc (extract-integer :dow expr))
    :day-of-month    (extract-integer :day expr)
    :day-of-year     (extract-integer :doy expr)
    ;; Postgres weeks start on Monday, so shift this date into the proper bucket and then decrement the resulting day
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
  (if-not value
    value
    (cond
      (isa? base-type :type/UUID)      (UUID/fromString value)
      (isa? base-type :type/IPAddress) (hx/cast :inet value)
      :else                            value)))


(defn- materialized-views
  "Fetch the Materialized Views for a Postgres DATABASE.
   These are returned as a set of maps, the same format as `:tables` returned by `describe-database`."
  [database]
  (try (set (jdbc/query (sql/db->jdbc-connection-spec database)
                        ["SELECT schemaname AS \"schema\", matviewname AS \"name\" FROM pg_matviews;"]))
       (catch Throwable e
         (log/error "Failed to fetch materialized views for this database:" (.getMessage e)))))

(defn- describe-database
  "Custom implementation of `describe-database` for Postgres.
   Postgres Materialized Views are not returned by normal JDBC methods: see [issue #2355](https://github.com/metabase/metabase/issues/2355); we have to manually fetch them.
   This implementation combines the results from the generic SQL default implementation with materialized views fetched from `materialized-views`."
  [driver database]
  (update (sql/describe-database driver database) :tables (u/rpartial set/union (materialized-views database))))

(defn- string-length-fn [field-key]
  (hsql/call :char_length (hx/cast :VARCHAR field-key)))


(defrecord PostgresDriver []
  clojure.lang.Named
  (getName [_] "PostgreSQL"))

(def PostgresISQLDriverMixin
  "Implementations of `ISQLDriver` methods for `PostgresDriver`."
  (merge (sql/ISQLDriverDefaultsMixin)
         {:column->base-type         (u/drop-first-arg column->base-type)
          :column->special-type      (u/drop-first-arg column->special-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :prepare-value             (u/drop-first-arg prepare-value)
          :set-timezone-sql          (constantly "UPDATE pg_settings SET setting = ? WHERE name ILIKE 'timezone';")
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(u/strict-extend PostgresDriver
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
                                                           :default      5432}
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

  sql/ISQLDriver PostgresISQLDriverMixin)

(driver/register-driver! :postgres (PostgresDriver.))
