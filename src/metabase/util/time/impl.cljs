(ns metabase.util.time.impl
  "CLJS implementation of the time utilities on top of Day.js.
  See [[metabase.util.time]] for the public interface."
  (:require
   [clojure.string :as str]
   ["dayjs" :as dayjs]
   ["dayjs/plugin/advancedFormat" :as advanced-format]
   ["dayjs/plugin/customParseFormat" :as custom-parse-format]
   ["dayjs/plugin/dayOfYear" :as day-of-year]
   ["dayjs/plugin/isoWeek" :as iso-week]
   ["dayjs/plugin/localeData" :as locale-data]
   ["dayjs/plugin/quarterOfYear" :as quarter-of-year]
   ["dayjs/plugin/utc" :as dayjs-utc]
   ["dayjs/plugin/weekOfYear" :as week-of-year]
   ["dayjs/plugin/weekday" :as weekday]
   ["dayjs/locale/es"]
   ["dayjs/locale/fr"]
   ["./dayjs_parse_zone_plugin" :default parse-zone]
   [metabase.util.time.impl-common :as common]))

;; forward declarations for helpers defined later
(declare ->dayjs parse-with-formats iso-8601->dayjs+type)

;; Plugins needed to match the Day.js surface we relied on previously.
(.extend dayjs dayjs-utc)
(.extend dayjs custom-parse-format)
(.extend dayjs iso-week)
(.extend dayjs weekday)
(.extend dayjs week-of-year)
(.extend dayjs quarter-of-year)
(.extend dayjs day-of-year)
(.extend dayjs locale-data)
(.extend dayjs advanced-format)
(.extend dayjs parse-zone)

(defn- annotate!
  "Store which components were present in the parsed value on the Day.js instance.
  This mirrors the parsingFlags checks we used with Moment previously."
  [^js d {:keys [has-date? has-time?]}]
  (let [x (or (.-$x d) (js-obj))]
    (aset d "$x" x)
    (when (some? has-date?)
      (aset x "hasDate" has-date?))
    (when (some? has-time?)
      (aset x "hasTime" has-time?)))
  d)

(defn- parsed-part?
  "Check whether the parsed value carried date or time parts."
  [^js d indices]
  (let [x (.-$x d)
        has-date (when x (.-hasDate x))
        has-time (when x (.-hasTime x))]
    (cond
      (some #{0 1 2} indices) (if (some? has-date) has-date true)
      (some #{3 4 5} indices) (if (some? has-time) has-time true)
      :else true)))

(defn- now [] (annotate! (dayjs) {:has-date? true, :has-time? true}))

;;; ----------------------------------------------- predicates -------------------------------------------------------
(defn- moment? [value]
  (and value (true? (.-_isAMomentObject value))))

(defn time?
  "checks if the provided value is a local time value."
  [value]
  (or (.isDayjs dayjs value)
      (moment? value)))

(defn datetime?
  "Given any value, check if it's a (possibly invalid) Day.js value."
  [value]
  (and value (time? value)))

(defn valid?
  "Given a Day.js value, check that it's valid."
  [value]
  (and (datetime? value) (.isValid ^js value)))

(defn normalize
  "Does nothing. Just a placeholder in CLJS; the JVM implementation does some real work."
  [value]
  value)

(defn same-day?
  "Given two platform-specific datetimes, checks if they fall within the same day."
  [d1 d2]
  (.isSame d1 d2 "day"))

(defn same-month?
  "True if these two datetimes fall in the same (year and) month."
  [d1 d2]
  (.isSame d1 d2 "month"))

(defn same-year?
  "True if these two datetimes fall in the same year."
  [d1 d2]
  (.isSame d1 d2 "year"))

;;; ---------------------------------------------- information -------------------------------------------------------
(def default-options
  "The default map of options - empty in CLJS."
  {})

;;; ------------------------------------------------ to-range --------------------------------------------------------
(defn- apply-offset
  [value offset-n offset-unit]
  (.add (->dayjs value) offset-n (name offset-unit)))

(defmethod common/to-range :default [value {:keys [n unit]}]
  (let [base      (dayjs value)
        adjusted  (if (> n 1)
                    (.add base (dec n) (name unit))
                    base)]
    [(.startOf base (name unit))
     (.endOf adjusted (name unit))]))

;; NB: Only the :default for to-range is needed in CLJS, since Day.js startOf and endOf methods are doing the work.

;;; -------------------------------------------- string->timestamp ---------------------------------------------------
(defmethod common/string->timestamp :default [value _]
  ;; Best effort to parse this unknown string format, as a local zoneless datetime, then treating it as UTC.
  (when-let [[parsed value-type] (iso-8601->dayjs+type value)]
    (let [needs-utc? (not (#{:local-time :offset-time} value-type))
          adjusted   (if needs-utc?
                       (.utc ^js parsed)
                       parsed)]
      adjusted)))

(defn- weekday-name->iso-weekday
  "Return ISO weekday number (1=Mon .. 7=Sun) for a localized weekday name."
  [value locale]
  (let [loc-inst (.locale (dayjs) (or locale (.locale dayjs)))
        data     (.localeData loc-inst)
        norm     (fn [s] (some-> s str/lower-case))
        match    (fn [names]
                   (some (fn [[i n]] (when (= (norm n) (norm value)) i))
                         (map-indexed vector names)))
        idx      (or (match (.weekdays data))
                     (match (.weekdaysShort data)))]
    (when-some [i idx]
      (.isoWeekday (.day loc-inst i)))))

(defmethod common/string->timestamp :day-of-week [value options]
  ;; Try to parse as a regular timestamp; if that fails then try to treat it as a weekday name and adjust from
  ;; the current time.
  (let [as-default (try ((get-method common/string->timestamp :default) value options)
                        (catch js/Error _ nil))]
    (if (valid? as-default)
      as-default
      (let [locale  (:locale options)
            iso-day (or (weekday-name->iso-weekday value locale)
                        (let [n (js/parseInt value 10)]
                          (when-not (js/isNaN n) n)))]
        (if iso-day
          (annotate! (-> (now)
                         (.isoWeekday iso-day)
                         (.startOf "day"))
                     {:has-date? true, :has-time? false})
          (throw (ex-info (str "Failed to coerce '" value "' to day-of-week")
                          {:value value})))))))

;;; -------------------------------------------- number->timestamp ---------------------------------------------------
(defn- magic-base-date
  "Some of the date coercions are relative, and not directly involved with any particular month.
  To avoid errors we need to use a reference date that is (a) in a month with 31 days,(b) in a leap year.
  This uses 2016-01-01 for the purpose.
  This is a function that returns fresh values."
  []
  (annotate! (dayjs "2016-01-01") {:has-date? true, :has-time? false}))

(defmethod common/number->timestamp :default [value _]
  ;; If no unit is given, or the unit is not recognized, try to parse the number as year number, returning the timestamp
  ;; for midnight UTC on January 1.
  (annotate! (.utc dayjs (str value) "YYYY" true) {:has-date? true, :has-time? false}))

(defmethod common/number->timestamp :minute-of-hour [value _]
  (annotate! (-> (now) (.minute value) (.startOf "minute")) {:has-date? false, :has-time? true}))

(defmethod common/number->timestamp :hour-of-day [value _]
  (annotate! (-> (now) (.hour value) (.startOf "hour")) {:has-date? false, :has-time? true}))

(defmethod common/number->timestamp :day-of-week [value _]
  ;; Metabase uses 1 to mean the start of the week, based on the Metabase setting for the first day of the week.
  ;; Day.js uses 0 as the first day of the week in its configured locale.
  (annotate! (-> (now) (.weekday (dec value)) (.startOf "day")) {:has-date? true, :has-time? false}))

(defmethod common/number->timestamp :day-of-week-iso [value _]
  (annotate! (-> (now) (.isoWeekday value) (.startOf "day")) {:has-date? true, :has-time? false}))

(defmethod common/number->timestamp :day-of-month [value _]
  ;; We force the initial date to be in a month with 31 days.
  (annotate! (-> (magic-base-date) (.date value) (.startOf "day")) {:has-date? true, :has-time? false}))

(defmethod common/number->timestamp :day-of-year [value _]
  ;; We force the initial date to be in a leap year (2016).
  (annotate! (-> (magic-base-date) (.dayOfYear value) (.startOf "day")) {:has-date? true, :has-time? false}))

(defmethod common/number->timestamp :week-of-year [value _]
  (annotate! (-> (now) (.week value) (.startOf "week")) {:has-date? true, :has-time? false}))

(defmethod common/number->timestamp :month-of-year [value _]
  (annotate! (-> (now) (.month (dec value)) (.startOf "month")) {:has-date? true, :has-time? false}))

(defmethod common/number->timestamp :quarter-of-year [value _]
  (annotate! (-> (now) (.quarter value) (.startOf "quarter")) {:has-date? true, :has-time? false}))

(defmethod common/number->timestamp :year [value _]
  (annotate! (-> (now) (.year value) (.startOf "year")) {:has-date? true, :has-time? false}))

;;; ---------------------------------------------- parsing helpers ---------------------------------------------------
(defn parse-with-zone
  "Parses a timestamp with Z or a timezone offset at the end.
  This requires a different API call from timestamps without time zones in CLJS."
  [value]
  (let [time-only?    (re-matches common/offset-time-regex value)
        time-prefix   (str (.format (now) "YYYY-MM-DD") "T")
        parsed        (.parseZone dayjs (if time-only?
                                          (str time-prefix value)
                                          value))]
    (annotate! parsed {:has-date? (not time-only?), :has-time? true})))

(defn localize
  "Given a freshly parsed absolute Day.js value, convert it to a local one."
  [value]
  (.local value))

(def ^:private parse-time-formats
  ["HH:mm:ss.SSSZ"
   "HH:mm:ss.SSS"
   "HH:mm:ss"
   "HH:mm"])

(defn- today-prefix []
  (str (.format (now) "YYYY-MM-DD") "T"))

(defn parse-time-string
  "Parses a time string that has been stripped of any time zone."
  [value]
  (parse-with-formats value {:formats       parse-time-formats
                             :parser        #(dayjs %1 %2 nil %3)
                             :prefix        today-prefix
                             :format-prefix "YYYY-MM-DDT"
                             :flags         {:has-date? false, :has-time? true}
                             :strict?       true}))

;;; ----------------------------------------------- constructors -----------------------------------------------------
(defn local-time
  "Constructs a platform time value (eg. Day.js, LocalTime) for the given hour and minute, plus optional seconds and
  milliseconds.

  If called without arguments, returns the current time."
  ([]
   (now))
  ([hours minutes]
   (annotate! (-> (dayjs) (.hour hours) (.minute minutes) (.second 0) (.millisecond 0))
              {:has-date? false, :has-time? true}))
  ([hours minutes seconds]
   (annotate! (-> (dayjs) (.hour hours) (.minute minutes) (.second seconds) (.millisecond 0))
              {:has-date? false, :has-time? true}))
  ([hours minutes seconds millis]
   (annotate! (-> (dayjs) (.hour hours) (.minute minutes) (.second seconds) (.millisecond millis))
              {:has-date? false, :has-time? true})))

(declare truncate)

(defn local-date
  "Constructs a platform date value (eg. Day.js, LocalDate) for the given year, month and day.

  Day is 1-31. January = 1, or you can specify keywords like `:jan`, `:jun`."
  ([] (annotate! (.startOf (dayjs) "day") {:has-date? true, :has-time? false}))
  ([year month day]
   (annotate! (dayjs (js/Date. year
                               (dec (or (common/month-keywords month) month))
                               day))
              {:has-date? true, :has-time? false})))

(defn local-date-time
  "Constructs a platform datetime (eg. Day.js, LocalDateTime).

  Accepts either:
  - no arguments (current datetime)
  - a local date and local time (see [[local-date]] and [[local-time]]); or
  - year, month, day, hour, and minute, plus optional seconds and millis."
  ([] (annotate! (dayjs) {:has-date? true, :has-time? true}))
  ([a-date a-time]
   (when-not (and (valid? a-date) (valid? a-time))
     (throw (ex-info "Expected valid Day.js values for date and time" {:date a-date
                                                                       :time a-time})))
   (let [t a-time
         combined (reduce (fn [acc unit]
                            (.set acc unit (.get t unit)))
                          (dayjs a-date)
                          ["hour" "minute" "second" "millisecond"])]
     (annotate! combined {:has-date? true, :has-time? true})))
  ([year month day hours minutes]
   (local-date-time (local-date year month day) (local-time hours minutes)))
  ([year month day hours minutes seconds]
   (local-date-time (local-date year month day) (local-time hours minutes seconds)))
  ([year month day hours minutes seconds millis]
   (local-date-time (local-date year month day) (local-time hours minutes seconds millis))))

;;; ------------------------------------------------ arithmetic ------------------------------------------------------

(declare unit-diff)

(defn day-diff
  "Returns the time elapsed between `before` and `after` in days."
  [before after]
  (unit-diff :day before after))

(defn- coerce-local-date-time [input]
  (annotate! (.utc dayjs (common/drop-trailing-time-zone input))
             {:has-date? true, :has-time? true}))

(def ^:private unit-formats
  {:day-of-week        "dddd"
   :day-of-week-abbrev "ddd"
   :day-of-week-iso    "dddd"
   :month-of-year      "MMM"
   :month-of-year-full "MMMM"
   :minute-of-hour     "m"
   :hour-of-day        "h A"
   :hour-of-day-24     "H"
   :day-of-month       "D"
   :day-of-year        "DDD"
   :week-of-year       "w"
   :quarter-of-year    "[Q]Q"})

(defn ^:private format-extraction-unit
  "Formats a date-time value given the temporal extraction unit.
  If unit is not supported, returns nil."
  [t unit locale]
  (cond
    (= unit :day-of-year)
    (str (.dayOfYear ^js t))

    :else
    (when-some [format (get unit-formats unit)]
      (if locale
        (-> t
            (.locale locale)
            (.format format))
        (.format t format)))))

(defn- has-parsed-parts?
  "Check if a parsed value carries explicit date/time parts at given indices.
  Date indices: 0=year, 1=month, 2=day. Time indices: 3=hours, 4=minutes, 5=seconds."
  [m indices]
  (if (and m (.-parsingFlags m))
    (let [^js/Object flags (.parsingFlags m)
          ^js/Array parts (.-parsedDateParts flags)]
      (when parts
        (some #(aget parts %) indices)))
    (parsed-part? m indices)))

(defn format-unit
  "Formats a temporal-value (iso date/time string, int for extraction units) given the temporal-bucketing unit.
   If unit is nil, formats the full date/time.
   Time input formatting is only defined with time units."
  ;; This third argument is needed for the JVM side; it can be ignored here.
  ([input unit] (format-unit input unit nil))
  ([input unit locale]
   (cond
     (string? input)
     (let [t (->dayjs input)]
       (if (and t (.isValid t))
         (or
          (format-extraction-unit t unit locale)
          ;; no locale for default formats
          (cond
            (not (has-parsed-parts? t [3 4 5])) (.format t "MMM D, YYYY")
            (not (has-parsed-parts? t [0 1 2])) (.format t "h:mm A")
            :else (.format t "MMM D, YYYY, h:mm A")))
         input))

     (number? input)
     (if (= unit :hour-of-day)
       (str (cond (zero? input) "12" (<= input 12) input :else (- input 12)) " " (if (<= input 11) "AM" "PM"))
      (or
       (format-extraction-unit (common/number->timestamp input {:unit unit}) unit locale)
       (str input)))

     (datetime? input)
     (or (format-extraction-unit input unit locale)
         ;; no locale for default formats
         (cond
           ;; no hour, minute, or seconds, must be date
           (not (has-parsed-parts? input [3 4 5])) ;; no time parts
           (.format input "MMM D, YYYY")

           ;; no year, month, or day, must be a time
           (not (has-parsed-parts? input [0 1 2])) ;; no date parts
           (.format input "h:mm A")

           :else ;; otherwise both date and time
           (.format input "MMM D, YYYY, h:mm A"))))))

(defn parse-unit
  "Parse a unit of time/date, e.g., 'Wed' or 'August' or '14'."
  ([input unit]
   (parse-unit input unit nil))
  ([input unit locale]
   (when-some [format (get unit-formats unit)]
     (let [flags {:has-date? true, :has-time? (boolean (re-find #"[Hhms]" format))}
           locale (or locale (.locale dayjs))
           parsed (dayjs input format locale true)]
       (if (.isValid parsed)
         (annotate! parsed flags)
         (let [loc-inst (.locale (dayjs) locale)
               data     (.localeData loc-inst)
               norm     (fn [s] (some-> s str/lower-case))]
           (cond
             (#{:day-of-week :day-of-week-abbrev} unit)
             (let [names (if (= unit :day-of-week-abbrev)
                           (.weekdaysShort data)
                           (.weekdays data))
                   idx   (some (fn [[i n]] (when (= (norm n) (norm input)) i))
                               (map-indexed vector names))]
               (when-some [i idx]
                 (annotate! (.startOf (.day loc-inst i) "day")
                            {:has-date? true, :has-time? false})))

             (#{:month-of-year :month-of-year-full} unit)
             (let [names (if (= unit :month-of-year-full)
                           (.months data)
                           (.monthsShort data))
                   idx   (some (fn [[i n]] (when (= (norm n) (norm input)) i))
                               (map-indexed vector names))]
               (when-some [i idx]
                 (annotate! (-> loc-inst
                                (.month i)
                                (.date 1)
                                (.startOf "day"))
                            {:has-date? true, :has-time? false}))))))))))

(defn- format-diff-with-formats
  "Helper for format-diff. Given two parsed values and a function to select formats based on matches,
   returns the formatted range or nil if no special formatting applies."
  [lhs rhs select-formats-fn]
  (let [year-matches? (= (.format lhs "YYYY") (.format rhs "YYYY"))
        month-matches? (= (.format lhs "MMM") (.format rhs "MMM"))
        day-matches? (= (.format lhs "D") (.format rhs "D"))
        [lhs-fmt rhs-fmt] (select-formats-fn year-matches? month-matches? day-matches?)]
    (when lhs-fmt
      (str (.format lhs lhs-fmt) "–" (.format rhs rhs-fmt)))))

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
      (or (format-diff-with-formats
           (coerce-local-date-time temporal-value-1)
           (coerce-local-date-time temporal-value-2)
           (fn [year? month? day?]
             (cond
               (and year? month? day?) ["MMM D, YYYY, h:mm A " " h:mm A"]
               year?                   ["MMM D, h:mm A " " MMM D, YYYY, h:mm A"])))
          (default-format))

      (and (common/matches-date? temporal-value-1)
           (common/matches-date? temporal-value-2))
      (or (format-diff-with-formats
           (annotate! (.utc dayjs temporal-value-1) {:has-date? true, :has-time? false})
           (annotate! (.utc dayjs temporal-value-2) {:has-date? true, :has-time? false})
           (fn [year? month? _day?]
             (cond
               (and year? month?) ["MMM D" "D, YYYY"]
               year?              ["MMM D " " MMM D, YYYY"])))
          (default-format))

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
  {:offset-date-time {:regex   common/offset-datetime-regex
                      :formats ["YYYY-MM-DDTHH:mm:ss.SSSZ"
                                "YYYY-MM-DDTHH:mm:ssZ"
                                "YYYY-MM-DDTHH:mmZ"]
                      :parser  #(.parseZone dayjs %1 %2 nil %3)
                      :flags   {:has-date? true, :has-time? true}
                      :strict? true}
   :local-date-time  {:regex   common/local-datetime-regex
                      :formats ["YYYY-MM-DDTHH:mm:ss.SSS"
                                "YYYY-MM-DDTHH:mm:ss"
                                "YYYY-MM-DDTHH:mm"]
                      :parser  #(.utc dayjs %1 %2 %3)
                      :flags   {:has-date? true, :has-time? true}
                      :strict? true}
   :local-date       {:regex   common/local-date-regex
                      :formats ["YYYY-MM-DD"
                                "YYYY-MM"
                                "YYYY"]
                      :parser  #(.utc dayjs %1 %2 %3)
                      :flags   {:has-date? true, :has-time? false}
                      :strict? true}
   :offset-time      {:regex   common/offset-time-regex
                      :formats ["HH:mm:ss.SSSZ"
                                "HH:mm:ssZ"
                                "HH:mmZ"]
                      :parser  #(.parseZone dayjs %1 %2 nil %3)
                      :prefix  today-prefix
                      :format-prefix "YYYY-MM-DDT"
                      :flags   {:has-date? false, :has-time? true}
                      :strict? true}
   :local-time       {:regex   common/local-time-regex
                      :formats ["HH:mm:ss.SSS"
                                "HH:mm:ss"
                                "HH:mm"]
                      :parser  #(dayjs %1 %2 nil %3)
                      :prefix  today-prefix
                      :format-prefix "YYYY-MM-DDT"
                      :flags   {:has-date? false, :has-time? true}
                      :strict? true}})

(defn- parse-with-formats
  [value {:keys [formats parser prefix format-prefix flags strict?]}]
  (let [prefix-val        (if (ifn? prefix) (prefix) prefix)
        format-prefix-val (if (ifn? format-prefix) (format-prefix) format-prefix)
        parsed (some (fn [fmt]
                       (let [parsed (parser (str (or prefix-val "") value)
                                            (str (or format-prefix-val "") fmt)
                                            strict?)]
                         (when (.isValid parsed)
                           (annotate! parsed flags))))
                     formats)]
    parsed))

(defn- iso-8601->dayjs+type
  [s]
  (some (fn [[value-type spec]]
          (when (re-matches (:regex spec) s)
            (when-let [parsed (parse-with-formats s spec)]
              [parsed value-type])))
        temporal-formats))


(def ^:private iso-8601-output-formats
  "Format strings for each temporal type, keyed by [type precision].
   Precision is :millis, :seconds, or :minutes based on the non-zero components."
  {:offset-date-time {:millis  "YYYY-MM-DDTHH:mm:ss.SSS[Z]"
                      :seconds "YYYY-MM-DDTHH:mm:ss[Z]"
                      :minutes "YYYY-MM-DDTHH:mm[Z]"}
   :local-date-time  {:millis  "YYYY-MM-DDTHH:mm:ss.SSS"
                      :seconds "YYYY-MM-DDTHH:mm:ss"
                      :minutes "YYYY-MM-DDTHH:mm"}
   :local-date       {:default "YYYY-MM-DD"}
   :offset-time      {:millis  "HH:mm:ss.SSS[Z]"
                      :seconds "HH:mm:ss[Z]"
                      :minutes "HH:mm[Z]"}
   :local-time       {:millis  "HH:mm:ss.SSS"
                      :seconds "HH:mm:ss"
                      :minutes "HH:mm"}})

(defn- dayjs+type->iso-8601
  "Convert a [dayjs value-type] pair to an ISO-8601 string."
  [[t value-type]]
  (let [formats (get iso-8601-output-formats value-type)
        format-key (cond
                     (:default formats)       :default
                     (pos? (.millisecond ^js t))  :millis
                     (pos? (.second ^js t))       :seconds
                     :else                    :minutes)]
    (.format t (get formats format-key))))

(defn- ->dayjs
  "Coerce a value to a Day.js instance. Handles strings, js/Date, and passes through Day.js instances."
  [t]
  (cond
    (string? t)            (first (iso-8601->dayjs+type t))
    (instance? js/Date t)  (.utc dayjs t)
    (moment? t)            (annotate! (dayjs (.valueOf ^js t)) {:has-date? true, :has-time? true})
    (.isDayjs dayjs t)     t
    :else                  t))

(defn unit-diff
  "Return the number of `unit`s between two temporal values `before` and `after`, e.g. maybe there are 32 `:day`s
  between Jan 1st and Feb 2nd."
  [unit before after]
  (.diff (->dayjs after) (->dayjs before) (name unit)))

(defn truncate
  "ClojureScript implementation of [[metabase.util.time/truncate]]; supports both Day.js instances and ISO-8601
  strings."
  [t unit]
  (if (string? t)
    (let [[t value-type] (iso-8601->dayjs+type t)
          t              (truncate t unit)]
      (dayjs+type->iso-8601 [t value-type]))
    (let [t (->dayjs t)]
      (.startOf t (name unit)))))

(defn add
  "ClojureScript implementation of [[metabase.util.time/add]]; supports both Day.js instances and ISO-8601 strings."
  [t unit amount]
  (if (string? t)
    (let [[t value-type] (iso-8601->dayjs+type t)
          t              (add t unit amount)]
      (dayjs+type->iso-8601 [t value-type]))
    (let [t (->dayjs t)]
      (.add t amount (name unit)))))

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
  [t unit]
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
