(ns metabase.driver.vertica
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [honeysql.format :as hformat]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.empty-string-is-null
    :as sql.qp.empty-string-is-null]
   [metabase.driver.sql.util :as sql.u]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honeysql-extensions :as hx]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log])
  (:import
   (java.sql ResultSet ResultSetMetaData Types)))

(driver/register! :vertica, :parent #{:sql-jdbc
                                      ::sql-jdbc.legacy/use-legacy-classes-for-read-and-set
                                      ::sql.qp.empty-string-is-null/empty-string-is-null})

(defmethod driver/supports? [:vertica :percentile-aggregations] [_ _] false)

(defmethod driver/database-supports? [:vertica :datetime-diff] [_ _ _] true)

(defmethod driver/supports? [:vertica :now] [_ _] true)

(defmethod driver/database-supports? [:vertica :convert-timezone]
  [_driver _feature _database]
  true)

(defmethod driver/database-supports? [:vertica :test/jvm-timezone-setting]
  [_driver _feature _database]
  false)

(defmethod driver/db-start-of-week :vertica
  [_]
  :monday)

(defmethod sql-jdbc.sync/database-type->base-type :vertica
  [_ database-type]
  ({:Boolean                   :type/Boolean
    :Integer                   :type/Integer
    :Bigint                    :type/BigInteger
    :Varbinary                 :type/*
    :Binary                    :type/*
    :Char                      :type/Text
    :Varchar                   :type/Text
    :Money                     :type/Decimal
    :Numeric                   :type/Decimal
    :Double                    :type/Decimal
    :Float                     :type/Float
    :Date                      :type/Date
    :Time                      :type/Time
    :TimeTz                    :type/TimeWithLocalTZ
    :Timestamp                 :type/DateTime
    :TimestampTz               :type/DateTimeWithLocalTZ
    :AUTO_INCREMENT            :type/Integer
    (keyword "Long Varchar")   :type/Text
    (keyword "Long Varbinary") :type/*} database-type))

(defmethod sql-jdbc.conn/connection-details->spec :vertica
  [_ {:keys [host port db dbname]
      :or   {host "localhost", port 5433, db ""}
      :as   details}]
  (-> (merge {:classname   "com.vertica.jdbc.Driver"
              :subprotocol "vertica"
              :subname     (str "//" host ":" port "/" (or dbname db))}
             (dissoc details :host :port :dbname :db :ssl))
      (sql-jdbc.common/handle-additional-options details)))

(defmethod sql.qp/current-datetime-honeysql-form :vertica
  [_]
  (hx/with-database-type-info (hx/call :current_timestamp 6) :TimestampTz))

(defmethod sql.qp/unix-timestamp->honeysql [:vertica :seconds]
  [_ _ expr]
  (hx/call :to_timestamp expr))

;; TODO - not sure if needed or not
(defn- cast-timestamp
  "Vertica requires stringified timestamps (what Date/DateTime/Timestamps are converted to) to be cast as timestamps
  before date operations can be performed. This function will add that cast if it is a timestamp, otherwise this is a
  no-op."
  [expr]
  (if (instance? java.time.temporal.Temporal expr)
    (hx/cast :timestamp expr)
    expr))

(defn- date-trunc [unit expr] (hx/call :date_trunc (hx/literal unit) (cast-timestamp expr)))
(defn- extract    [unit expr] (hx/call :extract    unit              (cast-timestamp expr)))
(defn- datediff   [unit a b]  (hx/call :datediff   (hx/literal unit) (cast-timestamp a) (cast-timestamp b)))

(def ^:private extract-integer (comp hx/->integer extract))

(defmethod sql.qp/date [:vertica :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:vertica :minute]          [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:vertica :minute-of-hour]  [_ _ expr] (extract-integer :minute expr))
(defmethod sql.qp/date [:vertica :hour]            [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:vertica :hour-of-day]     [_ _ expr] (extract-integer :hour expr))
(defmethod sql.qp/date [:vertica :day]             [_ _ expr] (hx/->date expr))
(defmethod sql.qp/date [:vertica :day-of-month]    [_ _ expr] (extract-integer :day expr))
(defmethod sql.qp/date [:vertica :day-of-year]     [_ _ expr] (extract-integer :doy expr))
(defmethod sql.qp/date [:vertica :month]           [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:vertica :month-of-year]   [_ _ expr] (extract-integer :month expr))
(defmethod sql.qp/date [:vertica :quarter]         [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:vertica :quarter-of-year] [_ _ expr] (extract-integer :quarter expr))
(defmethod sql.qp/date [:vertica :year]            [_ _ expr] (date-trunc :year expr))
(defmethod sql.qp/date [:vertica :year-of-era]     [_ _ expr] (extract-integer :year expr))

(defmethod sql.qp/date [:vertica :week]
  [_ _ expr]
  (sql.qp/adjust-start-of-week :vertica (partial date-trunc :week) (cast-timestamp expr)))

(defmethod sql.qp/date [:vertica :week-of-year-iso] [_driver _ expr] (hx/call :week_iso expr))

(defmethod sql.qp/date [:vertica :day-of-week]
  [_ _ expr]
  (sql.qp/adjust-day-of-week :vertica (hx/call :dayofweek_iso expr)))

(defmethod sql.qp/->honeysql [:vertica :convert-timezone]
  [driver [_ arg target-timezone source-timezone]]
  (let [expr         (cast-timestamp (sql.qp/->honeysql driver arg))
        timestamptz? (hx/is-of-type? expr "timestamptz")]
    (sql.u/validate-convert-timezone-args timestamptz? target-timezone source-timezone)
    (-> (if timestamptz?
          expr
          (hx/at-time-zone expr (or source-timezone (qp.timezone/results-timezone-id))))
        (hx/at-time-zone target-timezone)
        (hx/with-database-type-info "timestamp"))))

(defmethod sql.qp/->honeysql [:vertica :concat]
  [driver [_ & args]]
  (->> args
       (map (partial sql.qp/->honeysql driver))
       (reduce (partial hx/call :concat))))

(defmethod sql.qp/datetime-diff [:vertica :year]
  [driver _unit x y]
  (let [months (sql.qp/datetime-diff driver :month x y)]
    (hx/->integer (hx/call :trunc (hx// months 12)))))

(defmethod sql.qp/datetime-diff [:vertica :quarter]
  [driver _unit x y]
  (let [months (sql.qp/datetime-diff driver :month x y)]
    (hx/->integer (hx/call :trunc (hx// months 3)))))

(defmethod sql.qp/datetime-diff [:vertica :month]
  [_driver _unit x y]
  (hx/+ (datediff :month x y)
        ;; datediff counts month boundaries not whole months, so we need to adjust
        ;; if x<y but x>y in the month calendar then subtract one month
        ;; if x>y but x<y in the month calendar then add one month
        (hx/call
         :case
         (hx/call :and
                  (hx/call :< (cast-timestamp x) (cast-timestamp y))
                  (hx/call :> (extract :day x) (extract :day y))) -1
         (hx/call :and
                  (hx/call :> (cast-timestamp x) (cast-timestamp y))
                  (hx/call :< (extract :day x) (extract :day y))) 1
         :else 0)))

(defmethod sql.qp/datetime-diff [:vertica :week]
  [_driver _unit x y]
  (hx/->integer (hx/call :trunc (hx// (datediff :day x y) 7))))

(defmethod sql.qp/datetime-diff [:vertica :day]
  [_driver _unit x y]
  (datediff :day x y))

(defmethod sql.qp/datetime-diff [:vertica :hour]
  [_driver _unit x y]
  (let [seconds (hx/- (extract :epoch y) (extract :epoch x))]
    (hx/->integer (hx/call :trunc (hx// seconds 3600)))))

(defmethod sql.qp/datetime-diff [:vertica :minute]
  [_driver _unit x y]
  (let [seconds (hx/- (extract :epoch y) (extract :epoch x))]
    (hx/->integer (hx/call :trunc (hx// seconds 60)))))

(defmethod sql.qp/datetime-diff [:vertica :second]
  [_driver _unit x y]
  (hx/->integer (hx/call :trunc (hx/- (extract :epoch y) (extract :epoch x)))))

(defmethod sql.qp/->honeysql [:vertica :regex-match-first]
  [driver [_ arg pattern]]
  (hx/call :regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)))

(defmethod sql.qp/->honeysql [:vertica :percentile]
  [driver [_ arg p]]
  (hx/raw (format "APPROXIMATE_PERCENTILE(%s USING PARAMETERS percentile=%s)"
                  (hformat/to-sql (sql.qp/->honeysql driver arg))
                  (hformat/to-sql (sql.qp/->honeysql driver p)))))

(defmethod sql.qp/->honeysql [:vertica :median]
  [driver [_ arg]]
  (hx/call :approximate_median (sql.qp/->honeysql driver arg)))

(defmethod sql.qp/add-interval-honeysql-form :vertica
  [_ hsql-form amount unit]
  (hx/call :timestampadd unit)
  ;; using `timestampadd` instead of `+ (INTERVAL)` because vertica add inteval for month, or year
  ;; by adding the equivalent number of days, not adding the unit compoinent.
  ;; For example `select date '2004-02-02' + interval '1 year' will return `2005-02-01` because it's adding
  ;; 365 days under the hood and 2004 is a leap year. Whereas other dbs will return `2006-02-02`.
  ;; So we use timestampadd to make the behavior consistent with other dbs
  (let [acceptable-types (case unit
                           (:millisecond :second :minute :hour) #{"time" "timetz" "timestamp" "timestamptz"}
                           (:day :week :month :quarter :year)   #{"date" "timestamp" "timestamptz"})
        hsql-form        (hx/cast-unless-type-in "timestamp" acceptable-types hsql-form)]
    (hx/call :timestampadd unit amount hsql-form)))

(defn- materialized-views
  "Fetch the Materialized Views for a Vertica `database`.
   These are returned as a set of maps, the same format as `:tables` returned by `describe-database`."
  [database]
  (try (set (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                        ["SELECT TABLE_SCHEMA AS \"schema\", TABLE_NAME AS \"name\" FROM V_CATALOG.VIEWS;"]))
       (catch Throwable e
         (log/error e (trs "Failed to fetch materialized views for this database")))))

(defmethod driver/describe-database :vertica
  [driver database]
  (-> ((get-method driver/describe-database :sql-jdbc) driver database)
      (update :tables set/union (materialized-views database))))

(defmethod driver.common/current-db-time-date-formatters :vertica
  [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss z"))

(defmethod driver.common/current-db-time-native-query :vertica
  [_]
  "select to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS TZ')")

(defmethod driver/current-db-time :vertica
  [& args]
  (apply driver.common/current-db-time args))

(defmethod sql-jdbc.execute/set-timezone-sql :vertica [_] "SET TIME ZONE TO %s;")

(defmethod sql-jdbc.execute/read-column [:vertica Types/TIME]
  [_ _ ^ResultSet rs _ ^Integer i]
  (when-let [s (.getString rs i)]
    (let [t (u.date/parse s)]
      (log/tracef "(.getString rs %d) [TIME] -> %s -> %s" i s t)
      t)))

(defmethod sql-jdbc.execute/read-column [:vertica Types/TIME_WITH_TIMEZONE]
  [_ _ ^ResultSet rs _ ^Integer i]
  (when-let [s (.getString rs i)]
    (let [t (u.date/parse s)]
      (log/tracef "(.getString rs %d) [TIME_WITH_TIMEZONE] -> %s -> %s" i s t)
      t)))

;; for some reason vertica `TIMESTAMP WITH TIME ZONE` columns still come back as `Type/TIMESTAMP`, which seems like a
;; bug with the JDBC driver?
(defmethod sql-jdbc.execute/read-column [:vertica Types/TIMESTAMP]
  [_ _ ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (when-let [s (.getString rs i)]
    (let [has-timezone? (= (u/lower-case-en (.getColumnTypeName rsmeta i)) "timestamptz")
          t             (u.date/parse s (when has-timezone? "UTC"))]
      (log/tracef "(.getString rs %d) [TIME_WITH_TIMEZONE] -> %s -> %s" i s t)
      t)))
