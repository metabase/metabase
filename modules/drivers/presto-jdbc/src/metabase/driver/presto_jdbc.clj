(ns metabase.driver.presto-jdbc
  "Presto JDBC driver. See https://prestodb.io/docs/current/ for complete dox."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.driver.presto-common :as presto-common]
            [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.execute.legacy-impl :as legacy]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util.i18n :refer [trs]])
  (:import com.facebook.presto.jdbc.PrestoConnection
           com.mchange.v2.c3p0.C3P0ProxyConnection
           [java.sql Connection PreparedStatement ResultSet ResultSetMetaData Time Types]
           [java.time Instant LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           [java.time.temporal ChronoField Temporal]))

(driver/register! :presto-jdbc, :parent #{:presto-common :sql-jdbc ::legacy/use-legacy-classes-for-read-and-set})

(defmethod sql.qp/->honeysql [:presto-jdbc :log]
  [driver [_ field]]
  (hsql/call :log10 (sql.qp/->honeysql driver field)))

(defmethod sql.qp/->honeysql [:presto-jdbc :count-where]
  [driver [_ pred]]
  ;; Presto will use the precision given here in the final expression, which chops off digits
  ;; need to explicitly provide two digits after the decimal
  (sql.qp/->honeysql driver [:sum-where 1.00M pred]))

(defmethod sql.qp/->honeysql [:presto-jdbc :absolute-datetime]
  [driver [_ dt binning]]
  ;; When setting a datetime param in the statement, we have to use the from_iso8601_timestamp Presto function
  ;; to properly capture its zone offset, when reporting timezone (i.e. connection/session level time zone)
  ;; is set
  (hsql/call :from_iso8601_timestamp (t/format (t/offset-date-time dt))))

(defmethod sql.qp/current-datetime-base-type :presto-jdbc
  [_]
  ;; in Presto, `now()` returns the current instant as `timestamp with time zone`
  :type/DateTimeWithTZ)

;;; Presto API helpers

(defmethod sql-jdbc.sync/database-type->base-type :presto-jdbc
  [_ field-type]
  (presto-common/presto-type->base-type field-type))

(defn- db-name
  "Creates a \"DB name\" for the given catalog `c` and schema `s`.  If both are specified, a slash is
  used to separate them.  See examples at:
  https://prestodb.io/docs/current/installation/jdbc.html#connecting"
  [c s]
  (cond
    (str/blank? c)
    ""

    (str/blank? s)
    c

    :else
    (str c "/" s)))

(defn- jdbc-spec
  [{:keys [host port catalog schema]
    :or   {host "localhost", port 5432, catalog ""}
    :as   opts}]
  (-> (merge
       {:classname                     "com.facebook.presto.jdbc.PrestoDriver"
        :subprotocol                   "presto"
        :subname                       (db.spec/make-subname host port (db-name catalog schema))}
       (dissoc opts :host :port :db :catalog :schema))
      sql-jdbc.common/handle-additional-options))

(defmethod sql-jdbc.conn/connection-details->spec :presto-jdbc
  [_ {ssl? :ssl, :as details-map}]
  (let [props (-> details-map
                  (update :port (fn [port]
                                    (if (string? port)
                                      (Integer/parseInt port)
                                      port)))
                  (assoc :SSL ssl?)
                  (dissoc :ssl))]
       (jdbc-spec props)))

(defn- have-select-privilege?
  "Checks whether the connected user has permission to select from the given `table-name`, in the given `schema`.
  Adapted from the legacy Presto driver implementation."
  [driver conn schema table-name]
  (try
   (let [sql (sql-jdbc.describe-database/simple-select-probe-query driver schema table-name)]
        ;; if the query completes without throwing an Exception, we can SELECT from this table
        (jdbc/reducible-query {:connection conn} sql)
        true)
   (catch Throwable _
     false)))

(defn- describe-schema
  "Gets a set of maps for all tables in the given `catalog` and `schema`. Adapted from the legacy Presto driver
  implementation."
  [driver conn catalog schema]
  (let [sql (presto-common/describe-schema-sql driver catalog schema)]
    (log/info (trs "Running statement in describe-schema: {0}" sql))
    (into #{} (comp (filter (fn [{table-name :table}]
                                (have-select-privilege? driver conn schema table-name)))
                    (map (fn [{table-name :table}]
                             {:name        table-name
                              :schema      schema})))
              (jdbc/reducible-query {:connection conn} sql))))

(defn- all-schemas
  "Gets a set of maps for all tables in all schemas in the given `catalog`. Adapted from the legacy Presto driver
  implementation."
  [driver conn catalog]
  (let [sql (presto-common/describe-catalog-sql driver catalog)]
    (log/info (trs "Running statement in all-schemas: {0}" sql))
    (into []
          (map (fn [{:keys [schema] :as full}]
                 (when-not (contains? presto-common/excluded-schemas schema)
                   (describe-schema driver conn catalog schema))))
          (jdbc/reducible-query {:connection conn} sql))))

(defmethod driver/describe-database :presto-jdbc
  [driver {{:keys [catalog schema] :as details} :details :as database}]
  (with-open [conn (-> (sql-jdbc.conn/db->pooled-connection-spec database)
                       jdbc/get-connection)]
    (let [schemas (all-schemas driver conn catalog)]
      {:tables (reduce set/union schemas)})))

(defmethod driver/describe-table :presto-jdbc
  [driver {{:keys [catalog] :as details} :details :as database} {schema :schema, table-name :name}]
  (with-open [conn (-> (sql-jdbc.conn/db->pooled-connection-spec database)
                     jdbc/get-connection)]
    (let [sql (presto-common/describe-table-sql driver catalog schema table-name)]
      (log/info (trs "Running statement in describe-table: {0}" sql))
      {:schema schema
       :name   table-name
       :fields (into
                 #{}
                 (map-indexed (fn [idx {:keys [column type] :as col}]
                                {:name column
                                 :database-type type
                                 :base-type         (presto-common/presto-type->base-type type)
                                 :database-position idx}))
                 (jdbc/reducible-query {:connection conn} sql))})))

;; Result set holdability must be HOLD_CURSORS_OVER_COMMIT
;; defining this method to omit the holdability param
(defmethod sql-jdbc.execute/prepared-statement :presto-jdbc
  [driver ^Connection conn ^String sql params]
  (let [stmt (.prepareStatement conn
                                sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY)]
       (try
         (try
           (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
           (catch Throwable e
             (log/debug e (trs "Error setting prepared statement fetch direction to FETCH_FORWARD"))))
         (sql-jdbc.execute/set-parameters! driver stmt params)
         stmt
         (catch Throwable e
           (.close stmt)
           (throw e)))))

;; and similarly for statement
(defmethod sql-jdbc.execute/statement :presto-jdbc
  [_ ^Connection conn]
  (let [stmt (.createStatement conn
                               ResultSet/TYPE_FORWARD_ONLY
                               ResultSet/CONCUR_READ_ONLY)]
       (try
         (try
           (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
           (catch Throwable e
             (log/debug e (trs "Error setting statement fetch direction to FETCH_FORWARD"))))
         stmt
         (catch Throwable e
           (.close stmt)
           (throw e)))))

(defmethod driver/can-connect? :sql-jdbc
  [driver details]
  (sql-jdbc.conn/can-connect? driver details))

(defmethod sql-jdbc.execute/connection-with-timezone :presto-jdbc
  [driver database ^String timezone-id]
  (let [^C3P0ProxyConnection conn         (.getConnection (sql-jdbc.execute/datasource database))
        ^PrestoConnection underlying-conn (.unwrap conn PrestoConnection)]
    (try
      (sql-jdbc.execute/set-best-transaction-level! driver conn)
      (when-not (str/blank? timezone-id) (.setTimeZoneId underlying-conn timezone-id))
      (try
        (.setReadOnly conn true)
        (catch Throwable e
          (log/debug e (trs "Error setting connection to read-only"))))
      ;; Presto JDBC driver doesn't support setting holdability
      conn
      (catch Throwable e
        (.close conn)
        (throw e)))))

(defmethod sql-jdbc.execute/set-parameter [:presto-jdbc OffsetDateTime]
  [_ prepared-statement i ^OffsetDateTime t]
  ;; necessary because PrestoPreparedStatement does not support OffsetDateTime in its setObject method
  (jdbc/set-parameter (t/sql-timestamp (t/with-offset-same-instant t (t/zone-offset 0))) prepared-statement i))

(defmethod sql-jdbc.execute/set-parameter [:presto-jdbc ZonedDateTime]
  [_ prepared-statement i ^OffsetDateTime t]
  ;; necessary because PrestoPreparedStatement does not support ZonedDateTime in its setObject method
  (jdbc/set-parameter (t/sql-timestamp (t/with-zone-same-instant t (t/zone-id "UTC"))) prepared-statement i))

(defn- set-time-param
  "Converts the given instance of `java.time.temporal`, assumed to be a time (either `LocalTime` or `OffsetTime`)
  into a `java.sql.Time`, including milliseconds, and sets the result as a parameter of the `PreparedStatement` `ps`
  at index `i`."
  [^PreparedStatement ps ^Integer i ^Temporal t]
  ;; for some reason, `java-time` can't handle passing millis to java.sql.Time, so this is the most straightforward way
  ;; I could find to do it
  ;; reported as https://github.com/dm3/clojure.java-time/issues/74
  (let [millis-of-day (.get t ChronoField/MILLI_OF_DAY)]
    (.setTime ps i (Time. millis-of-day))))

(defmethod sql-jdbc.execute/set-parameter [:presto-jdbc OffsetTime]
  [_ ^PreparedStatement ps ^Integer i t]
  ;; necessary because PrestoPreparedStatement does not implement the setTime overload with the last param being
  ;; a Calendar instance
  (let [adjusted-tz   (t/with-offset-same-instant t (t/zone-offset 0))]
    (set-time-param ps i adjusted-tz)))

(defmethod sql-jdbc.execute/set-parameter [:presto-jdbc LocalTime]
  [_ ^PreparedStatement ps ^Integer i t]
  ;; necessary because PrestoPreparedStatement does not implement the setTime overload with the last param being
  ;; a Calendar instance
  (set-time-param ps i t))

;; TODO: need this?
#_(defmethod sql.qp/cast-temporal-string [:presto-jdbc :Coercion/ISO8601->DateTime]
    [_driver _semantic_type expr]
    (hsql/call :from_iso8601_timestamp expr))

#_(defmethod sql-jdbc.execute/read-column-thunk [:presto-jdbc Types/DATE]
    [_ ^ResultSet rs _ ^Integer i]
    (fn []
      (when-let [s (.getString rs i)]
        (let [t (u.date/parse s)]
          t))))

#_(defmethod sql-jdbc.execute/read-column-thunk [:presto-jdbc Types/TIMESTAMP]
    [_ ^ResultSet rs _ i]
    #(.getTimestamp rs i))

(defn- ^LocalTime sql-time->local-time
  "Converts the given instance of `java.sql.Time` into a `java.time.LocalTime`, including milliseconds. Needed for
  similar reasons as `set-time-param` above."
  [^Time sql-time]
  ;; Similar to above, `java-time` can't get the millis from the `java.sql.Time` directly, so this appears to be
  ;; the most straightforward way to do it
  (LocalTime/ofInstant (Instant/ofEpochMilli (.getTime sql-time)) (t/zone-id "UTC")))

(defmethod sql-jdbc.execute/read-column-thunk [:presto-jdbc Types/TIME]
  [_ ^ResultSet rs ^ResultSetMetaData rs-meta ^Integer i]
  #(let [local-time (-> (.getTime rs i)
                        sql-time->local-time)
         type-name  (.getColumnTypeName rs-meta i)
         base-type  (presto-common/presto-type->base-type type-name)]
     ;; for both `time` and `time with time zone`, the JDBC type reported by the driver is `Types/TIME`, hence
     ;; we also need to check the column type name to differentiate between them here
     (if (isa? base-type :type/TimeWithTZ)
       ;; this shouldn't really be so difficult
       (t/offset-time
         (.get local-time ChronoField/HOUR_OF_DAY)
         (.get local-time ChronoField/MINUTE_OF_HOUR)
         (.get local-time ChronoField/SECOND_OF_MINUTE)
         (.get local-time ChronoField/NANO_OF_SECOND)
         (t/zone-offset 0))
       local-time))) ; else a local time (no zone), so just return that

(defmethod sql-jdbc.execute/read-column-thunk [:presto-jdbc Types/TIMESTAMP]
  [_ ^ResultSet rs ^ResultSetMetaData rs-meta ^Integer i]
  #(let [timestamp (.getTimestamp rs i)
         local-dt  (t/local-date-time timestamp)
         type-name (.getColumnTypeName rs-meta i)
         base-type (presto-common/presto-type->base-type type-name)]
     ;; for both `timestamp` and `timestamp with time zone`, the JDBC type reported by the driver is
     ;; `Types/TIMESTAMP`, hence we also need to check the column type name to differentiate between them here
     (if (isa? base-type :type/DateTimeWithTZ)
       ;; this also shouldn't really be so difficult
       (t/offset-date-time
         (.get local-dt ChronoField/YEAR)
         (.get local-dt ChronoField/MONTH_OF_YEAR)
         (.get local-dt ChronoField/DAY_OF_MONTH)
         (.get local-dt ChronoField/HOUR_OF_DAY)
         (.get local-dt ChronoField/MINUTE_OF_HOUR)
         (.get local-dt ChronoField/SECOND_OF_MINUTE)
         (.get local-dt ChronoField/NANO_OF_SECOND)
         (t/zone-offset 0))
       local-dt))) ; else a local date time (no zone), so just return that

(prefer-method driver/supports? [:presto-common :set-timezone] [:sql-jdbc :set-timezone])
