(ns metabase.util.date-2.parse.builder
  "Utility functions for programatically building a `DateTimeFormatter`. Easier to understand than chaining a hundred
  Java calls and trying to keep the structure straight.

  The basic idea here is you pass a number of `sections` to `formatter` to build a `DateTimeFormatter` — see
  `metabase.util.date-2.parse` for examples. Most of these sections are simple wrappers around corresponding
  `DateTimeFormatterBuilder` -- see
  https://docs.oracle.com/javase/8/docs/api/java/time/format/DateTimeFormatterBuilder.html for documenation.

  TODO - this is a prime library candidate."
  (:require [metabase.util.date-2.common :as common])
  (:import [java.time.format DateTimeFormatter DateTimeFormatterBuilder SignStyle]
           java.time.temporal.TemporalField))

(defprotocol ^:private Section
  (^:private apply-section [this builder]))

(extend-protocol Section
  String
  (apply-section [s builder]
    (.appendLiteral ^DateTimeFormatterBuilder builder s))

  clojure.lang.Fn
  (apply-section [f builder]
    (f builder))

  clojure.lang.Sequential
  (apply-section [sections builder]
    (doseq [section sections]
      (apply-section section builder)))

  DateTimeFormatter
  (apply-section [formatter builder]
    (.append ^DateTimeFormatterBuilder builder formatter)))

(defn optional
  "Make wrapped `sections` optional."
  [& sections]
  (reify Section
    (apply-section [_ builder]
      (.optionalStart ^DateTimeFormatterBuilder builder)
      (apply-section sections builder)
      (.optionalEnd ^DateTimeFormatterBuilder builder))))

(defn- set-option [^DateTimeFormatterBuilder builder option]
  (case option
    :strict           (.parseStrict builder)
    :lenient          (.parseLenient builder)
    :case-sensitive   (.parseCaseSensitive builder)
    :case-insensitive (.parseCaseInsensitive builder)))

(def ^:private ^:dynamic *options*
  {:strictness       :strict
   :case-sensitivity :case-sensitive})

(defn- do-with-option [builder k new-value thunk]
  (let [old-value (get *options* k)]
    (if (= old-value new-value)
      (thunk)
      (binding [*options* (assoc *options* k new-value)]
        (set-option builder new-value)
        (thunk)
        (set-option builder old-value)))))

(defn- with-option-section [k v sections]
  (reify Section
    (apply-section [_ builder]
      (do-with-option builder k v (fn [] (apply-section sections builder))))))

(defn strict
  "Use strict parsing for wrapped `sections`."
  [& sections]
  (with-option-section :strictness :strict sections))

(defn lenient
  "Use lenient parsing for wrapped `sections`."
  [& sections]
  (with-option-section :strictness :lenient sections))

(defn case-sensitive
  "Make wrapped `sections` case-sensitive."
  [& sections]
  (with-option-section :case-sensitivity :case-sensitive sections))

(defn case-insensitive
  "Make wrapped `sections` case-insensitive."
  [& sections]
  (with-option-section :case-sensitivity :case-insensitive sections))

(def ^:private ^SignStyle sign-style
  (common/static-instances SignStyle))

(defn- temporal-field ^TemporalField [x]
  (let [field (if (keyword? x)
                (common/temporal-field x)
                x)]
    (assert (instance? TemporalField field)
      (format "Invalid TemporalField: %s" (pr-str field)))
    field))

(defn value
  "Define a section for a specific field such as `:hour-of-day` or `:minute-of-hour`. Refer to
  `metabase.util.date-2.common/temporal-field` for all possible temporal fields names."
  ([temporal-field-name]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (temporal-field temporal-field-name))))

  ([temporal-field-name width]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (temporal-field temporal-field-name) width)))

  ([temporal-field-name min-val max-val sign-style-name]
   (fn [^DateTimeFormatterBuilder builder]
     (.appendValue builder (temporal-field temporal-field-name) min-val max-val (sign-style sign-style-name)))))

(defn default-value
  "Define a section that sets a default value for a field like `:minute-of-hour`."
  [temporal-field-name default-value]
  (fn [^DateTimeFormatterBuilder builder]
    (.parseDefaulting builder (temporal-field temporal-field-name) default-value)))

(defn fraction
  "Define a section for a fractional value, e.g. milliseconds or nanoseconds."
  [temporal-field-name min-val-width max-val-width & {:keys [decimal-point?]}]
  (fn [^DateTimeFormatterBuilder builder]
    (.appendFraction builder (temporal-field temporal-field-name) 0 9 (boolean decimal-point?))))

(defn zone-offset
  "Define a section for a timezone offset. e.g. `-08:00`."
  []
  (lenient
   (fn [^DateTimeFormatterBuilder builder]
     (.appendOffsetId builder))))

(defn zone-id
  "An a section for a timezone ID wrapped in square brackets, e.g. `[America/Los_Angeles]`."
  []
  (strict
   (case-sensitive
    (optional "[")
    (fn [^DateTimeFormatterBuilder builder]
      (.appendZoneRegionId builder))
    (optional "]"))))

(defn formatter
  "Return a new `DateTimeFormatter` from `sections`. See examples in `metabase.util.date-2.parse` for more details.

    (formatter
     (case-insensitive
      (value :hour-of-day 2)
      (optional
       \":\"
       (value :minute-of-hour 2)
       (optional
        \":\"
        (value :second-of-minute)))))

    ->

    #object[java.time.format.DateTimeFormatter
            \"ParseCaseSensitive(false)Value(HourOfDay,2)[':'Value(MinuteOfHour,2)[':'Value(SecondOfMinute)]]\"]"
  ^DateTimeFormatter [& sections]
  (let [builder (DateTimeFormatterBuilder.)]
    (apply-section sections builder)
    (.toFormatter builder)))
