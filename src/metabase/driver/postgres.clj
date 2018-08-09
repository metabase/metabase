(ns metabase.driver.postgres
  "Database driver for PostgreSQL databases. Builds on top of the 'Generic SQL' driver, which implements most
  functionality for JDBC-based drivers."
  (:require [clojure
             [set :as set :refer [rename-keys]]
             [string :as s]]
            [clojure.java.jdbc :as jdbc]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.db.spec :as dbspec]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.util
             [honeysql-extensions :as hx]
             [ssh :as ssh]])
  (:import java.sql.Time
           java.util.UUID
           metabase.query_processor.interface.Value))

(defrecord PostgresDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "PostgreSQL"))

(def ^:private default-base-types
  "Map of default Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  {:bigint        :type/BigInteger
   :bigserial     :type/BigInteger
   :bit           :type/*
   :bool          :type/Boolean
   :boolean       :type/Boolean
   :box           :type/*
   :bpchar        :type/Text ; "blank-padded char" is the internal name of "character"
   :bytea         :type/*    ; byte array
   :cidr          :type/Text ; IPv4/IPv6 network address
   :circle        :type/*
   :citext        :type/Text ; case-insensitive text
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
   :interval      :type/*               ; time span
   :json          :type/Text
   :jsonb         :type/Text
   :line          :type/*
   :lseg          :type/*
   :macaddr       :type/Text
   :money         :type/Decimal
   :numeric       :type/Decimal
   :path          :type/*
   :pg_lsn        :type/Integer         ; PG Log Sequence #
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
   (keyword "timestamp without timezone") :type/DateTime})

(defn- column->base-type
  "Actual implementation of `column->base-type`. If `:enum-types` is passed along (usually done by our implementation
  of `describe-table` below) we'll give the column a base type of `:type/PostgresEnum` *if* it's an enum type.
  Otherwise we'll look in the static `default-base-types` map above."
  [driver column]
  (if (contains? (:enum-types driver) column)
    :type/PostgresEnum
    (default-base-types column)))

(defn- column->special-type
  "Attempt to determine the special-type of a Field given its name and Postgres column type."
  [_ column-type]
  ;; this is really, really simple right now.  if its postgres :json type then it's :type/SerializedJSON special-type
  (case column-type
    :json :type/SerializedJSON
    :inet :type/IPAddress
    nil))

(def ^:private ^:const ssl-params
  "Params to include in the JDBC connection spec for an SSL connection."
  {:ssl        true
   :sslmode    "require"
   :sslfactory "org.postgresql.ssl.NonValidatingFactory"})  ; HACK Why enable SSL if we disable certificate validation?

(def ^:private ^:const disable-ssl-params
  "Params to include in the JDBC connection spec to disable SSL."
  {:sslmode "disable"})

(defn- connection-details->spec [{ssl? :ssl, :as details-map}]
  (-> details-map
      (update :port (fn [port]
                      (if (string? port)
                        (Integer/parseInt port)
                        port)))
      ;; remove :ssl in case it's false; DB will still try (& fail) to connect if the key is there
      (dissoc :ssl)
      (merge (if ssl?
               ssl-params
               disable-ssl-params))
      (rename-keys {:dbname :db})
      dbspec/postgres
      (sql/handle-additional-options details-map)))


(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :to_timestamp expr)
    :milliseconds (recur (hx// expr 1000) :seconds)))

(defn- date-trunc [unit expr] (hsql/call :date_trunc (hx/literal unit) (hx/->timestamp expr)))
(defn- extract    [unit expr] (hsql/call :extract    unit              (hx/->timestamp expr)))

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
    :week            (hx/- (date-trunc :week (hx/+ (hx/->timestamp expr) one-day))
                           one-day)
    :week-of-year    (extract-integer :week (hx/+ (hx/->timestamp expr) one-day))
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

(defmethod sqlqp/->honeysql [PostgresDriver Value]
  [driver {value :value, {:keys [base-type database-type]} :field}]
  (when (some? value)
    (cond
      (isa? base-type :type/UUID)         (UUID/fromString value)
      (isa? base-type :type/IPAddress)    (hx/cast :inet value)
      (isa? base-type :type/PostgresEnum) (hx/quoted-cast database-type value)
      :else                               (sqlqp/->honeysql driver value))))

(defmethod sqlqp/->honeysql [PostgresDriver Time]
  [_ time-value]
  (hx/->time time-value))

(defn- string-length-fn [field-key]
  (hsql/call :char_length (hx/cast :VARCHAR field-key)))

(defn- enum-types
  "Fetch a set of the enum types associated with `database`.

     (enum-types some-db) ; -> #{:bird_type :bird_status}"
  [database]
  (set
   (map (comp keyword :typname)
        (jdbc/query (connection-details->spec (:details database))
                    [(str "SELECT DISTINCT t.typname "
                          "FROM pg_enum e "
                          "LEFT JOIN pg_type t "
                          "  ON t.oid = e.enumtypid")]))))

(defn- describe-table
  "Describe the Fields present in a `table`. This just hands off to the normal SQL driver implementation of the same
  name, but first fetches database enum types so we have access to them. These are simply assoc'ed with `driver`,
  since that argument will end up getting passed to the function that can actually do something with the enum types,
  namely `column->base-type`, which you will find above."
  [driver database table]
  (sql/describe-table (assoc driver :enum-types (enum-types database)) database table))


(def ^:private pg-date-formatters (driver/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSS zzz"))
(def ^:private pg-db-time-query "select to_char(current_timestamp, 'YYYY-MM-DD HH24:MI:SS.MS TZ')")

(def PostgresISQLDriverMixin
  "Implementations of `ISQLDriver` methods for `PostgresDriver`. This is made a 'mixin' because these implementations
  are also used by the Redshift driver."
  (merge (sql/ISQLDriverDefaultsMixin)
         {:column->base-type         column->base-type
          :column->special-type      (u/drop-first-arg column->special-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :set-timezone-sql          (constantly "SET SESSION TIMEZONE TO %s;")
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(u/strict-extend PostgresDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:current-db-time                   (driver/make-current-db-time-fn pg-db-time-query pg-date-formatters)
          :date-interval                     (u/drop-first-arg date-interval)
          :describe-table                    describe-table
          :details-fields                    (constantly (ssh/with-tunnel-config
                                                           [driver/default-host-details
                                                            (assoc driver/default-port-details :default 5432)
                                                            driver/default-dbname-details
                                                            driver/default-user-details
                                                            driver/default-password-details
                                                            driver/default-ssl-details
                                                            (assoc driver/default-additional-options-details
                                                              :placeholder "prepareThreshold=0")]))
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)})

  sql/ISQLDriver PostgresISQLDriverMixin)

(defn -init-driver
  "Register the PostgreSQL driver"
  []
  (driver/register-driver! :postgres (PostgresDriver.)))
