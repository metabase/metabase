(ns metabase.driver.snowflake
  "Snowflake Driver."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [java-time :as t]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc :as sql-jdbc]
            [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.driver.sync :as driver.s]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.util.add-alias-info :as add]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.i18n :refer [trs tru]])
  (:import [java.sql ResultSet Types]
           [java.time OffsetDateTime ZonedDateTime]
           metabase.util.honeysql_extensions.Identifier))

(driver/register! :snowflake, :parent #{:sql-jdbc ::sql-jdbc.legacy/use-legacy-classes-for-read-and-set})

(defmethod driver/humanize-connection-error-message :snowflake
  [_ message]
  (log/spy :error (type message))
  (condp re-matches message
    #"(?s).*Object does not exist.*$"
    :database-name-incorrect

    #"(?s).*" ; default - the Snowflake errors have a \n in them
    message))

(defmethod driver/db-start-of-week :snowflake
  [_]
  :sunday)

(defn- start-of-week-setting->snowflake-offset
  "Value to use for the `WEEK_START` connection parameter -- see
  https://docs.snowflake.com/en/sql-reference/parameters.html#label-week-start -- based on
  the [[metabase.public-settings/start-of-week]] Setting. Snowflake considers `:monday` to be `1`, through `:sunday`
  as `7`."
  []
  (inc (driver.common/start-of-week->int)))

(defmethod sql-jdbc.conn/connection-details->spec :snowflake
  [_ {:keys [account additional-options], :as details}]
  (when (get "week_start" (sql-jdbc.common/additional-options->map additional-options :url))
    (log/warn (trs "You should not set WEEK_START in Snowflake connection options; this might lead to incorrect results. Set the Start of Week Setting instead.")))
  (let [upcase-not-nil (fn [s] (when s (u/upper-case-en s)))]
    ;; it appears to be the case that their JDBC driver ignores `db` -- see my bug report at
    ;; https://support.snowflake.net/s/question/0D50Z00008WTOMCSA5/
    (-> (merge {:classname                                  "net.snowflake.client.jdbc.SnowflakeDriver"
                :subprotocol                                "snowflake"
                :subname                                    (str "//" account ".snowflakecomputing.com/")
                :client_metadata_request_use_connection_ctx true
                :ssl                                        true
                ;; keep open connections open indefinitely instead of closing them. See #9674 and
                ;; https://docs.snowflake.net/manuals/sql-reference/parameters.html#client-session-keep-alive
                :client_session_keep_alive                  true
                ;; other SESSION parameters
                ;; not 100% sure why we need to do this but if we don't set the connection to UTC our report timezone
                ;; stuff doesn't work, even though we ultimately override this when we set the session timezone
                :timezone                                   "UTC"
                ;; tell Snowflake to use the same start of week that we have set for the
                ;; [[metabase.public-settings/start-of-week]] Setting.
                :week_start                                 (start-of-week-setting->snowflake-offset)}
               (-> details
                   ;; original version of the Snowflake driver incorrectly used `dbname` in the details fields instead
                   ;; of `db`. If we run across `dbname`, correct our behavior
                   (set/rename-keys {:dbname :db})
                   ;; see https://github.com/metabase/metabase/issues/9511
                   (update :warehouse upcase-not-nil)
                   (update :schema upcase-not-nil)
                   (dissoc :host :port :timezone)))
        (sql-jdbc.common/handle-additional-options details))))

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
    :GEOGRAPHY                  :type/SerializedJSON
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
(defmethod sql.qp/unix-timestamp->honeysql [:snowflake :microseconds] [_ _ expr] (hsql/call :to_timestamp expr 6))

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
(defmethod sql.qp/date [:snowflake :day-of-month]    [_ _ expr] (extract :day expr))
(defmethod sql.qp/date [:snowflake :day-of-year]     [_ _ expr] (extract :dayofyear expr))
(defmethod sql.qp/date [:snowflake :month]           [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:snowflake :month-of-year]   [_ _ expr] (extract :month expr))
(defmethod sql.qp/date [:snowflake :quarter]         [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:snowflake :quarter-of-year] [_ _ expr] (extract :quarter expr))
(defmethod sql.qp/date [:snowflake :year]            [_ _ expr] (date-trunc :year expr))

;; these don't need to be adjusted for start of week, since we're Setting the WEEK_START connection parameter
(defmethod sql.qp/date [:snowflake :week]
  [_driver _unit expr]
  (date-trunc :week expr))

(defmethod sql.qp/date [:snowflake :day-of-week]
  [_driver _unit expr]
  (extract :dayofweek expr))

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
;;
;; Table & Field identifiers (usually) need to be qualified with the current database name; this needs to be part of the
;; table e.g.
;;
;;    "table"."field" -> "database"."table"."field"

;; This takes care of Table identifiers. We handle Field identifiers in the [[sql.qp/->honeysql]] method for `[:sql
;; :field]` below.
(defmethod sql.qp/->honeysql [:snowflake Identifier]
  [_ {:keys [identifier-type], :as identifier}]
  (let [qualify? (and (seq (query-db-name))
                      (= identifier-type :table))]
    (cond-> identifier
      qualify?
      (update :components (partial cons (query-db-name))))))

(defmethod sql.qp/->honeysql [:snowflake :field]
  [driver [_ _ {::add/keys [source-table]} :as field-clause]]
  (let [parent-method (get-method sql.qp/->honeysql [:sql :field])
        qualify?      (and
                       ;; `query-db-name` is not currently set, e.g. because we're generating DDL statements for tests
                       (seq (query-db-name))
                       ;; Only Qualify Field identifiers that are qualified by a Table. (e.g. don't qualify stuff
                       ;; inside `CREATE TABLE` DDL statements)
                       (integer? source-table))
        identifier (parent-method driver field-clause)]
    (cond-> identifier
      qualify? (update :components (partial cons (query-db-name))))))

(defmethod sql.qp/->honeysql [:snowflake :time]
  [driver [_ value unit]]
  (hx/->time (sql.qp/->honeysql driver value)))

(defmethod driver/table-rows-seq :snowflake
  [driver database table]
  (sql-jdbc/query driver database {:select [:*]
                                   :from   [(qp.store/with-store
                                              (qp.store/fetch-and-store-database! (u/the-id database))
                                              (sql.qp/->honeysql driver table))]}))

(defmethod driver/describe-database :snowflake
  [driver database]
  ;; using the JDBC `.getTables` method seems to be pretty buggy -- it works sometimes but other times randomly
  ;; returns nothing
  (let [db-name          (db-name database)
        excluded-schemas (set (sql-jdbc.sync/excluded-schemas driver))]
    (qp.store/with-store
      (qp.store/fetch-and-store-database! (u/the-id database))
      (let [spec            (sql-jdbc.conn/db->pooled-connection-spec database)
            sql             (format "SHOW OBJECTS IN DATABASE \"%s\"" db-name)
            schema-patterns (driver.s/db-details->schema-filter-patterns "schema-filters" database)
            [inclusion-patterns exclusion-patterns] schema-patterns]
        (log/tracef "[Snowflake] %s" sql)
        (with-open [conn (jdbc/get-connection spec)]
          {:tables (into
                    #{}
                    (comp (filter (fn [{schema :schema_name, table-name :name}]
                                    (and (not (contains? excluded-schemas schema))
                                         (driver.s/include-schema? inclusion-patterns
                                                                   exclusion-patterns
                                                                   schema)
                                         (sql-jdbc.sync/have-select-privilege? driver conn schema table-name))))
                          (map (fn [{schema :schema_name, table-name :name, remark :comment}]
                                 {:name        table-name
                                  :schema      schema
                                  :description (not-empty remark)})))
                    (try
                      (jdbc/reducible-query {:connection conn} sql)
                      (catch Throwable e
                        (throw (ex-info (trs "Error executing query: {0}" (ex-message e)) {:sql sql} e)))))})))))

(defmethod driver/describe-table :snowflake
  [driver database table]
  (let [spec (sql-jdbc.conn/db->pooled-connection-spec database)]
    (with-open [conn (jdbc/get-connection spec)]
      (->> (assoc (select-keys table [:name :schema])
                  :fields (sql-jdbc.sync/describe-table-fields driver conn table (db-name database)))
           ;; find PKs and mark them
           (sql-jdbc.sync/add-table-pks (.getMetaData conn))))))

(defmethod driver/describe-table-fks :snowflake
  [driver database table]
  (sql-jdbc.sync/describe-table-fks driver database table (db-name database)))

(defmethod sql-jdbc.execute/set-timezone-sql :snowflake [_] "ALTER SESSION SET TIMEZONE = %s;")

(defmethod sql.qp/current-datetime-honeysql-form :snowflake [_] :%current_timestamp)

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

(defmethod driver/normalize-db-details :snowflake
  [_ database]
  (if-not (str/blank? (-> database :details :regionid))
    (-> (update-in database [:details :account] #(str/join "." [% (-> database :details :regionid)]))
      (m/dissoc-in [:details :regionid]))
    database))

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
