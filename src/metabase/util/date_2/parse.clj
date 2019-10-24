(ns metabase.util.date-2.parse
  (:require [java-time :as t]
            [metabase.util.date-2.common :as common])
  (:import [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime]
           [java.time.format DateTimeFormatter DateTimeFormatterBuilder SignStyle]
           [java.time.temporal ChronoField TemporalAccessor]))

(def ^ChronoField chrono-field
  (common/static-instances ChronoField))

(def ^:private ^SignStyle sign-style
  (common/static-instances SignStyle))

(defn- value
  ([chrono-field-name]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (chrono-field chrono-field-name))))

  ([chrono-field-name width]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (chrono-field chrono-field-name) width)))

  ([chrono-field-name min max sign-style-name]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (chrono-field chrono-field-name) min max (sign-style sign-style-name)))))

(defn- default-value [chrono-field-name default-value]
  (fn [^DateTimeFormatterBuilder builder]
    (.parseDefaulting builder (chrono-field chrono-field-name) default-value)))

(defn- fraction
  [chrono-field-name min-width max-width & {:keys [decimal-point?]}]
  (fn [^DateTimeFormatterBuilder builder]
    (.appendFraction builder (chrono-field chrono-field-name) 0 9 (boolean decimal-point?))))

(defn- optional [& parts]
  (fn [^DateTimeFormatterBuilder builder]
    (.optionalStart builder)
    (doseq [part parts]
      (part builder))
    (.optionalEnd builder)))

(defn- literal [^String s]
  (fn [^DateTimeFormatterBuilder builder]
    (.appendLiteral builder s)))

(defn- lenient [& parts]
  (fn [^DateTimeFormatterBuilder builder]
    (.parseLenient builder)
    (doseq [part parts]
      (part builder))
    (.parseStrict builder)))

(defn- offset []
  (lenient
   (fn [^DateTimeFormatterBuilder builder]
     (.appendOffset builder "+HH:MM:ss" "Z"))))

(defn- append [^DateTimeFormatter formatter]
  (fn [^DateTimeFormatterBuilder builder]
    (.append builder formatter)))

(defn- case-insensitive []
  (fn [^DateTimeFormatterBuilder builder]
    (.parseCaseInsensitive builder)))

(defn- build-formatter
  ^DateTimeFormatter [& parts]
  (let [builder (DateTimeFormatterBuilder.)]
    (doseq [part parts]
      (part builder))
    (.toFormatter builder)))

(def ^:private ^DateTimeFormatter date-formatter*
  (build-formatter
   (value :year 4 10 :exceeds-pad)
   (optional
    (literal "-")
    (value :month-of-year 2)
    (optional
     (literal "-")
     (value :day-of-month 2)))
   (default-value :month-of-year 1)
   (default-value :day-of-month 1)))

;; TO actually use date or time formatter you need to append the (optional (offset))

(def ^:private ^DateTimeFormatter time-formatter*
  (build-formatter
   (value :hour-of-day 2)
   (optional
    (literal ":")
    (value :minute-of-hour 2)
    (optional
     (literal ":")
     (value :second-of-minute 2)
     (optional
      (fraction :nano-of-second 0 9, :decimal-point? true))))
   (default-value :minute-of-hour 0)
   (default-value :second-of-minute 0)
   (default-value :nano-of-second 0)))

(def ^:private ^DateTimeFormatter formatter
  (build-formatter
   (case-insensitive)
   (optional
    (append date-formatter*))
   (optional
    (literal "T"))
   (optional
    (literal " "))
   (optional
    (append time-formatter*))
   (optional
    (offset))))

(defn- accessor-get ^Long [^TemporalAccessor accessor, chrono-field-name]
  (.getLong accessor (chrono-field chrono-field-name)))

(defn- accessor-supports? [^TemporalAccessor accessor, chrono-field-name]
  (.isSupported accessor (chrono-field chrono-field-name)))

(defn- offset-date-from-accessor ^OffsetDateTime [^TemporalAccessor accessor]
  (OffsetDateTime/of
   (accessor-get accessor :year)
   (accessor-get accessor :month-of-year)
   (accessor-get accessor :day-of-month)
   0
   0
   0
   0
   (t/zone-offset accessor)))

(defn parse
  "Parse a string into a `java.time` object."
  [^String s]
  (when (seq s)
    (let [accessor     (.parse formatter s)
          has-date?    (accessor-supports? accessor :year)
          has-time?    (accessor-supports? accessor :hour-of-day)
          has-offset?  (accessor-supports? accessor :offset-seconds)
          literal-type [(if has-offset? :offset :local)
                        (cond
                          (and has-date? has-time?) :datetime
                          has-date?                 :date
                          has-time?                 :time)]]
      (case literal-type
        [:offset :datetime] (OffsetDateTime/from accessor)
        [:local :datetime]  (LocalDateTime/from accessor)
        [:offset :date]     (offset-date-from-accessor accessor)
        [:local :date]      (LocalDate/from accessor)
        [:offset :time]     (OffsetTime/from accessor)
        [:local :time]      (LocalTime/from accessor)))))
