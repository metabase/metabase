(ns metabase.driver.common.parameters.dates
  "Shared code for handling datetime parameters, used by both MBQL and native params implementations."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.shared.util.time :as shared.ut]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu])
  (:import
   (java.time.temporal Temporal)))

(set! *warn-on-reflection* true)

(def ^:private temporal-units-regex #"(millisecond|second|minute|hour|day|week|month|quarter|year)")

(def date-exclude-regex
  "Regex to match date exclusion values, e.g. exclude-days-Mon, exclude-months-Jan, etc."
  (re-pattern (str "exclude-" temporal-units-regex #"s-([-\p{Alnum}]+)")))

(mu/defn date-type?
  "Is param type `:date` or some subtype like `:date/month-year`?"
  [param-type :- :keyword]
  (= (get-in lib.schema.parameter/types [param-type :type]) :date))

(defn not-single-date-type?
  "Does date `param-type` represent a range of dates, rather than a single absolute date? (The value may be relative,
  such as `past30days`, or absolute, such as `2020-01`.)"
  [param-type]
  (and (date-type? param-type)
       (not (#{:date/single :date} param-type))))

(defn exclusion-date-type
  "When date `param-type` represent an exclusion of dates returns the temporal unit that's excluded."
  [param-type value]
  (when (and (date-type? param-type)
             (string? value))
    (some->> (re-matches date-exclude-regex value)
             second
             keyword)))

;; Both in MBQL and SQL parameter substitution a field value is compared to a date range, either relative or absolute.
;; Currently the field value is casted to a day (ignoring the time of day), so the ranges should have the same
;; granularity level.
;;
;; See https://github.com/metabase/metabase/pull/4607#issuecomment-290884313 how we could support
;; hour/minute granularity in field parameter queries.

(defn- day-range
  [start end]
  {:start start :end end :unit :day})

(defn- comparison-range
  ([t unit]
   (comparison-range t t unit :day))

  ([start end unit]
   (comparison-range start end unit :day))

  ([start end unit resolution]
   (merge
    (u.date/comparison-range start unit :>= {:resolution resolution})
    (u.date/comparison-range end   unit :<= {:resolution resolution, :end :inclusive})
    {:unit unit})))

(defn- second-range
  [start end]
  (comparison-range start end :second :second))

(defn- minute-range
  [start end]
  (comparison-range start end :minute :minute))

(defn- hour-range
  [start end]
  (comparison-range start end :hour :hour))

(defn- week-range [start end]
  (comparison-range start end :week))

(defn- month-range [start end]
  (comparison-range start end :month))

(defn- year-range [start end]
  (comparison-range start end :year))

(defn- relative-quarter-range
  [start end]
  (comparison-range start end :quarter))

(defn- absolute-quarter-range
  [quarter year]
  (let [year-quarter (t/year-quarter year (case quarter
                                            "Q1" 1
                                            "Q2" 2
                                            "Q3" 3
                                            "Q4" 4))]
    {:start (.atDay year-quarter 1)
     :end   (.atEndOfQuarter year-quarter)
     :unit  :quarter}))

(def ^:private operations-by-date-unit
  {"second"  {:unit-range second-range
              :to-period  t/seconds}
   "minute"  {:unit-range minute-range
              :to-period  t/minutes}
   "hour"    {:unit-range hour-range
              :to-period  t/hours}
   "day"     {:unit-range day-range
              :to-period  t/days}
   "week"    {:unit-range week-range
              :to-period  t/weeks}
   "month"   {:unit-range month-range
              :to-period  t/months}
   "quarter" {:unit-range relative-quarter-range
              :to-period  (comp t/months (partial * 3))}
   "year"    {:unit-range year-range
              :to-period  t/years}})

(defn- maybe-reduce-resolution [unit dt]
  (if (contains? #{"second" "minute" "hour"} unit)
    dt
    ; for units that are a day or longer, convert back to LocalDate
    (t/local-date dt)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              DATE STRING DECODERS                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; For parsing date strings and producing either a date range (for raw SQL parameter substitution) or a MBQL clause

(defn- expand-parser-groups
  [group-label group-value]
  (when group-value
    (case group-label
      :unit (conj (seq (get operations-by-date-unit group-value))
                  [group-label group-value])
      (:int-value :int-value-1) [[group-label (Integer/parseInt group-value)]]
      (:date :date-1 :date-2) [[group-label (u.date/parse group-value)]]
      [[group-label group-value]])))

(mu/defn- regex->parser :- fn?
  "Takes a regex and labels matching the regex capturing groups. Returns a parser which takes a parameter value,
  validates the value against regex and gives a map of labels and group values. Respects the following special label
  names:

      :unit – finds a matching date unit and merges date unit operations to the result
      :int-value, :int-value-1 – converts the group value to integer
      :date, :date1, date2 – converts the group value to absolute date"
  [regex :- [:fn {:error/message "regular expression"} m/regexp?] group-labels]
  (fn [param-value]
    (when-let [regex-result (re-matches regex param-value)]
      (into {} (mapcat expand-parser-groups group-labels (rest regex-result))))))

;; Decorders consist of:
;; 1) Parser which tries to parse the date parameter string
;; 2) Range decoder which takes the parser output and produces a date range relative to the given datetime
;; 3) Filter decoder which takes the parser output and produces a mbql clause for a given mbql field reference

(def ^:private relative-suffix-regex (re-pattern (format "(|~|-from-([0-9]+)%ss)" temporal-units-regex)))

(defn- include-current?
  "Adding a tilde (~) at the end of a past<n><unit>s filter means we should include the current time-unit (e.g. year, day,
  week, or month)."
  [relative-suffix]
  (= "~" relative-suffix))

(defn- with-temporal-unit-if-field
  [clause unit]
  (cond-> clause
    (mbql.u/is-clause? :field clause) (mbql.u/with-temporal-unit unit)))

(def ^:private relative-date-string-decoders
  [{:parser #(= % "today")
    :range  (fn [_ dt]
              (let [dt-res (t/local-date dt)]
                {:start dt-res,
                 :end   dt-res
                 :unit  :day}))
    :filter (fn [_ field-clause]
              [:= (with-temporal-unit-if-field field-clause :day) [:relative-datetime :current]])}

   {:parser #(= % "yesterday")
    :range  (fn [_ dt]
              (let [dt-res (t/local-date dt)]
                {:start (t/minus dt-res (t/days 1))
                 :end   (t/minus dt-res (t/days 1))
                 :unit  :day}))
    :filter (fn [_ field-clause]
              [:= (with-temporal-unit-if-field field-clause :day) [:relative-datetime -1 :day]])}

   ;; Adding a tilde (~) at the end of a past<n><unit>s filter means we should include the current day/etc.
   ;; e.g. past30days  = past 30 days, not including partial data for today ({:include-current false})
   ;;      past30days~ = past 30 days, *including* partial data for today   ({:include-current true}).
   ;; Adding a -from-<n><unit>s suffix at the end of the filter means we want to offset the range in the
   ;; case of past filters into the past, in the case of next filters into the future.
   ;; The implementation below uses the fact that if the relative suffix is not empty, then the
   ;; include-current flag is true.
   {:parser (regex->parser (re-pattern (str #"past([0-9]+)" temporal-units-regex #"s" relative-suffix-regex))
                           [:int-value :unit :relative-suffix :int-value-1 :unit-1])
    :range  (fn [{:keys [unit int-value unit-range to-period relative-suffix unit-1 int-value-1]} dt]
              (let [dt-offset (cond-> dt
                                unit-1 (t/minus ((get-in operations-by-date-unit [unit-1 :to-period]) int-value-1)))
                    dt-resolution (maybe-reduce-resolution unit dt-offset)]
                (unit-range (t/minus dt-resolution (to-period int-value))
                            (t/minus dt-resolution (to-period (if (include-current? relative-suffix) 0 1))))))

    :filter (fn [{:keys [unit int-value relative-suffix unit-1 int-value-1]} field-clause]
              (if unit-1
                [:between
                 [:+ field-clause [:interval int-value-1 (keyword unit-1)]]
                 [:relative-datetime (- int-value) (keyword unit)]
                 [:relative-datetime 0 (keyword unit)]]
                [:time-interval field-clause (- int-value) (keyword unit) {:include-current (include-current? relative-suffix)}]))}

   {:parser (regex->parser (re-pattern (str #"next([0-9]+)" temporal-units-regex #"s" relative-suffix-regex))
                           [:int-value :unit :relative-suffix :int-value-1 :unit-1])
    :range  (fn [{:keys [unit int-value unit-range to-period relative-suffix unit-1 int-value-1]} dt]
              (let [dt-offset (cond-> dt
                                unit-1 (t/plus ((get-in operations-by-date-unit [unit-1 :to-period]) int-value-1)))
                    dt-resolution (maybe-reduce-resolution unit dt-offset)]
                (unit-range (t/plus dt-resolution (to-period (if (include-current? relative-suffix) 0 1)))
                            (t/plus dt-resolution (to-period int-value)))))
    :filter (fn [{:keys [unit int-value relative-suffix unit-1 int-value-1]} field-clause]
              (if unit-1
                [:between
                 [:+ field-clause [:interval (- int-value-1) (keyword unit-1)]]
                 [:relative-datetime 0 (keyword unit)]
                 [:relative-datetime int-value (keyword unit)]]
                [:time-interval field-clause int-value (keyword unit) {:include-current (include-current? relative-suffix)}]))}

   {:parser (regex->parser (re-pattern (str #"last" temporal-units-regex))
                           [:unit])
    :range  (fn [{:keys [unit unit-range to-period]} dt]
              (let [last-unit (t/minus (maybe-reduce-resolution unit dt) (to-period 1))]
                (unit-range last-unit last-unit)))
    :filter (fn [{:keys [unit]} field-clause]
              [:time-interval field-clause :last (keyword unit)])}

   {:parser (regex->parser (re-pattern (str #"this" temporal-units-regex))
                           [:unit])
    :range  (fn [{:keys [unit unit-range]} dt]
              (let [dt-adj (maybe-reduce-resolution unit dt)]
                (unit-range dt-adj dt-adj)))
    :filter (fn [{:keys [unit]} field-clause]
              [:time-interval field-clause :current (keyword unit)])}])

(defn- ->iso-8601-date [t]
  (t/format :iso-local-date t))

(defn- ->iso-8601-date-time [t]
  (t/format :iso-local-date-time t))


;; TODO - using `range->filter` so much below seems silly. Why can't we just bucket the field and use `:=` clauses?
(defn- range->filter
  [{:keys [start end]} field-clause]
  [:between (with-temporal-unit-if-field field-clause :day) (->iso-8601-date start) (->iso-8601-date end)])

(def ^:private short-day->day
  {"Mon" :monday
   "Tue" :tuesday
   "Wed" :wednesday
   "Thu" :thursday
   "Fri" :friday
   "Sat" :saturday
   "Sun" :sunday})

(def ^:private short-month->month
  (into {}
        (map-indexed (fn [i m] [m (inc i)]))
        ["Jan" "Feb" "Mar" "Apr" "May" "Jun" "Jul" "Aug" "Sep" "Oct" "Nov" "Dec"]))

(defn- parse-int-in-range [s min-val max-val]
  (try
    (let [i (Integer/parseInt s)]
      (when (<= min-val i max-val)
        i))
    (catch NumberFormatException _)))

(defn- excluded-datetime [unit date exclusion]
  (let [year (t/year date)]
    (case unit
      :hour (when-let [hour (parse-int-in-range exclusion 0 23)]
              (format "%sT%02d:00:00Z" date hour))
      :day (when-let [day (short-day->day exclusion)]
             (str (t/adjust date :next-or-same-day-of-week day)))
      :month (when-let [month (short-month->month exclusion)]
               (format "%s-%02d-01" year month))
      :quarter (when-let [quarter (parse-int-in-range exclusion 1 4)]
                 (format "%s-%02d-01" year (inc (* 3 (dec quarter)))))
      nil)))

(def ^:private excluded-temporal-unit
  {:hour    :hour-of-day
   :day     :day-of-week
   :month   :month-of-year
   :quarter :quarter-of-year})

(defn- absolute-date->unit
  [date-string]
  (if (str/includes? date-string "T")
    ;; on the UI you can specify the time up to the minute, so we use minute here
    :minute
    :day))

(def ^:private absolute-date-string-decoders
  ;; year and month
  [{:parser (regex->parser #"([0-9]{4}-[0-9]{2})" [:date])
    :range  (fn [{:keys [date]} _]
              (month-range date date))
    :filter (fn [{:keys [date]} field-clause]
              (range->filter (month-range date date) field-clause))}
   ;; quarter year
   {:parser (regex->parser #"(Q[1-4]{1})-([0-9]{4})" [:quarter :year])
    :range  (fn [{:keys [quarter year]} _]
              (absolute-quarter-range quarter (Integer/parseInt year)))
    :filter (fn [{:keys [quarter year]} field-clause]
              (range->filter (absolute-quarter-range quarter (Integer/parseInt year))
                             field-clause))}
   ;; single day
   {:parser (regex->parser #"([0-9-T:]+)" [:date])
    :range  (fn [{:keys [date]} _]
              {:start date :end date :unit (absolute-date->unit date)})
    :filter (fn [{:keys [date]} field-clause]
              (let [iso8601date (->iso-8601-date date)]
                [:= (with-temporal-unit-if-field field-clause :day) iso8601date]))}
   ;; day range
   {:parser (regex->parser #"([0-9-T]+)~([0-9-T]+)" [:date-1 :date-2])
    :range  (fn [{:keys [date-1 date-2]} _]
              {:start date-1 :end date-2 :unit (absolute-date->unit date-1)})
    :filter (fn [{:keys [date-1 date-2]} field-clause]
              [:between (with-temporal-unit-if-field field-clause :day) (->iso-8601-date date-1) (->iso-8601-date date-2)])}
   ;; datetime range
   {:parser (regex->parser #"([0-9-T:]+)~([0-9-T:]+)" [:date-1 :date-2])
    :range  (fn [{:keys [date-1 date-2]} _]
              {:start date-1, :end date-2 :unit (absolute-date->unit date-1)})
    :filter (fn [{:keys [date-1 date-2]} field-clause]
              [:between (with-temporal-unit-if-field field-clause :default)
               (->iso-8601-date-time date-1)
               (->iso-8601-date-time date-2)])}
   ;; before day
   {:parser (regex->parser #"~([0-9-T:]+)" [:date])
    :range  (fn [{:keys [date]} _]
              {:end date :unit (absolute-date->unit date)})
    :filter (fn [{:keys [date]} field-clause]
              [:< (with-temporal-unit-if-field field-clause :day) (->iso-8601-date date)])}
   ;; after day
   {:parser (regex->parser #"([0-9-T:]+)~" [:date])
    :range  (fn [{:keys [date]} _]
              {:start date :unit (absolute-date->unit date)})
    :filter (fn [{:keys [date]} field-clause]
              [:> (with-temporal-unit-if-field field-clause :day) (->iso-8601-date date)])}
   ;; exclusions
   {:parser (regex->parser date-exclude-regex [:unit :exclusions])
    :filter (fn [{:keys [unit exclusions]} field-clause]
              (let [unit (keyword unit)
                    exclusions (map (partial excluded-datetime unit (t/local-date))
                                    (str/split exclusions #"-"))]
                (when (and (seq exclusions) (every? some? exclusions))
                  (into [:!= (with-temporal-unit-if-field field-clause (excluded-temporal-unit unit))] exclusions))))}])

(def ^:private all-date-string-decoders
  (concat relative-date-string-decoders absolute-date-string-decoders))

(mu/defn- execute-decoders
  "Returns the first successfully decoded value, run through both parser and a range/filter decoder depending on
  `decoder-type`. This generates an *inclusive* range by default. The range is adjusted to be exclusive as needed: see
  dox for [[date-string->range]] for more details."
  [decoders
   decoder-type :- [:enum :range :filter]
   decoder-param
   date-string :- :string]
  (some (fn [{parser :parser, parser-result-decoder decoder-type}]
          (when-let [parser-result (and parser-result-decoder (parser date-string))]
            (parser-result-decoder parser-result decoder-param)))
        decoders))

(def ^:private TemporalUnit
  (into [:enum] u.date/add-units))

(def ^:private TemporalRange
  [:map
   [:start {:optional true} (lib.schema.common/instance-of-class Temporal)]
   [:end   {:optional true} (lib.schema.common/instance-of-class Temporal)]
   [:unit                   TemporalUnit]])

(mu/defn- adjust-inclusive-range-if-needed :- [:maybe TemporalRange]
  "Make an inclusive date range exclusive as needed."
  [{:keys [inclusive-start? inclusive-end?]} temporal-range :- [:maybe TemporalRange]]
  (-> temporal-range
      (m/update-existing :start #(if inclusive-start?
                                   %
                                   (u.date/add % (case (:unit temporal-range)
                                                   (:year :quarter :month :week :day)
                                                   :day
                                                   (:unit temporal-range)) -1)))
      (m/update-existing :end #(if inclusive-end?
                                 %
                                 (u.date/add % (case (:unit temporal-range)
                                                   (:year :quarter :month :week :day)
                                                   :day
                                                   (:unit temporal-range)) 1)))))

(def ^:private DateStringRange
  "Schema for a valid date range returned by `date-string->range`."
  [:and [:map {:closed true}
         [:start {:optional true} ::lib.schema.common/non-blank-string]
         [:end   {:optional true} ::lib.schema.common/non-blank-string]]
   [:fn {:error/message "must have either :start or :end"}
    (fn [{:keys [start end]}]
      (or start end))]
   [:fn {:error/message ":start must come before :end"}
    (fn [{:keys [start end]}]
      (or (not start)
          (not end)
          (not (pos? (compare start end)))))]])

(defn- format-date-range
  [date-range]
  (-> date-range
      (m/update-existing :start u.date/format)
      (m/update-existing :end u.date/format)
      (dissoc :unit)))

(mu/defn date-string->range :- DateStringRange
  "Takes a string description of a date range such as `lastmonth` or `2016-07-15~2016-08-6` and returns a map with
  `:start` and/or `:end` keys, as ISO-8601 *date* strings. By default, `:start` and `:end` are inclusive,

  e.g:
    (date-string->range \"past2days\") ; -> {:start \"2020-01-20\", :end \"2020-01-21\"}

  intended for use with SQL like

    WHERE date(some_column) BETWEEN date '2020-01-20' AND date '2020-01-21'

  which is *INCLUSIVE*. If the filter clause you're generating is not inclusive, pass the `:inclusive-start?` or
  `:inclusive-end?` options as needed to generate an appropriate range.

  Note that some ranges are open-ended on one side, and will have only a `:start` or an `:end`."
  ;; 1-arg version returns inclusive start/end; 2-arg version can adjust as needed
  ([date-string]
   (date-string->range date-string nil))

  ([date-string  :- ::lib.schema.common/non-blank-string
    {:keys [inclusive-start? inclusive-end?]
     :or   {inclusive-start? true inclusive-end? true}}]
   (let [options {:inclusive-start? inclusive-start?, :inclusive-end? inclusive-end?}
         now (t/local-date-time)]
     ;; Relative dates respect the given time zone because a notion like "last 7 days" might mean a different range of
     ;; days depending on the user timezone
     (or (->> (execute-decoders relative-date-string-decoders :range now date-string)
              (adjust-inclusive-range-if-needed options)
              format-date-range)
         ;; Absolute date ranges don't need the time zone conversion because in SQL the date ranges are compared
         ;; against the db field value that is casted granularity level of a day in the db time zone
         (->> (execute-decoders absolute-date-string-decoders :range nil date-string)
              (adjust-inclusive-range-if-needed options)
              format-date-range)
         ;; if both of the decoders above fail, then the date string is invalid
         (throw (ex-info (tru "Don''t know how to parse date param ''{0}'' — invalid format" date-string)
                         {:param date-string
                          :type  qp.error-type/invalid-parameter}))))))

(defn- date-str->qp-aware-offset-dt
  "Generate offset datetime from `date-str` with respect to qp's `results-timezone`."
  [date-str]
  (when date-str
    (let [[y M d h m s] (shared.ut/yyyyMMddhhmmss->parts date-str)]
      (try (.toOffsetDateTime (t/zoned-date-time y M d h m s 0 (t/zone-id (qp.timezone/results-timezone-id))))
           (catch Throwable _
             (t/offset-date-time y M d h m s 0 (t/zone-offset (qp.timezone/results-timezone-id))))))))

(defn- date-str->unit-fn
  "Return appropriate function for interval end adjustments in [[exclusive-datetime-range-end]]."
  [date-str]
  (when date-str
    (if (re-matches shared.ut/local-date-regex date-str)
      t/days
      t/minutes)))

(defn- exclusive-datetime-range-end
  "Transform `end-dt` OffsetDateTime to appropriate range end.

  Context. Datetime range is required for `FieldFilter`s on `:type/DateTime` fields (see the
  [[metabase.driver.sql.parameters.substitution/field-filter->replacement-snippet-info]]) instead of _Date Range_
  available from [[date-string->range]].

  [[date-string->range]] returns interval of dates. [[date-str->datetime-range]] modifies the interval to consist
  of datetimes. By adding 0 temporal padding the end interval has to be adjusted."
  [end-dt unit-fn]
  (when (and end-dt unit-fn)
    (t/+ end-dt (unit-fn 1))))

(defn- fallback-raw-range
  "Try to extract date time value if [[date-string->range]] fails."
  [date-str]
  (let [date-str (first (re-find #"\d+-\d+-\d+T?(\d?+)?(:\d+)?(:\d+)?" date-str))]
    {:start date-str
     :end   date-str}))

(mu/defn date-str->datetime-range :- DateStringRange
  "Generate range from `date-range-str`.

  First [[date-string->range]] generates range for dates (inclusive by default). Operating on that range,
  this function:
  1. converts dates to OffsetDateTime, respecting qp's timezone, adding zero temporal padding,
  2. updates range to correct _end-exclusive datetime_*
  3. formats the range.

  This function is meant to be used for generating inclusive intervals for `:type/DateTime` field filters.

  * End-exclusive gte lt filters are generated for `:type/DateTime` fields."
  [raw-date-str]
  (let [;; `raw-date-str` is sanitized in case it contains millis and timezone which are incompatible
        ;; with [[date-string->range]]. `substitute-field-filter-test` expects that to happen.
        range-raw (try (date-string->range raw-date-str)
                       (catch Throwable _
                         (fallback-raw-range raw-date-str)))]
    (-> (update-vals range-raw date-str->qp-aware-offset-dt)
        (update :end exclusive-datetime-range-end (date-str->unit-fn (:end range-raw)))
        format-date-range)))

(mu/defn date-string->filter :- mbql.s/Filter
  "Takes a string description of a *date* (not datetime) range such as 'lastmonth' or '2016-07-15~2016-08-6' and
   returns a corresponding MBQL filter clause for a given field reference."
  [date-string :- :string
   field       :- [:or ::lib.schema.id/field mbql.s/Field]]
  (or (execute-decoders all-date-string-decoders :filter (mbql.u/wrap-field-id-if-needed field) date-string)
      (throw (ex-info (tru "Don''t know how to parse date string {0}" (pr-str date-string))
                      {:type        qp.error-type/invalid-parameter
                       :date-string date-string}))))
