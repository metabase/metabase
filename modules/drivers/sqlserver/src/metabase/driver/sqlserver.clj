(ns metabase.driver.sqlserver
  "Driver for SQLServer databases. Uses the official Microsoft JDBC driver under the hood (pre-0.25.0, used jTDS)."
  (:require
   [clojure.data.xml :as xml]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log])
  (:import
   (java.sql Connection ResultSet Time)
   (java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

(driver/register! :sqlserver, :parent :sql-jdbc)

(doseq [[feature supported?] {:case-sensitivity-string-filter-options false
                              :convert-timezone                       true
                              :datetime-diff                          true
                              :index-info                             true
                              :now                                    true
                              :regex                                  false
                              :test/jvm-timezone-setting              false}]
  (defmethod driver/database-supports? [:sqlserver feature] [_driver _feature _db] supported?))

(defmethod driver/database-supports? [:sqlserver :percentile-aggregations]
  [_ _ db]
  (let [major-version (get-in db [:dbms_version :semantic-version 0] 0)]
    (when (zero? major-version)
      (log/warn "Unable to determine sqlserver's dbms major version. Fallback to 0."))
    (>= major-version 16)))

(defmethod driver/db-start-of-week :sqlserver
  [_]
  :sunday)

(defmethod driver/prettify-native-form :sqlserver
  [_ native-form]
  (sql.u/format-sql-and-fix-params :tsql native-form))

;; See the list here: https://docs.microsoft.com/en-us/sql/connect/jdbc/using-basic-data-types
(defmethod sql-jdbc.sync/database-type->base-type :sqlserver
  [_ column-type]
  ({:bigint           :type/BigInteger
    :binary           :type/*
    :bit              :type/Boolean ; actually this is 1 / 0 instead of true / false ...
    :char             :type/Text
    :cursor           :type/*
    :date             :type/Date
    :datetime         :type/DateTime
    :datetime2        :type/DateTime
    :datetimeoffset   :type/DateTimeWithZoneOffset
    :decimal          :type/Decimal
    :float            :type/Float
    :geography        :type/*
    :geometry         :type/*
    :hierarchyid      :type/*
    :image            :type/*
    :int              :type/Integer
    :money            :type/Decimal
    :nchar            :type/Text
    :ntext            :type/Text
    :numeric          :type/Decimal
    :nvarchar         :type/Text
    :real             :type/Float
    :smalldatetime    :type/DateTime
    :smallint         :type/Integer
    :smallmoney       :type/Decimal
    :sql_variant      :type/*
    :table            :type/*
    :text             :type/Text
    :time             :type/Time
    :timestamp        :type/* ; not a standard SQL timestamp, see https://msdn.microsoft.com/en-us/library/ms182776.aspx
    :tinyint          :type/Integer
    :uniqueidentifier :type/UUID
    :varbinary        :type/*
    :varchar          :type/Text
    :xml              :type/*
    (keyword "int identity") :type/Integer} column-type)) ; auto-incrementing integer (ie pk) field

(defmethod sql-jdbc.conn/connection-details->spec :sqlserver
  [_ {:keys [user password db host port instance domain ssl]
      :or   {user "dbuser", password "dbpassword", db "", host "localhost"}
      :as   details}]
  (-> {:applicationName    config/mb-version-and-process-identifier
       :subprotocol        "sqlserver"
       ;; it looks like the only thing that actually needs to be passed as the `subname` is the host; everything else
       ;; can be passed as part of the Properties
       :subname            (str "//" host)
       ;; everything else gets passed as `java.util.Properties` to the JDBC connection.  (passing these as Properties
       ;; instead of part of the `:subname` is preferable because they support things like passwords with special
       ;; characters)
       :database           db
       :password           password
       ;; Wait up to 10 seconds for connection success. If we get no response by then, consider the connection failed
       :loginTimeout       10
       ;; apparently specifying `domain` with the official SQLServer driver is done like `user:domain\user` as opposed
       ;; to specifying them seperately as with jTDS see also:
       ;; https://social.technet.microsoft.com/Forums/sqlserver/en-US/bc1373f5-cb40-479d-9770-da1221a0bc95/connecting-to-sql-server-in-a-different-domain-using-jdbc-driver?forum=sqldataaccess
       :user               (str (when domain (str domain "\\"))
                                user)
       :instanceName       instance
       :encrypt            (boolean ssl)
       ;; only crazy people would want this. See https://docs.microsoft.com/en-us/sql/connect/jdbc/configuring-how-java-sql-time-values-are-sent-to-the-server?view=sql-server-ver15
       :sendTimeAsDatetime false}
      ;; only include `port` if it is specified; leave out for dynamic port: see
      ;; https://github.com/metabase/metabase/issues/7597
      (merge (when port {:port port}))
      (sql-jdbc.common/handle-additional-options details, :seperator-style :semicolon)))

(def ^:private ^:dynamic *field-options*
  "The options part of the `:field` clause we're currently compiling."
  nil)

(defmethod sql.qp/->honeysql [:sqlserver :field]
  [driver [_ _ options :as field-clause]]
  (let [parent-method (get-method sql.qp/->honeysql [:sql :field])]
    (binding [*field-options* options]
      (parent-method driver field-clause))))

(defn- maybe-inline-number [x]
  (if (number? x)
    [:inline x]
    x))

;; See https://docs.microsoft.com/en-us/sql/t-sql/functions/datepart-transact-sql?view=sql-server-ver15
(defn- date-part [unit expr]
  (-> [:datepart [:raw (name unit)] expr]
      (h2x/with-database-type-info "integer")))

(defn- date-add [unit & exprs]
  (into [:dateadd [:raw (name unit)]]
        (map maybe-inline-number)
        exprs))

(defn- date-diff [unit x y]
  [:datediff_big [:raw (name unit)] x y])

;; See https://docs.microsoft.com/en-us/sql/t-sql/functions/date-and-time-data-types-and-functions-transact-sql for
;; details on the functions we're using.

(defmethod sql.qp/date [:sqlserver :default]
  [_driver _unit expr]
  expr)

(defmethod sql.qp/date [:sqlserver :second-of-minute]
  [_driver _unit expr]
  (date-part :second expr))

(defn- time-from-parts [hour minute second fraction precision]
  (-> (into [:TimeFromParts]
            (map maybe-inline-number)
            [hour minute second fraction precision])
      (h2x/with-database-type-info "time")))

(defmethod sql.qp/date [:sqlserver :minute]
  [_driver _unit expr]
  (if (= (h2x/database-type expr) "time")
    (time-from-parts (date-part :hour expr) (date-part :minute expr) 0 0 0)
    (h2x/maybe-cast :smalldatetime expr)))

(defmethod sql.qp/date [:sqlserver :minute-of-hour]
  [_ _ expr]
  (date-part :minute expr))

(defn- date-time-2-from-parts [year month day hour minute second fraction precision]
  (-> (into [:datetime2fromparts]
            (map maybe-inline-number)
            [year month day hour minute second fraction precision])
      (h2x/with-database-type-info "datetime2")))

(defmethod sql.qp/date [:sqlserver :hour]
  [_driver _unit expr]
  (if (= (h2x/database-type expr) "time")
    (time-from-parts (date-part :hour expr) 0 0 0 0)
    (date-time-2-from-parts (h2x/year expr) (h2x/month expr) (h2x/day expr) (date-part :hour expr) 0 0 0 0)))

(defmethod sql.qp/date [:sqlserver :hour-of-day]
  [_driver _unit expr]
  (date-part :hour expr))

(defmethod sql.qp/date [:sqlserver :day]
  [_driver _unit expr]
  ;; `::optimized-bucketing?` is added by `optimized-temporal-buckets`; this signifies that we can use more efficient
  ;; SQL functions like `day()` that don't return a full DATE. See `optimized-temporal-buckets` below for more info.
  (if (::optimized-bucketing? *field-options*)
    (h2x/day expr)
    [:DateFromParts (h2x/year expr) (h2x/month expr) (h2x/day expr)]))

(defmethod sql.qp/date [:sqlserver :day-of-week]
  [_driver _unit expr]
  (sql.qp/adjust-day-of-week :sqlserver (date-part :weekday expr)))

(defmethod sql.qp/date [:sqlserver :day-of-month]
  [_driver _unit expr]
  (date-part :day expr))

(defmethod sql.qp/date [:sqlserver :day-of-year]
  [_driver _unit expr]
  (date-part :dayofyear expr))

;; Subtract the number of days needed to bring us to the first day of the week, then convert to back to orignal type
(defn- trunc-week
  [expr]
  (let [original-type (if (= "datetimeoffset" (h2x/type-info->db-type (h2x/type-info expr)))
                        "datetimeoffset"
                        "datetime")]
    (h2x/cast original-type
      (date-add :day
                (h2x/- 1 (date-part :weekday expr))
                (h2x/->date expr)))))

(defmethod sql.qp/date [:sqlserver :week]
  [driver _ expr]
  (sql.qp/adjust-start-of-week driver trunc-week expr))

(defmethod sql.qp/date [:sqlserver :week-of-year-iso]
  [_ _ expr]
  (date-part :iso_week expr))

(defmethod sql.qp/date [:sqlserver :month]
  [_ _ expr]
  (if (::optimized-bucketing? *field-options*)
    (h2x/month expr)
    [:DateFromParts (h2x/year expr) (h2x/month expr) [:inline 1]]))

(defmethod sql.qp/date [:sqlserver :month-of-year]
  [_driver _unit expr]
  (date-part :month expr))

;; Format date as yyyy-01-01 then add the appropriate number of quarter
;; Equivalent SQL:
;;     DATEADD(quarter, DATEPART(quarter, %s) - 1, FORMAT(%s, 'yyyy-01-01'))
(defmethod sql.qp/date [:sqlserver :quarter]
  [_driver _unit expr]
  (date-add :quarter
            (h2x/dec (date-part :quarter expr))
            [:DateFromParts (h2x/year expr) [:inline 1] [:inline 1]]))

(defmethod sql.qp/date [:sqlserver :quarter-of-year]
  [_driver _unit expr]
  (date-part :quarter expr))

(defmethod sql.qp/date [:sqlserver :year]
  [_driver _unit expr]
  (if (::optimized-bucketing? *field-options*)
    (h2x/year expr)
    [:DateFromParts (h2x/year expr) [:inline 1] [:inline 1]]))

(defmethod sql.qp/date [:sqlserver :year-of-era]
  [_driver _unit expr]
  (date-part :year expr))

(defmethod sql.qp/add-interval-honeysql-form :sqlserver
  [_ hsql-form amount unit]
  (date-add unit amount hsql-form))

(defmethod sql.qp/unix-timestamp->honeysql [:sqlserver :seconds]
  [_ _ expr]
  ;; The second argument to DATEADD() gets casted to a 32-bit integer. BIGINT is 64 bites, so we tend to run into
  ;; integer overflow errors (especially for millisecond timestamps).
  ;; Work around this by converting the timestamps to minutes instead before calling DATEADD().
  (date-add :minute (h2x// expr 60) (h2x/literal "1970-01-01")))

(defonce
  ^{:private true
    :doc     "A map of all zone-id to the corresponding windows-zone.
             I.e {\"Asia/Tokyo\" \"Tokyo Standard Time\"}"}
  zone-id->windows-zone
  (let [data (-> (io/resource "timezones/windowsZones.xml")
                 io/reader
                 xml/parse
                 :content
                 second
                 :content
                 first
                 :content)]
    (->> (for [mapZone data
               :let [attrs       (:attrs mapZone)
                     window-zone (:other attrs)
                     zone-ids    (str/split (:type attrs) #" ")]]
           (zipmap zone-ids (repeat window-zone)))
         (apply merge {"UTC" "UTC"}))))

(defmethod sql.qp/->honeysql [:sqlserver :convert-timezone]
  [driver [_ arg target-timezone source-timezone]]
  (let [expr            (sql.qp/->honeysql driver arg)
        datetimeoffset? (h2x/is-of-type? expr "datetimeoffset")]
    (sql.u/validate-convert-timezone-args datetimeoffset? target-timezone source-timezone)
    (-> (if datetimeoffset?
          expr
          (h2x/at-time-zone expr (zone-id->windows-zone source-timezone)))
        (h2x/at-time-zone (zone-id->windows-zone target-timezone))
        h2x/->datetime)))

(defmethod sql.qp/->honeysql [:sqlserver :datetime-diff]
  [driver [_ x y unit]]
  (let [x (sql.qp/->honeysql driver x)
        y (sql.qp/->honeysql driver y)
        _ (sql.qp/datetime-diff-check-args x y (partial re-find #"(?i)^(timestamp|date)"))
        x (if (h2x/is-of-type? x "datetimeoffset")
            (h2x/at-time-zone x (zone-id->windows-zone (qp.timezone/results-timezone-id)))
            x)
        x (h2x/cast "datetime2" x)
        y (if (h2x/is-of-type? y "datetimeoffset")
            (h2x/at-time-zone y (zone-id->windows-zone (qp.timezone/results-timezone-id)))
            y)
        y (h2x/cast "datetime2" y)]
    (sql.qp/datetime-diff driver unit x y)))

(defmethod sql.qp/datetime-diff [:sqlserver :year]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :month x y) 12))

(defmethod sql.qp/datetime-diff [:sqlserver :quarter]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :month x y) 3))

(defmethod sql.qp/datetime-diff [:sqlserver :month]
  [_driver _unit x y]
  (h2x/+ (date-diff :month x y)
         ;; datediff counts month boundaries not whole months, so we need to adjust
         ;; if x<y but x>y in the month calendar then subtract one month
         ;; if x>y but x<y in the month calendar then add one month
         [:case
          [:and [:< x y] [:> (date-part :day x) (date-part :day y)]] -1
          [:and [:> x y] [:< (date-part :day x) (date-part :day y)]] 1
          :else 0]))

(defmethod sql.qp/datetime-diff [:sqlserver :week] [_driver _unit x y] (h2x// (date-diff :day x y) 7))
(defmethod sql.qp/datetime-diff [:sqlserver :day] [_driver _unit x y] (date-diff :day x y))
(defmethod sql.qp/datetime-diff [:sqlserver :hour] [_driver _unit x y] (h2x// (date-diff :millisecond x y) 3600000))
(defmethod sql.qp/datetime-diff [:sqlserver :minute] [_driver _unit x y] (date-diff :minute x y))
(defmethod sql.qp/datetime-diff [:sqlserver :second] [_driver _unit x y] (date-diff :second x y))

(defmethod sql.qp/cast-temporal-string [:sqlserver :Coercion/ISO8601->DateTime]
  [_driver _semantic_type expr]
  (h2x/->datetime expr))

(defmethod sql.qp/cast-temporal-string [:sqlserver :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _semantic_type expr]
  ;; "20190421164300" -> "2019-04-21 16:43:00"
  ;;                          5  8  11 14 17
  (let [formatted (reduce (fn [expr [index c]]
                            [:stuff expr index 0 c])
                          expr
                          [[5 "-"]
                           [8 "-"]
                           [11 " "]
                           [14 ":"]
                           [17 ":"]])]
    ;; 20 is ODBC canonical yyyy-mm-dd hh:mi:ss (24h). I couldn't find a way to use an arbitrary format string when
    ;; parsing and SO seems to push towards manually formatting a string and then parsing with one of the available
    ;; formats. Not great.
    [:convert [:raw "datetime2"] formatted 20]))

(defmethod sql.qp/apply-top-level-clause [:sqlserver :limit]
  [_driver _top-level-clause honeysql-form {value :limit}]
  (-> honeysql-form
      (dissoc :select)
      (assoc :select-top (into [(sql.qp/inline-num value)] (:select honeysql-form)))))

(defmethod sql.qp/apply-top-level-clause [:sqlserver :page]
  [_driver _top-level-clause honeysql-form {{:keys [items page]} :page}]
  (assoc honeysql-form :offset [:raw (format "%d ROWS FETCH NEXT %d ROWS ONLY"
                                               (* items (dec page))
                                               items)]))

(defn- optimized-temporal-buckets
  "If `field-clause` is being truncated temporally to `:year`, `:month`, or `:day`, return a optimized set of
  replacement `:field` clauses that we can use to generate more efficient SQL. Otherwise returns `nil`.

    (optimized-temporal-buckets [:field 1 {:temporal-unit :month])
    ;; ->
    [[:field 1 {:temporal-unit :year, ::optimized-bucketing? true}]
     [:field 1 {:temporal-unit :month, ::optimized-bucketing? true}]]

  How is this used? Without optimization, we used to generate SQL like

    SELECT DateFromParts(year(field), month(field), 1), count(*)
    FROM table
    GROUP BY DateFromParts(year(field), month(field), 1)
    ORDER BY DateFromParts(year(field), month(field), 1) ASC

  The optimized SQL we generate instead looks like

    SELECT DateFromParts(year(field), month(field), 1), count(*)
    FROM table
    GROUP BY year(field), month(field)
    ORDER BY year(field) ASC, month(field) ASC

  The `year`, `month`, and `day` can make use of indexes whereas `DateFromParts` cannot. The optimized version of the
  query is much more efficient. See #9934 for more details."
  [field-clause]
  (when (mbql.u/is-clause? :field field-clause)
    (let [[_ id-or-name {:keys [temporal-unit], :as opts}] field-clause]
      (when (#{:year :month :day} temporal-unit)
        (mapv
         (fn [unit]
           [:field id-or-name (assoc opts :temporal-unit unit, ::optimized-bucketing? true)])
         (case temporal-unit
           :year  [:year]
           :month [:year :month]
           :day   [:year :month :day]))))))

(defn- optimize-breakout-clauses
  "Optimize `breakout-clauses` using `optimized-temporal-buckets`, if possible."
  [breakout-clauses]
  (vec
   (mapcat
    (fn [breakout]
      (or (optimized-temporal-buckets breakout)
          [breakout]))
    breakout-clauses)))

(defmethod sql.qp/apply-top-level-clause [:sqlserver :breakout]
  [driver _ honeysql-form {breakout-fields :breakout, fields-fields :fields :as _query}]
  ;; this is basically the same implementation as the default one in the `sql.qp` namespace, the only difference is
  ;; that we optimize the fields in the GROUP BY clause using `optimize-breakout-clauses`.
  (let [optimized      (optimize-breakout-clauses breakout-fields)
        unique-name-fn (mbql.u/unique-name-generator)]
    (as-> honeysql-form new-hsql
      ;; we can still use the "unoptimized" version of the breakout for the SELECT... e.g.
      ;;
      ;;    SELECT DateFromParts(year(field), month(field), 1)
      (apply sql.helpers/select new-hsql (->> breakout-fields
                                              (remove (set fields-fields))
                                              (mapv (fn [field-clause]
                                                      (sql.qp/as driver field-clause unique-name-fn)))))
      ;; For the GROUP BY, we replace the unoptimized fields with the optimized ones, e.g.
      ;;
      ;;    GROUP BY year(field), month(field)
      (apply sql.helpers/group-by new-hsql (mapv (partial sql.qp/->honeysql driver) optimized))
      ;; remove duplicate group by clauses (from the optimize breakout clauses stuff)
      (update new-hsql :group-by distinct))))

(defn- optimize-order-by-subclauses
  "Optimize `:order-by` `subclauses` using [[optimized-temporal-buckets]], if possible."
  [subclauses]
  (vec
   (mapcat
    (fn [[direction field :as subclause]]
      (if-let [optimized (optimized-temporal-buckets field)]
        (for [optimized-clause optimized]
          [direction optimized-clause])
        [subclause]))
    subclauses)))

(defmethod sql.qp/apply-top-level-clause [:sqlserver :order-by]
  [driver _ honeysql-form query]
  ;; similar to the way we optimize GROUP BY above, optimize temporal bucketing in the ORDER BY if possible, because
  ;; year(), month(), and day() can make use of indexes while DateFromParts() cannot.
  (let [query         (update query :order-by optimize-order-by-subclauses)
        parent-method (get-method sql.qp/apply-top-level-clause [:sql-jdbc :order-by])]
    (-> (parent-method driver :order-by honeysql-form query)
        ;; order bys have to be distinct in SQL Server!!!!!!!1
        (update :order-by distinct))))

;; SQLServer doesn't support `TRUE`/`FALSE`; it uses `1`/`0`, respectively; convert these booleans to numbers.
(defmethod sql.qp/->honeysql [:sqlserver Boolean]
  [_ bool]
  (if bool 1 0))

(defmethod sql.qp/->honeysql [:sqlserver Time]
  [_ time-value]
  (h2x/->time time-value))

(defmethod sql.qp/->honeysql [:sqlserver :stddev]
  [driver [_ field]]
  [:stdevp (sql.qp/->honeysql driver field)])

(defmethod sql.qp/->honeysql [:sqlserver :var]
  [driver [_ field]]
  [:varp (sql.qp/->honeysql driver field)])

(defmethod sql.qp/->honeysql [:sqlserver :substring]
  [driver [_ arg start length]]
  (if length
    [:substring (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start) (sql.qp/->honeysql driver length)]
    [:substring (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start) [:len (sql.qp/->honeysql driver arg)]]))

(defmethod sql.qp/->honeysql [:sqlserver :length]
  [driver [_ arg]]
  [:len (sql.qp/->honeysql driver arg)])

(defmethod sql.qp/->honeysql [:sqlserver :ceil]
  [driver [_ arg]]
  [:ceiling (sql.qp/->honeysql driver arg)])

(defmethod sql.qp/->honeysql [:sqlserver :round]
  [driver [_ arg]]
  [:round (h2x/cast :float (sql.qp/->honeysql driver arg)) 0])

(defmethod sql.qp/->honeysql [:sqlserver :power]
  [driver [_ arg power]]
  [:power (h2x/cast :float (sql.qp/->honeysql driver arg)) (sql.qp/->honeysql driver power)])

(defn- format-approx-percentile-cont
  [_tag [expr p :as _args]]
  (let [[expr-sql & expr-args] (sql/format-expr expr {:nested true})
        [p-sql & p-args]       (sql/format-expr p {:nested true})]
    (into [(format "APPROX_PERCENTILE_CONT(%s) WITHIN GROUP (ORDER BY %s)" p-sql expr-sql)]
          cat
          [p-args expr-args])))

(sql/register-fn! ::approx-percentile-cont #'format-approx-percentile-cont)

(defmethod sql.qp/->honeysql [:sqlserver :percentile]
  [driver [_ arg val]]
  [::approx-percentile-cont
   (sql.qp/->honeysql driver arg)
   (sql.qp/->honeysql driver val)])

(defmethod sql.qp/->honeysql [:sqlserver :median]
  [driver [_ arg]]
  (sql.qp/->honeysql driver [:percentile arg 0.5]))

(def ^:private ^:dynamic *compared-field-options*
  "This variable is set to the options of the field we are comparing
  (presumably in a filter)."
  nil)

(defn- timezoneless-comparison?
  "Returns if we are currently comparing a timezoneless data type."
  []
  (contains? #{:type/DateTime :type/Time} (:base-type *compared-field-options*)))

;; For some strange reason, comparing a datetime or datetime2 column
;; against a Java LocaDateTime object sometimes doesn't work (see
;; [[metabase.driver.sqlserver-test/filter-by-datetime-fields-test]]).
;; Instead of this, we format a string which SQL Server then parses. Ugly.

(defn- format-without-trailing-zeros
  "Since there is no pattern for fractional seconds that produces a variable
  number of digits, we remove any trailing zeros. The resulting string then
  can be parsed as any data type supporting the required precision. (E.g.,
  datetime support 3 fractional digits, datetime2 supports 7. If we read a
  datetime value and then send back as a filter value, it will be formatted
  with 7 fractional digits and then the zeros get removed so that SQL Server
  can parse the result as a datetime value.)"
  [value  ^DateTimeFormatter formatter]
  (-> (.format formatter value)
      (str/replace #"\.?0*$" "")))

(def ^:private ^DateTimeFormatter time-format
  (DateTimeFormatter/ofPattern "HH:mm:ss.SSSSSSS"))

(defmethod sql.qp/->honeysql [:sqlserver OffsetTime]
  [_driver t]
  (cond-> t
    (timezoneless-comparison?) (format-without-trailing-zeros time-format)))

(def ^:private ^DateTimeFormatter datetime-format
  (DateTimeFormatter/ofPattern "y-MM-dd HH:mm:ss.SSSSSSS"))

(doseq [c [OffsetDateTime ZonedDateTime]]
  (defmethod sql.qp/->honeysql [:sqlserver c]
    [_driver t]
    (cond-> t
      (timezoneless-comparison?) (format-without-trailing-zeros datetime-format))))

;;; this is a psuedo-MBQL clause to signify that we need to do a cast, see the code below where we add it for an
;;; explanation.
(defmethod sql.qp/->honeysql [:sqlserver ::cast]
  [driver [_tag expr database-type]]
  (h2x/maybe-cast database-type (sql.qp/->honeysql driver expr)))

(doseq [op [:= :!= :< :<= :> :>= :between]]
  (defmethod sql.qp/->honeysql [:sqlserver op]
    [driver [_tag field & args :as _clause]]
    (binding [*compared-field-options* (when (and (vector? field)
                                                  (= (get field 0) :field))
                                         (get field 2))]
      ;; We read string literals like `2019-11-05T14:23:46.410` as `datetime2`, which is never going to be `=` to a
      ;; `datetime` (etc.). Wrap all args after the first in temporal filters in a cast() to the same type as the first
      ;; arg so filters work correctly. Do this before we fully compile to Honey SQL so we can still use the parent
      ;; method to take care of things like `[:= <string> <expr>]` generating `WHERE <string> = ? AND <string> IS NOT
      ;; NULL` for us.
      (let [clause (into [op field]
                         ;; we're compiling this ahead of time and throwing out the compiled value to make it easier to
                         ;; get the real database type of the expression... maybe when we convert this to MLv2 we can
                         ;; just use MLv2 metadata or type calculation functions instead.
                         (or (when-let [field-database-type (h2x/database-type (sql.qp/->honeysql driver field))]
                               (when (#{"datetime" "datetime2" "datetimeoffset" "smalldatetime"} field-database-type)
                                 (map (fn [[_type val :as expr]]
                                        ;; Do not cast nil arguments to enable transformation to IS NULL.
                                        (if (some? val)
                                          [::cast expr field-database-type]
                                          expr)))))
                             identity)
                         args)]
        ((get-method sql.qp/->honeysql [:sql-jdbc op]) driver clause)))))

(defmethod driver/db-default-timezone :sqlserver
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver database nil
   (fn [^java.sql.Connection conn]
     (with-open [stmt (.prepareStatement conn "SELECT sysdatetimeoffset();")
                 rset (.executeQuery stmt)]
       (when (.next rset)
         (when-let [offset-date-time (.getObject rset 1 java.time.OffsetDateTime)]
           (t/zone-offset offset-date-time)))))))

(defmethod sql.qp/current-datetime-honeysql-form :sqlserver
  [_]
  (h2x/with-database-type-info :%getdate "datetime"))

(defmethod sql-jdbc.sync/excluded-schemas :sqlserver
  [_]
  #{"sys" "INFORMATION_SCHEMA"})

;; From the dox:
;;
;; The ORDER BY clause is invalid in views, inline functions, derived tables, subqueries, and common table
;; expressions, unless TOP, OFFSET or FOR XML is also specified.
;;
;; To fix this :
;;
;; - Remove `:order-by` without a corresponding `:limit` inside a `:join` (since it usually doesn't really accomplish
;;   anything anyway; if you really need it you can always specify a limit yourself)
;;
;;   TODO - I'm not actually sure about this. What about a RIGHT JOIN? Postgres at least seems to ignore the ORDER BY
;;   inside a subselect RIGHT JOIN, altho I can imagine other DBMSes actually returning results in that order. I guess
;;   we will see what happens down the road.
;;
;; - Add a max-results `:limit` to source queries if there's not already one

(defn- fix-order-bys [inner-query]
  (letfn [;; `in-source-query?` = whether the DIRECT parent is `:source-query`. This is only called on maps that have
          ;; `:limit`, and the only two possible parents there are `:query` (for top-level queries) or `:source-query`.
          (in-source-query? [path]
            (= (last path) :source-query))
          ;; `in-join-source-query?` = whether the parent is `:source-query`, and the grandparent is `:joins`, i.e. we
          ;; are a source query being joined against. In this case it's apparently ok to remove the ORDER BY.
          ;;
          ;; What about source-query in source-query in Join? Not sure about that case. Probably better to be safe and
          ;; not do the aggressive optimizations. See
          ;; https://github.com/metabase/metabase/pull/19384#discussion_r787002558 for more details.
          (in-join-source-query? [path]
            (and (in-source-query? path)
                 (= (last (butlast path)) :joins)))
          (has-order-by-without-limit? [m]
            (and (map? m)
                 (:order-by m)
                 (not (:limit m))))
          (remove-order-by? [path m]
            (and (has-order-by-without-limit? m)
                 (in-join-source-query? path)))
          (add-limit? [path m]
            (and (has-order-by-without-limit? m)
                 (not (in-join-source-query? path))
                 (in-source-query? path)))]
    (lib.util.match/replace inner-query
      ;; remove order by and then recurse in case we need to do more tranformations at another level
      (m :guard (partial remove-order-by? &parents))
      (fix-order-bys (dissoc m :order-by))

      (m :guard (partial add-limit? &parents))
      (fix-order-bys (assoc m :limit qp.i/absolute-max-results)))))

(defmethod sql.qp/preprocess :sqlserver
  [driver inner-query]
  (let [parent-method (get-method sql.qp/preprocess :sql)]
    (fix-order-bys (parent-method driver inner-query))))

;; In order to support certain native queries that might return results at the end, we have to use only prepared
;; statements (see #9940)
(defmethod sql-jdbc.execute/statement-supported? :sqlserver [_]
  false)

;; SQL server only supports setting holdability at the connection level, not the statement level, as per
;; https://docs.microsoft.com/en-us/sql/connect/jdbc/using-holdability?view=sql-server-ver15
;; and
;; https://github.com/microsoft/mssql-jdbc/blob/v9.2.1/src/main/java/com/microsoft/sqlserver/jdbc/SQLServerConnection.java#L5349-L5357
;; an exception is thrown if they do not match, so it's safer to simply NOT try to override it at the statement level,
;; because it's not supported anyway
;; this impl is otherwise the same as the default
(defmethod sql-jdbc.execute/prepared-statement :sqlserver
  [driver ^Connection conn ^String sql params]
  (let [stmt (.prepareStatement conn sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY)]
    (try
      (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
      (sql-jdbc.execute/set-parameters! driver stmt params)
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))

;; similar rationale to prepared-statement above
(defmethod sql-jdbc.execute/statement :sqlserver
  [_ ^Connection conn]
  (let [stmt (.createStatement conn
               ResultSet/TYPE_FORWARD_ONLY
               ResultSet/CONCUR_READ_ONLY)]
    (try
      (try
        (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
        (catch Throwable e
          (log/debug e "Error setting statement fetch direction to FETCH_FORWARD")))
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))

(defmethod unprepare/unprepare-value [:sqlserver LocalDate]
  [_ ^LocalDate t]
  ;; datefromparts(year, month, day)
  ;; See https://docs.microsoft.com/en-us/sql/t-sql/functions/datefromparts-transact-sql?view=sql-server-ver15
  (format "DateFromParts(%d, %d, %d)" (.getYear t) (.getMonthValue t) (.getDayOfMonth t)))

(defmethod unprepare/unprepare-value [:sqlserver LocalTime]
  [_ ^LocalTime t]
  ;; timefromparts(hour, minute, seconds, fraction, precision)
  ;; See https://docs.microsoft.com/en-us/sql/t-sql/functions/timefromparts-transact-sql?view=sql-server-ver15
  ;; precision = 7 which means the fraction is 100 nanoseconds, smallest supported by SQL Server
  (format "TimeFromParts(%d, %d, %d, %d, 7)" (.getHour t) (.getMinute t) (.getSecond t) (long (/ (.getNano t) 100))))

(defmethod unprepare/unprepare-value [:sqlserver OffsetTime]
  [driver t]
  (unprepare/unprepare-value driver (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))))

(defmethod unprepare/unprepare-value [:sqlserver OffsetDateTime]
  [_ ^OffsetDateTime t]
  ;; DateTimeOffsetFromParts(year, month, day, hour, minute, seconds, fractions, hour_offset, minute_offset, precision)
  (let [offset-minutes (long (/ (.getTotalSeconds (.getOffset t)) 60))
        hour-offset    (long (/ offset-minutes 60))
        minute-offset  (mod offset-minutes 60)]
    (format "DateTimeOffsetFromParts(%d, %d, %d, %d, %d, %d, %d, %d, %d, 7)"
            (.getYear t) (.getMonthValue t) (.getDayOfMonth t)
            (.getHour t) (.getMinute t) (.getSecond t) (long (/ (.getNano t) 100))
            hour-offset minute-offset)))

(defmethod unprepare/unprepare-value [:sqlserver ZonedDateTime]
  [driver t]
  (unprepare/unprepare-value driver (t/offset-date-time t)))

(defmethod unprepare/unprepare-value [:sqlserver LocalDateTime]
  [_ ^LocalDateTime t]
  ;; DateTime2FromParts(year, month, day, hour, minute, seconds, fractions, precision)
  (format "DateTime2FromParts(%d, %d, %d, %d, %d, %d, %d, 7)"
          (.getYear t) (.getMonthValue t) (.getDayOfMonth t)
          (.getHour t) (.getMinute t) (.getSecond t) (long (/ (.getNano t) 100))))

;; SQL Server doesn't support TIME WITH TIME ZONE so convert OffsetTimes to LocalTimes in UTC. Otherwise SQL Server
;; will try to convert it to a `DATETIMEOFFSET` which of course is not comparable to `TIME` columns
;;
;; TIMEZONE FIXME — does it make sense to convert this to UTC? Shouldn't we convert it to the report timezone? Figure
;; this mystery out
(defmethod sql-jdbc.execute/set-parameter [:sqlserver OffsetTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))))

;; instead of default `microsoft.sql.DateTimeOffset`
(defmethod sql-jdbc.execute/read-column-thunk [:sqlserver microsoft.sql.Types/DATETIMEOFFSET]
  [_^ResultSet rs _ ^Integer i]
  (fn []
    (.getObject rs i OffsetDateTime)))

;; SQL Server doesn't really support boolean types so use bits instead (#11592)
(defmethod driver.sql/->prepared-substitution [:sqlserver Boolean]
  [driver bool]
  (driver.sql/->prepared-substitution driver (if bool 1 0)))

(defmethod driver/normalize-db-details :sqlserver
  [_ database]
  (if-let [rowcount-override (-> database :details :rowcount-override)]
    ;; if the user has set the rowcount-override connection property, it ends up in the details map, but it actually
    ;; needs to be moved over to the settings map (which is where DB local settings go, as per #19399)
    (-> (update database :details #(dissoc % :rowcount-override))
        (update :settings #(assoc % :unaggregated-query-row-limit rowcount-override)))
    database))
