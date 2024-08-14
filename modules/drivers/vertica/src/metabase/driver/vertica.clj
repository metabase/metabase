(ns metabase.driver.vertica
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.driver :as driver]
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
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log])
  (:import
   (java.sql ResultSet ResultSetMetaData Types)))

(set! *warn-on-reflection* true)

(driver/register! :vertica, :parent #{:sql-jdbc
                                      ::sql-jdbc.legacy/use-legacy-classes-for-read-and-set
                                      ::sql.qp.empty-string-is-null/empty-string-is-null})

(doseq [[feature supported?] {:convert-timezone          true
                              :datetime-diff             true
                              :now                       true
                              :identifiers-with-spaces   true
                              :percentile-aggregations   false
                              :test/jvm-timezone-setting false}]
  (defmethod driver/database-supports? [:vertica feature] [_driver _feature _db] supported?))

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
  [_driver]
  (h2x/with-database-type-info [:current_timestamp [:inline 6]] "timestamptz"))

(defmethod sql.qp/unix-timestamp->honeysql [:vertica :seconds]
  [_driver _seconds-or-milliseconds honeysql-expr]
  (h2x/with-database-type-info [:to_timestamp honeysql-expr] "timestamp"))

;; TODO - not sure if needed or not
(defn- cast-timestamp
  "Vertica requires stringified timestamps (what Date/DateTime/Timestamps are converted to) to be cast as timestamps
  before date operations can be performed. This function will add that cast if it is a timestamp, otherwise this is a
  no-op."
  [expr]
  ;; TODO -- this seems clearly wrong for LocalTimes and OffsetTimes
  (if (instance? java.time.temporal.Temporal expr)
    (h2x/cast :timestamp expr)
    expr))

(defn- date-trunc [unit expr]
  (-> [:date_trunc (h2x/literal unit) (cast-timestamp expr)]
      (h2x/with-database-type-info (h2x/database-type expr))))

(defn- extract  [unit expr] [::h2x/extract unit               (cast-timestamp expr)])
(defn- datediff [unit a b]  [:datediff     (h2x/literal unit) (cast-timestamp a) (cast-timestamp b)])

(def ^:private extract-integer (comp h2x/->integer extract))

(defmethod sql.qp/date [:vertica :default]         [_driver _unit expr] expr)
(defmethod sql.qp/date [:vertica :minute]          [_driver _unit expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:vertica :minute-of-hour]  [_driver _unit expr] (extract-integer :minute expr))
(defmethod sql.qp/date [:vertica :hour]            [_driver _unit expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:vertica :hour-of-day]     [_driver _unit expr] (extract-integer :hour expr))
(defmethod sql.qp/date [:vertica :day]             [_driver _unit expr] (h2x/->date expr))
(defmethod sql.qp/date [:vertica :day-of-month]    [_driver _unit expr] (extract-integer :day expr))
(defmethod sql.qp/date [:vertica :day-of-year]     [_driver _unit expr] (extract-integer :doy expr))
(defmethod sql.qp/date [:vertica :month]           [_driver _unit expr] (date-trunc :month expr))
(defmethod sql.qp/date [:vertica :month-of-year]   [_driver _unit expr] (extract-integer :month expr))
(defmethod sql.qp/date [:vertica :quarter]         [_driver _unit expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:vertica :quarter-of-year] [_driver _unit expr] (extract-integer :quarter expr))
(defmethod sql.qp/date [:vertica :year]            [_driver _unit expr] (date-trunc :year expr))
(defmethod sql.qp/date [:vertica :year-of-era]     [_driver _unit expr] (extract-integer :year expr))

(defmethod sql.qp/date [:vertica :week]
  [_driver _unit expr]
  (sql.qp/adjust-start-of-week :vertica (partial date-trunc :week) (cast-timestamp expr)))

(defmethod sql.qp/date [:vertica :week-of-year-iso]
  [_driver _unit expr]
  [:week_iso expr])

(defmethod sql.qp/date [:vertica :day-of-week]
  [_driver _unit expr]
  (sql.qp/adjust-day-of-week :vertica [:dayofweek_iso expr]))

(defmethod sql.qp/->honeysql [:vertica :convert-timezone]
  [driver [_ arg target-timezone source-timezone]]
  (let [expr         (cast-timestamp (sql.qp/->honeysql driver arg))
        timestamptz? (h2x/is-of-type? expr "timestamptz")]
    (sql.u/validate-convert-timezone-args timestamptz? target-timezone source-timezone)
    (-> (if timestamptz?
          expr
          (h2x/at-time-zone expr (or source-timezone (qp.timezone/results-timezone-id))))
        (h2x/at-time-zone target-timezone)
        (h2x/with-database-type-info "timestamp"))))

(defmethod sql.qp/->honeysql [:vertica :concat]
  [driver [_ & args]]
  (transduce
   (map #(sql.qp/->honeysql driver %))
   (completing (fn [x y]
                 (if (some? x)
                   [:concat x y]
                   y)))
   nil
   args))

(defmethod sql.qp/datetime-diff [:vertica :year]
  [driver _unit x y]
  (let [months (sql.qp/datetime-diff driver :month x y)]
    (h2x/->integer [:trunc (h2x// months 12)])))

(defmethod sql.qp/datetime-diff [:vertica :quarter]
  [driver _unit x y]
  (let [months (sql.qp/datetime-diff driver :month x y)]
    (h2x/->integer [:trunc (h2x// months 3)])))

(defmethod sql.qp/datetime-diff [:vertica :month]
  [_driver _unit x y]
  (h2x/+ (datediff :month x y)
         ;; datediff counts month boundaries not whole months, so we need to adjust
         ;; if x<y but x>y in the month calendar then subtract one month
         ;; if x>y but x<y in the month calendar then add one month
         [:case
          [:and
           [:< (cast-timestamp x) (cast-timestamp y)]
           [:> (extract :day x) (extract :day y)]] -1
          [:and
           [:> (cast-timestamp x) (cast-timestamp y)]
           [:< (extract :day x) (extract :day y)]] 1
          :else [:inline 0]]))

(defmethod sql.qp/datetime-diff [:vertica :week]
  [_driver _unit x y]
  (h2x/->integer [:trunc (h2x// (datediff :day x y) 7)]))

(defmethod sql.qp/datetime-diff [:vertica :day]
  [_driver _unit x y]
  (datediff :day x y))

(defmethod sql.qp/datetime-diff [:vertica :hour]
  [_driver _unit x y]
  (let [seconds (h2x/- (extract :epoch y) (extract :epoch x))]
    (h2x/->integer [:trunc (h2x// seconds 3600)])))

(defmethod sql.qp/datetime-diff [:vertica :minute]
  [_driver _unit x y]
  (let [seconds (h2x/- (extract :epoch y) (extract :epoch x))]
    (h2x/->integer [:trunc (h2x// seconds 60)])))

(defmethod sql.qp/datetime-diff [:vertica :second]
  [_driver _unit x y]
  (h2x/->integer [:trunc (h2x/- (extract :epoch y) (extract :epoch x))]))

(defmethod sql.qp/->honeysql [:vertica :regex-match-first]
  [driver [_ arg pattern]]
  [:regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)])

(defn- format-percentile
  [_fn [arg p]]
  (let [[arg-sql & arg-args] (sql/format-expr arg {:nested true})
        p                    (if (number? p)
                               [:inline p]
                               p)
        [p-sql & p-args]     (sql/format-expr p {:nested true})]
    (into [(format "APPROXIMATE_PERCENTILE(%s USING PARAMETERS percentile=%s)"
                   arg-sql
                   p-sql)]
          cat
          [arg-args p-args])))

(sql/register-fn! ::percentile #'format-percentile)

(defmethod sql.qp/->honeysql [:vertica :percentile]
  [driver [_ arg p]]
  (let [arg (sql.qp/->honeysql driver arg)
        p   (sql.qp/->honeysql driver p)]
    [::percentile arg p]))

(defmethod sql.qp/->honeysql [:vertica :median]
  [driver [_ arg]]
  [:approximate_median (sql.qp/->honeysql driver arg)])

(defmethod sql.qp/->honeysql [:vertica java.time.LocalDate]
  [_driver t]
  (-> [:raw (format "date '%s'" (u.date/format t))]
      (h2x/with-database-type-info "date")))

(defmethod sql.qp/->honeysql [:vertica java.time.LocalTime]
  [_driver t]
  (-> [:raw (format "time '%s'" (u.date/format "HH:mm:ss.SSS" t))]
      (h2x/with-database-type-info "time")))

(defmethod sql.qp/->honeysql [:vertica java.time.OffsetTime]
  [_driver t]
  (-> [:raw (format "time with time zone '%s'" (u.date/format "HH:mm:ss.SSS xxx" t))]
      (h2x/with-database-type-info "timetz")))

(defmethod sql.qp/->honeysql [:vertica java.time.LocalDateTime]
  [_driver t]
  (-> [:raw (format "timestamp '%s'" (u.date/format "yyyy-MM-dd HH:mm:ss.SSS" t))]
      (h2x/with-database-type-info "timestamp")))

(defmethod sql.qp/->honeysql [:vertica java.time.OffsetDateTime]
  [_driver t]
  (-> [:raw (format "timestamp with time zone '%s'" (u.date/format "yyyy-MM-dd HH:mm:ss.SSS xxx" t))]
      (h2x/with-database-type-info "timestamptz")))

(defmethod sql.qp/->honeysql [:vertica java.time.ZonedDateTime]
  [driver t]
  (sql.qp/->honeysql driver (t/offset-date-time t)))

(defmethod sql.qp/add-interval-honeysql-form :vertica
  [_ hsql-form amount unit]
  ;; using `timestampadd` instead of `+ (INTERVAL)` because vertica add inteval for month, or year
  ;; by adding the equivalent number of days, not adding the unit compoinent.
  ;; For example `select date '2004-02-02' + interval '1 year' will return `2005-02-01` because it's adding
  ;; 365 days under the hood and 2004 is a leap year. Whereas other dbs will return `2006-02-02`.
  ;; So we use timestampadd to make the behavior consistent with other dbs
  (let [acceptable-types (case unit
                           (:millisecond :second :minute :hour) #{"time" "timetz" "timestamp" "timestamptz"}
                           (:day :week :month :quarter :year)   #{"date" "timestamp" "timestamptz"})
        hsql-form        (h2x/cast-unless-type-in "timestamp" acceptable-types hsql-form)]
    [:timestampadd unit (sql.qp/inline-num amount) hsql-form]))

(defn- materialized-views
  "Fetch the Materialized Views for a Vertica `database`.
   These are returned as a set of maps, the same format as `:tables` returned by `describe-database`."
  [database]
  (try (set (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                        ["SELECT TABLE_SCHEMA AS \"schema\", TABLE_NAME AS \"name\" FROM V_CATALOG.VIEWS;"]))
       (catch Throwable e
         (log/error e "Failed to fetch materialized views for this database"))))

(defmethod driver/describe-database :vertica
  [driver database]
  (-> ((get-method driver/describe-database :sql-jdbc) driver database)
      (update :tables set/union (materialized-views database))))

(defmethod driver/db-default-timezone :vertica
  [_driver _database]
  ;; There is no Database default timezone in Vertica, you can change the SESSION timezone with `SET TIME ZONE TO ...`,
  ;; but TIMESTAMP WITH TIMEZONEs are all stored in UTC. See
  ;; https://www.vertica.com/docs/9.0.x/HTML/index.htm#Authoring/InstallationGuide/AppendixTimeZones/UsingTimeZonesWithHPVertica.htm
  "UTC")

(defmethod sql-jdbc.execute/set-timezone-sql :vertica [_] "SET TIME ZONE TO %s;")

(defmethod sql-jdbc.execute/read-column-thunk [:vertica Types/TIME]
  [_driver ^ResultSet rs _rsmeta ^Long i]
  (fn read-time []
    (when-let [s (.getString rs i)]
      (let [t (u.date/parse s)]
        (log/tracef "(.getString rs %d) [TIME] -> %s -> %s" i s t)
        t))))

(defmethod sql-jdbc.execute/read-column-thunk [:vertica Types/TIME_WITH_TIMEZONE]
  [_driver ^ResultSet rs _rsmeta ^Long i]
  (fn read-time-with-timezone []
    (when-let [s (.getString rs i)]
      (let [t (u.date/parse s)]
        (log/tracef "(.getString rs %d) [TIME_WITH_TIMEZONE] -> %s -> %s" i s t)
        t))))

;; for some reason vertica `TIMESTAMP WITH TIME ZONE` columns still come back as `Type/TIMESTAMP`, which seems like a
;; bug with the JDBC driver?
(defmethod sql-jdbc.execute/read-column-thunk [:vertica Types/TIMESTAMP]
  [_driver ^ResultSet rs ^ResultSetMetaData rsmeta ^Long i]
  (let [has-timezone?    (= (u/lower-case-en (.getColumnTypeName rsmeta i)) "timestamptz")
        ^String timezone (when has-timezone? "UTC")]
    (fn read-timestamp []
      (when-let [s (.getString rs i)]
        (let [t (u.date/parse s timezone)]
          (log/tracef "(.getString rs %d) [TIME_WITH_TIMEZONE] -> %s -> %s" i s t)
          t)))))
