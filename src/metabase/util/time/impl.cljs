(ns metabase.util.time.impl
  "CLJS implementation of the time utilities on top of Day.js.
  See [[metabase.util.time]] for the public interface."
  (:require
   ["dayjs" :as dayjs]
   ["dayjs/plugin/advancedFormat" :as advancedFormat]
   ["dayjs/plugin/customParseFormat" :as customParseFormat]
   ["dayjs/plugin/dayOfYear" :as dayOfYear]
   ["dayjs/plugin/isoWeek" :as isoWeek]
   ["dayjs/plugin/localeData" :as localeData]
   ["dayjs/plugin/objectSupport" :as objectSupport]
   ["dayjs/plugin/quarterOfYear" :as quarterOfYear]
   ["dayjs/plugin/utc" :as utc]
   ["dayjs/plugin/weekOfYear" :as weekOfYear]
   ["dayjs/plugin/weekday" :as weekday]
   [metabase.util.time.impl-common :as common]))

;; Initialize dayjs plugins
(dayjs/extend advancedFormat)
(dayjs/extend customParseFormat)
(dayjs/extend dayOfYear)
(dayjs/extend isoWeek)
(dayjs/extend localeData)
(dayjs/extend objectSupport)
(dayjs/extend quarterOfYear)
(dayjs/extend utc)
(dayjs/extend weekday)
(dayjs/extend weekOfYear)

(defn- now [] (dayjs))

;;; ----------------------------------------------- predicates -------------------------------------------------------
(defn datetime?
  "Given any value, check if it's a Day.js instance."
  [value]
  (and value (dayjs/isDayjs value)))

(def time?
  "Checks if the provided value is a local time value.
  In Day.js, times are represented as full datetime instances."
  datetime?)

(defn valid?
  "Given a Day.js instance, check that it's valid."
  [value]
  (and (datetime? value) (.isValid ^dayjs value)))

(defn normalize
  "Does nothing. Just a placeholder in CLJS; the JVM implementation does some real work."
  [value]
  value)

(defn same-day?
  "Given two platform-specific datetimes, checks if they fall within the same day."
  [^dayjs d1 ^dayjs d2]
  (.isSame d1 d2 "day"))

(defn same-month?
  "True if these two datetimes fall in the same (year and) month."
  [^dayjs d1 ^dayjs d2]
  (.isSame d1 d2 "month"))

(defn same-year?
  "True if these two datetimes fall in the same year."
  [^dayjs d1 ^dayjs d2]
  (.isSame d1 d2 "year"))

;;; ---------------------------------------------- information -------------------------------------------------------
(defn first-day-of-week
  "The first day of the week varies by locale, but Metabase has a setting that overrides it.
  In CLJS, Day.js is already configured with that setting."
  []
  (nth [:sunday :monday :tuesday :wednesday :thursday :friday :saturday]
       (.firstDayOfWeek (dayjs/localeData))))

(def default-options
  "The default map of options - empty in CLJS."
  {})

;;; ------------------------------------------------ to-range --------------------------------------------------------
(defn- apply-offset
  [value offset-n offset-unit]
  (.add
   (dayjs value)
   offset-n
   (name offset-unit)))

(defmethod common/to-range :default [^dayjs value {:keys [n unit]}]
  (let [^dayjs adjusted (if (> n 1)
                          (.add value (dec n) (name unit))
                          value)]
    [(.startOf value      (name unit))
     (.endOf   adjusted   (name unit))]))

;; NB: Only the :default for to-range is needed in CLJS, since Day.js's startOf and endOf methods are doing the work.

;;; -------------------------------------------- string->timestamp ---------------------------------------------------
(defn- valid-date-string?
  "Check if a date string is a valid ISO-8601 format.
  Rejects invalid dates like '2024-01-99' by validating the date components."
  [value]
  (when (string? value)
    ;; Parse with dayjs and check if it matches one of our expected formats
    ;; AND that the formatted output matches the input (to catch invalid dates)
    (let [parsed (.utc dayjs value)]
      (when (.isValid parsed)
        ;; Check for invalid dates by comparing input with formatted output
        ;; For "2024-01-99", dayjs would roll over to April, so format would differ
        ;; Note: re-find without groups returns a string, not a vector
        (let [input-date-part (re-find #"^\d{4}-\d{2}-\d{2}" value)
              output-date-part (.format parsed "YYYY-MM-DD")]
          (or (nil? input-date-part)  ;; If no date part found, it's a time-only or other format
              (= input-date-part output-date-part)))))))

(defmethod common/string->timestamp :default [value _]
  ;; Best effort to parse this unknown string format, as a local zoneless datetime, then treating it as UTC.
  ;; Validate the date to reject invalid dates like "2024-01-99"
  (when (valid-date-string? value)
    (.utc dayjs value)))

(def ^:private day-name->iso-weekday
  "Map of day names (case-insensitive) to ISO weekday numbers (Monday=1, Sunday=7)."
  {"mon" 1 "monday" 1
   "tue" 2 "tuesday" 2
   "wed" 3 "wednesday" 3
   "thu" 4 "thursday" 4
   "fri" 5 "friday" 5
   "sat" 6 "saturday" 6
   "sun" 7 "sunday" 7})

(defn- parse-day-name [value]
  (when (string? value)
    (get day-name->iso-weekday (.toLowerCase value))))

(defmethod common/string->timestamp :day-of-week [value options]
  ;; Try to parse as a regular timestamp; if that fails then try to treat it as a weekday name and adjust from
  ;; the current time.
  (let [as-default (try ((get-method common/string->timestamp :default) value options)
                        (catch js/Error _ nil))]
    (if (valid? as-default)
      as-default
      ;; dayjs's isoWeekday only accepts numbers, so we need to convert day names to numbers
      (when-let [iso-weekday (parse-day-name value)]
        (-> (now)
            (.isoWeekday iso-weekday)
            (.startOf "day"))))))

;;; -------------------------------------------- number->timestamp ---------------------------------------------------
(defn- magic-base-date
  "Some of the date coercions are relative, and not directly involved with any particular month.
  To avoid errors we need to use a reference date that is (a) in a month with 31 days,(b) in a leap year.
  This uses 2016-01-01 for the purpose.
  This is a function that returns fresh values, since we want a consistent reference."
  []
  (dayjs "2016-01-01"))

(defmethod common/number->timestamp :default [value _]
  ;; If no unit is given, or the unit is not recognized, try to parse the number as year number, returning the timestamp
  ;; for midnight UTC on January 1.
  ;; We need to pass it as a string to avoid dayjs treating it as a Unix timestamp
  (.utc dayjs (str value)))

(defmethod common/number->timestamp :minute-of-hour [value _]
  (-> (now) (.minute value) (.startOf "minute")))

(defmethod common/number->timestamp :hour-of-day [value _]
  (-> (now) (.hour value) (.startOf "hour")))

(defmethod common/number->timestamp :day-of-week [value _]
  ;; Metabase uses 1 to mean the start of the week, based on the Metabase setting for the first day of the week.
  ;; Day.js's weekday() uses 0 as the first day of the week in its configured locale.
  (-> (now) (.weekday (dec value)) (.startOf "day")))

(defmethod common/number->timestamp :day-of-week-iso [value _]
  (-> (now) (.isoWeekday value) (.startOf "day")))

(defmethod common/number->timestamp :day-of-month [value _]
  ;; We force the initial date to be in a month with 31 days.
  (-> (magic-base-date) (.date value) (.startOf "day")))

(defmethod common/number->timestamp :day-of-year [value _]
  ;; We force the initial date to be in a leap year (2016).
  (-> (magic-base-date) (.dayOfYear value) (.startOf "day")))

(defmethod common/number->timestamp :week-of-year [value _]
  (-> (now) (.week value) (.startOf "week")))

(defmethod common/number->timestamp :month-of-year [value _]
  ;; Day.js uses 0-based months, so we need to subtract 1
  (-> (now) (.month (dec value)) (.startOf "month")))

(defmethod common/number->timestamp :quarter-of-year [value _]
  (-> (now) (.quarter value) (.startOf "quarter")))

(defmethod common/number->timestamp :year [value _]
  (-> (now) (.year value) (.startOf "year")))

;;; ---------------------------------------------- parsing helpers ---------------------------------------------------
(defn parse-with-zone
  "Parses a timestamp with Z or a timezone offset at the end.
  Dayjs will handle this correctly with utc() and keepOffset."
  [value]
  (let [;; Check if it has a timezone offset
        has-offset? (re-find #"[Zz]|[+-]\d{2}:?\d{2}$" value)]
    (if has-offset?
      ;; Parse as UTC and keep the offset info
      (.utc dayjs value true)
      ;; No timezone, parse normally
      (dayjs value))))

(defn localize
  "Given a freshly parsed absolute Day.js instance, convert it to a local one."
  [value]
  (.local value))

(def ^:private parse-time-formats
  #js ["HH:mm:ss.SSS"
       "HH:mm:ss"
       "HH:mm"])

(defn parse-time-string
  "Parses a time string that has been stripped of any time zone."
  [value]
  (dayjs value parse-time-formats))

;;; ----------------------------------------------- constructors -----------------------------------------------------
(defn local-time
  "Constructs a platform time value (eg. Day.js, LocalTime) for the given hour and minute, plus optional seconds and
  milliseconds.

  If called without arguments, returns the current time."
  ([]
   ;; Actually a full datetime, but Day.js doesn't have freestanding time values.
   (dayjs))
  ([hours minutes]
   (dayjs #js {:hour hours, :minute minutes}))
  ([hours minutes seconds]
   (dayjs #js {:hour hours, :minute minutes, :second seconds}))
  ([hours minutes seconds millis]
   (dayjs #js {:hour hours, :minute minutes, :second seconds, :millisecond millis})))

(declare truncate)

(defn local-date
  "Constructs a platform date value (eg. Day.js, LocalDate) for the given year, month and day.

  Day is 1-31. January = 1, or you can specify keywords like `:jan`, `:jun`."
  ([] (truncate (dayjs) :day))
  ([year month day]
   (dayjs #js {:year  year
               :date  day
               ;; Day.js uses 0-based months, unlike Metabase.
               :month (dec (or (common/month-keywords month) month))})))

(defn local-date-time
  "Constructs a platform datetime (eg. Day.js, LocalDateTime).

  Accepts either:
  - no arguments (current datetime)
  - a local date and local time (see [[local-date]] and [[local-time]]); or
  - year, month, day, hour, and minute, plus optional seconds and millis."
  ([] (dayjs))
  ([a-date a-time]
   (when-not (and (valid? a-date) (valid? a-time))
     (throw (ex-info "Expected valid Day.js instances for date and time" {:date a-date
                                                                          :time a-time})))
   ;; Use Day.js object support plugin to set all values at once
   (dayjs #js {:year        (.year ^dayjs a-date)
               :month       (.month ^dayjs a-date)
               :date        (.date ^dayjs a-date)
               :hour        (.hour ^dayjs a-time)
               :minute      (.minute ^dayjs a-time)
               :second      (.second ^dayjs a-time)
               :millisecond (.millisecond ^dayjs a-time)}))
  ([year month day hours minutes]
   (dayjs #js {:year   year
               :month  (dec (or (common/month-keywords month) month))
               :date   day
               :hour   hours
               :minute minutes}))
  ([year month day hours minutes seconds]
   (dayjs #js {:year   year
               :month  (dec (or (common/month-keywords month) month))
               :date   day
               :hour   hours
               :minute minutes
               :second seconds}))
  ([year month day hours minutes seconds millis]
   (dayjs #js {:year        year
               :month       (dec (or (common/month-keywords month) month))
               :date        day
               :hour        hours
               :minute      minutes
               :second      seconds
               :millisecond millis})))

;;; ------------------------------------------------ arithmetic ------------------------------------------------------

(declare unit-diff)

(defn day-diff
  "Returns the time elapsed between `before` and `after` in days."
  [before after]
  (unit-diff :day before after))

(defn- coerce-local-date-time [input]
  (-> input
      common/drop-trailing-time-zone
      (dayjs/utc)))

(def ^:private unit-formats
  "Format strings for temporal units.
  Note: :day-of-year uses nil because DDD produces zero-padded output, we use dayOfYear() method instead."
  {:day-of-week        "dddd"
   :day-of-week-abbrev "ddd"
   :day-of-week-iso    "dddd"
   :month-of-year      "MMM"
   :month-of-year-full "MMMM"
   :minute-of-hour     "m"
   :hour-of-day        "h A"
   :hour-of-day-24     "h"
   :day-of-month       "D"
   :day-of-year        nil ;; handled specially with dayOfYear() method
   :week-of-year       "w"
   :quarter-of-year    "[Q]Q"})

(defn ^:private format-extraction-unit
  "Formats a date-time value given the temporal extraction unit.
  If unit is not supported, returns nil."
  [^dayjs t unit locale]
  ;; Special case for day-of-year: use the dayOfYear() method instead of format
  ;; because DDD produces zero-padded output
  (if (= unit :day-of-year)
    (str (.dayOfYear t))
    (when-some [format (get unit-formats unit)]
      (if locale
        (-> t
            (.locale locale)
            (.format format))
        (.format t format)))))

(defn- has-explicit-time?
  "Does this Day.js value have explicit time parts?
  For Day.js we check if hour, minute or second are non-zero, since Day.js doesn't track parsed parts.
  Note: This also returns true for time 00:00 if there's no date (checked by has-explicit-date?)."
  [^dayjs m]
  (or (pos? (.hour m))
      (pos? (.minute m))
      (pos? (.second m))
      (pos? (.millisecond m))))

(defn- has-explicit-date?
  "Does this Day.js value have explicit date parts?
  For Day.js we check if the date matches today - if it does, it might be a time-only value
  where dayjs defaulted to today's date. This is a heuristic since dayjs doesn't track parsed parts."
  [^dayjs m]
  (let [^dayjs today (dayjs)]
    ;; If the date matches today and time components are not all zero,
    ;; it's likely a time-only value that defaulted to today
    (not (and (= (.year m) (.year today))
              (= (.month m) (.month today))
              (= (.date m) (.date today))))))

(defn format-unit
  "Formats a temporal-value (iso date/time string, int for extraction units) given the temporal-bucketing unit.
   If unit is nil, formats the full date/time.
   Time input formatting is only defined with time units."
  ;; This third argument is needed for the JVM side; it can be ignored here.
  ([input unit] (format-unit input unit nil))
  ([input unit locale]
   (cond
     (string? input)
     (let [time? (common/matches-time? input)
           date? (common/matches-date? input)
           date-time? (common/matches-date-time? input)
           t (cond
               ;; Anchor to an arbitrary date since time inputs are only defined for
               ;; :hour-of-day and :minute-of-hour.
               time? (.utc dayjs (str "2023-01-01T" input))
               (or date? date-time?) (coerce-local-date-time input))]
       (if (and t (.isValid t))
         (or
          (format-extraction-unit t unit locale)
          ;; no locale for default formats
          (cond
            time? (.format t "h:mm A")
            date? (.format t "MMM D, YYYY")
            date-time? (.format t "MMM D, YYYY, h:mm A")))
         input))

     (number? input)
     (if (= unit :hour-of-day)
       (str (cond (zero? input) "12" (<= input 12) input :else (- input 12)) " " (if (<= input 11) "AM" "PM"))
       (or
        (format-extraction-unit (common/number->timestamp input {:unit unit}) unit locale)
        (str input)))

     (dayjs/isDayjs input)
     (or (format-extraction-unit input unit locale)
         ;; no locale for default formats
         (cond
           ;; no hour, minute, or seconds, must be date
           (not (has-explicit-time? input))
           (.format input "MMM D, YYYY")

           ;; no year, month, or day, must be a time
           (not (has-explicit-date? input))
           (.format input "h:mm A")

           :else ;; otherwise both date and time
           (.format input "MMM D, YYYY, h:mm A"))))))

(def ^:private month-abbrev->month
  "Map of English month abbreviations (case-insensitive) to month numbers (0-11)."
  {"jan" 0 "feb" 1 "mar" 2 "apr" 3 "may" 4 "jun" 5
   "jul" 6 "aug" 7 "sep" 8 "oct" 9 "nov" 10 "dec" 11})

(defn- parse-day-abbrev
  "Parse a day abbreviation like 'Wed' to a dayjs set to that weekday."
  [input]
  ;; Reuse day-name->iso-weekday and use isoWeekday for consistency
  (when-let [iso-weekday (parse-day-name input)]
    (-> (now) (.isoWeekday iso-weekday) (.startOf "day"))))

(defn- parse-month-abbrev
  "Parse a month abbreviation like 'Jan' to a dayjs set to that month."
  [input]
  (when-let [month (get month-abbrev->month (.toLowerCase input))]
    (-> (now) (.month month) (.startOf "month"))))

(defn- parse-hour-24
  "Parse an hour in 24-hour format to a dayjs set to that hour."
  [input]
  (when-let [hour (js/parseInt input 10)]
    (when (and (not (js/isNaN hour)) (>= hour 0) (< hour 24))
      (-> (now) (.hour hour) (.startOf "hour")))))

(defn parse-unit
  "Parse a unit of time/date, e.g., 'Wed' or 'August' or '14'."
  ([input unit]
   ;; Dayjs can't parse day/month names from format strings, so we handle them manually
   (case unit
     (:day-of-week :day-of-week-abbrev)
     (parse-day-abbrev input)

     (:month-of-year :month-of-year-full)
     (parse-month-abbrev input)

     :hour-of-day-24
     (parse-hour-24 input)

     ;; For other units, try standard dayjs parsing
     (when-some [format (get unit-formats unit)]
       (dayjs input format))))
  ([input unit locale]
   (let [temp (.locale (dayjs))]     ;; 1. save current locale
     (try
       (.locale (dayjs) locale)      ;; 2. set new locale for subsequent parse
       (parse-unit input unit)
       (finally
         (.locale (dayjs) temp)))))) ;; 3. set locale to original

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
            year-matches? (= (.format lhs "YYYY") (.format rhs "YYYY"))
            day-matches? (and (= (.format lhs "MMM") (.format rhs "MMM"))
                              (= (.format lhs "D") (.format rhs "D")))
            [lhs-fmt rhs-fmt] (cond
                                ;; Same day: show date once, both times
                                (and year-matches? day-matches?)
                                ["MMM D, YYYY, h:mm A " " h:mm A"]

                                ;; Same year: abbreviate year on first value
                                year-matches?
                                ["MMM D, h:mm A " " MMM D, YYYY, h:mm A"])]

        (if lhs-fmt
          (str (.format lhs lhs-fmt) "–" (.format rhs rhs-fmt))
          (default-format)))

      (and (common/matches-date? temporal-value-1)
           (common/matches-date? temporal-value-2))
      (let [lhs (.utc dayjs temporal-value-1)
            rhs (.utc dayjs temporal-value-2)
            year-matches? (= (.format lhs "YYYY") (.format rhs "YYYY"))
            month-matches? (= (.format lhs "MMM") (.format rhs "MMM"))
            [lhs-fmt rhs-fmt] (cond
                                (and year-matches? month-matches?)
                                ["MMM D" "D, YYYY"]

                                year-matches?
                                ["MMM D " " MMM D, YYYY"])]
        (if lhs-fmt
          (str (.format lhs lhs-fmt) "–" (.format rhs rhs-fmt))
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
         date-ranges (map #(.format % (if (#{:hour :minute} unit) "YYYY-MM-DDTHH:mm" "YYYY-MM-DD"))
                          (common/to-range offset-now
                                           {:unit unit
                                            :n pos-n
                                            :offset-n offset-n
                                            :offset-unit offset-unit}))]
     (apply format-diff date-ranges))))

(def ^:private temporal-formats
  "Map of temporal types to their regex patterns and dayjs format strings.
  Note: In dayjs, Z matches timezone offsets like +05:00, while [Z] matches literal 'Z'.
  We include both patterns to handle both Z and +HH:mm offsets."
  {:offset-date-time {:regex   common/offset-datetime-regex
                      :formats #js ["YYYY-MM-DDTHH:mm:ss.SSS[Z]"
                                    "YYYY-MM-DDTHH:mm:ss.SSSZ"
                                    "YYYY-MM-DDTHH:mm:ss[Z]"
                                    "YYYY-MM-DDTHH:mm:ssZ"
                                    "YYYY-MM-DDTHH:mm[Z]"
                                    "YYYY-MM-DDTHH:mmZ"]}
   :local-date-time  {:regex   common/local-datetime-regex
                      :formats #js ["YYYY-MM-DDTHH:mm:ss.SSS"
                                    "YYYY-MM-DDTHH:mm:ss"
                                    "YYYY-MM-DDTHH:mm"]}
   :local-date       {:regex   common/local-date-regex
                      :formats #js ["YYYY-MM-DD"
                                    "YYYY-MM"
                                    "YYYY"]}
   :offset-time      {:regex   common/offset-time-regex
                      :formats #js ["HH:mm:ss.SSS[Z]"
                                    "HH:mm:ss.SSSZ"
                                    "HH:mm:ss[Z]"
                                    "HH:mm:ssZ"
                                    "HH:mm[Z]"
                                    "HH:mmZ"]}
   :local-time       {:regex   common/local-time-regex
                      :formats #js ["HH:mm:ss.SSS"
                                    "HH:mm:ss"
                                    "HH:mm"]}})

(defn- parse-with-formats
  "Parse a string with the given formats array. Returns a valid dayjs or nil."
  [s formats]
  (let [parsed (dayjs s formats true)] ;; true = strict mode
    (when (.isValid parsed)
      parsed)))

(defn- iso-8601->dayjs+type
  [s]
  (some (fn [[value-type {:keys [regex formats]}]]
          (when (re-matches regex s)
            ;; offset-date-time needs special handling for timezone preservation
            (let [parsed (if (= value-type :offset-date-time)
                           (parse-with-zone s)
                           (parse-with-formats s formats))]
              (when (and parsed (.isValid parsed))
                [parsed value-type]))))
        temporal-formats))

(def ^:private iso-8601-format-strings
  "Format strings for ISO-8601 output by type and precision."
  {:offset-date-time {:millis "YYYY-MM-DDTHH:mm:ss.SSS[Z]"
                      :second "YYYY-MM-DDTHH:mm:ss[Z]"
                      :minute "YYYY-MM-DDTHH:mm[Z]"}
   :local-date-time  {:millis "YYYY-MM-DDTHH:mm:ss.SSS"
                      :second "YYYY-MM-DDTHH:mm:ss"
                      :minute "YYYY-MM-DDTHH:mm"}
   :local-date       {:default "YYYY-MM-DD"}
   :offset-time      {:millis "HH:mm:ss.SSS[Z]"
                      :second "HH:mm:ss[Z]"
                      :minute "HH:mm[Z]"}
   :local-time       {:millis "HH:mm:ss.SSS"
                      :second "HH:mm:ss"
                      :minute "HH:mm"}})

(defn- dayjs+type->iso-8601
  "Format a dayjs instance as ISO-8601 string based on its type."
  [[^dayjs t value-type]]
  (let [formats (get iso-8601-format-strings value-type)
        format-string (or (:default formats)
                          (cond
                            (pos? (.millisecond t)) (:millis formats)
                            (pos? (.second t))      (:second formats)
                            :else                   (:minute formats)))]
    (.format t format-string)))

(defn- ^dayjs ->dayjs
  "Convert a value to a dayjs instance. Handles strings, js/Date, and dayjs instances."
  [t]
  (cond
    (string? t)           (first (iso-8601->dayjs+type t))
    (instance? js/Date t) (.utc dayjs t)
    :else                 t))

(defn unit-diff
  "Return the number of `unit`s between two temporal values `before` and `after`, e.g. maybe there are 32 `:day`s
  between Jan 1st and Feb 2nd."
  [unit before after]
  (.diff (->dayjs after) (->dayjs before) (name unit)))

(defn- with-string-preservation
  "Apply f to a temporal value, preserving string format if input was a string."
  [t f]
  (if (string? t)
    (let [[parsed value-type] (iso-8601->dayjs+type t)]
      (dayjs+type->iso-8601 [(f parsed) value-type]))
    (f (->dayjs t))))

(defn truncate
  "ClojureScript implementation of [[metabase.util.time/truncate]]; supports both Day.js instances and ISO-8601
  strings."
  [t unit]
  (with-string-preservation t (fn [^dayjs parsed]
                                (.startOf parsed (name unit)))))

(defn add
  "ClojureScript implementation of [[metabase.util.time/add]]; supports both Day.js instances and ISO-8601 strings."
  [t unit amount]
  (with-string-preservation t (fn [^dayjs parsed]
                                (.add parsed amount (name unit)))))

(defn format-for-base-type
  "ClojureScript implementation of [[metabase.util.time/format-for-base-type]]; format a temporal value as an ISO-8601
  string appropriate for a value of the given `base-type`, e.g. a `:type/Time` gets formatted as a `HH:mm:ss.SSS`
  string."
  [t base-type]
  (if (string? t)
    t
    (let [t          (->dayjs t)
          value-type (condp #(isa? %2 %1) base-type
                       :type/TimeWithTZ     :offset-time
                       :type/Time           :local-time
                       :type/DateTimeWithTZ :offset-date-time
                       :type/DateTime       :local-date-time
                       :type/Date           :local-date)]
      (dayjs+type->iso-8601 [t value-type]))))

(defn extract
  "Extract a field such as `:minute-of-hour` from a temporal value `t`."
  [^dayjs t unit]
  (case unit
    :second-of-minute (.second t)
    :minute-of-hour   (.minute t)
    :hour-of-day      (.hour t)
    :day-of-week      (inc (.weekday t)) ;; `weekday` is 0-6, where 0 corresponds to the first day of week
    :day-of-week-iso  (.isoWeekday t)
    :day-of-month     (.date t)
    :day-of-year      (.dayOfYear t)
    :week-of-year     (.week t)
    :month-of-year    (inc (.month t)) ;; `month` is 0-11
    :quarter-of-year  (.quarter t)
    :year             (.year t)))
