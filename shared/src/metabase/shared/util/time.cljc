(ns metabase.shared.util.time
  "Time parsing helper functions.
  In Java these return [[OffsetDateTime]], in JavaScript they return Moments.
  Most of the implementations are in the split CLJ/CLJS files [[metabase.shared.util.internal.time]]."
  (:require
   [metabase.shared.util.internal.time :as internal]
   [metabase.shared.util.internal.time-common :as common]
   [metabase.shared.util.namespaces :as shared.ns]
   [metabase.util :as u]))

;; Importing and re-exporting some functions defined in each implementation.
(shared.ns/import-fns
 [common
  to-range]
 [internal
  valid?
  same-day?
  same-month?
  same-year?
  day-diff])

(defn- prep-options [options]
  (merge internal/default-options (u/normalize-map options)))

(defn ^:export coerce-to-timestamp
  "Parses a timestamp value into a date object. This can be a straightforward Unix timestamp or ISO format string.
  But the `:unit` field can be used to alter the parsing to, for example, treat the input number as a day-of-week or
  day-of-month number.
  Returns Moments in JS and OffsetDateTimes in Java."
  ([value] (coerce-to-timestamp value {}))
  ([value options]
   (let [options (prep-options options)
         base (cond
                ;; Just return an already-parsed value. (Moment in CLJS, DateTime classes in CLJ.)
                (internal/datetime? value)                        (internal/normalize value)
                ;; If there's a timezone offset, or Z for Zulu/UTC time, parse it directly.
                (and (string? value)
                     (re-matches #".*(Z|[+-]\d\d:?\d\d)$" value)) (internal/parse-with-zone value)
                ;; Then we fall back to two multimethods for coercing strings and number to timestamps per the :unit.
                (string? value)                                   (common/string->timestamp value options)
                :else                                             (common/number->timestamp value options))]
     (if (:local options)
       (internal/localize base)
       base))))

(defn ^:export coerce-to-time
  "Parses a standalone time, or the time portion of a timestamp.
  Accepts a platform time value (eg. Moment, OffsetTime, LocalTime) or a string."
  [value]
  (cond
    (internal/time? value) value
    (string? value) (-> value common/drop-trailing-time-zone internal/parse-time-string)
    :else           (throw (ex-info "Unknown input to coerce-to-time; expecting a string"
                                    {:value value}))))

(defn format-unit
  "Formats a temporal-value (iso date/time string, int for hour/minute) given the temporal-bucketing unit.
   If unit is nil, formats the full date/time"
  [temporal-value unit]
  (internal/format-unit temporal-value unit))

(defn format-diff
  "Formats a time difference between two temporal values.
   Drops redundant information."
  [temporal-value-1 temporal-value-2]
  (internal/format-diff temporal-value-1 temporal-value-2))

(defn format-relative-date-range
  "Given a `n` `unit` time interval and the current date, return a string representing the date-time range.
   Provide an `offset-n` and `offset-unit` time interval to change the date used relative to the current date.
   `options` is a map and supports `:include-current` to include the current given unit of time in the range."
  ([n unit]
   (format-relative-date-range n unit nil nil nil))
  ([n unit offset-n offset-unit]
   (format-relative-date-range n unit offset-n offset-unit nil))
  ([n unit offset-n offset-unit options]
   (internal/format-relative-date-range n unit offset-n offset-unit options))
  ([t n unit offset-n offset-unit options]
   (internal/format-relative-date-range (coerce-to-timestamp t) n unit offset-n offset-unit options)))
