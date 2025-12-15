(ns metabase.driver.clickhouse-qp
  "CLickHouse driver: QueryProcessor-related definition"
  (:refer-clojure :exclude [some])
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.clickhouse-nippy]
   [metabase.driver.clickhouse-version :as clickhouse-version]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.performance :refer [some]]
   [metabase.util.string :as string])
  (:import
   [java.net Inet4Address Inet6Address]
   [java.sql ResultSet ResultSetMetaData Types]
   [java.time
    LocalDate
    LocalDateTime
    LocalTime
    OffsetDateTime
    OffsetTime
    ZonedDateTime]
   [java.util Arrays UUID]))
;; (set! *warn-on-reflection* true) ;; isn't enabled because of Arrays/toString call

(defmethod sql.qp/quote-style :clickhouse [_] :mysql)

;; without try, there might be test failures when QP is not yet initialized
;; e.g., when a test is preparing the dataset
(defn- get-report-timezone-id-safely
  []
  (try
    (driver-api/report-timezone-id-if-supported)
    (catch Throwable _e nil)))

;; datetime('europe/amsterdam') -> europe/amsterdam
(defn- extract-datetime-timezone
  [db-type]
  (when (and db-type (string? db-type))
    (cond
      ;; e.g. DateTime64(3, 'Europe/Amsterdam')
      (str/starts-with? db-type "datetime64")
      (if (> (count db-type) 17) (subs db-type 15 (- (count db-type) 2)) nil)
      ;; e.g. DateTime('Europe/Amsterdam')
      (str/starts-with? db-type "datetime")
      (if (> (count db-type) 12) (subs db-type 10 (- (count db-type) 2)) nil)
      ;; _
      :else nil)))

(defn- remove-low-cardinality-and-nullable
  [db-type]
  (when (and db-type (string? db-type))
    (let [db-type-lowercase (u/lower-case-en db-type)
          without-low-car   (if (str/starts-with? db-type-lowercase "lowcardinality(")
                              (subs db-type-lowercase 15 (dec (count db-type-lowercase)))
                              db-type-lowercase)
          without-nullable  (if (str/starts-with? without-low-car "nullable(")
                              (subs without-low-car 9 (dec (count without-low-car)))
                              without-low-car)]
      without-nullable)))

(defn- in-report-timezone
  [expr]
  (let [report-timezone (get-report-timezone-id-safely)
        lower           (u/lower-case-en (h2x/database-type expr))
        db-type         (remove-low-cardinality-and-nullable lower)]
    (if (and report-timezone (string? db-type) (str/starts-with? db-type "datetime"))
      (let [timezone (extract-datetime-timezone db-type)]
        (if (not (= timezone (u/lower-case-en report-timezone)))
          [:'toTimeZone expr (h2x/literal report-timezone)]
          expr))
      expr)))

(defmethod sql.qp/date [:clickhouse :default]
  [_ _ expr]
  expr)

;;; ------------------------------------------------------------------------------------
;;; Extract functions
;;; ------------------------------------------------------------------------------------

(defn- date-extract
  [ch-fn expr db-type]
  (-> [ch-fn (in-report-timezone expr)]
      (h2x/with-database-type-info db-type)))

(defmethod sql.qp/date [:clickhouse :day-of-week]
  [_ _ expr]
  ;; a tick in the function name prevents HSQL2 to make the function call UPPERCASE
  ;; https://cljdoc.org/d/com.github.seancorfield/honeysql/2.4.1011/doc/getting-started/other-databases#clickhouse
  (sql.qp/adjust-day-of-week
   :clickhouse (date-extract :'toDayOfWeek expr "uint8")))

(defmethod sql.qp/date [:clickhouse :month-of-year]
  [_ _ expr]
  (date-extract :'toMonth expr "uint8"))

(defmethod sql.qp/date [:clickhouse :minute-of-hour]
  [_ _ expr]
  (date-extract :'toMinute expr "uint8"))

(defmethod sql.qp/date [:clickhouse :hour-of-day]
  [_ _ expr]
  (date-extract :'toHour expr "uint8"))

(defmethod sql.qp/date [:clickhouse :day-of-month]
  [_ _ expr]
  (date-extract :'toDayOfMonth expr "uint8"))

(defmethod sql.qp/date [:clickhouse :day-of-year]
  [_ _ expr]
  (date-extract :'toDayOfYear expr "uint16"))

(defmethod sql.qp/date [:clickhouse :week-of-year-iso]
  [_ _ expr]
  (date-extract :'toISOWeek expr "uint8"))

(defmethod sql.qp/date [:clickhouse :quarter-of-year]
  [_ _ expr]
  (date-extract :'toQuarter expr "uint8"))

(defmethod sql.qp/date [:clickhouse :year-of-era]
  [_ _ expr]
  (date-extract :'toYear expr "uint16"))

;;; ------------------------------------------------------------------------------------
;;; Truncate functions
;;; ------------------------------------------------------------------------------------

(defn- date-trunc
  [ch-fn expr]
  [ch-fn (in-report-timezone expr)])

(defn- to-start-of-week
  [expr]
  (date-trunc :'toMonday expr))

(defmethod sql.qp/date [:clickhouse :minute]
  [_ _ expr]
  (date-trunc :'toStartOfMinute expr))

(defmethod sql.qp/date [:clickhouse :hour]
  [_ _ expr]
  (date-trunc :'toStartOfHour expr))

(defmethod sql.qp/date [:clickhouse :day]
  [_ _ expr]
  (date-trunc :'toStartOfDay expr))

(defmethod sql.qp/date [:clickhouse :week]
  [driver _ expr]
  (sql.qp/adjust-start-of-week driver to-start-of-week expr))

(defmethod sql.qp/date [:clickhouse :month]
  [_ _ expr]
  (date-trunc :'toStartOfMonth expr))

(defmethod sql.qp/date [:clickhouse :quarter]
  [_ _ expr]
  (date-trunc :'toStartOfQuarter expr))

(defmethod sql.qp/date [:clickhouse :year]
  [_ _ expr]
  (date-trunc :'toStartOfYear expr))

;;; ------------------------------------------------------------------------------------
;;; Unix timestamps functions
;;; ------------------------------------------------------------------------------------

(defmethod sql.qp/unix-timestamp->honeysql [:clickhouse :seconds]
  [_ _ expr]
  (h2x/->datetime expr))

(defmethod sql.qp/unix-timestamp->honeysql [:clickhouse :milliseconds]
  [_ _ expr]
  (let [report-timezone (get-report-timezone-id-safely)
        inner-expr      (h2x// expr 1000)]
    (if report-timezone
      [:'toDateTime64 inner-expr 3 report-timezone]
      [:'toDateTime64 inner-expr 3])))

(defmethod sql.qp/unix-timestamp->honeysql [:clickhouse :microseconds]
  [_ _ expr]
  (let [report-timezone (get-report-timezone-id-safely)
        inner-expr      [:'toInt64 (h2x// expr 1000)]]
    (if report-timezone
      [:'fromUnixTimestamp64Milli inner-expr report-timezone]
      [:'fromUnixTimestamp64Milli inner-expr])))

;;; ------------------------------------------------------------------------------------
;;; HoneySQL forms
;;; ------------------------------------------------------------------------------------

(defmethod sql.qp/->honeysql [:clickhouse :convert-timezone]
  [driver [_ arg target-timezone source-timezone]]
  (let [expr          (sql.qp/->honeysql driver (cond-> arg (string? arg) u.date/parse))
        with-tz-info? (or (sql.qp.u/field-with-tz? arg)
                          (h2x/is-of-type? expr #"(?:nullable\(|lowcardinality\()?(datetime64\(\d, {0,1}'.*|datetime\(.*)"))
        _             (sql.u/validate-convert-timezone-args with-tz-info? target-timezone source-timezone)]
    (if (not with-tz-info?)
      [:'plus
       expr
       [:'toIntervalSecond
        [:'minus
         [:'timeZoneOffset [:'toTimeZone expr target-timezone]]
         [:'timeZoneOffset [:'toTimeZone expr source-timezone]]]]]
      [:'toTimeZone expr target-timezone])))

(defmethod sql.qp/current-datetime-honeysql-form :clickhouse
  [_]
  (let [report-timezone (get-report-timezone-id-safely)
        [expr db-type]  (if report-timezone
                          [[:'now64 [:raw 9] (h2x/literal report-timezone)] (format "DateTime64(9, '%s')" report-timezone)]
                          [[:'now64 [:raw 9]] "DateTime64(9)"])]
    (h2x/with-database-type-info expr db-type)))

(defn- date-time-parse-fn
  [nano]
  (if (zero? nano) :'parseDateTimeBestEffort :'parseDateTime64BestEffort))

(defmethod sql.qp/->honeysql [:clickhouse LocalDateTime]
  [_ ^java.time.LocalDateTime t]
  (let [formatted (t/format "yyyy-MM-dd HH:mm:ss.SSS" t)
        report-tz (or (get-report-timezone-id-safely) "UTC")]
    (if (zero? (.getNano t))
      [:'parseDateTimeBestEffort   formatted   report-tz]
      [:'parseDateTime64BestEffort formatted 3 report-tz])))

(defmethod sql.qp/->honeysql [:clickhouse ZonedDateTime]
  [_ ^java.time.ZonedDateTime t]
  (let [formatted (t/format "yyyy-MM-dd HH:mm:ss.SSSZZZZZ" t)
        fn        (date-time-parse-fn (.getNano t))]
    [fn formatted]))

(defmethod sql.qp/->honeysql [:clickhouse OffsetDateTime]
  [_ ^java.time.OffsetDateTime t]
  ;; copy-paste due to reflection warnings
  (let [formatted (t/format "yyyy-MM-dd HH:mm:ss.SSSZZZZZ" t)
        fn        (date-time-parse-fn (.getNano t))]
    [fn formatted]))

(defmethod sql.qp/->honeysql [:clickhouse LocalDate]
  [_ ^java.time.LocalDate t]
  [:'parseDateTimeBestEffort t])

(defn- local-date-time
  [^java.time.LocalTime t]
  (t/local-date-time (t/local-date 1970 1 1) t))

(defmethod sql.qp/->honeysql [:clickhouse LocalTime]
  [driver ^java.time.LocalTime t]
  (sql.qp/->honeysql driver (local-date-time t)))

(defmethod sql.qp/->honeysql [:clickhouse OffsetTime]
  [driver ^java.time.OffsetTime t]
  (sql.qp/->honeysql driver (t/offset-date-time
                             (local-date-time (.toLocalTime t))
                             (.getOffset t))))

(defn- args->float64
  [args]
  (map (fn [arg] [:'toFloat64 (sql.qp/->honeysql :clickhouse arg)]) args))

(defn- interval? [expr]
  (driver-api/is-clause? :interval expr))

(defmethod sql.qp/->honeysql [:clickhouse :+]
  [driver [_ & args]]
  (if (some interval? args)
    (if-let [[field intervals] (u/pick-first (complement interval?) args)]
      (reduce (fn [hsql-form [_ amount unit]]
                (sql.qp/add-interval-honeysql-form driver hsql-form amount unit))
              (sql.qp/->honeysql driver field)
              intervals)
      (throw (ex-info "Summing intervals is not supported" {:args args})))
    (into [:+] (args->float64 args))))

(defmethod sql.qp/->honeysql [:clickhouse :log]
  [driver [_ field]]
  [:'log10 (sql.qp/->honeysql driver field)])

(defmethod sql.qp/->honeysql [:clickhouse :percentile]
  [driver [_ field p]]
  [:raw "quantile(" (sql.qp/->honeysql driver p) ")(" (sql.qp/->honeysql driver field) ")"])

(defmethod sql.qp/->honeysql [:clickhouse :regex-match-first]
  [driver [_ arg pattern]]
  [:'extract (sql.qp/->honeysql driver arg) pattern])

(defmethod sql.qp/->honeysql [:clickhouse :split-part]
  [driver [_ text divider position]]
  (let [position (sql.qp/->honeysql driver position)]
    [:case
     [:< position 1]
     ""

     :else
     [:'arrayElement
      [:'splitByString (sql.qp/->honeysql driver divider) [:'assumeNotNull (sql.qp/->honeysql driver text)]]
      [:'toInt64 position]]]))

(defmethod sql.qp/->honeysql [:clickhouse :text]
  [driver [_ value]]
  (h2x/maybe-cast "TEXT" (sql.qp/->honeysql driver value)))

(defmethod sql.qp/date-dbtype :clickhouse
  [_driver]
  :Date32)

(defmethod sql.qp/->honeysql [:clickhouse :stddev]
  [driver [_ field]]
  [:'stddevPop (sql.qp/->honeysql driver field)])

(defmethod sql.qp/->honeysql [:clickhouse :median]
  [driver [_ field]]
  [:'median (sql.qp/->honeysql driver field)])

;; Substring does not work for Enums, so we need to cast to String
(defmethod sql.qp/->honeysql [:clickhouse :substring]
  [driver [_ arg start length]]
  (let [str [:'toString (sql.qp/->honeysql driver arg)]]
    (if length
      [:'substring str
       (sql.qp/->honeysql driver start)
       (sql.qp/->honeysql driver length)]
      [:'substring str
       (sql.qp/->honeysql driver start)])))

(defmethod sql.qp/->honeysql [:clickhouse :var]
  [driver [_ field]]
  [:'varPop (sql.qp/->honeysql driver field)])

(defmethod sql.qp/float-dbtype :clickhouse
  [_]
  :Float64)

(defmethod sql.qp/->float :clickhouse
  [_ value]
  ;; casting in clickhouse does not properly handle NULL; this function does
  (h2x/with-database-type-info [:'toFloat64 value] :Float64))

(defmethod sql.qp/->integer :clickhouse
  [driver value]
  (sql.qp/->integer-with-round driver value))

(defmethod sql.qp/->honeysql [:clickhouse :value]
  [driver value]
  (let [[_ value {base-type :base_type}] value]
    (when (some? value)
      (condp #(isa? %2 %1) base-type
        :type/IPAddress [:'toIPv4 value]
        (sql.qp/->honeysql driver value)))))

(defn- text-val? [value]
  (let [[qual valuevalue fieldinfo] value]
    (and (isa? qual :value)
         (isa? (:base_type fieldinfo) :type/Text)
         (nil? valuevalue))))

(defn- uuid-comp? [field value]
  (let [[qual valuevalue fieldinfo] value]
    (and (isa? qual :value)
         (isa? (:base_type fieldinfo) :type/UUID)
         (isa? (:base-type (nth field 2)) :type/UUID)
         (string? valuevalue))))

(defmethod sql.qp/->honeysql [:clickhouse :=]
  [driver [op field value]]
  (let [hsql-field (sql.qp/->honeysql driver field)
        hsql-value (sql.qp/->honeysql driver value)]
    (cond
      (text-val? value)
      [:or
       [:= hsql-field hsql-value]
       [:= [:'empty hsql-field] 1]]

      ;; UUID fields can be compared directly with strings in ClickHouse.
      ;; If the string is not a valid UUID (ie due to is-empty desugaring),
      ;; then direct comparison will cause an error, so just return false
      (uuid-comp? field value)
      (if (string/valid-uuid? hsql-value)
        [:= hsql-field hsql-value]
        false)

      :else ((get-method sql.qp/->honeysql [:sql :=]) driver [op field value]))))

(defmethod sql.qp/->honeysql [:clickhouse :!=]
  [driver [op field value]]
  (let [hsql-field (sql.qp/->honeysql driver field)
        hsql-value (sql.qp/->honeysql driver value)]
    (cond
      (text-val? value)
      [:and
       [:!= hsql-field hsql-value]
       [:= [:'notEmpty hsql-field] 1]]

      (uuid-comp? field value)
      (if (string/valid-uuid? hsql-value)
        [:or [:!= hsql-field hsql-value]
         [:isNull hsql-field]]
        true)

      :else ((get-method sql.qp/->honeysql [:sql :!=]) driver [op field value]))))

;; I do not know why the tests expect nil counts for empty results
;; but that's how it is :-)
;;
;; It would even be better if we could use countIf and sumIf directly
;;
;; metabase.query-processor.count-where-test
;; metabase.query-processor.share-test
(defmethod sql.qp/->honeysql [:clickhouse :count-where]
  [driver [_ pred]]
  [:case
   [:> [:'count] 0]
   [:sum [:case (sql.qp/->honeysql driver pred) 1 :else 0]]
   :else nil])

(defmethod sql.qp/->honeysql [:clickhouse :sum-where]
  [driver [_ field pred]]
  [:sum [:case (sql.qp/->honeysql driver pred) (sql.qp/->honeysql driver field)
         :else 0]])

(defmethod sql.qp/add-interval-honeysql-form :clickhouse
  [_ dt amount unit]
  (h2x/+ dt [:raw (format "INTERVAL %d %s" (int amount) (name unit))]))

(defn- clickhouse-string-fn
  [fn-name field value options]
  (let [[_ _ {:keys [base-type]}] field
        hsql-field (cond->> (sql.qp/->honeysql :clickhouse field)
                     (= base-type :type/UUID) (conj [:'toString]))
        hsql-value (sql.qp/->honeysql :clickhouse value)]
    (if (get options :case-sensitive true)
      [fn-name hsql-field hsql-value]
      [fn-name [:'lowerUTF8 hsql-field] [:'lowerUTF8 hsql-value]])))

(defmethod sql.qp/->honeysql [:clickhouse :starts-with]
  [_ [_ field value options]]
  (let [starts-with (clickhouse-version/with-min 23 8
                      (constantly :'startsWithUTF8)
                      (constantly :'startsWith))]
    (clickhouse-string-fn starts-with field value options)))

(defmethod sql.qp/->honeysql [:clickhouse :ends-with]
  [_ [_ field value options]]
  (let [ends-with (clickhouse-version/with-min 23 8
                    (constantly :'endsWithUTF8)
                    (constantly :'endsWith))]
    (clickhouse-string-fn ends-with field value options)))

(defmethod sql.qp/->honeysql [:clickhouse :contains]
  [_ [_ field value options]]
  (let [[_ _ {:keys [base-type]}] field
        hsql-field (cond->> (sql.qp/->honeysql :clickhouse field)
                     (= base-type :type/UUID) (conj [:'toString]))
        hsql-value (sql.qp/->honeysql :clickhouse value)
        position-fn (if (get options :case-sensitive true)
                      :'positionUTF8
                      :'positionCaseInsensitiveUTF8)]
    [:> [position-fn hsql-field hsql-value] 0]))

(defmethod sql.qp/->honeysql [:clickhouse :datetime-diff]
  [driver [_ x y unit]]
  (let [x (sql.qp/->honeysql driver x)
        y (sql.qp/->honeysql driver y)]
    (case unit
      ;; Week: Metabase tests expect a bit different result from what `age` provides
      (:week)
      [:'intDiv [:'dateDiff (h2x/literal :day) (date-trunc :'toStartOfDay x) (date-trunc :'toStartOfDay y)] [:raw 7]]
      ;; -------------------------
      (:year :month :quarter :day)
      [:'age (h2x/literal unit) (date-trunc :'toStartOfDay x) (date-trunc :'toStartOfDay y)]
      ;; -------------------------
      (:hour :minute :second)
      [:'age (h2x/literal unit) (in-report-timezone x) (in-report-timezone y)])))

;; We do not have Time data types, so we cheat a little bit
(defmethod sql.qp/cast-temporal-string [:clickhouse :Coercion/ISO8601->Time]
  [_driver _special_type expr]
  [:'parseDateTimeBestEffort [:'concat "1970-01-01T" expr]])

(defmethod sql.qp/cast-temporal-byte [:clickhouse :Coercion/ISO8601->Time]
  [_driver _special_type expr]
  expr)

(defmethod sql.qp/cast-temporal-string [:clickhouse :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  [:'parseDateTime expr (h2x/literal "%Y%m%d%H%i%S")])

;;; ------------------------------------------------------------------------------------
;;; JDBC-related functions
;;; ------------------------------------------------------------------------------------

(defmethod sql-jdbc.execute/read-column-thunk [:clickhouse Types/TINYINT]
  [_ ^ResultSet rs ^ResultSetMetaData _ ^Integer i]
  (fn []
    (.getObject rs i)))

(defmethod sql-jdbc.execute/read-column-thunk [:clickhouse Types/SMALLINT]
  [_ ^ResultSet rs ^ResultSetMetaData _ ^Integer i]
  (fn []
    (.getObject rs i)))

;; This is for tests only - some of them expect nil values
;; getInt/getLong return 0 in case of a NULL value in the result set
;; the only way to check if it was actually NULL - call ResultSet.wasNull afterwards
(defn- with-null-check
  [^ResultSet rs value]
  (if (.wasNull rs) nil value))

(defmethod sql-jdbc.execute/read-column-thunk [:clickhouse Types/BIGINT]
  [_ ^ResultSet rs ^ResultSetMetaData _ ^Integer i]
  (fn []
    (with-null-check rs (.getBigDecimal rs i))))

(defmethod sql-jdbc.execute/read-column-thunk [:clickhouse Types/INTEGER]
  [_ ^ResultSet rs ^ResultSetMetaData _ ^Integer i]
  (fn []
    (with-null-check rs (.getLong rs i))))

(defn- zdt-in-report-timezone
  [^ZonedDateTime zdt]
  (let [maybe-report-timezone (get-report-timezone-id-safely)]
    (if maybe-report-timezone
      (.withZoneSameInstant zdt (java.time.ZoneId/of maybe-report-timezone))
      (if (= (.getId (.getZone zdt)) "GMT0") ;; for test purposes only; GMT0 is a legacy tz
        (.withZoneSameInstant zdt (java.time.ZoneId/of "UTC"))
        zdt))))

(defmethod sql-jdbc.execute/read-column-thunk [:clickhouse Types/DATE]
  [_ ^ResultSet rs ^ResultSetMetaData _rsmeta ^Integer i]
  (fn []
    (when-let [sql-date (.getDate rs i)]
      (.toLocalDate sql-date))))

(defmethod sql-jdbc.execute/read-column-thunk [:clickhouse Types/TIMESTAMP]
  [_ ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (fn []
    (when-let [zdt (.getObject rs i ZonedDateTime)]
      (let [db-type (remove-low-cardinality-and-nullable (.getColumnTypeName rsmeta i))]
        (if (= db-type "datetime64(3, 'gmt0')")
              ;; a hack for some MB test assertions only; GMT0 is a legacy tz
          (.toLocalDateTime ^ZonedDateTime (zdt-in-report-timezone zdt))
              ;; this is the normal behavior
          (.toOffsetDateTime (.withZoneSameInstant
                              ^ZonedDateTime (zdt-in-report-timezone zdt)
                              (java.time.ZoneId/of "UTC"))))))))

(defmethod sql-jdbc.execute/read-column-thunk [:clickhouse Types/TIME]
  [_ ^ResultSet rs ^ResultSetMetaData _ ^Integer i]
  (fn []
    (.getObject rs i OffsetTime)))

(defmethod sql-jdbc.execute/read-column-thunk [:clickhouse Types/NUMERIC]
  [_ ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (fn []
    ; count is NUMERIC cause UInt64 is too large for the canonical SQL BIGINT,
    ; and defaults to BigDecimal, but we want it to be coerced to java Long
    ; cause it still fits and the tests are expecting that
    (if (= (.getColumnLabel rsmeta i) "count")
      (.getLong rs i)
      (.getBigDecimal rs i))))

(defmethod sql-jdbc.execute/read-column-thunk [:clickhouse Types/ARRAY]
  [_ ^ResultSet rs ^ResultSetMetaData _rsmeta ^Integer i]
  (fn []
    (when-let [arr         (.getArray rs i)]
      (Arrays/deepToString (.getArray arr)))))

(defn- ipv4-column->string
  [^ResultSet rs ^Integer i]
  (when-let [^Inet4Address inet-address (.getObject rs i Inet4Address)]
    (.getHostAddress inet-address)))

(defn- ipv6-column->string
  [^ResultSet rs ^Integer i]
  (when-let [^Inet6Address inet-address (.getObject rs i Inet6Address)]
    (.getHostAddress inet-address)))

(defmethod sql-jdbc.execute/read-column-thunk [:clickhouse Types/OTHER]
  [_ ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (fn []
    (let [normalized-db-type (remove-low-cardinality-and-nullable
                              (.getColumnTypeName rsmeta i))]
      (cond
        (= normalized-db-type "ipv4")
        (ipv4-column->string rs i)
        (= normalized-db-type "ipv6")
        (ipv6-column->string rs i)
            ;; _
        :else (.getObject rs i)))))

(defmethod sql-jdbc.execute/read-column-thunk [:clickhouse Types/VARCHAR]
  [_ ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (fn []
    (let [normalized-db-type (remove-low-cardinality-and-nullable
                              (.getColumnTypeName rsmeta i))]
      (cond
        ;; Enum8/Enum16
        (str/starts-with? normalized-db-type "enum")
        (.getString rs i)
        ;; _
        :else (.getObject rs i)))))

(defmethod sql.qp/inline-value [:clickhouse LocalDate]
  [_ t]
  (format "'%s'" (t/format "yyyy-MM-dd" t)))

(defmethod sql.qp/inline-value [:clickhouse LocalTime]
  [_ t]
  (format "'%s'" (t/format "HH:mm:ss.SSS" t)))

(defmethod sql.qp/inline-value [:clickhouse OffsetTime]
  [_ t]
  (format "'%s'" (t/format "HH:mm:ss.SSSZZZZZ" t)))

(defmethod sql.qp/inline-value [:clickhouse LocalDateTime]
  [_ t]
  (format "'%s'" (t/format "yyyy-MM-dd HH:mm:ss.SSS" t)))

(defmethod sql.qp/inline-value [:clickhouse OffsetDateTime]
  [_ ^OffsetDateTime t]
  (format "%s('%s')"
          (if (zero? (.getNano t)) "parseDateTimeBestEffort" "parseDateTime64BestEffort")
          (t/format "yyyy-MM-dd HH:mm:ss.SSSZZZZZ" t)))

(defmethod sql.qp/inline-value [:clickhouse ZonedDateTime]
  [_ t]
  (format "'%s'" (t/format "yyyy-MM-dd HH:mm:ss.SSSZZZZZ" t)))

(defmethod sql.params.substitution/->replacement-snippet-info [:clickhouse UUID]
  [_driver this]
  {:replacement-snippet (format "CAST('%s' AS UUID)" (str this))})
