(ns metabase.shared.util.internal.time
  "CLJS implementation of the time utilities on top of Moment.js.
  See [[metabase.shared.util.time]] for the public interface."
  (:require
   ["moment" :as moment]
   [metabase.shared.util.internal.time-common :as common]))

(defn- now [] (moment))

;;; ----------------------------------------------- predicates -------------------------------------------------------
(defn datetime?
  "Given any value, check if it's a (possibly invalid) Moment."
  [value]
  (and value (moment/isMoment value)))

(defn time?
  "checks if the provided value is a local time value."
  [value]
  (moment/isMoment value))

(defn valid?
  "Given a Moment, check that it's valid."
  [value]
  (and (datetime? value) (.isValid ^moment/Moment value)))

(defn normalize
  "Does nothing. Just a placeholder in CLJS; the JVM implementation does some real work."
  [value]
  value)

(defn same-day?
  "Given two platform-specific datetimes, checks if they fall within the same day."
  [^moment/Moment d1 ^moment/Moment d2]
  (.isSame d1 d2 "day"))

(defn same-month?
  "True if these two datetimes fall in the same (year and) month."
  [^moment/Moment d1 ^moment/Moment d2]
  (.isSame d1 d2 "month"))

(defn same-year?
  "True if these two datetimes fall in the same year."
  [^moment/Moment d1 ^moment/Moment d2]
  (.isSame d1 d2 "year"))

;;; ---------------------------------------------- information -------------------------------------------------------
(defn first-day-of-week
  "The first day of the week varies by locale, but Metabase has a setting that overrides it.
  In CLJS, Moment is already configured with that setting."
  []
  (-> (moment/weekdays 0)
      (.toLowerCase)
      keyword))

(def default-options
  "The default map of options - empty in CLJS."
  {})

;;; ------------------------------------------------ to-range --------------------------------------------------------
(defmethod common/to-range :default [^moment/Moment value {:keys [unit]}]
  (let [^moment/Moment c1 (.clone value)
        ^moment/Moment c2 (.clone value)]
    [(.startOf c1 (name unit))
     (.endOf   c2 (name unit))]))

;; NB: Only the :default for to-range is needed in CLJS, since Moment's startOf and endOf methods are doing the work.

;;; -------------------------------------------- string->timestamp ---------------------------------------------------
(defmethod common/string->timestamp :default [value _]
  ;; Best effort to parse this unknown string format, as a local zoneless datetime, then treating it as UTC.
  (moment/utc value moment/ISO_8601))

(defmethod common/string->timestamp :day-of-week [value options]
  ;; Try to parse as a regular timestamp; if that fails then try to treat it as a weekday name and adjust from
  ;; the current time.
  (let [as-default (try ((get-method common/string->timestamp :default) value options)
                        (catch js/Error _ nil))]
    (if (valid? as-default)
      as-default
      (-> (now)
          (.isoWeekday value)
          (.startOf "day")))))

;;; -------------------------------------------- number->timestamp ---------------------------------------------------
(defn- magic-base-date
  "Some of the date coercions are relative, and not directly involved with any particular month.
  To avoid errors we need to use a reference date that is (a) in a month with 31 days,(b) in a leap year.
  This uses 2016-01-01 for the purpose.
  This is a function that returns fresh values, since Moments are mutable."
  []
  (moment "2016-01-01"))

(defmethod common/number->timestamp :default [value _]
  ;; If no unit is given, or the unit is not recognized, try to parse the number as year number, returning the timestamp
  ;; for midnight UTC on January 1.
  (moment/utc value moment/ISO_8601))

(defmethod common/number->timestamp :minute-of-hour [value _]
  (.. (now) (minute value) (startOf "minute")))

(defmethod common/number->timestamp :hour-of-day [value _]
  (.. (now) (hour value) (startOf "hour")))

(defmethod common/number->timestamp :day-of-week [value _]
  ;; Metabase uses 1 to mean the start of the week, based on the Metabase setting for the first day of the week.
  ;; Moment uses 0 as the first day of the week in its configured locale.
  (.. (now) (weekday (dec value)) (startOf "day")))

(defmethod common/number->timestamp :day-of-month [value _]
  ;; We force the initial date to be in a month with 31 days.
  (.. (magic-base-date) (date value) (startOf "day")))

(defmethod common/number->timestamp :day-of-year [value _]
  ;; We force the initial date to be in a leap year (2016).
  (.. (magic-base-date) (dayOfYear value) (startOf "day")))

(defmethod common/number->timestamp :week-of-year [value _]
  (.. (now) (week value) (startOf "week")))

(defmethod common/number->timestamp :month-of-year [value _]
  (.. (now) (month (dec value)) (startOf "month")))

(defmethod common/number->timestamp :quarter-of-year [value _]
  (.. (now) (quarter value) (startOf "quarter")))

(defmethod common/number->timestamp :year [value _]
  (.. (now) (year value) (startOf "year")))

;;; ---------------------------------------------- parsing helpers ---------------------------------------------------
(defn parse-with-zone
  "Parses a timestamp with Z or a timezone offset at the end.
  This requires a different API call from timestamps without time zones in CLJS."
  [value]
  (moment/parseZone value))

(defn localize
  "Given a freshly parsed absolute Moment, convert it to a local one."
  [value]
  (.local value))

(def ^:private parse-time-formats
  #js ["HH:mm:ss.SSS[Z]"
       "HH:mm:ss.SSS"
       "HH:mm:ss"
       "HH:mm"])

(defn parse-time-string
  "Parses a time string that has been stripped of any time zone."
  [value]
  (moment value parse-time-formats))

;;; ------------------------------------------------ arithmetic ------------------------------------------------------

(defn day-diff
  "Returns the time elapsed between `before` and `after` in days."
  [^moment/Moment before ^moment/Moment after]
  (.diff after before "day"))
