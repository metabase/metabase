(ns metabase.driver.postgres
  "Database driver for PostgreSQL databases. Builds on top of the SQL JDBC driver, which implements most functionality
  for JDBC-based drivers."
  (:require [clojure
             [set :as set :refer [rename-keys]]
             [string :as s]]
            [clojure.java.jdbc :as jdbc]
            [honeysql.core :as hsql]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util
             [honeysql-extensions :as hx]
             [ssh :as ssh]])
  (:import java.sql.Time
           java.util.UUID))

(driver/register! :postgres, :parent :sql-jdbc)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/display-name :postgres [_] "PostgreSQL")


(defmethod driver/date-interval :postgres [_ unit amount]
  (hsql/raw (format "(NOW() + INTERVAL '%d %s')" (int amount) (name unit))))

(defmethod driver/humanize-connection-error-message :postgres [_ message]
  (condp re-matches message
    #"^FATAL: database \".*\" does not exist$"
    (driver.common/connection-error-messages :database-name-incorrect)

    #"^No suitable driver found for.*$"
    (driver.common/connection-error-messages :invalid-hostname)

    #"^Connection refused. Check that the hostname and port are correct and that the postmaster is accepting TCP/IP connections.$"
    (driver.common/connection-error-messages :cannot-connect-check-host-and-port)

    #"^FATAL: role \".*\" does not exist$"
    (driver.common/connection-error-messages :username-incorrect)

    #"^FATAL: password authentication failed for user.*$"
    (driver.common/connection-error-messages :password-incorrect)

    #"^FATAL: .*$" ; all other FATAL messages: strip off the 'FATAL' part, capitalize, and add a period
    (let [[_ message] (re-matches #"^FATAL: (.*$)" message)]
      (str (s/capitalize message) \.))

    #".*" ; default
    message))

(defmethod driver.common/current-db-time-date-formatters :postgres [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSS zzz"))

(defmethod driver.common/current-db-time-native-query :postgres [_]
  "select to_char(current_timestamp, 'YYYY-MM-DD HH24:MI:SS.MS TZ')")

(defmethod driver/current-db-time :postgres [& args]
  (apply driver.common/current-db-time args))


(defmethod driver/connection-properties :postgres [_]
  (ssh/with-tunnel-config
    [driver.common/default-host-details
     (assoc driver.common/default-port-details :default 5432)
     driver.common/default-dbname-details
     driver.common/default-user-details
     driver.common/default-password-details
     driver.common/default-ssl-details
     (assoc driver.common/default-additional-options-details
       :placeholder "prepareThreshold=0")]))


(defn- enum-types [driver database]
  (set
   (map (comp keyword :typname)
        (jdbc/query (sql-jdbc.conn/connection-details->spec driver (:details database))
                    [(str "SELECT DISTINCT t.typname "
                          "FROM pg_enum e "
                          "LEFT JOIN pg_type t "
                          "  ON t.oid = e.enumtypid")]))))

(def ^:private ^:dynamic *enum-types* nil)

;; Describe the Fields present in a `table`. This just hands off to the normal SQL driver implementation of the same
;; name, but first fetches database enum types so we have access to them. These are simply binded to the dynamic var
;; and used later in `database-type->base-type`, which you will find below.
(defmethod driver/describe-table :postgres [driver database table]
  (binding [*enum-types* (enum-types driver database)]
    (sql-jdbc.sync/describe-table driver database table)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/unix-timestamp->timestamp [:postgres :seconds] [_ _ expr]
  (hsql/call :to_timestamp expr))


(defn- date-trunc [unit expr] (hsql/call :date_trunc (hx/literal unit) (hx/->timestamp expr)))
(defn- extract    [unit expr] (hsql/call :extract    unit              (hx/->timestamp expr)))

(def ^:private extract-integer (comp hx/->integer extract))

(def ^:private ^:const one-day (hsql/raw "INTERVAL '1 day'"))

(defmethod sql.qp/date [:postgres :default]        [_ _ expr] expr)
(defmethod sql.qp/date [:postgres :minute]         [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:postgres :minute-of-hour] [_ _ expr] (extract-integer :minute expr))
(defmethod sql.qp/date [:postgres :hour]           [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:postgres :hour-of-day]    [_ _ expr] (extract-integer :hour expr))
(defmethod sql.qp/date [:postgres :day]            [_ _ expr] (hx/->date expr))
;; Postgres DOW is 0 (Sun) - 6 (Sat); increment this to be consistent with Java, H2, MySQL, and Mongo (1-7)
(defmethod sql.qp/date [:postgres :day-of-week]     [_ _ expr] (hx/inc (extract-integer :dow expr)))
(defmethod sql.qp/date [:postgres :day-of-month]    [_ _ expr] (extract-integer :day expr))
(defmethod sql.qp/date [:postgres :day-of-year]     [_ _ expr] (extract-integer :doy expr))
;; Postgres weeks start on Monday, so shift this date into the proper bucket and then decrement the resulting day
(defmethod sql.qp/date [:postgres :week]            [_ _ expr] (hx/- (date-trunc :week (hx/+ (hx/->timestamp expr)
                                                                                             one-day))
                                                                     one-day))
(defmethod sql.qp/date [:postgres :week-of-year]    [_ _ expr] (extract-integer :week (hx/+ (hx/->timestamp expr)
                                                                                            one-day)))
(defmethod sql.qp/date [:postgres :month]           [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:postgres :month-of-year]   [_ _ expr] (extract-integer :month expr))
(defmethod sql.qp/date [:postgres :quarter]         [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:postgres :quarter-of-year] [_ _ expr] (extract-integer :quarter expr))
(defmethod sql.qp/date [:postgres :year]            [_ _ expr] (extract-integer :year expr))


(defmethod sql.qp/->honeysql [:postgres :value] [driver value]
  (let [[_ value {base-type :base_type, database-type :database_type}] value]
    (when (some? value)
      (cond
        (isa? base-type :type/UUID)         (UUID/fromString value)
        (isa? base-type :type/IPAddress)    (hx/cast :inet value)
        (isa? base-type :type/PostgresEnum) (hx/quoted-cast database-type value)
        :else                               (sql.qp/->honeysql driver value)))))

(defmethod sql.qp/->honeysql [:postgres Time]
  [_ time-value]
  (hx/->time time-value))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

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

(defmethod sql-jdbc.sync/database-type->base-type :postgres [driver column]
  (if (contains? *enum-types* column)
    :type/PostgresEnum
    (default-base-types column)))

(defmethod sql-jdbc.sync/column->special-type :postgres [_ database-type _]
  ;; this is really, really simple right now.  if its postgres :json type then it's :type/SerializedJSON special-type
  (case database-type
    "json" :type/SerializedJSON
    "inet" :type/IPAddress
    nil))

(def ^:private ^:const ssl-params
  "Params to include in the JDBC connection spec for an SSL connection."
  {:ssl        true
   :sslmode    "require"
   :sslfactory "org.postgresql.ssl.NonValidatingFactory"})  ; HACK Why enable SSL if we disable certificate validation?

(def ^:private ^:const disable-ssl-params
  "Params to include in the JDBC connection spec to disable SSL."
  {:sslmode "disable"})

(defmethod sql-jdbc.conn/connection-details->spec :postgres [_ {ssl? :ssl, :as details-map}]
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
      db.spec/postgres
      (sql-jdbc.common/handle-additional-options details-map)))


(defmethod sql-jdbc.execute/set-timezone-sql :postgres [_]
  "SET SESSION TIMEZONE TO %s;")
