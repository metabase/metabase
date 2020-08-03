(ns metabase.driver.snowflake
  "Snowflake Driver."
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver
             [common :as driver.common]
             [sql-jdbc :as sql-jdbc]]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql-jdbc.execute.legacy-impl :as legacy]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [date-2 :as u.date]
             [honeysql-extensions :as hx]
             [i18n :refer [tru]]])
  (:import [java.sql ResultSet Types]
           [java.time OffsetDateTime ZonedDateTime]
           metabase.util.honeysql_extensions.Identifier))

(driver/register! :snowflake, :parent #{:sql-jdbc ::legacy/use-legacy-classes-for-read-and-set})

(defmethod driver/humanize-connection-error-message :snowflake
  [_ message]
  (log/spy :error (type message))
  (condp re-matches message
    #"(?s).*Object does not exist.*$"
    (driver.common/connection-error-messages :database-name-incorrect)

    #"(?s).*" ; default - the Snowflake errors have a \n in them
    message))

(defmethod sql-jdbc.conn/connection-details->spec :snowflake
  [_ {:keys [account regionid], :as opts}]
  (let [host (if regionid
               (str account "." regionid)
               account)
        upcase-not-nil (fn [s] (when s (u/upper-case-en s)))]
    ;; it appears to be the case that their JDBC driver ignores `db` -- see my bug report at
    ;; https://support.snowflake.net/s/question/0D50Z00008WTOMCSA5/
    (-> (merge {:classname                                  "net.snowflake.client.jdbc.SnowflakeDriver"
                :subprotocol                                "snowflake"
                :subname                                    (str "//" host ".snowflakecomputing.com/")
                :client_metadata_request_use_connection_ctx true
                :ssl                                        true
                ;; keep open connections open indefinitely instead of closing them. See #9674 and
                ;; https://docs.snowflake.net/manuals/sql-reference/parameters.html#client-session-keep-alive
                :client_session_keep_alive                  true
                ;; other SESSION parameters
                ;; use the same week start we use for all the other drivers
                :week_start                                 7
                ;; not 100% sure why we need to do this but if we don't set the connection to UTC our report timezone
                ;; stuff doesn't work, even though we ultimately override this when we set the session timezone
                :timezone                                   "UTC"}
               (-> opts
                   ;; original version of the Snowflake driver incorrectly used `dbname` in the details fields instead of
                   ;; `db`. If we run across `dbname`, correct our behavior
                   (set/rename-keys {:dbname :db})
                   ;; see https://github.com/metabase/metabase/issues/9511
                   (update :warehouse upcase-not-nil)
                   (update :schema upcase-not-nil)
                   (dissoc :host :port :timezone)))
        (sql-jdbc.common/handle-additional-options opts))))

(defmethod sql-jdbc.sync/database-type->base-type :snowflake
  [_ base-type]
  ({:NUMBER                     :type/Number
    :DECIMAL                    :type/Decimal
    :NUMERIC                    :type/Number
    :INT                        :type/Integer
    :INTEGER                    :type/Integer
    :BIGINT                     :type/BigInteger
    :SMALLINT                   :type/Integer
    :TINYINT                    :type/Integer
    :BYTEINT                    :type/Integer
    :FLOAT                      :type/Float
    :FLOAT4                     :type/Float
    :FLOAT8                     :type/Float
    :DOUBLE                     :type/Float
    (keyword "DOUBLE PRECISON") :type/Float
    :REAL                       :type/Float
    :VARCHAR                    :type/Text
    :CHAR                       :type/Text
    :CHARACTER                  :type/Text
    :STRING                     :type/Text
    :TEXT                       :type/Text
    :BINARY                     :type/*
    :VARBINARY                  :type/*
    :BOOLEAN                    :type/Boolean
    :DATE                       :type/Date
    :DATETIME                   :type/DateTime
    :TIME                       :type/Time
    :TIMESTAMP                  :type/DateTime
    :TIMESTAMPLTZ               :type/DateTime
    :TIMESTAMPNTZ               :type/DateTime
    :TIMESTAMPTZ                :type/DateTimeWithTZ
    :VARIANT                    :type/*
    ;; Maybe also type *
    :OBJECT                     :type/Dictionary
    :ARRAY                      :type/*} base-type))

(defmethod sql.qp/unix-timestamp->honeysql [:snowflake :seconds]      [_ _ expr] (hsql/call :to_timestamp expr))
(defmethod sql.qp/unix-timestamp->honeysql [:snowflake :milliseconds] [_ _ expr] (hsql/call :to_timestamp expr 3))

(defmethod sql.qp/current-datetime-honeysql-form :snowflake
  [_]
  :%current_timestamp)

(defmethod sql.qp/add-interval-honeysql-form :snowflake
  [_ hsql-form amount unit]
  (hsql/call :dateadd
    (hsql/raw (name unit))
    (hsql/raw (int amount))
    (hx/->timestamp hsql-form)))

(defn- extract    [unit expr] (hsql/call :date_part unit (hx/->timestamp expr)))
(defn- date-trunc [unit expr] (hsql/call :date_trunc unit (hx/->timestamp expr)))

(defmethod sql.qp/date [:snowflake :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:snowflake :minute]          [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:snowflake :minute-of-hour]  [_ _ expr] (extract :minute expr))
(defmethod sql.qp/date [:snowflake :hour]            [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:snowflake :hour-of-day]     [_ _ expr] (extract :hour expr))
(defmethod sql.qp/date [:snowflake :day]             [_ _ expr] (date-trunc :day expr))
(defmethod sql.qp/date [:snowflake :day-of-week]     [_ _ expr] (extract :dayofweek expr))
(defmethod sql.qp/date [:snowflake :day-of-month]    [_ _ expr] (extract :day expr))
(defmethod sql.qp/date [:snowflake :day-of-year]     [_ _ expr] (extract :dayofyear expr))
(defmethod sql.qp/date [:snowflake :week]            [_ _ expr] (date-trunc :week expr))
(defmethod sql.qp/date [:snowflake :week-of-year]    [_ _ expr] (extract :week expr))
(defmethod sql.qp/date [:snowflake :month]           [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:snowflake :month-of-year]   [_ _ expr] (extract :month expr))
(defmethod sql.qp/date [:snowflake :quarter]         [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:snowflake :quarter-of-year] [_ _ expr] (extract :quarter expr))
(defmethod sql.qp/date [:snowflake :year]            [_ _ expr] (date-trunc :year expr))


(defmethod sql.qp/->honeysql [:snowflake :regex-match-first]
  [driver [_ arg pattern]]
  (hsql/call :regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)))

(defmethod sql.qp/->honeysql [:snowflake :median]
  [driver [_ arg]]
  (sql.qp/->honeysql driver [:percentile arg 0.5]))

(defn- db-name
  "As mentioned above, old versions of the Snowflake driver used `details.dbname` to specify the physical database, but
  tests (and Snowflake itself) expected `details.db`. This has since been fixed, but for legacy support we'll still
  accept either. Throw an Exception if neither key can be found."
  {:arglists '([database])}
  [{details :details}]
  (or (:db details)
      (:dbname details)
      (throw (Exception. (tru "Invalid Snowflake connection details: missing DB name.")))))

(defn- query-db-name []
  ;; the store is always initialized when running QP queries; for some stuff like the test extensions DDL statements
  ;; it won't be, *but* they should already be qualified by database name anyway
  (when (qp.store/initialized?)
    (db-name (qp.store/database))))

;; unless we're currently using a table alias, we need to prepend Table and Field identifiers with the DB name for the
;; query
(defn- should-qualify-identifier?
  "Should we qualify an Identifier with the dataset name?

  Table & Field identifiers (usually) need to be qualified with the current database name; this needs to be part of the
  table e.g.

    \"table\".\"field\" -> \"database\".\"table\".\"field\""
  [{:keys [identifier-type components]}]
  (cond
    ;; If we're currently using a Table alias, don't qualify the alias with the dataset name
    sql.qp/*table-alias*
    false

    ;;; `query-db-name` is not currently set, e.g. because we're generating DDL statements for tests
    (empty? (query-db-name))
    false

    ;; already qualified
    (= (first components) (query-db-name))
    false

    ;; otherwise always qualify Table identifiers
    (= identifier-type :table)
    true

    ;; Only qualify Field identifiers that are qualified by a Table. (e.g. don't qualify stuff inside `CREATE TABLE`
    ;; DDL statements)
    (and (= identifier-type :field)
         (>= (count components) 2))
    true))

(defmethod sql.qp/->honeysql [:snowflake Identifier]
  [_ {:keys [identifier-type], :as identifier}]
  (cond-> identifier
    (should-qualify-identifier? identifier)
    (update :components (partial cons (query-db-name)))))

(defmethod sql.qp/->honeysql [:snowflake :time]
  [driver [_ value unit]]
  (hx/->time (sql.qp/->honeysql driver value)))

(defmethod sql.qp/field->identifier :snowflake
  [driver {table-id :table_id, :as field}]
  ;; TODO - Making a DB call for each field to fetch its Table is inefficient and makes me cry, but this method is
  ;; currently only used for SQL params so it's not a huge deal at this point
  ;;
  ;; TODO - we should make sure these are in the QP store somewhere and then could at least batch the calls
  (qp.store/fetch-and-store-tables! [(u/get-id table-id)])
  (sql.qp/->honeysql driver field))


(defmethod driver/table-rows-seq :snowflake
  [driver database table]
  (sql-jdbc/query driver database {:select [:*]
                                   :from   [(qp.store/with-store
                                              (qp.store/fetch-and-store-database! (u/get-id database))
                                              (sql.qp/->honeysql driver table))]}))

(defmethod driver/describe-database :snowflake
  [driver database]
  ;; using the JDBC `.getTables` method seems to be pretty buggy -- it works sometimes but other times randomly
  ;; returns nothing
  (let [db-name          (db-name database)
        excluded-schemas (set (sql-jdbc.sync/excluded-schemas driver))]
    {:tables (set (for [table (jdbc/query
                               (sql-jdbc.conn/db->pooled-connection-spec database)
                               (format "SHOW OBJECTS IN DATABASE \"%s\"" db-name))
                        :when (not (contains? excluded-schemas (:schema_name table)))]
                    {:name        (:name table)
                     :schema      (:schema_name table)
                     :description (not-empty (:comment table))}))}))

(defmethod driver/describe-table :snowflake
  [driver database table]
  (jdbc/with-db-metadata [metadata (sql-jdbc.conn/db->pooled-connection-spec database)]
    (->> (assoc (select-keys table [:name :schema])
                :fields (sql-jdbc.sync/describe-table-fields metadata driver table (db-name database)))
         ;; find PKs and mark them
         (sql-jdbc.sync/add-table-pks metadata))))

(defmethod driver/describe-table-fks :snowflake
  [driver database table]
  (sql-jdbc.sync/describe-table-fks driver database table (db-name database)))

(defmethod sql-jdbc.execute/set-timezone-sql :snowflake [_] "ALTER SESSION SET TIMEZONE = %s;")

(defmethod sql.qp/current-datetime-honeysql-form :snowflake [_] :%current_timestamp)

(defmethod driver/format-custom-field-name :snowflake
  [_ s]
  (str/lower-case s))

;; See https://docs.snowflake.net/manuals/sql-reference/data-types-datetime.html#timestamp.
(defmethod driver.common/current-db-time-date-formatters :snowflake
  [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSSSSSSSS Z"))

(defmethod driver.common/current-db-time-native-query :snowflake
  [_]
  "select to_char(current_timestamp, 'YYYY-MM-DD HH24:MI:SS.FF TZHTZM')")

(defmethod driver/current-db-time :snowflake
  [& args]
  (apply driver.common/current-db-time args))

(defmethod sql-jdbc.sync/excluded-schemas :snowflake
  [_]
  #{"INFORMATION_SCHEMA"})

(defmethod driver/can-connect? :snowflake
  [driver {:keys [db], :as details}]
  (and ((get-method driver/can-connect? :sql-jdbc) driver details)
       (let [spec (sql-jdbc.conn/details->connection-spec-for-testing-connection driver details)
             sql  (format "SHOW OBJECTS IN DATABASE \"%s\";" db)]
         (jdbc/query spec sql)
         true)))

(defmethod unprepare/unprepare-value [:snowflake OffsetDateTime]
  [_ t]
  (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-offset t)))

(defmethod unprepare/unprepare-value [:snowflake ZonedDateTime]
  [driver t]
  (unprepare/unprepare-value driver (t/offset-date-time t)))

;; Like Vertica, Snowflake doesn't seem to be able to return a LocalTime/OffsetTime like everyone else, but it can
;; return a String that we can parse
(defmethod sql-jdbc.execute/read-column-thunk [:snowflake Types/TIME]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [s (.getString rs i)]
      (let [t (u.date/parse s)]
        (log/tracef "(.getString rs %d) [TIME] -> %s -> %s" i (pr-str s) (pr-str t))
        t))))

(defmethod sql-jdbc.execute/read-column-thunk [:snowflake Types/TIME_WITH_TIMEZONE]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [s (.getString rs i)]
      (let [t (u.date/parse s)]
        (log/tracef "(.getString rs %d) [TIME_WITH_TIMEZONE] -> %s -> %s" i (pr-str s) (pr-str t))
        t))))

;; TODO ­ would it make more sense to use functions like `timestamp_tz_from_parts` directly instead of JDBC parameters?

;; Snowflake seems to ignore the calendar parameter of `.setTime` and `.setTimestamp` and instead uses the session
;; timezone; normalize temporal values to UTC so we end up with the right values
(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set java.time.OffsetTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/sql-time (t/with-offset-same-instant t (t/zone-offset 0)))))

(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set java.time.OffsetDateTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/sql-timestamp (t/with-offset-same-instant t (t/zone-offset 0)))))

(defmethod sql-jdbc.execute/set-parameter [:snowflake java.time.ZonedDateTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/sql-timestamp (t/with-zone-same-instant t (t/zone-id "UTC")))))
