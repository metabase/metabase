(ns metabase.lib.temporal-bucket
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.time :as u.time]))

(mu/defn describe-temporal-unit :- :string
  "Get a translated description of a temporal bucketing unit."
  ([]
   (describe-temporal-unit 1 nil))

  ([unit]
   (describe-temporal-unit 1 unit))

  ([n    :- :int
    unit :- [:maybe :keyword]]
   (if-not unit
     ""
     (let [n (abs n)]
       (case (keyword unit)
         :default         (i18n/trun "Default period"  "Default periods"  n)
         :millisecond     (i18n/trun "Millisecond"     "Milliseconds"     n)
         :second          (i18n/trun "Second"          "Seconds"          n)
         :minute          (i18n/trun "Minute"          "Minutes"          n)
         :hour            (i18n/trun "Hour"            "Hours"            n)
         :day             (i18n/trun "Day"             "Days"             n)
         :week            (i18n/trun "Week"            "Weeks"            n)
         :month           (i18n/trun "Month"           "Months"           n)
         :quarter         (i18n/trun "Quarter"         "Quarters"         n)
         :year            (i18n/trun "Year"            "Years"            n)
         :minute-of-hour  (i18n/trun "Minute of hour"  "Minutes of hour"  n)
         :hour-of-day     (i18n/trun "Hour of day"     "Hours of day"     n)
         :day-of-week     (i18n/trun "Day of week"     "Days of week"     n)
         :day-of-month    (i18n/trun "Day of month"    "Days of month"    n)
         :day-of-year     (i18n/trun "Day of year"     "Days of year"     n)
         :week-of-year    (i18n/trun "Week of year"    "Weeks of year"    n)
         :month-of-year   (i18n/trun "Month of year"   "Months of year"   n)
         :quarter-of-year (i18n/trun "Quarter of year" "Quarters of year" n)
         ;; e.g. :unknown-unit => "Unknown unit"
         (let [[unit & more] (str/split (name unit) #"-")]
           (str/join \space (cons (str/capitalize unit) more))))))))

(def ^:private TemporalIntervalAmount
  [:or [:enum :current :last :next] :int])

(defn- interval-n->int [n]
  (if (number? n)
    n
    (case n
      :current 0
      :next    1
      :last    -1
      0)))

(mu/defn describe-temporal-interval :- ::lib.schema.common/non-blank-string
  "Get a translated description of a temporal bucketing interval. If unit is unspecified, assume `:day`."
  [n    :- TemporalIntervalAmount
   unit :- [:maybe :keyword]]
  (let [n    (interval-n->int n)
        unit (or unit :day)]
    (cond
      (zero? n) (if (= unit :day)
                  (i18n/tru "Today")
                  (i18n/tru "This {0}" (describe-temporal-unit unit)))
      (= n 1)   (if (= unit :day)
                  (i18n/tru "Tomorrow")
                  (i18n/tru "Next {0}" (describe-temporal-unit unit)))
      (= n -1)  (if (= unit :day)
                  (i18n/tru "Yesterday")
                  (i18n/tru "Previous {0}" (describe-temporal-unit unit)))
      (neg? n)  (i18n/tru "Previous {0} {1}" (abs n) (describe-temporal-unit (abs n) unit))
      (pos? n)  (i18n/tru "Next {0} {1}" n (describe-temporal-unit n unit)))))

(mu/defn describe-relative-datetime :- ::lib.schema.common/non-blank-string
  "Get a translated description of a relative datetime interval, ported from
 `frontend/src/metabase-lib/queries/utils/query-time.js`.

  e.g. if the relative interval is `-1 days`, then `n` = `-1` and `unit` = `:day`.

  If `:unit` is unspecified, assume `:day`."
  [n    :- TemporalIntervalAmount
   unit :- [:maybe :keyword]]
  (let [n    (interval-n->int n)
        unit (or unit :day)]
    (cond
      (zero? n)
      (i18n/tru "Now")

      (neg? n)
      ;; this should legitimately be lowercasing in the user locale. I know system locale isn't necessarily the same
      ;; thing, but it might be. This will have to do until we have some sort of user-locale lower-case functionality
      #_{:clj-kondo/ignore [:discouraged-var]}
      (i18n/tru "{0} {1} ago" (abs n) (str/lower-case (describe-temporal-unit (abs n) unit)))

      :else
      #_{:clj-kondo/ignore [:discouraged-var]}
      (i18n/tru "{0} {1} from now" n (str/lower-case (describe-temporal-unit n unit))))))

(defmulti with-temporal-bucket-method
  "Implementation for [[temporal-bucket]]. Implement this to tell [[temporal-bucket]] how to add a bucket to a
  particular MBQL clause."
  {:arglists '([x unit])}
  (fn [x _unit]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(mu/defn with-temporal-bucket
  "Add a temporal bucketing unit, e.g. `:day` or `:day-of-year`, to an MBQL clause or something that can be converted to
  an MBQL clause. E.g. for a Field or Field metadata or `:field` clause, this might do something like this:

    (temporal some-field :day)

    =>

    [:field 1 {:temporal-unit :day}]

  Pass a `nil` `unit` to remove the temporal bucket."
  [x option-or-unit :- [:maybe [:or
                                ::lib.schema.temporal-bucketing/option
                                ::lib.schema.temporal-bucketing/unit]]]
  (with-temporal-bucket-method x (cond-> option-or-unit
                                   (not (keyword? option-or-unit)) :unit)))

(defmulti temporal-bucket-method
  "Implementation of [[temporal-bucket]]. Return the current temporal bucketing unit associated with `x`."
  {:arglists '([x])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defmethod temporal-bucket-method :default
  [_x]
  nil)

(mu/defmethod temporal-bucket-method :option/temporal-bucketing :- ::lib.schema.temporal-bucketing/unit
  [option]
  (:unit option))

(mu/defn raw-temporal-bucket :- [:maybe ::lib.schema.temporal-bucketing/unit]
  "Get the raw temporal bucketing `unit` associated with something e.g. a `:field` ref or a ColumnMetadata."
  [x]
  (temporal-bucket-method x))

(mu/defn temporal-bucket :- [:maybe ::lib.schema.temporal-bucketing/option]
  "Get the current temporal bucketing option associated with something, if any."
  [x]
  (when-let [unit (raw-temporal-bucket x)]
    {:lib/type :option/temporal-bucketing
     :unit     unit}))

(def ^:private hidden-bucketing-options
  "Options that are technically legal in MBQL, but that should be hidden in the UI."
  #{:millisecond
    :second
    :second-of-minute
    :year-of-era})

(def time-bucket-options
  "The temporal bucketing options for time type expressions."
  (into []
        (comp (remove hidden-bucketing-options)
              (map (fn [unit]
                     (cond-> {:lib/type :option/temporal-bucketing
                              :unit unit}
                       (= unit :hour) (assoc :default true)))))
        lib.schema.temporal-bucketing/ordered-time-bucketing-units))

(def date-bucket-options
  "The temporal bucketing options for date type expressions."
  (mapv (fn [unit]
          (cond-> {:lib/type :option/temporal-bucketing
                   :unit unit}
            (= unit :day) (assoc :default true)))
        lib.schema.temporal-bucketing/ordered-date-bucketing-units))

(def datetime-bucket-units
  "The temporal bucketing units for datetime type expressions."
  (into []
        (remove hidden-bucketing-options)
        lib.schema.temporal-bucketing/ordered-datetime-bucketing-units))

(def datetime-bucket-options
  "The temporal bucketing options for datetime type expressions."
  (mapv (fn [unit]
          (cond-> {:lib/type :option/temporal-bucketing
                   :unit unit}
            (= unit :day) (assoc :default true)))
        datetime-bucket-units))

(defn available-temporal-units
  "The temporal bucketing units for datetime type expressions."
  []
  datetime-bucket-units)

(defmethod lib.metadata.calculation/display-name-method :option/temporal-bucketing
  [_query _stage-number {:keys [unit]} _style]
  (describe-temporal-unit unit))

(defmethod lib.metadata.calculation/display-info-method :option/temporal-bucketing
  [query stage-number option]
  (merge {:display-name (lib.metadata.calculation/display-name query stage-number option)
          :short-name (u/qualified-name (raw-temporal-bucket option))
          :is-temporal-extraction (let [bucket (raw-temporal-bucket option)]
                                    (and (contains? lib.schema.temporal-bucketing/datetime-extraction-units
                                                    bucket)
                                         (not (contains? lib.schema.temporal-bucketing/datetime-truncation-units
                                                         bucket))))}
         (select-keys option [:default :selected])))

(defmulti available-temporal-buckets-method
  "Implementation for [[available-temporal-buckets]]. Return a set of units from
  `:metabase.lib.schema.temporal-bucketing/unit` that are allowed to be used with `x`."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod available-temporal-buckets-method :default
  [_query _stage-number _x]
  #{})

(defn- mark-unit [options option-key unit]
  (cond->> options
    (some #(= (:unit %) unit) options)
    (mapv (fn [option]
            (cond-> option
              (contains? option option-key) (dissoc option option-key)
              (= (:unit option) unit)       (assoc option-key true))))))

(defn available-temporal-buckets-for-type
  "Given the type of this column and nillable `default-unit` and `selected-unit`s, return the correct list of buckets."
  [column-type default-unit selected-unit]
  (let [options       (cond
                        (isa? column-type :type/DateTime) datetime-bucket-options
                        (isa? column-type :type/Date)     date-bucket-options
                        (isa? column-type :type/Time)     time-bucket-options
                        :else                             [])
        fallback-unit (if (isa? column-type :type/Time)
                        :hour
                        :month)
        default-unit  (or default-unit fallback-unit)]
    (cond-> options
      (= :inherited default-unit) (->> (mapv #(dissoc % :default)))
      default-unit  (mark-unit :default  default-unit)
      selected-unit (mark-unit :selected selected-unit))))

(mu/defn available-temporal-buckets :- [:sequential [:ref ::lib.schema.temporal-bucketing/option]]
  "Get a set of available temporal bucketing units for `x`. Returns nil if no units are available."
  ([query x]
   (available-temporal-buckets query -1 x))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    x]
   (available-temporal-buckets-method query stage-number x)))

(mu/defn describe-temporal-pair :- :string
  "Return a string describing the temporal pair.
   Used when comparing temporal values like `[:!= ... [:field {:temporal-unit :day-of-week} ...] \"2022-01-01\"]`"
  [temporal-column
   temporal-value :- [:or :int :string]]
  (u.time/format-unit temporal-value (:unit (temporal-bucket temporal-column))))

(defn add-temporal-bucket-to-ref
  "Internal helper shared between a few implementations of [[with-temporal-bucket-method]].

  Not intended to be called otherwise."
  [[tag options id-or-name] unit]
  ;; if `unit` is an extraction unit like `:month-of-year`, then the `:effective-type` of the ref changes to
  ;; `:type/Integer` (month of year returns an int). We need to record the ORIGINAL effective type somewhere in case
  ;; we need to refer back to it, e.g. to see what temporal buckets are available if we want to change the unit, or if
  ;; we want to remove it later. We will record this with the key `::original-effective-type`. Note that changing the
  ;; unit multiple times should keep the original first value of `::original-effective-type`.
  (if unit
    (let [original-temporal-unit  ((some-fn :metabase.lib.field/original-temporal-unit :temporal-unit) options)
          extraction-unit?        (contains? lib.schema.temporal-bucketing/datetime-extraction-units unit)
          original-effective-type ((some-fn :metabase.lib.field/original-effective-type :effective-type :base-type)
                                   options)
          new-effective-type      (if extraction-unit?
                                    :type/Integer
                                    original-effective-type)
          options                 (-> options
                                      (assoc :temporal-unit unit
                                             :effective-type new-effective-type
                                             :metabase.lib.field/original-effective-type original-effective-type)
                                      (m/assoc-some :metabase.lib.field/original-temporal-unit original-temporal-unit))]
      [tag options id-or-name])
    ;; `unit` is `nil`: remove the temporal bucket and remember it :metabase.lib.field/original-temporal-unit.
    (let [original-effective-type (:metabase.lib.field/original-effective-type options)
          original-temporal-unit ((some-fn :metabase.lib.field/original-temporal-unit :temporal-unit) options)
          options (cond-> (dissoc options :temporal-unit)
                    original-effective-type
                    (-> (assoc :effective-type original-effective-type)
                        (dissoc :metabase.lib.field/original-effective-type))
                    original-temporal-unit
                    (assoc :metabase.lib.field/original-temporal-unit original-temporal-unit))]
      [tag options id-or-name])))

(defn- ends-with-temporal-unit?
  [s temporal-unit]
  (str/ends-with? s (str ": " (describe-temporal-unit temporal-unit))))

(defn ensure-ends-with-temporal-unit
  "Append `temporal-unit` into a string `s` if appropriate.

  The `:default` temporal unit is not appended. If `temporal-unit` is already suffix of `s`, do not add it
  for the second time. This function may be called multiple times during processing of a query stage."
  [s temporal-unit]
  (if (or (not (string? s)) ; ie. nil or something that definitely should not occur here
          (= :default temporal-unit)
          (ends-with-temporal-unit? s temporal-unit))
    s
    (lib.util/format "%s: %s" s (describe-temporal-unit temporal-unit))))

(defn ensure-temporal-unit-in-display-name
  "Append temporal unit into `column-metadata`'s `:display_name` when appropriate.

  This is expected to be called after `:unit` is added into column metadata, ie. in terms of annotate middleware, after
  the column metadata coming from a driver are merged with result of `column-info`."
  [column-metadata]
  (if-some [temporal-unit (:unit column-metadata)]
    (update column-metadata :display_name ensure-ends-with-temporal-unit temporal-unit)
    column-metadata))
