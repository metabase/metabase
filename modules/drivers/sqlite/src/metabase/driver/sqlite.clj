(ns metabase.driver.sqlite
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.parameters.substitution
    :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [schema.core :as s])
  (:import
   (java.sql Connection ResultSet Types)
   (java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (java.time.temporal Temporal)))

(set! *warn-on-reflection* true)

(driver/register! :sqlite, :parent :sql-jdbc)

(defmethod sql.qp/honey-sql-version :sqlite
  [_driver]
  2)

;; SQLite does not support a lot of features, so do not show the options in the interface
(doseq [[feature supported?] {:right-join                             false
                              :full-join                              false
                              :regex                                  false
                              :percentile-aggregations                false
                              :advanced-math-expressions              false
                              :standard-deviation-aggregations        false
                              :schemas                                false
                              :datetime-diff                          true
                              :now                                    true
                              ;; SQLite `LIKE` clauses are case-insensitive by default, and thus cannot be made case-sensitive. So let people know
                              ;; we have this 'feature' so the frontend doesn't try to present the option to you.
                              :case-sensitivity-string-filter-options false}]
  (defmethod driver/database-supports? [:sqlite feature] [_driver _feature _db] supported?))

;; HACK SQLite doesn't support ALTER TABLE ADD CONSTRAINT FOREIGN KEY and I don't have all day to work around this so
;; for now we'll just skip the foreign key stuff in the tests.
(defmethod driver/database-supports? [:sqlite :foreign-keys] [_driver _feature _db] (not config/is-test?))

;; Every SQLite3 file starts with "SQLite Format 3"
;; or "** This file contains an SQLite
;; There is also SQLite2 but last 2 version was 2005
(defn- confirm-file-is-sqlite [filename]
  (with-open [reader (io/input-stream filename)]
    (let [outarr (byte-array 50)]
      (.read reader outarr)
      (let [line (String. outarr)]
        (or (str/includes? line "SQLite format 3")
            (str/includes? line "This file contains an SQLite"))))))

(defmethod driver/can-connect? :sqlite
  [driver details]
  (if (confirm-file-is-sqlite (:db details))
    (sql-jdbc.conn/can-connect? driver details)
    false))

(defmethod driver/db-start-of-week :sqlite
  [_]
  :sunday)

(defmethod sql-jdbc.conn/connection-details->spec :sqlite
  [_ {:keys [db]
      :or   {db "sqlite.db"}
      :as   details}]
  (merge {:subprotocol "sqlite"
          :subname     db}
         (dissoc details :db)
         ;; disallow "FDW" (connecting to other SQLite databases on the local filesystem) -- see https://github.com/metabase/metaboat/issues/152
         {:limit_attached 0}))

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

;; The normal SELECT * FROM table WHERE 1 <> 1 LIMIT 0 query doesn't return any information for SQLite views -- it
;; seems to be the case that the query has to return at least one row
(defmethod sql-jdbc.sync/fallback-metadata-query :sqlite
  [driver _db-name-or-nil _schema-name table-name]
  (sql.qp/format-honeysql driver {:select [:*]
                                  :from   [[(h2x/identifier :table table-name)]]
                                  :limit  1}))

(defn- ->date [& args]
  (-> (into [:date] args)
      (h2x/with-database-type-info "date")))

(defn- ->datetime [& args]
  (-> (into [:datetime] args)
      (h2x/with-database-type-info "datetime")))

(defn- ->time [& args]
  (-> (into [:time] args)
      (h2x/with-database-type-info "time")))

(defn- strftime [format-str expr]
  [:strftime (h2x/literal format-str) expr])

;; See also the [SQLite Date and Time Functions Reference](http://www.sqlite.org/lang_datefunc.html).

(defmethod sql.qp/date [:sqlite :default] [_driver _unit expr] expr)

(defmethod sql.qp/date [:sqlite :second]
  [_driver _unit expr]
  (if (= (h2x/database-type expr) "time")
    (->time (strftime "%H:%M:%S" expr))
    (->datetime (strftime "%Y-%m-%d %H:%M:%S" expr))))

(defmethod sql.qp/date [:sqlite :second-of-minute]
  [_driver _unit expr]
  (h2x/->integer (strftime "%S" expr)))

(defmethod sql.qp/date [:sqlite :minute]
  [_driver _unit expr]
  (if (= (h2x/database-type expr) "time")
    (->time (strftime "%H:%M" expr))
    (->datetime (strftime "%Y-%m-%d %H:%M" expr))))

(defmethod sql.qp/date [:sqlite :minute-of-hour]
  [_driver _ expr]
  (h2x/->integer (strftime "%M" expr)))

(defmethod sql.qp/date [:sqlite :hour]
  [_driver _unit expr]
  (if (= (h2x/database-type expr) "time")
    (->time (strftime "%H:00" expr))
    (->datetime (strftime "%Y-%m-%d %H:00" expr))))

(defmethod sql.qp/date [:sqlite :hour-of-day]
  [_driver _ expr]
  (h2x/->integer (strftime "%H" expr)))

(defmethod sql.qp/date [:sqlite :day]
  [_driver _ expr]
  (->date expr))

;; SQLite day of week (%w) is Sunday = 0 <-> Saturday = 6. We want 1 - 7 so add 1
(defmethod sql.qp/date [:sqlite :day-of-week]
  [_driver _ expr]
  (sql.qp/adjust-day-of-week :sqlite (h2x/->integer (h2x/inc (strftime "%w" expr)))))

(defmethod sql.qp/date [:sqlite :day-of-month]
  [_driver _ expr]
  (h2x/->integer (strftime "%d" expr)))

(defmethod sql.qp/date [:sqlite :day-of-year]
  [_driver _ expr]
  (h2x/->integer (strftime "%j" expr)))

(defmethod sql.qp/date [:sqlite :week]
  [_ _ expr]
  (let [week-extract-fn (fn [expr]
                          ;; Move back 6 days, then forward to the next Sunday
                          (->date expr
                                  (h2x/literal "-6 days")
                                  (h2x/literal "weekday 0")))]
    (sql.qp/adjust-start-of-week :sqlite week-extract-fn expr)))

(defmethod sql.qp/date [:sqlite :week-of-year-iso]
  [driver _ expr]
  ;; Maybe we can follow the algorithm here https://en.wikipedia.org/wiki/ISO_week_date#Algorithms
  (throw (ex-info (tru "Sqlite doesn't support extract isoweek")
                  {:driver driver
                   :form   expr
                   :type   qp.error-type/invalid-query})))

(defmethod sql.qp/date [:sqlite :month]
  [_driver _ expr]
  (->date expr (h2x/literal "start of month")))

(defmethod sql.qp/date [:sqlite :month-of-year]
  [_driver _ expr]
  (h2x/->integer (strftime "%m" expr)))

;;    DATE(DATE(%s, 'start of month'), '-' || ((STRFTIME('%m', %s) - 1) % 3) || ' months')
;; -> DATE(DATE('2015-11-16', 'start of month'), '-' || ((STRFTIME('%m', '2015-11-16') - 1) % 3) || ' months')
;; -> DATE('2015-11-01', '-' || ((11 - 1) % 3) || ' months')
;; -> DATE('2015-11-01', '-' || 1 || ' months')
;; -> DATE('2015-11-01', '-1 months')
;; -> '2015-10-01'
(defmethod sql.qp/date [:sqlite :quarter]
  [_driver _ expr]
  (->date
    (->date expr (h2x/literal "start of month"))
    [:||
     (h2x/literal "-")
     (h2x/mod (h2x/dec (strftime "%m" expr))
              3)
     (h2x/literal " months")]))

;; q = (m + 2) / 3
(defmethod sql.qp/date [:sqlite :quarter-of-year]
  [_driver _ expr]
  (h2x// (h2x/+ (strftime "%m" expr)
                2)
         3))

(defmethod sql.qp/date [:sqlite :year]
  [_driver _ expr]
  (->date expr (h2x/literal "start of year")))

(defmethod sql.qp/date [:sqlite :year-of-era]
  [_driver _ expr]
  (h2x/->integer (strftime "%Y" expr)))

(defmethod sql.qp/add-interval-honeysql-form :sqlite
  [_driver hsql-form amount unit]
  (let [[multiplier sqlite-unit] (case unit
                                   :second  [1 "seconds"]
                                   :minute  [1 "minutes"]
                                   :hour    [1 "hours"]
                                   :day     [1 "days"]
                                   :week    [7 "days"]
                                   :month   [1 "months"]
                                   :quarter [3 "months"]
                                   :year    [1 "years"])]
    (->datetime hsql-form (h2x/literal (format "%+d %s" (* amount multiplier) sqlite-unit)))))

(defmethod sql.qp/unix-timestamp->honeysql [:sqlite :seconds]
  [_ _ expr]
  (->datetime expr (h2x/literal "unixepoch")))

(defmethod sql.qp/cast-temporal-string [:sqlite :Coercion/ISO8601->DateTime]
  [_driver _semantic_type expr]
  (->datetime expr))

(defmethod sql.qp/cast-temporal-string [:sqlite :Coercion/ISO8601->Date]
  [_driver _semantic_type expr]
  (->date expr))

(defmethod sql.qp/cast-temporal-string [:sqlite :Coercion/ISO8601->Time]
  [_driver _semantic_type expr]
  (->time expr))

;; SQLite doesn't like Temporal values getting passed in as prepared statement args, so we need to convert them to
;; date literal strings instead to get things to work
;;
;; TODO - not sure why this doesn't need to be done in `->honeysql` as well? I think it's because the MBQL date values
;; are funneled through the `date` family of functions above
;;
;; TIMESTAMP FIXME — this doesn't seem like the correct thing to do for non-Dates. I think params only support dates
;; rn however
(s/defmethod driver.sql/->prepared-substitution [:sqlite Temporal] :- driver.sql/PreparedStatementSubstitution
  [_driver date]
  ;; for anything that's a Temporal value convert it to a yyyy-MM-dd formatted date literal
  ;; string For whatever reason the SQL generated from parameters ends up looking like `WHERE date(some_field) = ?`
  ;; sometimes so we need to use just the date rather than a full ISO-8601 string
  (sql.params.substitution/make-stmt-subs "?" [(t/format "yyyy-MM-dd" date)]))

;; SQLite doesn't support `TRUE`/`FALSE`; it uses `1`/`0`, respectively; convert these booleans to numbers.
(defmethod sql.qp/->honeysql [:sqlite Boolean]
  [_ bool]
  (if bool 1 0))

(defmethod sql.qp/->honeysql [:sqlite :substring]
  [driver [_ arg start length]]
  (if length
    [:substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start) (sql.qp/->honeysql driver length)]
    [:substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start)]))

(defmethod sql.qp/->honeysql [:sqlite :concat]
  [driver [_ & args]]
  (into
   [:||]
   (mapv (partial sql.qp/->honeysql driver) args)))

(defmethod sql.qp/->honeysql [:sqlite :floor]
  [_driver [_ arg]]
  [:round (h2x/- arg 0.5)])

(defmethod sql.qp/->honeysql [:sqlite :ceil]
  [_driver [_ arg]]
  [:case
   ;; if we're ceiling a whole number, just cast it to an integer
   ;; [:ceil 1.0] should returns 1
   [:= [:round arg] arg] (h2x/->integer arg)
   :else                 [:round (h2x/+ arg 0.5)]])

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
  [:date (h2x/literal (u.date/format-sql t))])

(defmethod sql.qp/->honeysql [:sqlite LocalDateTime]
  [driver t]
  (if (zero-time? t)
    (sql.qp/->honeysql driver (t/local-date t))
    [:datetime (h2x/literal (u.date/format-sql t))]))

(defmethod sql.qp/->honeysql [:sqlite LocalTime]
  [_ t]
  [:time (h2x/literal (u.date/format-sql t))])

(defmethod sql.qp/->honeysql [:sqlite OffsetDateTime]
  [driver t]
  (if (zero-time? t)
    (sql.qp/->honeysql driver (t/local-date t))
    [:datetime (h2x/literal (u.date/format-sql t))]))

(defmethod sql.qp/->honeysql [:sqlite OffsetTime]
  [_ t]
  [:time (h2x/literal (u.date/format-sql t))])

(defmethod sql.qp/->honeysql [:sqlite ZonedDateTime]
  [driver t]
  (if (zero-time? t)
    (sql.qp/->honeysql driver (t/local-date t))
    [:datetime (h2x/literal (u.date/format-sql t))]))

;; SQLite defaults everything to UTC
(defmethod driver/db-default-timezone :sqlite
  [_driver _database]
  "UTC")

(defmethod sql-jdbc.sync/active-tables :sqlite
  [& args]
  (apply sql-jdbc.sync/post-filtered-active-tables args))

(defmethod sql.qp/current-datetime-honeysql-form :sqlite
  [_]
  [:datetime (h2x/literal :now)])

(defmethod sql.qp/datetime-diff [:sqlite :year]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :month x y) 12))

(defmethod sql.qp/datetime-diff [:sqlite :quarter]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :month x y) 3))

(defmethod sql.qp/datetime-diff [:sqlite :month]
  [driver _unit x y]
  (let [extract            (fn [unit x] (sql.qp/date driver unit x))
        year-diff          (h2x/- (extract :year y) (extract :year x))
        month-of-year-diff (h2x/- (extract :month-of-year y) (extract :month-of-year x))
        total-month-diff   (h2x/+ month-of-year-diff (h2x/* year-diff 12))]
    (h2x/+ total-month-diff
          ;; total-month-diff counts month boundaries not whole months, so we need to adjust
          ;; if x<y but x>y in the month calendar then subtract one month
          ;; if x>y but x<y in the month calendar then add one month
          [:case
           [:and [:< x y] [:> (extract :day-of-month x) (extract :day-of-month y)]]
           -1
           [:and [:> x y] [:< (extract :day-of-month x) (extract :day-of-month y)]]
           1
           :else 0])))

(defmethod sql.qp/datetime-diff [:sqlite :week]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :day x y) 7))

(defmethod sql.qp/datetime-diff [:sqlite :day]
  [_driver _unit x y]
  (h2x/->integer
    (h2x/- [:julianday y (h2x/literal "start of day")]
           [:julianday x (h2x/literal "start of day")])))

(defmethod sql.qp/datetime-diff [:sqlite :hour]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :second x y) 3600))

(defmethod sql.qp/datetime-diff [:sqlite :minute]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :second x y) 60))

(defmethod sql.qp/datetime-diff [:sqlite :second]
  [_driver _unit x y]
  ;; strftime strftime('%s', <timestring>) returns the unix time as an integer.
  (h2x/- (strftime "%s" y) (strftime "%s" x)))

;; SQLite's JDBC driver is fussy and won't let you change connections to read-only after you create them. So skip that
;; step. SQLite doesn't have a notion of session timezones so don't do that either. The only thing we're doing here from
;; the default impl is setting the transaction isolation level
(defmethod sql-jdbc.execute/do-with-connection-with-options :sqlite
  [driver db-or-id-or-spec options f]
  (sql-jdbc.execute/do-with-resolved-connection
   driver
   db-or-id-or-spec
   options
   (fn [^Connection conn]
     (when-not (sql-jdbc.execute/recursive-connection?)
       (sql-jdbc.execute/set-best-transaction-level! driver conn))
     (f conn))))

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

;; SQLite has no intrinsic date/time type. The sqlite-jdbc driver provides the following de-facto mappings:
;;    DATE or DATETIME => Types/DATE (only if type is int or string)
;;    TIMESTAMP => Types/TIMESTAMP (only if type is int)
;; The data itself can be stored either as
;;    1) integer (unix epoch) - this is "point in time", so no confusion about timezone
;;    2) float (julian days) - this is "point in time", so no confusion about timezone
;;    3) string (ISO8601) - zoned or unzoned depending on content, sqlite-jdbc always treat it as local time
;; Note that it is possible to store other invalid data in the column as SQLite does not perform any validation.
(defn- sqlite-handle-timestamp
  [^ResultSet rs ^Integer i]
  (let [obj (.getObject rs i)]
    (cond
      ;; For strings, use our own parser which is more flexible than sqlite-jdbc's and handles timezones correctly
      (instance? String obj) (u.date/parse obj)
      ;; For other types, fallback to sqlite-jdbc's parser
      ;; Even in DATE column, it is possible to put DATETIME, so always treat as DATETIME
      (some? obj) (t/local-date-time (.getTimestamp rs i)))))

(defmethod sql-jdbc.execute/read-column-thunk [:sqlite Types/DATE]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (sqlite-handle-timestamp rs i)))

(defmethod sql-jdbc.execute/read-column-thunk [:sqlite Types/TIMESTAMP]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (sqlite-handle-timestamp rs i)))
