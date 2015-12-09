(ns metabase.driver.sqlite
  (:require (clojure [set :as set]
                     [string :as s])
            (korma [core :as k]
                   [db :as kdb])
            [korma.sql.utils :as kutils]
            [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.util :as u]
            [metabase.util.korma-extensions :as kx]))

;; We'll do regex pattern matching here for determining Field types
;; because SQLite types can have optional lengths, e.g. NVARCHAR(100) or NUMERIC(10,5)
;; See also http://www.sqlite.org/datatype3.html
(def ^:private ^:const pattern->type
  [[#"BIGINT"   :BigIntegerField]
   [#"BIG INT"  :BigIntegerField]
   [#"INT"      :IntegerField]
   [#"CHAR"     :TextField]
   [#"TEXT"     :TextField]
   [#"CLOB"     :TextField]
   [#"BLOB"     :UnknownField]
   [#"REAL"     :FloatField]
   [#"DOUB"     :FloatField]
   [#"FLOA"     :FloatField]
   [#"NUMERIC"  :FloatField]
   [#"DECIMAL"  :DecimalField]
   [#"BOOLEAN"  :BooleanField]
   [#"DATETIME" :DateTimeField]
   [#"DATE"     :DateField]])

(def ^:private ->date     (partial k/sqlfn* :DATE))
(def ^:private ->datetime (partial k/sqlfn* :DATETIME))

(defn- strftime [format-str expr]
  (k/sqlfn :STRFTIME (kx/literal format-str) expr))

(defn- date
  "Apply truncation / extraction to a date field or value for SQLite.
   See also the [SQLite Date and Time Functions Reference](http://www.sqlite.org/lang_datefunc.html)."
  [_ unit expr]
  ;; Convert Timestamps to ISO 8601 strings before passing to SQLite, otherwise they don't seem to work correctly
  (let [v (if (instance? java.sql.Timestamp expr)
            (kx/literal (u/date->iso-8601 expr))
            expr)]
    (case unit
      :default         (->datetime v)
      :minute          (->datetime (strftime "%Y-%m-%d %H:%M" v))
      :minute-of-hour  (kx/->integer (strftime "%M" v))
      :hour            (->datetime (strftime "%Y-%m-%d %H:00" v))
      :hour-of-day     (kx/->integer (strftime "%H" v))
      :day             (->date v)
      ;; SQLite day of week (%w) is Sunday = 0 <-> Saturday = 6. We want 1 - 7 so add 1
      :day-of-week     (kx/->integer (kx/inc (strftime "%w" v)))
      :day-of-month    (kx/->integer (strftime "%d" v))
      :day-of-year     (kx/->integer (strftime "%j" v))
      ;; Move back 6 days, then forward to the next Sunday
      :week            (->date v, (kx/literal "-6 days"), (kx/literal "weekday 0"))
      ;; SQLite first week of year is 0, so add 1
      :week-of-year    (kx/->integer (kx/inc (strftime "%W" v)))
      :month           (->date v, (kx/literal "start of month"))
      :month-of-year   (kx/->integer (strftime "%m" v))
      ;;    DATE(DATE(%s, 'start of month'), '-' || ((STRFTIME('%m', %s) - 1) % 3) || ' months')
      ;; -> DATE(DATE('2015-11-16', 'start of month'), '-' || ((STRFTIME('%m', '2015-11-16') - 1) % 3) || ' months')
      ;; -> DATE('2015-11-01', '-' || ((11 - 1) % 3) || ' months')
      ;; -> DATE('2015-11-01', '-' || 1 || ' months')
      ;; -> DATE('2015-11-01', '-1 months')
      ;; -> '2015-10-01'
      :quarter         (->date
                        (->date v, (kx/literal "start of month"))
                        (kx/infix "||"
                                  (kx/literal "-")
                                  (kx/mod (kx/dec (strftime "%m" v))
                                          3)
                                  (kx/literal " months")))
      ;; q = (m + 2) / 3
      :quarter-of-year (kx// (kx/+ (strftime "%m" v)
                                   2)
                             3)
      :year            (kx/->integer (strftime "%Y" v)))))

(def ^:private datetime (partial k/sqlfn* :DATETIME))

(defn- date-interval [_ unit amount]
  (let [[multiplier unit] (case unit
                            :second  [1 "seconds"]
                            :minute  [1 "minutes"]
                            :hour    [1 "hours"]
                            :day     [1 "days"]
                            :week    [7 "days"]
                            :month   [1 "months"]
                            :quarter [3 "months"]
                            :year    [1 "years"])]
    ;; Make a string like DATE('now', '+7 days')
    (datetime (kx/literal "now")
              (kx/literal (format "%+d %s" (* amount multiplier) unit)))))

(defn- unix-timestamp->timestamp [_ expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (datetime expr (kx/literal "unixepoch"))
    :milliseconds (recur nil (kx// expr 1000) :seconds)))

(defrecord SQLiteDriver []
  clojure.lang.Named
  (getName [_] "SQLite"))

(extend SQLiteDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:active-tables  sql/post-filtered-active-tables
          :date-interval  date-interval
          :details-fields (constantly [{:name         "db"
                                        :display-name "Filename"
                                        :placeholder  "/home/camsaul/toucan_sightings.sqlite 😋"
                                        :required     true}])
          :features       (fn [this]
                            (set/difference (sql/features this)
                                            ;; SQLite doesn't have a standard deviation function
                                            #{:standard-deviation-aggregations}
                                            ;; HACK SQLite doesn't support ALTER TABLE ADD CONSTRAINT FOREIGN KEY and I don't have all day to work around this
                                            ;; so for now we'll just skip the foreign key stuff in the tests.
                                            (when (config/is-test?)
                                              #{:foreign-keys})))})
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:column->base-type         (sql/pattern-based-column->base-type pattern->type)
          :connection-details->spec  (fn [_ details]
                                       (kdb/sqlite3 details))
          :current-datetime-fn       (constantly (k/raw "DATETIME('now')"))
          :date                      date
          :string-length-fn          (constantly :LENGTH)
          :unix-timestamp->timestamp unix-timestamp->timestamp}))

(driver/register-driver! :sqlite (SQLiteDriver.))
