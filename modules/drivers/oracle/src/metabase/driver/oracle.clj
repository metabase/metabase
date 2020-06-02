(ns metabase.driver.oracle
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.driver
             [common :as driver.common]
             [sql :as sql]]
            [metabase.driver.sql
             [query-processor :as sql.qp]
             [util :as sql.u]]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.util
             [honeysql-extensions :as hx]
             [i18n :refer [trs]]
             [ssh :as ssh]])
  (:import com.mchange.v2.c3p0.C3P0ProxyConnection
           [java.sql Connection ResultSet Types]
           [java.time Instant OffsetDateTime ZonedDateTime]
           [oracle.jdbc OracleConnection OracleTypes]
           oracle.sql.TIMESTAMPTZ))

(driver/register! :oracle, :parent :sql-jdbc)

(def ^:private database-type->base-type
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [;; Any types -- see http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i107578
    [#"ANYDATA"     :type/*]  ; Instance of a given type with data plus a description of the type (?)
    [#"ANYTYPE"     :type/*]  ; Can be any named SQL type or an unnamed transient type
    [#"ARRAY"       :type/*]
    [#"BFILE"       :type/*]
    [#"BLOB"        :type/*]
    [#"RAW"         :type/*]
    [#"CHAR"        :type/Text]
    [#"CLOB"        :type/Text]
    [#"DATE"        :type/Date]
    [#"DOUBLE"      :type/Float]
    ;; Expression filter type
    [#"^EXPRESSION" :type/*]
    [#"FLOAT"       :type/Float]
    ;; Does this make sense?
    [#"INTERVAL"    :type/DateTime]
    [#"LONG RAW"    :type/*]
    [#"LONG"        :type/Text]
    ;; Media types -- http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i121058
    [#"^ORD"        :type/*]
    [#"NUMBER"      :type/Decimal]
    [#"REAL"        :type/Float]
    [#"REF"         :type/*]
    [#"ROWID"       :type/*]
    ;; Spatial types -- see http://docs.oracle.com/cd/B28359_01/server.111/b28286/sql_elements001.htm#i107588
    [#"^SDO_"       :type/*]
    [#"STRUCT"      :type/*]
    [#"TIMESTAMP"   :type/DateTime]
    [#"URI"         :type/Text]
    [#"XML"         :type/*]]))

(defmethod sql-jdbc.sync/database-type->base-type :oracle
  [_ column-type]
  (database-type->base-type column-type))

(defmethod sql-jdbc.conn/connection-details->spec :oracle
  [_ {:keys [host port sid service-name]
      :or   {host "localhost", port 1521}
      :as   details}]
  (assert (or sid service-name))
  (merge
   {:classname   "oracle.jdbc.OracleDriver"
    :subprotocol "oracle:thin"
    :subname     (str "@" host
                      ":" port
                      (when sid
                        (str ":" sid))
                      (when service-name
                        (str "/" service-name)))}
   (dissoc details :host :port :sid :service-name)))

(defmethod driver/can-connect? :oracle
  [driver details]
  (let [connection (sql-jdbc.conn/connection-details->spec driver (ssh/include-ssh-tunnel details))]
    (= 1M (first (vals (first (jdbc/query connection ["SELECT 1 FROM dual"])))))))

(defn- trunc
  "Truncate a date. See also this [table of format
  templates](http://docs.oracle.com/cd/B28359_01/olap.111/b28126/dml_functions_2071.htm#CJAEFAIA)

      (trunc :day v) -> TRUNC(v, 'day')"
  [format-template v]
  (hsql/call :trunc v (hx/literal format-template)))

(defmethod sql.qp/date [:oracle :minute]         [_ _ v] (trunc :mi v))
;; you can only extract minute + hour from TIMESTAMPs, even though DATEs still have them (WTF), so cast first
(defmethod sql.qp/date [:oracle :minute-of-hour] [_ _ v] (hsql/call :extract :minute (hx/->timestamp v)))
(defmethod sql.qp/date [:oracle :hour]           [_ _ v] (trunc :hh v))
(defmethod sql.qp/date [:oracle :hour-of-day]    [_ _ v] (hsql/call :extract :hour (hx/->timestamp v)))
(defmethod sql.qp/date [:oracle :day]            [_ _ v] (trunc :dd v))
(defmethod sql.qp/date [:oracle :day-of-month]   [_ _ v] (hsql/call :extract :day v))
;; [SIC] The format template for truncating to start of week is 'day' in Oracle #WTF
;; iw = same day of the week as first day of the ISO year
;; iy = ISO year
(defmethod sql.qp/date [:oracle :week]           [_ _ v] (trunc :day v))
(defmethod sql.qp/date [:oracle :month]          [_ _ v] (trunc :month v))
(defmethod sql.qp/date [:oracle :month-of-year]  [_ _ v] (hsql/call :extract :month v))
(defmethod sql.qp/date [:oracle :quarter]        [_ _ v] (trunc :q v))
(defmethod sql.qp/date [:oracle :year]           [_ _ v] (trunc :year v))

(defmethod sql.qp/date [:oracle :day-of-year] [driver _ v]
  (hx/inc (hx/- (sql.qp/date driver :day v) (trunc :year v))))

(defmethod sql.qp/date [:oracle :week-of-year] [_ _ v]
  (hx/inc (hx// (hx/- (trunc :iw v)
                      (trunc :iy v))
                7)))

(defmethod sql.qp/date [:oracle :quarter-of-year] [driver _ v]
  (hx// (hx/+ (sql.qp/date driver :month-of-year (sql.qp/date driver :quarter v))
              2)
        3))

;; subtract number of days between today and first day of week, then add one since first day of week = 1
(defmethod sql.qp/date [:oracle :day-of-week] [driver _ v]
  (hx/inc (hx/- (sql.qp/date driver :day v)
                (sql.qp/date driver :week v))))

(def ^:private now (hsql/raw "SYSDATE"))

(defmethod sql.qp/current-datetime-honeysql-form :oracle [_] now)

(defn- num-to-ds-interval [unit v] (hsql/call :numtodsinterval v (hx/literal unit)))
(defn- num-to-ym-interval [unit v] (hsql/call :numtoyminterval v (hx/literal unit)))


(defmethod sql.qp/->honeysql [:oracle :substring]
  [driver [_ arg start length]]
  (if length
    (hsql/call :substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start) (sql.qp/->honeysql driver length))
    (hsql/call :substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start))))

(defmethod sql.qp/->honeysql [:oracle :concat]
  [driver [_ & args]]
  (->> args
       (map (partial sql.qp/->honeysql driver))
       (reduce (partial hsql/call :concat))))

(defmethod sql.qp/->honeysql [:oracle :regex-match-first]
  [driver [_ arg pattern]]
  (hsql/call :regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)))

(defmethod sql.qp/add-interval-honeysql-form :oracle
  [_ hsql-form amount unit]
  (hx/+
   (hx/->timestamp hsql-form)
   (case unit
     :second  (num-to-ds-interval :second amount)
     :minute  (num-to-ds-interval :minute amount)
     :hour    (num-to-ds-interval :hour   amount)
     :day     (num-to-ds-interval :day    amount)
     :week    (num-to-ds-interval :day    (hx/* amount (hsql/raw 7)))
     :month   (num-to-ym-interval :month  amount)
     :quarter (num-to-ym-interval :month  (hx/* amount (hsql/raw 3)))
     :year    (num-to-ym-interval :year   amount))))

(defmethod sql.qp/unix-timestamp->honeysql [:oracle :seconds]
  [_ _ field-or-value]
  (hx/+ (hsql/raw "timestamp '1970-01-01 00:00:00 UTC'")
        (num-to-ds-interval :second field-or-value)))

(defmethod sql.qp/unix-timestamp->honeysql [:oracle :milliseconds]
  [driver _ field-or-value]
  (sql.qp/unix-timestamp->honeysql driver :seconds (hx// field-or-value (hsql/raw 1000))))

;; Oracle doesn't support `LIMIT n` syntax. Instead we have to use `WHERE ROWNUM <= n` (`NEXT n ROWS ONLY` isn't
;; supported on Oracle versions older than 12). This has to wrap the actual query, e.g.
;;
;; SELECT *
;; FROM (
;;     SELECT *
;;     FROM employees
;;     ORDER BY employee_id
;; )
;; WHERE ROWNUM < 10;
;;
;; This wrapping can cause problems if there is an ambiguous column reference in the nested query (i.e. two columns
;; with the same alias name). To ensure that doesn't happen, those column references need to be disambiguated first
;;
;; To do an offset we have to do something like:
;;
;; SELECT *
;; FROM (
;;     SELECT __table__.*, ROWNUM AS __rownum__
;;     FROM (
;;         SELECT *
;;         FROM employees
;;         ORDER BY employee_id
;;     ) __table__
;;     WHERE ROWNUM <= 150
;; )
;; WHERE __rownum__ >= 100;
;;
;; See issue #3568 and the Oracle documentation for more details:
;; http://docs.oracle.com/cd/B19306_01/server.102/b14200/pseudocolumns009.htm
(defmethod sql.qp/apply-top-level-clause [:oracle :limit]
  [_ _ honeysql-query {value :limit}]
  {:select [:*]
   ;; if `honeysql-query` doesn't have a `SELECT` clause yet (which might be the case when using a source query) fall
   ;; back to including a `SELECT *` just to make sure a valid query is produced
   :from   [(-> (merge {:select [:*]}
                       honeysql-query)
                (update :select sql.u/select-clause-deduplicate-aliases))]
   :where  [:<= (hsql/raw "rownum") value]})

(defmethod sql.qp/apply-top-level-clause [:oracle :page]
  [driver _ honeysql-query {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can use use the single-nesting implementation for `apply-limit`
      (sql.qp/apply-top-level-clause driver :limit honeysql-query {:limit items})
      ;; if we need to do an offset we have to do double-nesting
      {:select [:*]
       :from   [{:select [:__table__.* [(hsql/raw "rownum") :__rownum__]]
                 :from   [[(merge {:select [:*]}
                                  honeysql-query)
                           :__table__]]
                 :where  [:<= (hsql/raw "rownum") (+ offset items)]}]
       :where  [:> :__rownum__ offset]})))


;; Oracle doesn't support `TRUE`/`FALSE`; use `1`/`0`, respectively; convert these booleans to numbers.
(defmethod sql.qp/->honeysql [:oracle Boolean]
  [_ bool]
  (if bool 1 0))

(defmethod driver/humanize-connection-error-message :oracle
  [_ message]
  ;; if the connection error message is caused by the assertion above checking whether sid or service-name is set,
  ;; return a slightly nicer looking version. Otherwise just return message as-is
  (if (str/includes? message "(or sid service-name)")
    "You must specify the SID and/or the Service Name."
    message))

(defn- remove-rownum-column
  "Remove the `:__rownum__` column from results, if present."
  [respond {:keys [cols], :as metadata} rows]
  (if-not (contains? (set (map :name cols)) "__rownum__")
    (respond metadata rows)
    ;; if we added __rownum__ it will always be the last column and value so we can just remove that
    (respond (update metadata :cols butlast)
             (eduction
              (fn [rf]
                (fn
                  ([]        (rf))
                  ([acc]     (rf acc))
                  ([acc row] (rf acc (butlast row)))))
              rows))))

(defmethod driver/execute-reducible-query :oracle
  [driver query context respond]
  ((get-method driver/execute-reducible-query :sql-jdbc) driver query context (partial remove-rownum-column respond)))

(defmethod driver.common/current-db-time-date-formatters :oracle
  [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSS zzz"))

(defmethod driver.common/current-db-time-native-query :oracle
  [_]
  "select to_char(current_timestamp, 'YYYY-MM-DD HH24:MI:SS.FF3 TZD') FROM DUAL")

(defmethod driver/current-db-time :oracle [& args]
  (apply driver.common/current-db-time args))

;; don't redef if already definied -- test extensions override this impl
(when-not (get (methods sql-jdbc.sync/excluded-schemas) :oracle)
  (defmethod sql-jdbc.sync/excluded-schemas :oracle
    [_]
    #{"ANONYMOUS"
      ;; TODO - are there othere APEX tables we want to skip? Maybe we should make this a pattern instead? (#"^APEX_")
      "APEX_040200"
      "APPQOSSYS"
      "AUDSYS"
      "CTXSYS"
      "DBSNMP"
      "DIP"
      "GSMADMIN_INTERNAL"
      "GSMCATUSER"
      "GSMUSER"
      "LBACSYS"
      "MDSYS"
      "OLAPSYS"
      "ORDDATA"
      "ORDSYS"
      "OUTLN"
      "RDSADMIN"
      "SYS"
      "SYSBACKUP"
      "SYSDG"
      "SYSKM"
      "SYSTEM"
      "WMSYS"
      "XDB"
      "XS$NULL"}))

(defmethod sql-jdbc.execute/set-timezone-sql :oracle
  [_]
  "ALTER session SET time_zone = %s")

;; Oracle doesn't support `CLOSE_CURSORS_AT_COMMIT`. Otherwise this method is basically the same as the default impl
(defmethod sql-jdbc.execute/prepared-statement :oracle
  [driver ^Connection conn ^String sql params]
  (let [stmt (.prepareStatement conn sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY)]
    (try
      (try
        (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
        (catch Throwable e
          (log/debug e (trs "Error setting result set fetch direction to FETCH_FORWARD"))))
      (sql-jdbc.execute/set-parameters! driver stmt params)
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))

;; instead of returning a CLOB object, return the String. (#9026)
(defmethod sql-jdbc.execute/read-column-thunk [:oracle Types/CLOB]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (.getString rs i)))

(defmethod sql-jdbc.execute/read-column-thunk [:oracle OracleTypes/TIMESTAMPTZ]
  [driver ^ResultSet rs _ ^Integer i]
  ;; Oracle `TIMESTAMPTZ` types can have either a zone offset *or* a zone ID; you could fetch either `OffsetDateTime`
  ;; or `ZonedDateTime` using `.getObject`, but fetching the wrong type will result in an Exception, meaning we have
  ;; try both and wrap the first in a try-catch. As far as I know there's now way to tell whether the value has a zone
  ;; offset or ID without first fetching a `TIMESTAMPTZ` object. So to avoid the try-catch we can fetch the
  ;; `TIMESTAMPTZ` and use `.offsetDateTimeValue` instead.
  (fn []
    (when-let [^TIMESTAMPTZ t (.getObject rs i TIMESTAMPTZ)]
      (let [^C3P0ProxyConnection proxy-conn (.. rs getStatement getConnection)
            conn                            (.unwrap proxy-conn OracleConnection)]
        ;; TIMEZONE FIXME - we need to warn if the Oracle JDBC driver is `ojdbc7.jar`, which probably won't have this
        ;; method
        ;;
        ;; I think we can call `(oracle.jdbc.OracleDriver/getJDBCVersion)` and check whether it returns 4.2+
        (.offsetDateTimeValue t conn)))))

(defmethod unprepare/unprepare-value [:oracle OffsetDateTime]
  [_ t]
  (let [s (-> (t/format "yyyy-MM-dd HH:mm:ss.SSS ZZZZZ" t)
              ;; Oracle doesn't like `Z` to mean UTC
              (str/replace #"Z$" "UTC"))]
    (format "timestamp '%s'" s)))

(defmethod unprepare/unprepare-value [:oracle ZonedDateTime]
  [_ t]
  (format "timestamp '%s'" (t/format "yyyy-MM-dd HH:mm:ss.SSS VV" t)))

(defmethod unprepare/unprepare-value [:oracle Instant]
  [driver t]
  (unprepare/unprepare-value driver (t/zoned-date-time t (t/zone-id "UTC"))))

;; Oracle doesn't really support boolean types so use bits instead (See #11592, similar issue for SQL Server)
(defmethod sql/->prepared-substitution [:oracle Boolean]
  [driver bool]
  (sql/->prepared-substitution driver (if bool 1 0)))
