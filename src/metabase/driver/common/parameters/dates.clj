(ns metabase.driver.common.parameters.dates
  "Shared code for handling datetime parameters, used by both MBQL and native params implementations.

  DEPRECATED: This namespace will be removed in the near future, in favor
  of [[metabase.query-processor.parameters.dates]] (which uses Lib/MBQL 5).

  TODO (Cam 9/30/25) -- a ton of stuff in this namespace is an exact duplicate of the version
  in [[metabase.query-processor.parameters.dates]], we should remove the version here to encourage migration to that
  namespace."
  {:deprecated "0.57.0"}
  (:refer-clojure :exclude [every? some get-in])
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.parameters.dates :as qp.parameters.dates]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [every? get-in]]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

;; Both in MBQL and SQL parameter substitution a field value is compared to a date range, either relative or absolute.
;; Currently the field value is casted to a day (ignoring the time of day), so the ranges should have the same
;; granularity level.
;;
;; See https://github.com/metabase/metabase/pull/4607#issuecomment-290884313 how we could support
;; hour/minute granularity in field parameter queries.

;; For parsing date strings and producing either a date range (for raw SQL parameter substitution) or a MBQL clause

;; Decoders consist of:
;; 1) Parser which tries to parse the date parameter string
;; 2) Range decoder which takes the parser output and produces a date range relative to the given datetime
;; 3) Filter decoder which takes the parser output and produces a mbql clause for a given mbql field reference

(defn- with-temporal-unit-if-field
  [clause unit]
  ;; legacy usages -- use Lib in new code going forward
  #_{:clj-kondo/ignore [:deprecated-var]}
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
   {:parser (#'qp.parameters.dates/regex->parser (re-pattern (str #"past([0-9]+)" @#'qp.parameters.dates/temporal-units-regex #"s" @#'qp.parameters.dates/relative-suffix-regex))
                                                 [:int-value :unit :relative-suffix :int-value-1 :unit-1])
    :range  (fn [{:keys [unit int-value unit-range to-period relative-suffix unit-1 int-value-1]} dt]
              (let [dt-offset (cond-> dt
                                unit-1 (t/minus ((get-in @#'qp.parameters.dates/operations-by-date-unit [unit-1 :to-period]) int-value-1)))
                    dt-resolution (#'qp.parameters.dates/maybe-reduce-resolution unit dt-offset)]
                (unit-range (t/minus dt-resolution (to-period int-value))
                            (t/minus dt-resolution (to-period (if (#'qp.parameters.dates/include-current? relative-suffix) 0 1))))))

    :filter (fn [{:keys [unit int-value relative-suffix unit-1 int-value-1]} field-clause]
              (if unit-1
                [:relative-time-interval
                 field-clause
                 (- int-value)
                 (keyword unit)
                 (- int-value-1)
                 (keyword unit-1)]
                [:time-interval
                 field-clause
                 (- int-value)
                 (keyword unit)
                 {:include-current (#'qp.parameters.dates/include-current? relative-suffix)}]))}

   {:parser (#'qp.parameters.dates/regex->parser (re-pattern (str #"next([0-9]+)" @#'qp.parameters.dates/temporal-units-regex #"s" @#'qp.parameters.dates/relative-suffix-regex))
                                                 [:int-value :unit :relative-suffix :int-value-1 :unit-1])
    :range  (fn [{:keys [unit int-value unit-range to-period relative-suffix unit-1 int-value-1]} dt]
              (let [dt-offset (cond-> dt
                                unit-1 (t/plus ((get-in @#'qp.parameters.dates/operations-by-date-unit [unit-1 :to-period]) int-value-1)))
                    dt-resolution (#'qp.parameters.dates/maybe-reduce-resolution unit dt-offset)]
                (unit-range (t/plus dt-resolution (to-period (if (#'qp.parameters.dates/include-current? relative-suffix) 0 1)))
                            (t/plus dt-resolution (to-period int-value)))))
    :filter (fn [{:keys [unit int-value relative-suffix unit-1 int-value-1]} field-clause]
              (if unit-1
                [:relative-time-interval
                 field-clause
                 int-value
                 (keyword unit)
                 int-value-1
                 (keyword unit-1)]
                [:time-interval
                 field-clause
                 int-value
                 (keyword unit)
                 {:include-current (#'qp.parameters.dates/include-current? relative-suffix)}]))}

   {:parser (#'qp.parameters.dates/regex->parser (re-pattern (str #"last" @#'qp.parameters.dates/temporal-units-regex))
                                                 [:unit])
    :range  (fn [{:keys [unit unit-range to-period]} dt]
              (let [last-unit (t/minus (#'qp.parameters.dates/maybe-reduce-resolution unit dt) (to-period 1))]
                (unit-range last-unit last-unit)))
    :filter (fn [{:keys [unit]} field-clause]
              [:time-interval field-clause :last (keyword unit)])}

   {:parser (#'qp.parameters.dates/regex->parser (re-pattern (str #"this" @#'qp.parameters.dates/temporal-units-regex))
                                                 [:unit])
    :range  (fn [{:keys [unit unit-range]} dt]
              (let [dt-adj (#'qp.parameters.dates/maybe-reduce-resolution unit dt)]
                (unit-range dt-adj dt-adj)))
    :filter (fn [{:keys [unit]} field-clause]
              [:time-interval field-clause :current (keyword unit)])}])

;; TODO - using `range->filter` so much below seems silly. Why can't we just bucket the field and use `:=` clauses?
(defn- range->filter
  [{:keys [start end]} field-clause]
  [:between
   (with-temporal-unit-if-field field-clause :day)
   (#'qp.parameters.dates/->iso-8601-date start)
   (#'qp.parameters.dates/->iso-8601-date end)])

(def ^:private absolute-date-string-decoders
  ;; year and month
  [{:parser (#'qp.parameters.dates/regex->parser #"([0-9]{4}-[0-9]{2})" [:date])
    :range  (fn [{:keys [date]} _]
              (#'qp.parameters.dates/month-range date date))
    :filter (fn [{:keys [date]} field-clause]
              (range->filter (#'qp.parameters.dates/month-range date date) field-clause))}
   ;; quarter year
   {:parser (#'qp.parameters.dates/regex->parser #"(Q[1-4]{1})-([0-9]{4})" [:quarter :year])
    :range  (fn [{:keys [quarter year]} _]
              (#'qp.parameters.dates/absolute-quarter-range quarter (Integer/parseInt year)))
    :filter (fn [{:keys [quarter year]} field-clause]
              (range->filter (#'qp.parameters.dates/absolute-quarter-range quarter (Integer/parseInt year))
                             field-clause))}
   ;; single day
   {:parser (#'qp.parameters.dates/regex->parser #"([0-9-T:]+)" [:date])
    :range  (fn [{:keys [date]} _]
              {:start date :end date :unit (#'qp.parameters.dates/absolute-date->unit date)})
    :filter (fn [{:keys [date]} field-clause]
              (let [unit        (#'qp.parameters.dates/absolute-date->unit date)
                    iso8601str  (case unit
                                  :day    (#'qp.parameters.dates/->iso-8601-date date)
                                  :minute (#'qp.parameters.dates/->iso-8601-date-time date))]
                [:= (with-temporal-unit-if-field field-clause unit) iso8601str]))}
   ;; day range
   {:parser (#'qp.parameters.dates/regex->parser #"([0-9-T]+)~([0-9-T]+)" [:date-1 :date-2])
    :range  (fn [{:keys [date-1 date-2]} _]
              {:start date-1 :end date-2 :unit (#'qp.parameters.dates/absolute-date->unit date-1)})
    :filter (fn [{:keys [date-1 date-2]} field-clause]
              [:between
               (with-temporal-unit-if-field field-clause :day)
               (#'qp.parameters.dates/->iso-8601-date date-1)
               (#'qp.parameters.dates/->iso-8601-date date-2)])}
   ;; datetime range
   {:parser (#'qp.parameters.dates/regex->parser #"([0-9-T:]+)~([0-9-T:]+)" [:date-1 :date-2])
    :range  (fn [{:keys [date-1 date-2]} _]
              {:start date-1, :end date-2 :unit (#'qp.parameters.dates/absolute-date->unit date-1)})
    :filter (fn [{:keys [date-1 date-2]} field-clause]
              [:between
               (with-temporal-unit-if-field field-clause :default)
               (#'qp.parameters.dates/->iso-8601-date-time date-1)
               (#'qp.parameters.dates/->iso-8601-date-time date-2)])}
   ;; before day
   {:parser (#'qp.parameters.dates/regex->parser #"~([0-9-T:]+)" [:date])
    :range  (fn [{:keys [date]} _]
              {:end date :unit (#'qp.parameters.dates/absolute-date->unit date)})
    :filter (fn [{:keys [date]} field-clause]
              [:< (with-temporal-unit-if-field field-clause :day) (#'qp.parameters.dates/->iso-8601-date date)])}
   ;; after day
   {:parser (#'qp.parameters.dates/regex->parser #"([0-9-T:]+)~" [:date])
    :range  (fn [{:keys [date]} _]
              {:start date :unit (#'qp.parameters.dates/absolute-date->unit date)})
    :filter (fn [{:keys [date]} field-clause]
              [:> (with-temporal-unit-if-field field-clause :day) (#'qp.parameters.dates/->iso-8601-date date)])}
   ;; exclusions
   {:parser (#'qp.parameters.dates/regex->parser qp.parameters.dates/date-exclude-regex [:unit :exclusions])
    :filter (fn [{:keys [unit exclusions]} field-clause]
              (let [unit (keyword unit)
                    exclusions (map (partial #'qp.parameters.dates/excluded-datetime unit (t/local-date))
                                    (str/split exclusions #"-"))]
                (when (and (seq exclusions) (every? some? exclusions))
                  (into [:!= (with-temporal-unit-if-field field-clause (#'qp.parameters.dates/excluded-temporal-unit unit))]
                        exclusions))))}])

(def ^:private all-date-string-decoders
  (concat relative-date-string-decoders absolute-date-string-decoders))

(mu/defn date-string->filter :- ::mbql.s/Filter
  "Takes a string description of a *date* (not datetime) range such as 'lastmonth' or '2016-07-15~2016-08-6', or
  an absolute date *or datetime* string, and returns a corresponding MBQL filter clause for a given field reference."
  [date-string :- :string
   field       :- [:or ::lib.schema.id/field ::mbql.s/FieldOrExpressionRef]]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (or (#'qp.parameters.dates/execute-decoders all-date-string-decoders :filter (mbql.u/wrap-field-id-if-needed field) date-string)
      (throw (ex-info (tru "Don''t know how to parse date string {0}" (pr-str date-string))
                      {:type        qp.error-type/invalid-parameter
                       :date-string date-string}))))

(p/import-vars
 [qp.parameters.dates
  date-str->datetime-range
  not-single-date-type?
  date-exclude-regex
  date-type?
  date-string->range
  exclusion-date-type])
