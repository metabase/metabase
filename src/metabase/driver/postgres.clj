(ns metabase.driver.postgres
  "Database driver for PostgreSQL databases. Builds on top of the SQL JDBC driver, which implements most functionality
  for JDBC-based drivers."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [java-time :as t]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.models :refer [Field]]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.ssh :as ssh]
            [pretty.core :refer [PrettyPrintable]])
  (:import [java.sql ResultSet ResultSetMetaData Time Types]
           [java.time LocalDateTime OffsetDateTime OffsetTime]
           [java.util Date UUID]))

(driver/register! :postgres, :parent :sql-jdbc)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/display-name :postgres [_] "PostgreSQL")

(defmethod sql.qp/add-interval-honeysql-form :postgres
  [_ hsql-form amount unit]
  (hx/+ (hx/->timestamp hsql-form)
        (hsql/raw (format "(INTERVAL '%s %s')" amount (name unit)))))

(defmethod driver/humanize-connection-error-message :postgres
  [_ message]
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
      (str (str/capitalize message) \.))

    #".*" ; default
    message))

(defmethod driver.common/current-db-time-date-formatters :postgres
  [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSS zzz"))

(defmethod driver.common/current-db-time-native-query :postgres
  [_]
  "select to_char(current_timestamp, 'YYYY-MM-DD HH24:MI:SS.MS TZ')")

(defmethod driver/current-db-time :postgres
  [& args]
  (apply driver.common/current-db-time args))

(defmethod driver/connection-properties :postgres
  [_]
  (ssh/with-tunnel-config
    [driver.common/default-host-details
     (assoc driver.common/default-port-details :placeholder 5432)
     driver.common/default-dbname-details
     driver.common/default-user-details
     driver.common/default-password-details
     driver.common/default-ssl-details
     (assoc driver.common/default-additional-options-details
            :placeholder "prepareThreshold=0")]))

(defmethod driver/db-start-of-week :postgres
  [_]
  :monday)

(defn- enum-types [_driver database]
  (set
    (map (comp keyword :typname)
         (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                     [(str "SELECT DISTINCT t.typname "
                           "FROM pg_enum e "
                           "LEFT JOIN pg_type t "
                           "  ON t.oid = e.enumtypid")]))))

(def ^:private ^:dynamic *enum-types* nil)

;; Describe the Fields present in a `table`. This just hands off to the normal SQL driver implementation of the same
;; name, but first fetches database enum types so we have access to them. These are simply binded to the dynamic var
;; and used later in `database-type->base-type`, which you will find below.
(defmethod driver/describe-table :postgres
  [driver database table]
  (binding [*enum-types* (enum-types driver database)]
    (sql-jdbc.sync/describe-table driver database table)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/unix-timestamp->honeysql [:postgres :seconds]
  [_ _ expr]
  (hsql/call :to_timestamp expr))

(defmethod sql.qp/cast-temporal-string [:postgres :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  (hsql/call :to_timestamp expr (hx/literal "YYYYMMDDHH24MISS")))

(defmethod sql.qp/cast-temporal-byte [:postgres :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal
                               (hsql/call :convert_from expr (hx/literal "UTF8"))))

(defn- date-trunc [unit expr] (hsql/call :date_trunc (hx/literal unit) (hx/->timestamp expr)))
(defn- extract    [unit expr] (hsql/call :extract    unit              (hx/->timestamp expr)))

(def ^:private extract-integer (comp hx/->integer extract))

(defmethod sql.qp/date [:postgres :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:postgres :minute]          [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:postgres :minute-of-hour]  [_ _ expr] (extract-integer :minute expr))
(defmethod sql.qp/date [:postgres :hour]            [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:postgres :hour-of-day]     [_ _ expr] (extract-integer :hour expr))
(defmethod sql.qp/date [:postgres :day]             [_ _ expr] (hx/->date expr))
(defmethod sql.qp/date [:postgres :day-of-month]    [_ _ expr] (extract-integer :day expr))
(defmethod sql.qp/date [:postgres :day-of-year]     [_ _ expr] (extract-integer :doy expr))
(defmethod sql.qp/date [:postgres :month]           [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:postgres :month-of-year]   [_ _ expr] (extract-integer :month expr))
(defmethod sql.qp/date [:postgres :quarter]         [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:postgres :quarter-of-year] [_ _ expr] (extract-integer :quarter expr))
(defmethod sql.qp/date [:postgres :year]            [_ _ expr] (date-trunc :year expr))

(defmethod sql.qp/date [:postgres :day-of-week]
  [_ _ expr]
  (sql.qp/adjust-day-of-week :postgres (extract-integer :dow expr)))

(defmethod sql.qp/date [:postgres :week]
  [_ _ expr]
  (sql.qp/adjust-start-of-week :postgres (partial date-trunc :week) expr))

(defmethod sql.qp/->honeysql [:postgres :value]
  [driver value]
  (let [[_ value {base-type :base_type, database-type :database_type}] value]
    (when (some? value)
      (condp #(isa? %2 %1) base-type
        :type/UUID         (UUID/fromString value)
        :type/IPAddress    (hx/cast :inet value)
        :type/PostgresEnum (hx/quoted-cast database-type value)
        (sql.qp/->honeysql driver value)))))

(defmethod sql.qp/->honeysql [:postgres :median]
  [driver [_ arg]]
  (sql.qp/->honeysql driver [:percentile arg 0.5]))

(defmethod sql.qp/->honeysql [:postgres :regex-match-first]
  [driver [_ arg pattern]]
  (let [col-name (hformat/to-sql (sql.qp/->honeysql driver arg))]
    (reify
      hformat/ToSql
      (to-sql [_]
        (str "substring(" col-name " FROM " (hformat/to-sql pattern) ")")))))

(defmethod sql.qp/->honeysql [:postgres Time]
  [_ time-value]
  (hx/->time time-value))

(defn- pg-conversion
  "HoneySQL form that adds a Postgres-style `::` cast e.g. `expr::type`.

    (pg-conversion :my_field ::integer) -> HoneySQL -[Compile]-> \"my_field\"::integer"
  [expr psql-type]
  (reify
    hformat/ToSql
    (to-sql [_]
      (format "%s::%s" (hformat/to-sql expr) (name psql-type)))
    PrettyPrintable
    (pretty [_]
      (format "%s::%s" (pr-str expr) (name psql-type)))))

(defmethod sql.qp/->honeysql [:postgres (class Field)]
  [driver {database-type :database_type, :as field}]
  (let [parent-method (get-method sql.qp/->honeysql [:sql (class Field)])
        identifier    (parent-method driver field)]
    (if (= database-type "money")
      (pg-conversion identifier :numeric)
      identifier)))

(defmethod unprepare/unprepare-value [:postgres Date]
  [_ value]
  (format "'%s'::timestamp" (u.date/format value)))

(prefer-method unprepare/unprepare-value [:sql Time] [:postgres Date])

(defmethod unprepare/unprepare-value [:postgres UUID]
  [_ value]
  (format "'%s'::uuid" value))


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
   :cidr          :type/Structured ; IPv4/IPv6 network address
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
   :json          :type/Structured
   :jsonb         :type/Structured
   :line          :type/*
   :lseg          :type/*
   :macaddr       :type/Structured
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
   :timetz        :type/TimeWithLocalTZ
   :timestamp     :type/DateTime
   :timestamptz   :type/DateTimeWithLocalTZ
   :tsquery       :type/*
   :tsvector      :type/*
   :txid_snapshot :type/*
   :uuid          :type/UUID
   :varbit        :type/*
   :varchar       :type/Text
   :xml           :type/Structured
   (keyword "bit varying")                :type/*
   (keyword "character varying")          :type/Text
   (keyword "double precision")           :type/Float
   (keyword "time with time zone")        :type/Time
   (keyword "time without time zone")     :type/Time
   (keyword "timestamp with timezone")    :type/DateTime
   (keyword "timestamp without timezone") :type/DateTime})

(defmethod sql-jdbc.sync/database-type->base-type :postgres
  [driver column]
  (if (contains? *enum-types* column)
    :type/PostgresEnum
    (default-base-types column)))

(defmethod sql-jdbc.sync/column->semantic-type :postgres
  [_ database-type _]
  ;; this is really, really simple right now.  if its postgres :json type then it's :type/SerializedJSON semantic-type
  (case database-type
    "json"  :type/SerializedJSON
    "jsonb" :type/SerializedJSON
    "xml"   :type/XML
    "inet"  :type/IPAddress
    nil))

(def ^:private ssl-params
  "Params to include in the JDBC connection spec for an SSL connection."
  {:ssl        true
   :sslmode    "require"})

(def ^:private disable-ssl-params
  "Params to include in the JDBC connection spec to disable SSL."
  {:sslmode "disable"})

(defmethod sql-jdbc.conn/connection-details->spec :postgres
  [_ {ssl? :ssl, :as details-map}]
  (let [props (-> details-map
                  (update :port (fn [port]
                                  (if (string? port)
                                    (Integer/parseInt port)
                                    port)))
                  ;; remove :ssl in case it's false; DB will still try (& fail) to connect if the key is there
                  (dissoc :ssl))
        ;; this happens via ->> so that the users props will override the ssl-params stuff.
        ;; if the user has specified a sslmode, it must always take precedence over our default.
        props (->> props
                   (merge (if ssl?
                            ssl-params
                            disable-ssl-params)))
        props (-> props
                  (set/rename-keys {:dbname :db})
                  db.spec/postgres
                  (sql-jdbc.common/handle-additional-options details-map))]
    props))

(defmethod sql-jdbc.execute/set-timezone-sql :postgres
  [_]
  "SET SESSION TIMEZONE TO %s;")

;; for some reason postgres `TIMESTAMP WITH TIME ZONE` columns still come back as `Type/TIMESTAMP`, which seems like a
;; bug with the JDBC driver?
(defmethod sql-jdbc.execute/read-column-thunk [:postgres Types/TIMESTAMP]
  [_ ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (let [^Class klass (if (= (str/lower-case (.getColumnTypeName rsmeta i)) "timestamptz")
                       OffsetDateTime
                       LocalDateTime)]
    (fn []
      (.getObject rs i klass))))

;; Sometimes Postgres times come back as strings like `07:23:18.331+00` (no minute in offset) and there's a bug in the
;; JDBC driver where it can't parse those correctly. We can do it ourselves in that case.
(defmethod sql-jdbc.execute/read-column-thunk [:postgres Types/TIME]
  [driver ^ResultSet rs rsmeta ^Integer i]
  (let [parent-thunk ((get-method sql-jdbc.execute/read-column-thunk [:sql-jdbc Types/TIME]) driver rs rsmeta i)]
    (fn []
      (try
        (parent-thunk)
        (catch Throwable _
          (let [s (.getString rs i)]
            (log/tracef "Error in Postgres JDBC driver reading TIME value, fetching as string '%s'" s)
            (u.date/parse s)))))))

;; The postgres JDBC driver cannot properly read MONEY columns — see https://github.com/pgjdbc/pgjdbc/issues/425. Work
;; around this by checking whether the column type name is `money`, and reading it out as a String and parsing to a
;; BigDecimal if so; otherwise, proceeding as normal
(defmethod sql-jdbc.execute/read-column-thunk [:postgres Types/DOUBLE]
  [driver ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (if (= (.getColumnTypeName rsmeta i) "money")
    (fn []
      (some-> (.getString rs i) u/parse-currency))
    (fn []
      (.getObject rs i))))

;; de-CLOB any CLOB values that come back
(defmethod sql-jdbc.execute/read-column-thunk :postgres
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (let [obj (.getObject rs i)]
      (if (instance? org.postgresql.util.PGobject obj)
        (.getValue ^org.postgresql.util.PGobject obj)
        obj))))

;; Postgres doesn't support OffsetTime
(defmethod sql-jdbc.execute/set-parameter [:postgres OffsetTime]
  [driver prepared-statement i t]
  (let [local-time (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))]
    (sql-jdbc.execute/set-parameter driver prepared-statement i local-time)))
