(ns metabase.util.date-2
  "Replacement for `metabase.util.date` that consistently uses `java.time` instead of a mix of `java.util.Date`,
  `java.sql.*`, and Joda-Time."
  (:refer-clojure :exclude [format range])
  (:require [java-time :as t]
            [java-time.core :as t.core]
            [metabase.util.date-2
             [common :as common]
             [parse :as parse]]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s])
  (:import [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           [java.time.temporal Temporal TemporalAdjuster WeekFields]))

(defn- add-zone-to-local [t timezone-id]
  (condp instance? t
    LocalDateTime (t/zoned-date-time t (t/zone-id timezone-id))
    LocalDate     (t/zoned-date-time t (t/local-time 0) (t/zone-id timezone-id))
    ;; don't attempt to convert local times to offset times because we have no idea what the offset actually should
    ;; be, since we don't know the date. Since it's not an exact instant in time we're not using it to make ranges in
    ;; MBQL filter clauses anyway
    ;;
    ;; TIMEZONE FIXME - not sure we even want to be adding zone-id info for the timestamps above either
    #_LocalTime     #_(t/offset-time t (t/zone-id timezone-id))
    t))

(defn parse
  "With one arg, parse a temporal literal into a corresponding `java.time` class, such as `LocalDate` or
  `OffsetDateTime`. With a second arg, literals that do not explicitly specify a timezone are interpreted as being in
  `timezone-id`."
  ([s]
   (parse/parse s))

  ([s default-timezone-id]
   (cond-> (parse s)
     default-timezone-id (add-zone-to-local default-timezone-id))))

(defn- temporal->iso-8601-formatter [t]
  (condp instance? t
    LocalDate      :iso-local-date
    LocalTime      :iso-local-time
    LocalDateTime  :iso-local-date-time
    OffsetTime     :iso-offset-time
    OffsetDateTime :iso-offset-date-time
    ZonedDateTime  :iso-offset-date-time))

(defn- temporal->sql-formatter [t]
  (condp instance? t
    LocalDate      "yyyy-MM-dd"
    LocalTime      "HH:mm:ss.SSSSS"
    LocalDateTime  "yyyy-MM-dd HH:mm:ss.SSSZZZZZ"
    OffsetTime     "HH:mm:ss.SSSZZZZZ"
    OffsetDateTime "yyyy-MM-dd HH:mm:ss.SSSZZZZZ"
    ZonedDateTime  "yyyy-MM-dd HH:mm:ss.SSSZZZZZ"))

(defn- format* [formatter t]
  (when t
    (if (t/instant? t)
      (recur formatter (t/zoned-date-time t (t/zone-id "UTC")))
      (t/format formatter t))))

(defn format
  "Format temporal value `t` as a ISO-8601 date/time/datetime string."
  ^String [t]
  (format* (temporal->iso-8601-formatter t) t))

(defn format-sql
  "Format a temporal value `t` as a SQL-style literal string. This is basically the same as ISO-8601 but uses a space
  rather than of a `T` to separate the date and time components."
  ^String [t]
  (format* (temporal->sql-formatter t) t))

(def ^:private add-units
  #{:millisecond :second :minute :hour :day :week :month :quarter :year})

(s/defn add :- Temporal
  "Return a temporal value relative to temporal value `t` by adding (or subtracting) a number of units. Returned value
  will be of same class as `t`.

    (add (t/zoned-date-time \"2019-11-05T15:44-08:00[US/Pacific]\") :month 2)
    ->
    (t/zoned-date-time \"2020-01-05T15:44-08:00[US/Pacific]\")"
  ([unit amount]
   (add (t/zoned-date-time) unit amount))

  ([t :- Temporal, unit :- (apply s/enum add-units), amount :- (s/maybe s/Int)]
   (if (zero? amount)
     t
     (t/plus t (case unit
                 :millisecond (t/millis amount)
                 :second      (t/seconds amount)
                 :minute      (t/minutes amount)
                 :hour        (t/hours amount)
                 :day         (t/days amount)
                 :week        (t/days (* amount 7))
                 :month       (t/months amount)
                 :quarter     (t/months (* amount 3))
                 :year        (t/years amount))))))

;; TIMEZONE FIXME - we should add `:millisecond-of-second` (or `:fraction-of-second`?) and `:second-of-minute` as
;; well. Not sure where we'd use these, but we should have them for consistency
(def extract-units
  "Units which return a (numerical, periodic) component of a date"
  #{:minute-of-hour
    :hour-of-day
    :day-of-week
    :iso-day-of-week
    :day-of-month
    :day-of-year
    :week-of-year
    :iso-week-of-year
    :month-of-year
    :quarter-of-year
    :year})

(def ^:private week-fields*
  (common/static-instances WeekFields))

;; this function is separate from the map above mainly to appease Eastwood due to a bug in `clojure/tools.analyzer` —
;; see https://clojure.atlassian.net/browse/TANAL-132
(defn- week-fields ^WeekFields [k]
  (get week-fields* k))

(s/defn extract :- Number
  "Extract a field such as `:minute-of-hour` from a temporal value `t`.

    (extract (t/zoned-date-time \"2019-11-05T15:44-08:00[US/Pacific]\") :day-of-month)
    ;; -> 5

  Values are returned as numbers (currently, always and integers, but this may change if we add support for
  `:fraction-of-second` in the future.)"
  ([unit]
   (extract unit (t/zoned-date-time)))

  ([t :- Temporal, unit :- (apply s/enum extract-units)]
   (t/as t (case unit
             :minute-of-hour   :minute-of-hour
             :hour-of-day      :hour-of-day
             :day-of-week      (.dayOfWeek (week-fields :sunday-start))
             :iso-day-of-week  (.dayOfWeek (week-fields :iso))
             :day-of-month     :day-of-month
             :day-of-year      :day-of-year
             :week-of-year     (.weekOfYear (week-fields :sunday-start))
             :iso-week-of-year (.weekOfYear (week-fields :iso))
             :month-of-year    :month-of-year
             :quarter-of-year  :quarter-of-year
             :year             :year))))

(def ^:private adjusters*
  {:first-day-of-week
   (reify TemporalAdjuster
     (adjustInto [_ t]
       (t/adjust t :previous-or-same-day-of-week :sunday)))

   :first-day-of-iso-week
   (reify TemporalAdjuster
     (adjustInto [_ t]
       (t/adjust t :previous-or-same-day-of-week :monday)))

   :first-day-of-quarter
   (reify TemporalAdjuster
     (adjustInto [_ t]
       (.with t (.atDay (t/year-quarter t) 1))))})

(defn- adjusters ^TemporalAdjuster [k]
  (get adjusters* k))

;; if you attempt to truncate a `LocalDate` to `:day` or anything smaller we can go ahead and return it as is
(extend-protocol t.core/Truncatable
  LocalDate
  (truncate-to [t unit]
    (case unit
      :millis  t
      :seconds t
      :minutes t
      :hours   t
      :days    t)))

(def truncate-units  "Valid date trucation units"
  #{:millisecond :second :minute :hour :day :week :iso-week :month :quarter :year})

(s/defn truncate :- Temporal
  "Truncate a temporal value `t` to the beginning of `unit`, e.g. `:hour` or `:day`. Not all truncation units are
  supported on all subclasses of `Temporal` — for example, you can't truncate a `LocalTime` to `:month`, for obvious
  reasons."
  ([unit]
   (truncate (t/zoned-date-time) unit))

  ([t :- Temporal, unit :- (apply s/enum truncate-units)]
   (case unit
     :default     t
     :millisecond (t/truncate-to t :millis)
     :second      (t/truncate-to t :seconds)
     :minute      (t/truncate-to t :minutes)
     :hour        (t/truncate-to t :hours)
     :day         (t/truncate-to t :days)
     :week        (-> (.with t (adjusters :first-day-of-week))     (t/truncate-to :days))
     :iso-week    (-> (.with t (adjusters :first-day-of-iso-week)) (t/truncate-to :days))
     :month       (-> (t/adjust t :first-day-of-month)             (t/truncate-to :days))
     :quarter     (-> (.with t (adjusters :first-day-of-quarter))  (t/truncate-to :days))
     :year        (-> (t/adjust t :first-day-of-year)              (t/truncate-to :days)))))

(s/defn bucket :- (s/cond-pre Number Temporal)
  "Perform a truncation or extraction unit on temporal value `t`. (These two operations are collectively known as
  'date bucketing' in Metabase code and MBQL, e.g. for date/time columns in MBQL `:breakout` (SQL `GROUP BY`)).

  You can combine this function with `group-by` to do some date/time bucketing in Clojure-land:

    (group-by #(bucket % :quarter-of-year) (map t/local-date [\"2019-01-01\" \"2019-01-02\" \"2019-01-04\"]))
    ;; -> {1 [(t/local-date \"2019-01-01\") (t/local-date \"2019-01-02\")], 2 [(t/local-date \"2019-01-04\")]}"
  ([unit]
   (bucket (t/zoned-date-time) unit))

  ([t :- Temporal, unit :- (apply s/enum (into extract-units truncate-units))]
   (cond
     (= unit :default)     t
     (extract-units unit)  (extract t unit)
     (truncate-units unit) (truncate t unit)
     :else                 (throw (Exception. (tru "Invalid unit: {0}" unit))))))

(defn range
  "Get a start (inclusive) and end (exclusive) pair of instants for a `unit` span of time containing `t`. e.g.

    (range (t/zoned-date-time \"2019-11-01T15:29:00Z[UTC]\") :week)
    ->
    {:start (t/zoned-date-time \"2019-10-27T00:00Z[UTC]\")
     :end   (t/zoned-date-time \"2019-11-03T00:00Z[UTC]\")}"
  [t unit]
  (let [t (truncate t unit)]
    {:start t, :end (add t unit 1)}))

(defn date-range
  "Return a date range with `:start` (inclusive) and `:end` (exclusive) points, either of which may be relative to the
  other if passed as a pair of `[n unit]`. With three args, both `start` and `end` can be relative to some instant
  `t`.

    (date-range (t/local-date \"2019-03-25\") (t/local-date \"2019-03-31\"))
    ->
    {:start (t/local-date \"2019-03-25\"), :end (t/local-date \"2019-03-31\")}

    ;; get the month starting with `2019-11-01`, i.e. the entire month of November 2019
    (date-range (t/local-date \"2019-11-01\") [1 :month])
    ->
    {:start (t/local-date \"2019-11-01\"), :end (t/local-date \"2019-12-01\")}

    ;; get the month prior to `2019-11-01`
    (date-range [-1 :month] (t/local-date \"2019-11-01\"))
    ->
    {:start (t/local-date \"2019-10-01\"), :end (t/local-date \"2019-11-01\")}

    ;; get a span from two months before `2019-11-05` to the next two months after
    (date-range [-2 :month] (t/local-date \"2019-11-05\") [2 :month])
    ->
    {:start (t/local-date \"2019-09-05\"), :end (t/local-date \"2020-01-05\")}"
  {:arglists '([start end] [start [n unit]] [[n unit] end] [[n unit] t [n unit]])}
  ([start end]
   (cond
     (and (instance? Temporal start) (instance? Temporal end))
     {:start (truncate start :day), :end (truncate end :day)}

     (instance? Temporal start)
     (date-range nil start end)

     (instance? Temporal end)
     (date-range start end nil)))

  ([[start-n start-unit :as start] t [end-n end-unit :as end]]
   {:pre [(instance? Temporal t)]}
   (date-range
    (if start
      (add t start-unit start-n)
      t)
    (if end
      (add t end-unit end-n)
      t))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Etc                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TIMEZONE FIXME - I think these actually belong in `metabase.util`

(defn seconds->ms
  "Convert `seconds` to milliseconds. More readable than doing this math inline."
  [seconds]
  (* seconds 1000))

(defn minutes->seconds
  "Convert `minutes` to seconds. More readable than doing this math inline."
  [minutes]
  (* 60 minutes))

(defn minutes->ms
  "Convert `minutes` to milliseconds. More readable than doing this math inline."
  [minutes]
  (-> minutes minutes->seconds seconds->ms))

;; Mainly for REPL usage. Have various temporal types print as a `java-time` function call you can use
(doseq [[klass f-symb] {Instant        't/instant
                        LocalDate      't/local-date
                        LocalDateTime  't/local-date-time
                        LocalTime      't/local-time
                        OffsetDateTime 't/offset-date-time
                        OffsetTime     't/offset-time
                        ZonedDateTime  't/zoned-date-time}]
  (defmethod print-method klass
    [t writer]
    (print-method (list f-symb (str t)) writer)))
