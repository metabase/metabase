(ns metabase.util.date-2.parse
  (:require [java-time :as t]
            [metabase.util.date-2.parse.builder :as b])
  (:import [java.time LocalDateTime OffsetDateTime OffsetTime ZonedDateTime ZoneOffset]
           java.time.format.DateTimeFormatter
           [java.time.temporal TemporalAccessor TemporalQueries]))

(def ^:private ^DateTimeFormatter date-formatter*
  (b/build-formatter
   (b/value :year 4 10 :exceeds-pad)
   (b/optional
    (b/literal "-")
    (b/value :month-of-year 2)
    (b/optional
     (b/literal "-")
     (b/value :day-of-month 2)))
   (b/default-value :month-of-year 1)
   (b/default-value :day-of-month 1)))

(def ^:private ^DateTimeFormatter time-formatter*
  (b/build-formatter
   (b/value :hour-of-day 2)
   (b/optional
    (b/literal ":")
    (b/value :minute-of-hour 2)
    (b/optional
     (b/literal ":")
     (b/value :second-of-minute 2)
     (b/optional
      (b/fraction :nano-of-second 0 9, :decimal-point? true))))
   (b/default-value :minute-of-hour 0)
   (b/default-value :second-of-minute 0)
   (b/default-value :nano-of-second 0)))

(def ^:private ^DateTimeFormatter offset-formatter*
  (b/build-formatter
   (b/offset-id)
   (b/optional
    (b/offset-zone-id))))

(def ^:private ^DateTimeFormatter formatter
  (b/build-formatter
   (b/case-insensitive
    (b/optional
     (b/append date-formatter*))
    (b/optional
     (b/literal "T"))
    (b/optional
     (b/literal " "))
    (b/optional
     (b/append time-formatter*))
    (b/optional
     (b/append offset-formatter*)))))

(def ^:private ^{:arglists '([accessor query])} query
  (let [queries {:local-date  (TemporalQueries/localDate)
                 :local-time  (TemporalQueries/localTime)
                 :zone-offset (TemporalQueries/offset)
                 :zone-id     (TemporalQueries/zoneId)}]
    (fn [^TemporalAccessor accessor query]
      (.query accessor (queries query)))))

(defn parse
  "Parse a string into a `java.time` object."
  [^String s]
  (when (seq s)
    (let [accessor     (.parse formatter s)
          local-date   (query accessor :local-date)
          local-time   (query accessor :local-time)
          zone-offset  (query accessor :zone-offset)
          zone-id      (or (query accessor :zone-id)
                           (when (= zone-offset ZoneOffset/UTC)
                             (t/zone-id "UTC")))
          literal-type [(cond
                          zone-id     :zone
                          zone-offset :offset
                          :else       :local)
                        (cond
                          (and local-date local-time) :datetime
                          local-date                 :date
                          local-time                  :time)]]
      (case literal-type
        [:zone :datetime]   (ZonedDateTime/of  local-date local-time zone-id)
        [:offset :datetime] (OffsetDateTime/of local-date local-time zone-offset)
        [:local :datetime]  (LocalDateTime/of  local-date local-time)
        [:zone :date]       (ZonedDateTime/of  local-date (t/local-time 0) zone-id)
        [:offset :date]     (OffsetDateTime/of local-date (t/local-time 0) zone-offset)
        [:local :date]      local-date
        [:zone :time]       (OffsetTime/of local-time zone-offset)
        [:offset :time]     (OffsetTime/of local-time zone-offset)
        [:local :time]      local-time))))
