(ns metabase.driver.sqlite
  (:require [clj-time
             [coerce :as tcoerce]
             [format :as tformat]]
            [clojure.string :as str]
            [honeysql
             [core :as hsql]
             [format :as hformat]]
            [metabase
             [config :as config]
             [driver :as driver]]
            [metabase.driver
             [common :as driver.common]
             [sql :as sql]]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]
             [i18n :refer [tru]]]
            [schema.core :as s])
  (:import [java.sql Time Timestamp]))

(driver/register! :sqlite, :parent :sql-jdbc)

(defmethod driver/display-name :sqlite [_] "SQLite")

(defmethod sql-jdbc.conn/connection-details->spec :sqlite [_ {:keys [db]
                                                              :or   {db "sqlite.db"}
                                                              :as   details}]
  (merge {:classname   "org.sqlite.JDBC"
          :subprotocol "sqlite"
          :subname     db}
         (dissoc details :db)))

;; We'll do regex pattern matching here for determining Field types because SQLite types can have optional lengths,
;; e.g. NVARCHAR(100) or NUMERIC(10,5) See also http://www.sqlite.org/datatype3.html
(def ^:private database-type->base-type
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [[#"BIGINT"   :type/BigInteger]
    [#"BIG INT"  :type/BigInteger]
    [#"INT"      :type/Integer]
    [#"CHAR"     :type/Text]
    [#"TEXT"     :type/Text]
    [#"CLOB"     :type/Text]
    [#"BLOB"     :type/*]
    [#"REAL"     :type/Float]
    [#"DOUB"     :type/Float]
    [#"FLOA"     :type/Float]
    [#"NUMERIC"  :type/Float]
    [#"DECIMAL"  :type/Decimal]
    [#"BOOLEAN"  :type/Boolean]
    [#"DATETIME" :type/DateTime]
    [#"DATE"     :type/Date]
    [#"TIME"     :type/Time]]))

(defmethod sql-jdbc.sync/database-type->base-type :sqlite [_ database-type]
  (database-type->base-type database-type))

;; register the SQLite concatnation operator `||` with HoneySQL as `sqlite-concat`
;; (hsql/format (hsql/call :sqlite-concat :a :b)) -> "(a || b)"
(defmethod hformat/fn-handler "sqlite-concat" [_ & args]
  (str "(" (str/join " || " (map hformat/to-sql args)) ")"))

(def ^:private ->date     (partial hsql/call :date))
(def ^:private ->datetime (partial hsql/call :datetime))

(defn- strftime [format-str expr]
  (hsql/call :strftime (hx/literal format-str) expr))

;; See also the [SQLite Date and Time Functions Reference](http://www.sqlite.org/lang_datefunc.html).

(defn- ts->str
  "Convert Timestamps to ISO 8601 strings before passing to SQLite, otherwise they don't seem to work correctly"
  [expr]
  (if (instance? Timestamp expr)
    (hx/literal (du/date->iso-8601 expr))
    expr))

(defmethod sql.qp/date [:sqlite :default]        [_ _ expr] (ts->str expr))
(defmethod sql.qp/date [:sqlite :second]         [_ _ expr] (->datetime (strftime "%Y-%m-%d %H:%M:%S" (ts->str expr))))
(defmethod sql.qp/date [:sqlite :minute]         [_ _ expr] (->datetime (strftime "%Y-%m-%d %H:%M" (ts->str expr))))
(defmethod sql.qp/date [:sqlite :minute-of-hour] [_ _ expr] (hx/->integer (strftime "%M" (ts->str expr))))
(defmethod sql.qp/date [:sqlite :hour]           [_ _ expr] (->datetime (strftime "%Y-%m-%d %H:00" (ts->str expr))))
(defmethod sql.qp/date [:sqlite :hour-of-day]    [_ _ expr] (hx/->integer (strftime "%H" (ts->str expr))))
(defmethod sql.qp/date [:sqlite :day]            [_ _ expr] (->date (ts->str expr)))
;; SQLite day of week (%w) is Sunday = 0 <-> Saturday = 6. We want 1 - 7 so add 1
(defmethod sql.qp/date [:sqlite :day-of-week]    [_ _ expr] (hx/->integer (hx/inc (strftime "%w" (ts->str expr)))))
(defmethod sql.qp/date [:sqlite :day-of-month]   [_ _ expr] (hx/->integer (strftime "%d" (ts->str expr))))
(defmethod sql.qp/date [:sqlite :day-of-year]    [_ _ expr] (hx/->integer (strftime "%j" (ts->str expr))))
;; Move back 6 days, then forward to the next Sunday
(defmethod sql.qp/date [:sqlite :week]           [_ _ expr] (->date (ts->str expr) (hx/literal "-6 days") (hx/literal "weekday 0")))
;; SQLite first week of year is 0, so add 1
(defmethod sql.qp/date [:sqlite :week-of-year]   [_ _ expr] (hx/->integer (hx/inc (strftime "%W" (ts->str expr)))))
(defmethod sql.qp/date [:sqlite :month]          [_ _ expr] (->date (ts->str expr) (hx/literal "start of month")))
(defmethod sql.qp/date [:sqlite :month-of-year]  [_ _ expr] (hx/->integer (strftime "%m" (ts->str expr))))

;;    DATE(DATE(%s, 'start of month'), '-' || ((STRFTIME('%m', %s) - 1) % 3) || ' months')
;; -> DATE(DATE('2015-11-16', 'start of month'), '-' || ((STRFTIME('%m', '2015-11-16') - 1) % 3) || ' months')
;; -> DATE('2015-11-01', '-' || ((11 - 1) % 3) || ' months')
;; -> DATE('2015-11-01', '-' || 1 || ' months')
;; -> DATE('2015-11-01', '-1 months')
;; -> '2015-10-01'
(defmethod sql.qp/date [:sqlite :quarter] [_ _ expr]
  (let [v (ts->str expr)]
    (->date
     (->date v (hx/literal "start of month"))
     (hsql/call :sqlite-concat
       (hx/literal "-")
       (hx/mod (hx/dec (strftime "%m" v))
               3)
       (hx/literal " months")))))

;; q = (m + 2) / 3
(defmethod sql.qp/date [:sqlite :quarter-of-year] [_ _ expr]
  (hx// (hx/+ (strftime "%m" (ts->str expr))
              2)
        3))

(defmethod sql.qp/date [:sqlite :year] [_ _ expr]
  (hx/->integer (strftime "%Y" (ts->str expr))))

(defmethod driver/date-interval :sqlite [driver unit amount]
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
    (->datetime (sql.qp/date driver unit (hx/literal "now"))
                (hx/literal (format "%+d %s" (* amount multiplier) sqlite-unit)))))

(defmethod sql.qp/unix-timestamp->timestamp [:sqlite :seconds] [_ _ expr]
  (->datetime expr (hx/literal "unixepoch")))

;; SQLite doesn't like things like Timestamps getting passed in as prepared statement args, so we need to convert them
;; to date literal strings instead to get things to work
;;
;; TODO - not sure why this doesn't need to be done in `->honeysql` as well? I think it's because the MBQL date values
;; are funneled through the `date` family of functions above
(s/defmethod sql/->prepared-substitution [:sqlite java.util.Date] :- sql/PreparedStatementSubstitution
  [_ date]
  ;; for anything that's a Date (usually a java.sql.Timestamp) convert it to a yyyy-MM-dd formatted date literal
  ;; string For whatever reason the SQL generated from parameters ends up looking like `WHERE date(some_field) = ?`
  ;; sometimes so we need to use just the date rather than a full ISO-8601 string
  (sql/make-stmt-subs "?" [(du/format-date "yyyy-MM-dd" date)]))

;; SQLite doesn't support `TRUE`/`FALSE`; it uses `1`/`0`, respectively; convert these booleans to numbers.
(defmethod sql.qp/->honeysql [:sqlite Boolean]
  [_ bool]
  (if bool 1 0))

(defmethod sql.qp/->honeysql [:sqlite Time]
  [_ time-value]
  (->> time-value
       tcoerce/to-date-time
       (tformat/unparse (tformat/formatters :hour-minute-second-ms))
       (hsql/call :time)))


(defmethod driver/connection-properties :sqlite [_]
  [{:name         "db"
    :display-name (tru "Filename")
    :placeholder  (tru "/home/camsaul/toucan_sightings.sqlite 😋")
    :required     true}])

;; SQLite `LIKE` clauses are case-insensitive by default, and thus cannot be made case-sensitive. So let people know
;; we have this 'feature' so the frontend doesn't try to present the option to you.
(defmethod driver/supports? [:sqlite :case-sensitivity-string-filter-options] [_ _] false)

;; SQLite doesn't have a standard deviation function
(defmethod driver/supports? [:sqlite :standard-deviation-aggregations] [_ _] false)

;; HACK SQLite doesn't support ALTER TABLE ADD CONSTRAINT FOREIGN KEY and I don't have all day to work around this so
;; for now we'll just skip the foreign key stuff in the tests.
(defmethod driver/supports? [:sqlite :foreign-keys] [_ _] (not config/is-test?))

;; SQLite defaults everything to UTC
(defmethod driver.common/current-db-time-date-formatters :sqlite [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss"))

(defmethod driver.common/current-db-time-native-query :sqlite [_]
  "select cast(datetime('now') as text);")

(defmethod driver/current-db-time :sqlite [& args]
  (apply driver.common/current-db-time args))

(defmethod sql-jdbc.sync/active-tables :sqlite [& args]
  (apply sql-jdbc.sync/post-filtered-active-tables args))

(defmethod sql.qp/current-datetime-fn :sqlite [_]
  (hsql/call :datetime (hx/literal :now)))
