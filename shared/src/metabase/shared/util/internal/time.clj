(ns metabase.shared.util.internal.time
  (:require
   [java-time :as t]
   [metabase.public-settings :as public-settings]
   [metabase.shared.util.internal.time-common :as common])
  (:import
   java.util.Locale))

(set! *warn-on-reflection* true)

(defn- now [] (t/offset-date-time))

;;; ----------------------------------------------- predicates -------------------------------------------------------
(defn datetime?
  "Given any value, check if it's a datetime object."
  [value]
  (or (t/offset-date-time? value)
      (t/zoned-date-time? value)
      (t/instant? value)))

(defn time?
  "checks if the provided value is a local time value."
  [value]
  (t/local-time? value))

(defn valid?
  "Given a datetime, check that it's valid."
  [value]
  (or (datetime?      value)
      (t/offset-time? value)
      (t/local-time?  value)))

(defn normalize
  "Does nothing. Just a placeholder in CLJS; the JVM implementation does some real work."
  [value]
  (t/offset-date-time value))

(defn same-day?
  "Given two platform-specific datetimes, checks if they fall within the same day."
  [d1 d2]
  (= (t/truncate-to d1 :days) (t/truncate-to d2 :days)))

(defn same-year?
  "True if these two datetimes fall in the same year."
  [d1 d2]
  (= (t/year d1) (t/year d2)))

(defn same-month?
  "True if these two datetimes fall in the same (year and) month."
  [d1 d2]
  (and (same-year? d1 d2)
       (= (t/month d1) (t/month d2))))

;;; ---------------------------------------------- information -------------------------------------------------------
(defn first-day-of-week
  "The first day of the week varies by locale, but Metabase has a setting that overrides it.
  In JVM, we can just read the setting directly."
  []
  (public-settings/start-of-week))

(def default-options
  "The default map of options."
  {:locale (Locale/getDefault)})

;;; ------------------------------------------------ to-range --------------------------------------------------------
(defn- minus-ms [value]
  (t/minus value (t/millis 1)))

(defmethod common/to-range :default [value _]
  ;; Fallback: Just return a zero-width at the input time.
  ;; This mimics Moment.js behavior if you `m.startOf("unknown unit")` - it doesn't change anything.
  [value value])

(defmethod common/to-range :minute [value _]
  (let [start (t/truncate-to value :minutes)]
    [start (minus-ms (t/plus start (t/minutes 1)))]))

(defmethod common/to-range :hour [value _]
  (let [start (t/truncate-to value :hours)]
    [start (minus-ms (t/plus start (t/hours 1)))]))

(defmethod common/to-range :day [value _]
  (let [start (t/truncate-to value :days)]
    [start (minus-ms (t/plus start (t/days 1)))]))

(defmethod common/to-range :week [value _]
  (let [first-day (first-day-of-week)
        start (-> value
                  (t/truncate-to :days)
                  (t/adjust :previous-or-same-day-of-week first-day))]
    [start (minus-ms (t/plus start (t/weeks 1)))]))

(defmethod common/to-range :month [value _]
  (let [value (t/truncate-to value :days)]
    [(t/adjust value :first-day-of-month)
     (minus-ms (t/adjust value :first-day-of-next-month))]))

(defmethod common/to-range :year [value _]
  (let [value (t/truncate-to value :days)]
    [(t/adjust value :first-day-of-year)
     (minus-ms (t/adjust value :first-day-of-next-year))]))

;;; -------------------------------------------- string->timestamp ---------------------------------------------------
(defmethod common/string->timestamp :default [value _]
  ;; Best effort to parse this unknown string format, as a local zoneless datetime, then treating it as UTC.
  (let [base (try (t/local-date-time value)
                  (catch Exception _
                    (try (t/local-date value)
                         (catch Exception _
                           nil))))]
    (when base
      (t/offset-date-time base (t/zone-id)))))

(defmethod common/string->timestamp :day-of-week [value options]
  ;; Try to parse as a regular timestamp; if that fails then try to treat it as a weekday name and adjust from
  ;; the current time.
  (let [as-default (try ((get-method common/string->timestamp :default) value options)
                        (catch Exception _ nil))]
    (if (valid? as-default)
      as-default
      (let [day (try (t/day-of-week "EEE" value)
                     (catch Exception _
                       (try (t/day-of-week "EEEE" value)
                            (catch Exception _
                              (throw (ex-info (str "Failed to coerce '" value "' to day-of-week")
                                              {:value value}))))))]
        (-> (now)
            (t/truncate-to :days)
            (t/adjust :previous-or-same-day-of-week :monday)  ; Move to ISO start of week.
            (t/adjust :next-or-same-day-of-week day))))))    ; Then to the specified day.

;;; -------------------------------------------- number->timestamp ---------------------------------------------------
(def ^:private magic-base-date
  "Some of the date coercions are relative, and not directly involved with any particular month.
  To avoid errors we need to use a reference date that is (a) in a month with 31 days,(b) in a leap year.
  This uses 2016-01-01 for the purpose."
  (t/offset-date-time 2016 01 01))

(defmethod common/number->timestamp :default [value _]
  ;; If no unit is given, or the unit is not recognized, try to parse the number as year number, returning the timestamp
  ;; for midnight UTC on January 1.
  (t/offset-date-time value))

(defmethod common/number->timestamp :minute-of-hour [value _]
  (-> (now) (t/truncate-to :hours) (t/plus (t/minutes value))))

(defmethod common/number->timestamp :hour-of-day [value _]
  (-> (now) (t/truncate-to :days) (t/plus (t/hours value))))

(defmethod common/number->timestamp :day-of-week [value _]
  ;; Metabase uses 1 to mean the start of the week, based on the Metabase setting for the first day of the week.
  ;; Moment uses 0 as the first day of the week in its configured locale.
  ;; For Java, get the first day of the week from the setting, and offset by `(dec value)` for the current day.
  (-> (now)
      (t/adjust :previous-or-same-day-of-week (first-day-of-week))
      (t/truncate-to :days)
      (t/plus (t/days (dec value)))))

(defmethod common/number->timestamp :day-of-month [value _]
  ;; We force the initial date to be in a month with 31 days.
  (t/plus magic-base-date (t/days (dec value))))

(defmethod common/number->timestamp :day-of-year [value _]
  ;; We force the initial date to be in a leap year (2016).
  (t/plus magic-base-date (t/days (dec value))))

(defmethod common/number->timestamp :week-of-year [value _]
  (-> (now)
      (t/truncate-to :days)
      (t/adjust :first-day-of-year)
      (t/adjust :previous-or-same-day-of-week (first-day-of-week))
      (t/plus (t/weeks (dec value)))))

(defmethod common/number->timestamp :month-of-year [value _]
  (t/offset-date-time (t/year (now)) value 1))

(defmethod common/number->timestamp :quarter-of-year [value _]
  (let [month (inc (* 3 (dec value)))]
    (t/offset-date-time (t/year (now)) month 1)))

(defmethod common/number->timestamp :year [value _]
  (t/offset-date-time value 1 1))

;;; ---------------------------------------------- parsing helpers ---------------------------------------------------
(defn parse-with-zone
  "Parses a timestamp with Z or a timezone offset at the end."
  [value]
  (t/offset-date-time value))

(defn localize
  "Given a freshly parsed `OffsetDateTime`, convert it to a `LocalDateTime`."
  [value]
  (t/local-date-time value))

(defn parse-time-string
  "Parses a time string that has been stripped of any time zone."
  [value]
  (t/local-time value))

;;; ------------------------------------------------ arithmetic ------------------------------------------------------

(defn day-diff
  "Returns the time elapsed between `before` and `after` in days (an integer)."
  [before after]
  (.toDays (t/duration before after)))
