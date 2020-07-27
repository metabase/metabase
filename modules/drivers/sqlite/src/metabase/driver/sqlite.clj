(ns metabase.driver.sqlite
  (:require [clojure.string :as str]
            [honeysql
             [core :as hsql]
             [format :as hformat]]
            [java-time :as t]
            [metabase
             [config :as config]
             [driver :as driver]]
            [metabase.driver
             [common :as driver.common]
             [sql :as sql]]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.parameters.substitution :as params.substitution]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.util
             [date-2 :as u.date]
             [honeysql-extensions :as hx]]
            [schema.core :as s])
  (:import [java.sql Connection ResultSet Types]
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           java.time.temporal.Temporal))

(driver/register! :sqlite, :parent :sql-jdbc)

;; SQLite does not support a lot of features, so do not show the options in the interface
(doseq [[feature supported?] {:right-join                             false
                              :full-join                              false
                              :regex                                  false
                              :percentile-aggregations                false
                              :advanced-math-expressions              false
                              :standard-deviation-aggregations        false}]
  (defmethod driver/supports? [:sqlite feature] [_ _] supported?))

;; SQLite `LIKE` clauses are case-insensitive by default, and thus cannot be made case-sensitive. So let people know
;; we have this 'feature' so the frontend doesn't try to present the option to you.
(defmethod driver/supports? [:sqlite :case-sensitivity-string-filter-options] [_ _] false)

;; HACK SQLite doesn't support ALTER TABLE ADD CONSTRAINT FOREIGN KEY and I don't have all day to work around this so
;; for now we'll just skip the foreign key stuff in the tests.
(defmethod driver/supports? [:sqlite :foreign-keys] [_ _] (not config/is-test?))

(defmethod sql-jdbc.conn/connection-details->spec :sqlite
  [_ {:keys [db]
      :or   {db "sqlite.db"}
      :as   details}]
  (merge {:subprotocol "sqlite"
          :subname     db}
         (dissoc details :db)))

;; We'll do regex pattern matching here for determining Field types because SQLite types can have optional lengths,
;; e.g. NVARCHAR(100) or NUMERIC(10,5) See also http://www.sqlite.org/datatype3.html
(def ^:private database-type->base-type
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [[#"BIGINT"    :type/BigInteger]
    [#"BIG INT"   :type/BigInteger]
    [#"INT"       :type/Integer]
    [#"CHAR"      :type/Text]
    [#"TEXT"      :type/Text]
    [#"CLOB"      :type/Text]
    [#"BLOB"      :type/*]
    [#"REAL"      :type/Float]
    [#"DOUB"      :type/Float]
    [#"FLOA"      :type/Float]
    [#"NUMERIC"   :type/Float]
    [#"DECIMAL"   :type/Decimal]
    [#"BOOLEAN"   :type/Boolean]
    [#"TIMESTAMP" :type/DateTime]
    [#"DATETIME"  :type/DateTime]
    [#"DATE"      :type/Date]
    [#"TIME"      :type/Time]]))

(defmethod sql-jdbc.sync/database-type->base-type :sqlite
  [_ database-type]
  (database-type->base-type database-type))

;; register the SQLite concatnation operator `||` with HoneySQL as `sqlite-concat`
;; (hsql/format (hsql/call :sqlite-concat :a :b)) -> "(a || b)"
(defmethod hformat/fn-handler "sqlite-concat"
  [_ & args]
  (str "(" (str/join " || " (map hformat/to-sql args)) ")"))

(def ^:private ->date     (partial hsql/call :date))
(def ^:private ->datetime (partial hsql/call :datetime))

(defn- strftime [format-str expr]
  (hsql/call :strftime (hx/literal format-str) expr))

;; See also the [SQLite Date and Time Functions Reference](http://www.sqlite.org/lang_datefunc.html).

(defmethod sql.qp/date [:sqlite :default]
  [driver _ expr]
  (sql.qp/->honeysql driver expr))

(defmethod sql.qp/date [:sqlite :second]
  [driver _ expr]
  (->datetime (strftime "%Y-%m-%d %H:%M:%S" (sql.qp/->honeysql driver expr))))

(defmethod sql.qp/date [:sqlite :minute]
  [driver _ expr]
  (->datetime (strftime "%Y-%m-%d %H:%M" (sql.qp/->honeysql driver expr))))

(defmethod sql.qp/date [:sqlite :minute-of-hour]
  [driver _ expr]
  (hx/->integer (strftime "%M" (sql.qp/->honeysql driver expr))))

(defmethod sql.qp/date [:sqlite :hour]
  [driver _ expr]
  (->datetime (strftime "%Y-%m-%d %H:00" (sql.qp/->honeysql driver expr))))

(defmethod sql.qp/date [:sqlite :hour-of-day]
  [driver _ expr]
  (hx/->integer (strftime "%H" (sql.qp/->honeysql driver expr))))

(defmethod sql.qp/date [:sqlite :day]
  [driver _ expr]
  (->date (sql.qp/->honeysql driver expr)))

;; SQLite day of week (%w) is Sunday = 0 <-> Saturday = 6. We want 1 - 7 so add 1
(defmethod sql.qp/date [:sqlite :day-of-week]
  [driver _ expr]
  (hx/->integer (hx/inc (strftime "%w" (sql.qp/->honeysql driver expr)))))

(defmethod sql.qp/date [:sqlite :day-of-month]
  [driver _ expr]
  (hx/->integer (strftime "%d" (sql.qp/->honeysql driver expr))))

(defmethod sql.qp/date [:sqlite :day-of-year]
  [driver _ expr]
  (hx/->integer (strftime "%j" (sql.qp/->honeysql driver expr))))

;; Move back 6 days, then forward to the next Sunday
(defmethod sql.qp/date [:sqlite :week]
  [driver _ expr]
  (->date (sql.qp/->honeysql driver expr) (hx/literal "-6 days") (hx/literal "weekday 0")))

;; SQLite first week of year is 0, so add 1
(defmethod sql.qp/date [:sqlite :week-of-year]
  [driver _ expr]
  (hx/->integer (hx/inc (strftime "%W" (sql.qp/->honeysql driver expr)))))

(defmethod sql.qp/date [:sqlite :month]
  [driver _ expr]
  (->date (sql.qp/->honeysql driver expr) (hx/literal "start of month")))

(defmethod sql.qp/date [:sqlite :month-of-year]
  [driver _ expr]
  (hx/->integer (strftime "%m" (sql.qp/->honeysql driver expr))))

;;    DATE(DATE(%s, 'start of month'), '-' || ((STRFTIME('%m', %s) - 1) % 3) || ' months')
;; -> DATE(DATE('2015-11-16', 'start of month'), '-' || ((STRFTIME('%m', '2015-11-16') - 1) % 3) || ' months')
;; -> DATE('2015-11-01', '-' || ((11 - 1) % 3) || ' months')
;; -> DATE('2015-11-01', '-' || 1 || ' months')
;; -> DATE('2015-11-01', '-1 months')
;; -> '2015-10-01'
(defmethod sql.qp/date [:sqlite :quarter]
  [driver _ expr]
  (let [v (sql.qp/->honeysql driver expr)]
    (->date
     (->date v (hx/literal "start of month"))
     (hsql/call :sqlite-concat
       (hx/literal "-")
       (hx/mod (hx/dec (strftime "%m" v))
               3)
       (hx/literal " months")))))

;; q = (m + 2) / 3
(defmethod sql.qp/date [:sqlite :quarter-of-year]
  [driver _ expr]
  (hx// (hx/+ (strftime "%m" (sql.qp/->honeysql driver expr))
              2)
        3))

(defmethod sql.qp/date [:sqlite :year]
  [driver _ expr]
  (->date (sql.qp/->honeysql driver expr) (hx/literal "start of year")))

(defmethod sql.qp/add-interval-honeysql-form :sqlite
  [driver hsql-form amount unit]
  (let [[multiplier sqlite-unit] (case unit
                                   :second  [1 "seconds"]
                                   :minute  [1 "minutes"]
                                   :hour    [1 "hours"]
                                   :day     [1 "days"]
                                   :week    [7 "days"]
                                   :month   [1 "months"]
                                   :quarter [3 "months"]
                                   :year    [1 "years"])]
    ;; Make a string like DATETIME(DATE('now', 'start of month'), '-1 month') The date bucketing will end up being
    ;; done twice since `date` is called on the results of `date-interval` automatically. This shouldn't be a big deal
    ;; because it's used for relative dates and only needs to be done once.
    ;;
    ;; It's important to call `date` on 'now' to apply bucketing *before* adding/subtracting dates to handle certain
    ;; edge cases as discussed in issue #2275 (https://github.com/metabase/metabase/issues/2275).
    ;;
    ;; Basically, March 30th minus one month becomes Feb 30th in SQLite, which becomes March 2nd.
    ;; DATE(DATETIME('2016-03-30', '-1 month'), 'start of month') is thus March 1st.
    ;; The SQL we produce instead (for "last month") ends up looking something like:
    ;; DATE(DATETIME(DATE('2015-03-30', 'start of month'), '-1 month'), 'start of month').
    ;; It's a little verbose, but gives us the correct answer (Feb 1st).
    (->datetime (sql.qp/date driver unit hsql-form)
                (hx/literal (format "%+d %s" (* amount multiplier) sqlite-unit)))))

(defmethod sql.qp/unix-timestamp->honeysql [:sqlite :seconds]
  [_ _ expr]
  (->datetime expr (hx/literal "unixepoch")))

;; SQLite doesn't like Temporal values getting passed in as prepared statement args, so we need to convert them to
;; date literal strings instead to get things to work
;;
;; TODO - not sure why this doesn't need to be done in `->honeysql` as well? I think it's because the MBQL date values
;; are funneled through the `date` family of functions above
;;
;; TIMESTAMP FIXME — this doesn't seem like the correct thing to do for non-Dates. I think params only support dates
;; rn however
(s/defmethod sql/->prepared-substitution [:sqlite Temporal] :- sql/PreparedStatementSubstitution
  [_ date]
  ;; for anything that's a Temporal value convert it to a yyyy-MM-dd formatted date literal
  ;; string For whatever reason the SQL generated from parameters ends up looking like `WHERE date(some_field) = ?`
  ;; sometimes so we need to use just the date rather than a full ISO-8601 string
  (params.substitution/make-stmt-subs "?" [(t/format "yyyy-MM-dd" date)]))

;; SQLite doesn't support `TRUE`/`FALSE`; it uses `1`/`0`, respectively; convert these booleans to numbers.
(defmethod sql.qp/->honeysql [:sqlite Boolean]
  [_ bool]
  (if bool 1 0))

(defmethod sql.qp/->honeysql [:sqlite :substring]
  [driver [_ arg start length]]
  (if length
    (hsql/call :substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start) (sql.qp/->honeysql driver length))
    (hsql/call :substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start))))

(defmethod sql.qp/->honeysql [:sqlite :concat]
  [driver [_ & args]]
  (hsql/raw (str/join " || " (for [arg args]
                               (let [arg (sql.qp/->honeysql driver arg)]
                                 (hformat/to-sql
                                  (if (string? arg)
                                    (hx/literal arg)
                                    arg)))))))

(defmethod sql.qp/->honeysql [:sqlite :floor]
  [driver [_ arg]]
  (hsql/call :round (hsql/call :- arg 0.5)))

(defmethod sql.qp/->honeysql [:sqlite :ceil]
  [driver [_ arg]]
  (hsql/call :round (hsql/call :+ arg 0.5)))


;; See https://sqlite.org/lang_datefunc.html

;; MEGA HACK
;;
;; if the time portion is zeroed out generate a date() instead, because SQLite isn't smart enough to compare DATEs
;; and DATETIMEs in a way that could be considered to make any sense whatsoever, e.g.
;;
;; date('2019-12-03') < datetime('2019-12-03 00:00')
(defn- zero-time? [t]
  (= (t/local-time t) (t/local-time 0)))

(defmethod sql.qp/->honeysql [:sqlite LocalDate]
  [_ t]
  (hsql/call :date (hx/literal (u.date/format-sql t))))

(defmethod sql.qp/->honeysql [:sqlite LocalDateTime]
  [driver t]
  (if (zero-time? t)
    (sql.qp/->honeysql driver (t/local-date t))
    (hsql/call :datetime (hx/literal (u.date/format-sql t)))))

(defmethod sql.qp/->honeysql [:sqlite LocalTime]
  [_ t]
  (hsql/call :time (hx/literal (u.date/format-sql t))))

(defmethod sql.qp/->honeysql [:sqlite OffsetDateTime]
  [driver t]
  (if (zero-time? t)
    (sql.qp/->honeysql driver (t/local-date t))
    (hsql/call :datetime (hx/literal (u.date/format-sql t)))))

(defmethod sql.qp/->honeysql [:sqlite OffsetTime]
  [_ t]
  (hsql/call :time (hx/literal (u.date/format-sql t))))

(defmethod sql.qp/->honeysql [:sqlite ZonedDateTime]
  [driver t]
  (if (zero-time? t)
    (sql.qp/->honeysql driver (t/local-date t))
    (hsql/call :datetime (hx/literal (u.date/format-sql t)))))

;; SQLite defaults everything to UTC
(defmethod driver.common/current-db-time-date-formatters :sqlite
  [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss"))

(defmethod driver.common/current-db-time-native-query :sqlite
  [_]
  "select cast(datetime('now') as text);")

(defmethod driver/current-db-time :sqlite
  [& args]
  (apply driver.common/current-db-time args))

(defmethod sql-jdbc.sync/active-tables :sqlite
  [& args]
  (apply sql-jdbc.sync/post-filtered-active-tables args))

(defmethod sql.qp/current-datetime-honeysql-form :sqlite
  [_]
  (hsql/call :datetime (hx/literal :now)))

;; SQLite's JDBC driver is fussy and won't let you change connections to read-only after you create them
(defmethod sql-jdbc.execute/connection-with-timezone :sqlite
  [driver database ^String timezone-id]
  (let [conn (.getConnection (sql-jdbc.execute/datasource database))]
    (try
      (sql-jdbc.execute/set-best-transaction-level! driver conn)
      conn
      (catch Throwable e
        (.close conn)
        (throw e)))))

;; SQLite's JDBC driver is dumb and complains if you try to call `.setFetchDirection` on the Connection
(defmethod sql-jdbc.execute/prepared-statement :sqlite
  [driver ^Connection conn ^String sql params]
  (let [stmt (.prepareStatement conn sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY
                                ResultSet/CLOSE_CURSORS_AT_COMMIT)]
    (try
      (sql-jdbc.execute/set-parameters! driver stmt params)
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))

;; (.getObject rs i LocalDate) doesn't seem to work, nor does `(.getDate)`; and it seems to be the case that
;; timestamps come back as `Types/DATE` as well? Fetch them as a String and then parse them
(defmethod sql-jdbc.execute/read-column-thunk [:sqlite Types/DATE]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (try
      (when-let [t (.getDate rs i)]
        (t/local-date t))
      (catch Throwable _
        (when-let [s (.getString rs i)]
          (u.date/parse s (qp.timezone/results-timezone-id)))))))
