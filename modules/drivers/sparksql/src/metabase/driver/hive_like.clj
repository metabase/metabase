(ns metabase.driver.hive-like
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x])
  (:import
   (java.sql ResultSet Types)
   (java.time LocalDate OffsetDateTime ZonedDateTime)))

(set! *warn-on-reflection* true)

(driver/register! :hive-like
                  :parent #{:sql-jdbc ::sql-jdbc.legacy/use-legacy-classes-for-read-and-set}
                  :abstract? true)

(doseq [[feature supported?] {:now           true
                              :datetime-diff true}]
  (defmethod driver/database-supports? [:hive-like feature] [_driver _feature _db] supported?))

(defmethod driver/escape-alias :hive-like
  [driver s]
  ;; replace question marks inside aliases with `_QMARK_`, otherwise Spark SQL will interpret them as JDBC parameter
  ;; placeholder (yes, even if the identifier is quoted... (:unamused:)
  ;;
  ;; `_QMARK_` is kind of arbitrary but that's what [[munge]] does and it seems like it would lead to less potential
  ;; name clashes than if we just used underscores.
  (let [s (str/replace s #"\?" "_QMARK_")]
    ((get-method driver/escape-alias :sql) driver s)))

(defmethod driver/db-start-of-week :hive-like
  [_]
  :sunday)

(defmethod sql-jdbc.conn/data-warehouse-connection-pool-properties :hive-like
  [driver database]
  ;; The Hive JDBC driver doesn't support `Connection.isValid()`, so we need to supply a test query for c3p0 to use to
  ;; validate connections upon checkout.
  (merge
   ((get-method sql-jdbc.conn/data-warehouse-connection-pool-properties :sql-jdbc) driver database)
   {"preferredTestQuery" "SELECT 1"}))

(defmethod sql-jdbc.sync/database-type->base-type :hive-like
  [_ database-type]
  (condp re-matches (u/lower-case-en (name database-type))
    #"boolean"          :type/Boolean
    #"tinyint"          :type/Integer
    #"smallint"         :type/Integer
    #"int"              :type/Integer
    #"bigint"           :type/BigInteger
    #"float"            :type/Float
    #"double"           :type/Float
    #"double precision" :type/Double
    #"decimal.*"        :type/Decimal
    #"char.*"           :type/Text
    #"varchar.*"        :type/Text
    #"string.*"         :type/Text
    #"binary*"          :type/*
    #"date"             :type/Date
    #"time"             :type/Time
    #"timestamp"        :type/DateTime
    #"interval"         :type/*
    #"array.*"          :type/Array
    #"map"              :type/Dictionary
    #".*"               :type/*))

(defmethod sql.qp/current-datetime-honeysql-form :hive-like
  [_]
  (h2x/with-database-type-info :%now "timestamp"))

(defmethod sql.qp/unix-timestamp->honeysql [:hive-like :seconds]
  [_ _ expr]
  (h2x/->timestamp [:from_unixtime expr]))

(defn- date-format [format-str expr]
  [:date_format expr (h2x/literal format-str)])

(defn- str-to-date [format-str expr]
  (h2x/->timestamp [:from_unixtime [:unix_timestamp expr (h2x/literal format-str)]]))

(defn- trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))

(defmethod sql.qp/date [:hive-like :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:hive-like :minute]          [_ _ expr] (trunc-with-format "yyyy-MM-dd HH:mm" (h2x/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :minute-of-hour]  [_ _ expr] [:minute (h2x/->timestamp expr)])
(defmethod sql.qp/date [:hive-like :hour]            [_ _ expr] (trunc-with-format "yyyy-MM-dd HH" (h2x/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :hour-of-day]     [_ _ expr] [:hour (h2x/->timestamp expr)])
(defmethod sql.qp/date [:hive-like :day]             [_ _ expr] (trunc-with-format "yyyy-MM-dd" (h2x/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :day-of-month]    [_ _ expr] [:dayofmonth (h2x/->timestamp expr)])
(defmethod sql.qp/date [:hive-like :day-of-year]     [_ _ expr] (h2x/->integer (date-format "D" (h2x/->timestamp expr))))
(defmethod sql.qp/date [:hive-like :month]           [_ _ expr] [:trunc (h2x/->timestamp expr) (h2x/literal :MM)])
(defmethod sql.qp/date [:hive-like :month-of-year]   [_ _ expr] [:month (h2x/->timestamp expr)])
(defmethod sql.qp/date [:hive-like :quarter-of-year] [_ _ expr] [:quarter (h2x/->timestamp expr)])
(defmethod sql.qp/date [:hive-like :year]            [_ _ expr] [:trunc (h2x/->timestamp expr) (h2x/literal :year)])

(def ^:private date-extract-units
  "See https://spark.apache.org/docs/3.3.0/api/sql/#extract"
  #{:year :y :years :yr :yrs
    :yearofweek
    :quarter :qtr
    :month :mon :mons :months
    :week :w :weeks
    :day :d :days
    :dayofweek :dow
    :dayofweek_iso :dow_iso
    :doy
    :hour :h :hours :hr :hrs
    :minute :m :min :mins :minutes
    :second :s :sec :seconds :secs})

(defn- format-date-extract
  [_fn [unit expr]]
  {:pre [(contains? date-extract-units unit)]}
  (let [[expr-sql & expr-args] (sql/format-expr expr {:nested true})]
    (into [(format "extract(%s FROM %s)" (name unit) expr-sql)]
          expr-args)))

(sql/register-fn! ::date-extract #'format-date-extract)

(defn- format-interval
  "Interval actually supports more than just plain numbers, but that's all we currently need. See
  https://spark.apache.org/docs/latest/sql-ref-literals.html#interval-literal"
  [_fn [amount unit]]
  {:pre [(number? amount)
         ;; other units are supported too but we're not currently supporting them.
         (#{:year :month :week :day :hour :minute :second :millisecond} unit)]}
  [(format "(interval '%d' %s)" (long amount) (name unit))])

(sql/register-fn! ::interval #'format-interval)

(defmethod sql.qp/date [:hive-like :day-of-week]
  [driver _unit expr]
  (sql.qp/adjust-day-of-week driver (-> [::date-extract :dow (h2x/->timestamp expr)]
                                        (h2x/with-database-type-info "integer"))))

(defmethod sql.qp/date [:hive-like :week]
  [driver _unit expr]
  (let [week-extract-fn (fn [expr]
                          (-> [:date_sub
                               (h2x/+ (h2x/->timestamp expr)
                                      [::interval 1 :day])
                               [::date-extract :dow (h2x/->timestamp expr)]]
                              (h2x/with-database-type-info "timestamp")))]
    (sql.qp/adjust-start-of-week driver week-extract-fn expr)))


(defmethod sql.qp/date [:hive-like :week-of-year-iso]
  [_driver _unit expr]
  [:weekofyear (h2x/->timestamp expr)])

(defmethod sql.qp/date [:hive-like :quarter]
  [_driver _unit expr]
  [:add_months
   [:trunc (h2x/->timestamp expr) (h2x/literal :year)]
   (h2x/* (h2x/- [:quarter (h2x/->timestamp expr)]
                 1)
          3)])

(defmethod sql.qp/->honeysql [:hive-like :replace]
  [driver [_ arg pattern replacement]]
  [:regexp_replace
   (sql.qp/->honeysql driver arg)
   (sql.qp/->honeysql driver pattern)
   (sql.qp/->honeysql driver replacement)])

(defmethod sql.qp/->honeysql [:hive-like :regex-match-first]
  [driver [_ arg pattern]]
  [:regexp_extract (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern) 0])

(defmethod sql.qp/->honeysql [:hive-like :median]
  [driver [_ arg]]
  [:percentile (sql.qp/->honeysql driver arg) 0.5])

(defmethod sql.qp/->honeysql [:hive-like :percentile]
  [driver [_ arg p]]
  [:percentile (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver p)])

(defmethod sql.qp/add-interval-honeysql-form :hive-like
  [driver hsql-form amount unit]
  (if (= unit :quarter)
    (recur driver hsql-form (* amount 3) :month)
    (h2x/+ (h2x/->timestamp hsql-form)
           [::interval amount unit])))

(defmethod sql.qp/datetime-diff [:hive-like :year]
  [driver _unit x y]
  [:div (sql.qp/datetime-diff driver :month x y) 12])

(defmethod sql.qp/datetime-diff [:hive-like :quarter]
  [driver _unit x y]
  [:div (sql.qp/datetime-diff driver :month x y) 3])

(defmethod sql.qp/datetime-diff [:hive-like :month]
  [_driver _unit x y]
  (h2x/->integer [:months_between y x]))

(defmethod sql.qp/datetime-diff [:hive-like :week]
  [_driver _unit x y]
  [:div [:datediff y x] 7])

(defmethod sql.qp/datetime-diff [:hive-like :day]
  [_driver _unit x y]
  [:datediff y x])

(defmethod sql.qp/datetime-diff [:hive-like :hour]
  [driver _unit x y]
  [:div (sql.qp/datetime-diff driver :second x y) 3600])

(defmethod sql.qp/datetime-diff [:hive-like :minute]
  [driver _unit x y]
  [:div (sql.qp/datetime-diff driver :second x y) 60])

(defmethod sql.qp/datetime-diff [:hive-like :second]
  [_driver _unit x y]
  [:- [:unix_timestamp y] [:unix_timestamp x]])

(def ^:dynamic *param-splice-style*
  "How we should splice params into SQL (i.e. 'unprepare' the SQL). Either `:friendly` (the default) or `:paranoid`.
  `:friendly` makes a best-effort attempt to escape strings and generate SQL that is nice to look at, but should not
  be considered safe against all SQL injection -- use this for 'convert to SQL' functionality. `:paranoid` hex-encodes
  strings so SQL injection is impossible; this isn't nice to look at, so use this for actually running a query."
  :friendly)

(defmethod unprepare/unprepare-value [:hive-like String]
  [_ ^String s]
  ;; Because Spark SQL doesn't support parameterized queries (e.g. `?`) convert the entire String to hex and decode.
  ;; e.g. encode `abc` as `decode(unhex('616263'), 'utf-8')` to prevent SQL injection
  (case *param-splice-style*
    :friendly (str \' (sql.u/escape-sql s :backslashes) \')
    :paranoid (format "decode(unhex('%s'), 'utf-8')" (codecs/bytes->hex (.getBytes s "UTF-8")))))

;; Hive/Spark SQL doesn't seem to like DATEs so convert it to a DATETIME first
(defmethod unprepare/unprepare-value [:hive-like LocalDate]
  [driver t]
  (unprepare/unprepare-value driver (t/local-date-time t (t/local-time 0))))

(defmethod unprepare/unprepare-value [:hive-like OffsetDateTime]
  [_ t]
  (format "to_utc_timestamp('%s', '%s')" (u.date/format-sql (t/local-date-time t)) (t/zone-offset t)))

(defmethod unprepare/unprepare-value [:hive-like ZonedDateTime]
  [_ t]
  (format "to_utc_timestamp('%s', '%s')" (u.date/format-sql (t/local-date-time t)) (t/zone-id t)))

;; Hive/Spark SQL doesn't seem to like DATEs so convert it to a DATETIME first
(defmethod sql-jdbc.execute/set-parameter [:hive-like LocalDate]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/local-date-time t (t/local-time 0))))

;; TIMEZONE FIXME — not sure what timezone the results actually come back as
;;
;; Also, pretty sure Spark SQL doesn't have a TIME type anyway.
;; https://spark.apache.org/docs/latest/sql-ref-datatypes.html
(defmethod sql-jdbc.execute/read-column-thunk [:hive-like Types/TIME]
  [_ ^ResultSet rs _rsmeta ^Integer i]
  (fn []
    (when-let [t (.getTimestamp rs i)]
      (t/offset-time (t/local-time t) (t/zone-offset 0)))))

(defmethod sql-jdbc.execute/read-column-thunk [:hive-like Types/DATE]
  [_ ^ResultSet rs _rsmeta ^Integer i]
  (fn []
    (when-let [s (.getString rs i)]
      (u.date/parse s))))

(defmethod sql-jdbc.execute/read-column-thunk [:hive-like Types/TIMESTAMP]
  [_ ^ResultSet rs _rsmeta ^Integer i]
  (fn []
    (when-let [t (.getTimestamp rs i)]
      (t/zoned-date-time (t/local-date-time t) (t/zone-id "UTC")))))
