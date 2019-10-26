(ns metabase.util.date-2
  "Replacement for `metabase.util.date` that consistently uses `java.time` instead of a mix of `java.util.Date`,
  `java.sql.*`, and Joda-Time."
  (:require [java-time :as t]
            [metabase.util.date-2.parse :as parse]
            [metabase.util.i18n :refer [tru]])
  (:import [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           [java.time.temporal Temporal TemporalAdjuster WeekFields]))

;; TODO - not sure if we actually want to use this...
(defn- ->zoned [t timezone-id]
  (condp instance? t
    LocalDateTime (t/zoned-date-time t (t/zone-id timezone-id))
    LocalDate     (t/zoned-date-time t (t/local-time 0) (t/zone-id timezone-id))
    LocalTime     (t/offset-time t (t/zone-id timezone-id))
    t))

(defn parse
  "With one arg, parse a temporal literal into a corresponding `java.time` class, such as `LocalDate` or
  `OffsetDateTime`. With a second arg, literals that do not explicitly specify a timezone are interpreted as being in
  `timezone-id`."
  ([s]
   (parse/parse s))

  ([s default-timezone-id]
   (->zoned (parse s) default-timezone-id)))

(defn time? [x]
  (some #(instance? % x) [OffsetTime LocalTime]))

(defn date? [x]
  (instance? LocalDate x))

(defn datetime? [x]
  (some #(instance? % x) [Instant ZonedDateTime OffsetDateTime LocalDateTime]))

#_(defn ->temporal [v]
  (condp instance? v
    ;; TODO - not sure this is actually what we want??
    java.sql.Timestamp (t/instant v)
    java.sql.Date      (t/instant v)
    java.util.Date     (t/instant v)))

(defn add
  (^Temporal [unit amount]
   (add (t/zoned-date-time) unit amount))

  (^Temporal [t unit amount]
   (t/plus t (case unit
               :millisecond (t/millis amount)
               :second      (t/seconds amount)
               :minute      (t/minutes amount)
               :hour        (t/hours amount)
               :day         (t/days amount)
               :week        (t/days (* amount 7))
               :month       (t/months amount)
               :quarter     (t/months (* amount 3))
               :year        (t/years 1)))))

(def extract-units
  "Units which return a (numerical, periodic) component of a date"
  #{:minute-of-hour :hour-of-day :day-of-week :day-of-month :day-of-year :week-of-year :iso-week-of-year :month-of-year
    :quarter-of-year :year})

(def ^:private week-fields
  (common/static-instances WeekFields))

(defn extract
  ([unit]
   (extract unit (t/zoned-date-time)))

  ([^Temporal t, unit]
   (case unit
     :minute-of-hour   (t/as t :minute-of-hour)
     :hour-of-day      (t/as t :hour-of-day)
     :day-of-week      (t/as t :day-of-week)
     :day-of-month     (t/as t :day-of-month)
     :day-of-year      (t/as t :day-of-year)
     :week-of-year     (t/as t (week-fields :sunday-start))
     :iso-week-of-year (t/as t (week-fields :iso))
     :month-of-year    (t/as t :month-of-year)
     :quarter-of-year  (t/as t :quarter-of-year)
     :year             (t/as t :year))))

(def trucate-units  "Valid date bucketing units"
  #{:second :minute :hour :day :week :iso-week :month :quarter :year})

(def ^:private ^{:arglists `(^TemporalAdjuster [~'k])} adjusters
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

(defn truncate
  (^Temporal [unit]
   (truncate (t/zoned-date-time) unit))

  (^Temporal [^Temporal t, unit]
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


(defn from-legacy ^:deprecated ^Temporal [v timezone-id]
  (condp instance? v
    java.sql.Date  (OffsetDateTime/ofInstant (t/instant (.getTime ^java.sql.Date v)) (t/zone-id timezone-id))
    java.util.Date (OffsetDateTime/ofInstant (t/instant v) (t/zone-id timezone-id))
    java.sql.Time  (t/offset-time (t/instant (.getTime ^java.sql.Time v)) (t/zone-id timezone-id))))

(defn bucket
  ([unit]
   (bucket (t/zoned-date-time) unit))

  ([t unit]
   (cond
     (= unit :default)    t
     (extract-units unit) (extract t unit)
     (trucate-units unit) (truncate t unit)
     :else                (throw (Exception. (tru "Invalid unit: {0}" unit))))))

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
