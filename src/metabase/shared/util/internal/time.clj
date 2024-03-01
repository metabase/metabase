(ns metabase.shared.util.internal.time
  (:require
   [java-time.api :as t]
   [metabase.public-settings :as public-settings]
   [metabase.shared.util.internal.time-common :as common]
   [metabase.util.date-2 :as u.date])
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

(defn- apply-offset
  [value offset-n offset-unit]
  (t/plus
    value
    (case offset-unit
      :minute (t/minutes offset-n)
      :hour (t/hours offset-n)
      :day (t/days offset-n)
      :week (t/weeks offset-n)
      :month (t/months offset-n)
      :year (t/years offset-n)
      (t/minutes 0))))

(defmethod common/to-range :default [value _]
  ;; Fallback: Just return a zero-width at the input time.
  ;; This mimics Moment.js behavior if you `m.startOf("unknown unit")` - it doesn't change anything.
  [value value])

(defmethod common/to-range :minute [value {:keys [n] :or {n 1}}]
  (let [start (-> value
                  (t/truncate-to :minutes))]
    [start (minus-ms (t/plus start (t/minutes n)))]))

(defmethod common/to-range :hour [value {:keys [n] :or {n 1}}]
  (let [start (-> value
                  (t/truncate-to :hours))]
    [start (minus-ms (t/plus start (t/hours n)))]))

(defmethod common/to-range :day [value {:keys [n] :or {n 1}}]
  (let [start (-> value
                  (t/truncate-to :days))]
    [start (minus-ms (t/plus start (t/days n)))]))

(defmethod common/to-range :week [value {:keys [n] :or {n 1}}]
  (let [first-day (first-day-of-week)
        start (-> value
                  (t/truncate-to :days)
                  (t/adjust :previous-or-same-day-of-week first-day))]
    [start (minus-ms (t/plus start (t/weeks n)))]))

(defmethod common/to-range :month [value {:keys [n] :or {n 1}}]
  (let [value (-> value
                  (t/truncate-to :days)
                  (t/adjust :first-day-of-month))]
    [value (minus-ms (t/plus value (t/months n)))]))

(defmethod common/to-range :year [value {:keys [n] :or {n 1}}]
  (let [value (-> value
                  (t/truncate-to :days)
                  (t/adjust :first-day-of-year))]
    [value (minus-ms (nth (iterate #(t/adjust % :first-day-of-next-year n) value) n))]))

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

(defn unit-diff
  "Return the number of `unit`s between two temporal values `before` and `after`, e.g. maybe there are 32 `:day`s
  between Jan 1st and Feb 2nd."
  [unit before after]
  (let [before   (cond-> before
                   (string? before) u.date/parse)
        after    (cond-> after
                   (string? after) u.date/parse)
        ;; you can't use LocalDates in durations I guess, so just convert them LocalDateTimes with time = 0
        before   (cond-> before
                   (instance? java.time.LocalDate before) (t/local-date-time 0))
        after    (cond-> after
                   (instance? java.time.LocalDate after) (t/local-date-time 0))
        duration (t/duration before after)]
    (case unit
      :millisecond (.toMillis duration)
      :second      (.toSeconds duration)
      :minute      (.toMinutes duration)
      :hour        (.toHours duration)
      :day         (.toDays duration)

      :week
      (long (/ (unit-diff :day before after) 7))

      :month
      (let [diff-months (- (u.date/extract after :month-of-year)
                           (u.date/extract before :month-of-year))
            diff-years  (- (u.date/extract after :year)
                          (u.date/extract before :year))]
        (+ diff-months (* diff-years 12)))

      :quarter
      (long (/ (unit-diff :month before after) 3))

      :year
      (- (u.date/extract after :year)
         (u.date/extract before :year)))))

(defn day-diff
  "Returns the time elapsed between `before` and `after` in days (an integer)."
  [before after]
  (unit-diff :day before after))

(defn- coerce-local-date-time [input]
  (cond-> input
    (re-find #"(?:Z|[+-]\d\d(?::?\d\d)?)$" input) (t/offset-date-time)
    :always (localize)))

(defn ^:private format-extraction-unit
  "Formats a date-time value given the temporal extraction unit.
  If unit is not supported, returns nil."
  [t unit]
  (case unit
    :day-of-week (t/format "EEEE" t)
    :month-of-year (t/format "MMM" t)
    :minute-of-hour (t/format "m" t)
    :hour-of-day (t/format "h a" t)
    :day-of-month (t/format "d" t)
    :day-of-year (t/format "D" t)
    :week-of-year (t/format "w" t)
    :quarter-of-year (t/format "'Q'Q" t)))

(defn format-unit
  "Formats a temporal-value (iso date/time string, int for extraction units) given the temporal-bucketing unit.
   If unit is nil, formats the full date/time"
  [input unit]
  (if (string? input)
    (let [time? (common/matches-time? input)
          date? (common/matches-date? input)
          date-time? (common/matches-date-time? input)
          t (cond
              time? (t/local-time input)
              date? (t/local-date input)
              date-time? (coerce-local-date-time input))]
      (if t
        (or
          (format-extraction-unit t unit)
          (cond
            time? (t/format "h:mm a" t)
            date? (t/format "MMM d, yyyy" t)
            :else (t/format "MMM d, yyyy, h:mm a" t)))
        input))
    (if (= unit :hour-of-day)
      (str (cond (zero? input) "12" (<= input 12) input :else (- input 12)) " " (if (<= input 11) "AM" "PM"))
      (or
        (format-extraction-unit (common/number->timestamp input {:unit unit}) unit)
        (str input)))))

(defn format-diff
  "Formats a time difference between two temporal values.
   Drops redundant information."
  [temporal-value-1 temporal-value-2]
  (let [default-format #(str (format-unit temporal-value-1 nil)
                             " – "
                             (format-unit temporal-value-2 nil))]
    (cond
      (some (complement string?) [temporal-value-1 temporal-value-2])
      (default-format)

      (= temporal-value-1 temporal-value-2)
      (format-unit temporal-value-1 nil)

      (and (common/matches-time? temporal-value-1)
           (common/matches-time? temporal-value-2))
      (default-format)

      (and (common/matches-date-time? temporal-value-1)
           (common/matches-date-time? temporal-value-2))
      (let [lhs (coerce-local-date-time temporal-value-1)
            rhs (coerce-local-date-time temporal-value-2)
            year-matches? (= (t/year lhs) (t/year rhs))
            month-matches? (= (t/month lhs) (t/month rhs))
            day-matches? (= (t/day-of-month lhs) (t/day-of-month rhs))
            hour-matches? (= (t/format "H" lhs) (t/format "H" rhs))
            [lhs-fmt rhs-fmt] (cond
                                (and year-matches? month-matches? day-matches? hour-matches?)
                                ["MMM d, yyyy, h:mm a " " h:mm a"]

                                (and year-matches? month-matches? day-matches?)
                                ["MMM d, yyyy, h:mm a " " h:mm a"]

                                year-matches?
                                ["MMM d, h:mm a " " MMM d, yyyy, h:mm a"])]

        (if lhs-fmt
          (str (t/format lhs-fmt lhs) "–" (t/format rhs-fmt rhs))
          (default-format)))

      (and (common/matches-date? temporal-value-1)
           (common/matches-date? temporal-value-2))
      (let [lhs (t/local-date temporal-value-1)
            rhs (t/local-date temporal-value-2)
            year-matches? (= (t/year lhs) (t/year rhs))
            month-matches? (= (t/month lhs) (t/month rhs))
            [lhs-fmt rhs-fmt] (cond
                                (and year-matches? month-matches?)
                                ["MMM d" "d, yyyy"]

                                year-matches?
                                ["MMM d " " MMM d, yyyy"])]
        (if lhs-fmt
          (str (t/format lhs-fmt lhs) "–" (t/format rhs-fmt rhs))
          (default-format)))

      :else
      (default-format))))

(defn format-relative-date-range
  "Given a `n` `unit` time interval and the current date, return a string representing the date-time range.
   Provide an `offset-n` and `offset-unit` time interval to change the date used relative to the current date.
   `options` is a map and supports `:include-current` to include the current given unit of time in the range."
  ([n unit offset-n offset-unit opts]
   (format-relative-date-range (now) n unit offset-n offset-unit opts))
  ([t n unit offset-n offset-unit {:keys [include-current]}]
   (let [offset-now (cond-> t
                      (neg? n) (apply-offset n unit)
                      (and (pos? n) (not include-current)) (apply-offset 1 unit)
                      (and offset-n offset-unit) (apply-offset offset-n offset-unit))
         pos-n (cond-> (abs n)
                 include-current inc)
         date-ranges (map (if (#{:hour :minute} unit)
                            #(t/format "yyyy-MM-dd'T'HH:mm" (t/local-date-time %))
                            #(str (t/local-date %)))
                          (common/to-range offset-now
                                           {:unit unit
                                            :n pos-n
                                            :offset-n offset-n
                                            :offset-unit offset-unit}))]
     (apply format-diff date-ranges))))

(defn truncate
  "Clojure implementation of [[metabase.shared.util.time/truncate]]; basically the same as [[u.date/truncate]] but also
  handles ISO-8601 strings."
  [t unit]
  (if (string? t)
    (str (truncate (u.date/parse t) unit))
    (u.date/truncate t unit)))

(defn add
  "Clojure implementation of [[metabase.shared.util.time/add]]; basically the same as [[u.date/add]] but also handles
  ISO-8601 strings."
  [t unit amount]
  (if (string? t)
    (str (add (u.date/parse t) unit amount))
    (u.date/add t unit amount)))

(defn format-for-base-type
  "Clojure implementation of [[metabase.shared.util.time/format-for-base-type]]; format a temporal value as an ISO-8601
  string. `base-type` is ignored for the Clojure implementation; this simply calls [[clojure.core/str]]."
  [t _base-type]
  (str t))
