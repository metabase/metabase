(ns metabase.util.date-2
  "Replacement for `metabase.util.date` that consistently uses `java.time` instead of a mix of `java.util.Date`,
  `java.sql.*`, and Joda-Time."
  (:require [java-time :as t]
            [metabase.util.date-2
             [common :as common]
             [parse :as parse]]
            [metabase.util.i18n :refer [tru]])
  (:import [java.time DayOfWeek Instant LocalDate LocalDateTime LocalTime ZonedDateTime]
           [java.time.temporal ChronoUnit Temporal]
           org.threeten.extra.YearWeek))

(defn- ->offset [v timezone-id]
  (condp instance? v
    LocalDate     (t/offset-date-time v (t/local-time 0) (t/zone-id timezone-id))
    LocalDateTime (t/offset-date-time v (t/zone-id timezone-id))
    LocalTime     (t/offset-time v (t/zone-id timezone-id))
    v))

(defn- ->local [v timezone-id]
  (condp instance? v
    OffsetDateTime (t/local-date-time v (t/zone-id timezone-id))
    OffsetTime     (t/local-time v (t/zone-id timezone-id))
    v))

(defn- ->timezone [v timezone-id]
  (condp instance? v
    OffsetDateTime (.atZoneSameInstant ^OffsetDateTime v (t/zone-id timezone-id))
    #_OffsetTime     #_(.atZoneSameInstant ^OffsetTime v (t/zone-id timezone-id))
    (->offset v timezone-id)))

(defn- ->zoned [v timezone-id]
  (condp instance? v
    LocalDateTime (t/zoned-date-time v (t/zone-id timezone-id))
    LocalDate     (t/zoned-date-time v (t/local-time 0) (t/zone-id timezone-id))
    LocalTime     (t/offset-time v (t/zone-id timezone-id))
    v))

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

(defn add
  (^Temporal [unit amount]
   (add unit amount (t/offset-date-time)))

  (^Temporal [unit amount v]
   (t/plus v (case unit
               :millisecond (t/millis amount)
               :second      (t/seconds amount)
               :minute      (t/minutes amount)
               :hour        (t/hours amount)
               :day         (t/days amount)
               :week        (t/days (* amount 7))
               :month       (t/months amount)
               :quarter     (t/months (* amount 3))
               :year        (t/years 1)))))

(def date-extract-units
  "Units which return a (numerical, periodic) component of a date"
  #{:minute-of-hour :hour-of-day :day-of-week :day-of-month :day-of-year :week-of-year :month-of-year :quarter-of-year
    :year})

(defn extract
  (^Integer [unit]
   (extract unit (t/offset-date-time)))

  (^Integer [unit v]
   {:pre [(date-extract-units unit)]}
   ;; TOOD - not sure if this makes sense
   (let [v (->local v "UTC")]
     (case unit
       :minute-of-hour  (.getFrom (parse/chrono-field :minute-of-hour) v)
       :hour-of-day     (.getFrom (parse/chrono-field :hour-of-day) v)
       :day-of-week     (.getValue (t/day-of-week v))
       :day-of-month    (.getValue (t/day-of-month v))
       :day-of-year     (.getFrom (parse/chrono-field :day-of-year) v)
       :week-of-year    (.getWeek (YearWeek/from v))
       :month-of-year   (.getValue (t/month v))
       :quarter-of-year (.getValue (t/quarter v))
       :year            (.getValue (t/year v)))))

  (^Integer [unit v timezone-id]
   (extract unit (->timezone v timezone-id))))

(def date-trunc-units
  "Valid date bucketing units"
  #{:second :minute :hour :day :week :month :quarter :year})

(def ^:private ^ChronoUnit chrono-unit (common/static-instances ChronoUnit))

(defn truncate-time
  ^Temporal [unit v]
  {:pre [(chrono-unit unit)]}
  (let [unit (chrono-unit unit)]
    (condp instance? v
      OffsetDateTime (.truncatedTo ^OffsetDateTime v unit)
      OffsetTime     (.truncatedTo ^OffsetTime     v unit)
      LocalDateTime  (.truncatedTo ^LocalDateTime  v unit)
      LocalTime      (.truncatedTo ^LocalTime      v unit)
      LocalDate      v)))

(defn truncate-date
  ^Temporal [unit v]
  (condp instance? v
    OffsetDateTime
    (-> (truncate-date unit (t/local-date v))
        (t/offset-date-time (t/local-time 0) (t/zone-offset v)))

    OffsetTime
    (throw (Exception. (tru "Cannot truncate a time to {0}." unit)))

    LocalTime
    (throw (Exception. (tru "Cannot truncate a time to {0}." unit)))

    (case unit
      :week    (.atDay (YearWeek/from v) DayOfWeek/MONDAY)
      :month   (.atDay (t/year-month v) 1)
      :quarter (.atDay (t/year-quarter v) 1)
      :year    (.atDay (t/year v) 1))))

(defn truncate
  ^Temporal [unit v]
  {:pre [(date-trunc-units unit)]}
  (case unit
    :default     v
    :millisecond (truncate-time :millis  v)
    :second      (truncate-time :seconds v)
    :minute      (truncate-time :minutes v)
    :hour        (truncate-time :hours   v)
    :day         (truncate-time :days    v)
    :week        (truncate-date :week    v)
    :month       (truncate-date :month   v)
    :quarter     (truncate-date :quarter v)
    :year        (truncate-date :year    v)))

#_(defn truncate-2 [unit v]
  (case unit
    :default     v
    :millisecond (truncate-time :millis  v)
    :second      (truncate-time :seconds v)
    :minute      (truncate-time :minutes v)
    :hour        (truncate-time :hours v)
    :day         (DayOfYear/from v)
    :week        (YearWeek/from v)
    :month       (t/year-month v)
    :quarter     (t/year-quarter v)
    :year        (t/year v)))

(defn from-legacy ^:deprecated ^Temporal [v timezone-id]
  (condp instance? v
    java.sql.Date  (OffsetDateTime/ofInstant (t/instant (.getTime ^java.sql.Date v)) (t/zone-id timezone-id))
    java.util.Date (OffsetDateTime/ofInstant (t/instant v) (t/zone-id timezone-id))
    java.sql.Time  (t/offset-time (t/instant (.getTime ^java.sql.Time v)) (t/zone-id timezone-id))))

(defn bucket [unit v timezone id]
  (if (= unit :default)
    v))

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
