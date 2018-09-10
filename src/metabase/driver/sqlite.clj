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
             [driver :as driver]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]]
            [puppetlabs.i18n.core :refer [tru]]
            [schema.core :as s])
  (:import [java.sql Time Timestamp]))

(defrecord SQLiteDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "SQLite"))

(defn- connection-details->spec
  "Create a database specification for a SQLite3 database. DETAILS should include a key for `:db` which is the path to
  the database file."
  [{:keys [db]
    :or   {db "sqlite.db"}
    :as   details}]
  (merge {:classname   "org.sqlite.JDBC"
          :subprotocol "sqlite"
          :subname     db}
         (dissoc details :db)))

;; We'll do regex pattern matching here for determining Field types because SQLite types can have optional lengths,
;; e.g. NVARCHAR(100) or NUMERIC(10,5) See also http://www.sqlite.org/datatype3.html
(def ^:private ^:const pattern->type
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
   [#"TIME"     :type/Time]])

;; register the SQLite concatnation operator `||` with HoneySQL as `sqlite-concat`
;; (hsql/format (hsql/call :sqlite-concat :a :b)) -> "(a || b)"
(defmethod hformat/fn-handler "sqlite-concat" [_ & args]
  (str "(" (str/join " || " (map hformat/to-sql args)) ")"))

(def ^:private ->date     (partial hsql/call :date))
(def ^:private ->datetime (partial hsql/call :datetime))

(defn- strftime [format-str expr]
  (hsql/call :strftime (hx/literal format-str) expr))

(defn- date
  "Apply truncation / extraction to a date field or value for SQLite.
   See also the [SQLite Date and Time Functions Reference](http://www.sqlite.org/lang_datefunc.html)."
  [unit expr]
  ;; Convert Timestamps to ISO 8601 strings before passing to SQLite, otherwise they don't seem to work correctly
  (let [v (if (instance? Timestamp expr)
            (hx/literal (du/date->iso-8601 expr))
            expr)]
    (case unit
      :default         v
      :second          (->datetime (strftime "%Y-%m-%d %H:%M:%S" v))
      :minute          (->datetime (strftime "%Y-%m-%d %H:%M" v))
      :minute-of-hour  (hx/->integer (strftime "%M" v))
      :hour            (->datetime (strftime "%Y-%m-%d %H:00" v))
      :hour-of-day     (hx/->integer (strftime "%H" v))
      :day             (->date v)
      ;; SQLite day of week (%w) is Sunday = 0 <-> Saturday = 6. We want 1 - 7 so add 1
      :day-of-week     (hx/->integer (hx/inc (strftime "%w" v)))
      :day-of-month    (hx/->integer (strftime "%d" v))
      :day-of-year     (hx/->integer (strftime "%j" v))
      ;; Move back 6 days, then forward to the next Sunday
      :week            (->date v, (hx/literal "-6 days"), (hx/literal "weekday 0"))
      ;; SQLite first week of year is 0, so add 1
      :week-of-year    (hx/->integer (hx/inc (strftime "%W" v)))
      :month           (->date v, (hx/literal "start of month"))
      :month-of-year   (hx/->integer (strftime "%m" v))
      ;;    DATE(DATE(%s, 'start of month'), '-' || ((STRFTIME('%m', %s) - 1) % 3) || ' months')
      ;; -> DATE(DATE('2015-11-16', 'start of month'), '-' || ((STRFTIME('%m', '2015-11-16') - 1) % 3) || ' months')
      ;; -> DATE('2015-11-01', '-' || ((11 - 1) % 3) || ' months')
      ;; -> DATE('2015-11-01', '-' || 1 || ' months')
      ;; -> DATE('2015-11-01', '-1 months')
      ;; -> '2015-10-01'
      :quarter         (->date
                        (->date v, (hx/literal "start of month"))
                        (hsql/call :sqlite-concat
                          (hx/literal "-")
                          (hx/mod (hx/dec (strftime "%m" v))
                                  3)
                          (hx/literal " months")))
      ;; q = (m + 2) / 3
      :quarter-of-year (hx// (hx/+ (strftime "%m" v)
                                   2)
                             3)
      :year            (hx/->integer (strftime "%Y" v)))))

(defn- date-interval [unit amount]
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
    (->datetime (date unit (hx/literal "now"))
                (hx/literal (format "%+d %s" (* amount multiplier) sqlite-unit)))))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (->datetime expr (hx/literal "unixepoch"))
    :milliseconds (recur (hx// expr 1000) :seconds)))

;; SQLite doesn't like things like Timestamps getting passed in as prepared statement args, so we need to convert them
;; to date literal strings instead to get things to work
;;
;; TODO - not sure why this doesn't need to be done in `->honeysql` as well? I think it's because the MBQL date values
;; are funneled through the `date` family of functions above
(s/defmethod sql/->prepared-substitution [SQLiteDriver java.util.Date] :- sql/PreparedStatementSubstitution
  [_ date]
  ;; for anything that's a Date (usually a java.sql.Timestamp) convert it to a yyyy-MM-dd formatted date literal
  ;; string For whatever reason the SQL generated from parameters ends up looking like `WHERE date(some_field) = ?`
  ;; sometimes so we need to use just the date rather than a full ISO-8601 string
  (sql/make-stmt-subs "?" [(du/format-date "yyyy-MM-dd" date)]))

;; SQLite doesn't support `TRUE`/`FALSE`; it uses `1`/`0`, respectively; convert these booleans to numbers.
(defmethod sqlqp/->honeysql [SQLiteDriver Boolean]
  [_ bool]
  (if bool 1 0))

(defmethod sqlqp/->honeysql [SQLiteDriver Time]
  [_ time-value]
  (->> time-value
       tcoerce/to-date-time
       (tformat/unparse (tformat/formatters :hour-minute-second-ms))
       (hsql/call :time)))

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))


;; SQLite defaults everything to UTC
(def ^:private sqlite-date-formatters (driver/create-db-time-formatters "yyyy-MM-dd HH:mm:ss"))
(def ^:private sqlite-db-time-query "select cast(datetime('now') as text);")

(u/strict-extend SQLiteDriver
  driver/IDriver
  (merge
   (sql/IDriverSQLDefaultsMixin)
   {:date-interval   (u/drop-first-arg date-interval)
    :details-fields  (constantly [{:name         "db"
                                   :display-name (tru "Filename")
                                   :placeholder  (tru "/home/camsaul/toucan_sightings.sqlite 😋")
                                   :required     true}])
    :features        (fn [this]
                       (-> (sql/features this)
                           ;; SQLite `LIKE` clauses are case-insensitive by default, and thus cannot be made
                           ;; case-sensitive. So let people know we have this 'feature' so the frontend doesn't try to
                           ;; present the option to you.
                           (conj :no-case-sensitivity-string-filter-options)
                           ;; SQLite doesn't have a standard deviation function
                           (disj :standard-deviation-aggregations
                                 ;; HACK SQLite doesn't support ALTER TABLE ADD CONSTRAINT FOREIGN KEY and I don't
                                 ;; have all day to work around this so for now we'll just skip the foreign key stuff
                                 ;; in the tests.
                                 (when config/is-test?
                                   :foreign-keys))))
    :current-db-time (driver/make-current-db-time-fn sqlite-db-time-query sqlite-date-formatters)})

  sql/ISQLDriver
  (merge
   (sql/ISQLDriverDefaultsMixin)
   {:active-tables             sql/post-filtered-active-tables
    :column->base-type         (sql/pattern-based-column->base-type pattern->type)
    :connection-details->spec  (u/drop-first-arg connection-details->spec)
    :current-datetime-fn       (constantly (hsql/call :datetime (hx/literal :now)))
    :date                      (u/drop-first-arg date)
    :string-length-fn          (u/drop-first-arg string-length-fn)
    :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(defn -init-driver
  "Register the SQLite driver"
  []
  (driver/register-driver! :sqlite (SQLiteDriver.)))
