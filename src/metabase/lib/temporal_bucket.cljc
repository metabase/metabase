(ns metabase.lib.temporal-bucket
  "TODO (Cam 6/13/25) -- decide whether things are `unit` or `bucket` and rename functions and args for consistency.
  Confusing to use both as synonyms."
  (:refer-clojure :exclude [mapv select-keys some])
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.display-name :as lib.display-name]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv select-keys some]]
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

(defn- temporal-interval-tru
  "Chooses the correct temporal interval description based on the provided amount `n`."
  [n
   this-interval-message
   prev-interval-message
   prev-interval-plural-message
   next-interval-message
   next-interval-plural-message]
  (cond
    (zero? n) this-interval-message
    (= n -1)  prev-interval-message
    (= n 1)   next-interval-message
    (neg? n)  prev-interval-plural-message
    (pos? n)  next-interval-plural-message
    :else     (throw (ex-info (str "Invalid n: " n) {:n n}))))

(mu/defn describe-temporal-interval :- ::lib.schema.common/non-blank-string
  "Get a translated description of a temporal bucketing interval. If unit is unspecified, assume `:day`."
  ([n    :- TemporalIntervalAmount
    unit :- [:maybe :keyword]]
   (describe-temporal-interval n unit nil))
  ([n    :- TemporalIntervalAmount
    unit :- [:maybe :keyword]
    opts :- [:maybe [:map [:include-current {:optional true} :boolean]]]]
   (let [n                (interval-n->int n)
         unit             (or unit :day)
         include-current? (:include-current opts)]
     (case (keyword unit)
       :millisecond     (temporal-interval-tru n
                                               (i18n/tru  "This millisecond")
                                               (if include-current?
                                                 (i18n/tru "Previous millisecond or this millisecond")
                                                 (i18n/tru "Previous millisecond"))
                                               (if include-current?
                                                 (i18n/tru "Previous {0} milliseconds or this millisecond" (abs n))
                                                 (i18n/tru "Previous {0} milliseconds" (abs n)))
                                               (if include-current?
                                                 (i18n/tru "Next millisecond or this millisecond")
                                                 (i18n/tru "Next millisecond"))
                                               (if include-current?
                                                 (i18n/tru "Next {0} milliseconds or this millisecond" (abs n))
                                                 (i18n/tru "Next {0} milliseconds" (abs n))))
       :second          (temporal-interval-tru n
                                               (i18n/tru  "This second")
                                               (if include-current?
                                                 (i18n/tru "Previous second or this second")
                                                 (i18n/tru "Previous second"))
                                               (if include-current?
                                                 (i18n/tru "Previous {0} seconds or this second" (abs n))
                                                 (i18n/tru "Previous {0} seconds" (abs n)))
                                               (if include-current?
                                                 (i18n/tru "Next second or this second")
                                                 (i18n/tru "Next second"))
                                               (if include-current?
                                                 (i18n/tru "Next {0} seconds or this second" (abs n))
                                                 (i18n/tru "Next {0} seconds" (abs n))))
       :minute          (temporal-interval-tru n
                                               (i18n/tru  "This minute")
                                               (if include-current?
                                                 (i18n/tru "Previous minute or this minute")
                                                 (i18n/tru "Previous minute"))
                                               (if include-current?
                                                 (i18n/tru "Previous {0} minutes or this minute" (abs n))
                                                 (i18n/tru "Previous {0} minutes" (abs n)))
                                               (if include-current?
                                                 (i18n/tru "Next minute or this minute")
                                                 (i18n/tru "Next minute"))
                                               (if include-current?
                                                 (i18n/tru "Next {0} minutes or this minute" (abs n))
                                                 (i18n/tru "Next {0} minutes" (abs n))))
       :hour            (temporal-interval-tru n
                                               (i18n/tru  "This hour")
                                               (if include-current?
                                                 (i18n/tru "Previous hour or this hour")
                                                 (i18n/tru "Previous hour"))
                                               (if include-current?
                                                 (i18n/tru "Previous {0} hours or this hour" (abs n))
                                                 (i18n/tru "Previous {0} hours" (abs n)))
                                               (if include-current?
                                                 (i18n/tru "Next hour or this hour")
                                                 (i18n/tru "Next hour"))
                                               (if include-current?
                                                 (i18n/tru "Next {0} hours or this hour" (abs n))
                                                 (i18n/tru "Next {0} hours" (abs n))))
       :day             (temporal-interval-tru n
                                               (i18n/tru  "Today")
                                               (if include-current?
                                                 (i18n/tru "Today or yesterday")
                                                 (i18n/tru "Yesterday"))
                                               (if include-current?
                                                 (i18n/tru "Previous {0} days or today" (abs n))
                                                 (i18n/tru "Previous {0} days" (abs n)))
                                               (if include-current?
                                                 (i18n/tru "Today or tomorrow")
                                                 (i18n/tru "Tomorrow"))
                                               (if include-current?
                                                 (i18n/tru "Next {0} days or today" (abs n))
                                                 (i18n/tru "Next {0} days" (abs n))))
       :week            (temporal-interval-tru n
                                               (i18n/tru  "This week")
                                               (if include-current?
                                                 (i18n/tru "Previous week or this week")
                                                 (i18n/tru "Previous week"))
                                               (if include-current?
                                                 (i18n/tru "Previous {0} weeks or this week" (abs n))
                                                 (i18n/tru "Previous {0} weeks" (abs n)))
                                               (if include-current?
                                                 (i18n/tru "Next week or this week")
                                                 (i18n/tru "Next week"))
                                               (if include-current?
                                                 (i18n/tru "Next {0} weeks or this week" (abs n))
                                                 (i18n/tru "Next {0} weeks" (abs n))))
       :month           (temporal-interval-tru n
                                               (i18n/tru  "This month")
                                               (if include-current?
                                                 (i18n/tru "Previous month or this month")
                                                 (i18n/tru "Previous month"))
                                               (if include-current?
                                                 (i18n/tru "Previous {0} months or this month" (abs n))
                                                 (i18n/tru "Previous {0} months" (abs n)))
                                               (if include-current?
                                                 (i18n/tru "Next month or this month")
                                                 (i18n/tru "Next month"))
                                               (if include-current?
                                                 (i18n/tru "Next {0} months or this month" (abs n))
                                                 (i18n/tru "Next {0} months" (abs n))))
       :quarter         (temporal-interval-tru n
                                               (i18n/tru  "This quarter")
                                               (if include-current?
                                                 (i18n/tru "Previous quarter or this quarter")
                                                 (i18n/tru "Previous quarter"))
                                               (if include-current?
                                                 (i18n/tru "Previous {0} quarters or this quarter" (abs n))
                                                 (i18n/tru "Previous {0} quarters" (abs n)))
                                               (if include-current?
                                                 (i18n/tru "Next quarter or this quarter")
                                                 (i18n/tru "Next quarter"))
                                               (if include-current?
                                                 (i18n/tru "Next {0} quarters or this quarter" (abs n))
                                                 (i18n/tru "Next {0} quarters" (abs n))))
       :year            (temporal-interval-tru n
                                               (i18n/tru  "This year")
                                               (if include-current?
                                                 (i18n/tru "Previous year or this year")
                                                 (i18n/tru "Previous year"))
                                               (if include-current?
                                                 (i18n/tru "Previous {0} years or this year" (abs n))
                                                 (i18n/tru "Previous {0} years" (abs n)))
                                               (if include-current?
                                                 (i18n/tru "Next year or this year")
                                                 (i18n/tru "Next year"))
                                               (if include-current?
                                                 (i18n/tru "Next {0} years or this year" (abs n))
                                                 (i18n/tru "Next {0} years" (abs n))))
       ;; else
       (i18n/tru "Unknown unit")))))

(defn- relative-datetime-tru
  "Chooses the correct relative interval description based on the provided amount `n`."
  [n
   prev-interval-message
   next-interval-message]
  (cond
    (neg? n) prev-interval-message
    (pos? n) next-interval-message
    :else
    (i18n/tru "starting now")))

(mu/defn describe-relative-datetime :- ::lib.schema.common/non-blank-string
  "Get a translated description of the offset part of a relative datetime interval.

  e.g. if the relative interval is `-1 days`, then `n` = `-1` and `unit` = `:day`.

  If `:unit` is unspecified, assume `:day`."
  [n    :- TemporalIntervalAmount
   unit :- [:maybe :keyword]]
  (let [n    (interval-n->int n)
        unit (or unit :day)]
    (case (keyword unit)
      :millisecond (relative-datetime-tru n
                                          (i18n/trun "starting {0} millisecond ago" "starting {0} milliseconds ago" (abs n))
                                          (i18n/trun "starting {0} millisecond from now" "starting {0} milliseconds from now" (abs n)))
      :second      (relative-datetime-tru n
                                          (i18n/trun "starting {0} second ago" "starting {0} seconds ago" (abs n))
                                          (i18n/trun "starting {0} second from now" "starting {0} seconds from now" (abs n)))
      :minute      (relative-datetime-tru n
                                          (i18n/trun "starting {0} minute ago" "starting {0} minutes ago" (abs n))
                                          (i18n/trun "starting {0} minute from now" "starting {0} minutes from now" (abs n)))
      :hour        (relative-datetime-tru n
                                          (i18n/trun "starting {0} hour ago" "starting {0} hours ago" (abs n))
                                          (i18n/trun "starting {0} hour from now" "starting {0} hours from now" (abs n)))
      :day         (relative-datetime-tru n
                                          (i18n/trun "starting {0} day ago" "starting {0} days ago" (abs n))
                                          (i18n/trun "starting {0} day from now" "starting {0} days from now" (abs n)))
      :week        (relative-datetime-tru n
                                          (i18n/trun "starting {0} week ago" "starting {0} weeks ago" (abs n))
                                          (i18n/trun "starting {0} week from now" "starting {0} weeks from now" (abs n)))
      :month       (relative-datetime-tru n
                                          (i18n/trun "starting {0} month ago" "starting {0} months ago" (abs n))
                                          (i18n/trun "starting {0} month from now" "starting {0} months from now" (abs n)))
      :quarter     (relative-datetime-tru n
                                          (i18n/trun "starting {0} quarter ago" "starting {0} quarters ago" (abs n))
                                          (i18n/trun "starting {0} quarter from now" "starting {0} quarters from now" (abs n)))
      :year        (relative-datetime-tru n
                                          (i18n/trun "starting {0} year ago" "starting {0} years ago" (abs n))
                                          (i18n/trun "starting {0} year from now" "starting {0} years from now" (abs n)))
      ;; else
      (i18n/tru "Unknown unit"))))

(mu/defn describe-temporal-interval-with-offset :- ::lib.schema.common/non-blank-string
  "Get a translated description of a temporal bucketing interval with offset."
  [n           :- TemporalIntervalAmount
   unit        :- [:maybe :keyword]
   offset      :- TemporalIntervalAmount
   offset-unit :- [:maybe :keyword]]
  (str
   (describe-temporal-interval n unit)
   ", "
   (describe-relative-datetime offset offset-unit)))

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
                                             :effective-type new-effective-type)
                                      (m/assoc-some :metabase.lib.field/original-effective-type original-effective-type
                                                    :metabase.lib.field/original-temporal-unit  original-temporal-unit))]
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
  (str/ends-with? s (str lib.display-name/column-display-name-separator (describe-temporal-unit temporal-unit))))

(defn ensure-ends-with-temporal-unit
  "Append `temporal-unit` into a string `s` if appropriate.

  The `:default` temporal unit is not appended. If `temporal-unit` is already suffix of `s`, do not add it
  for the second time. This function may be called multiple times during processing of a query stage."
  [s temporal-unit]
  (if (or (not (string? s)) ; ie. nil or something that definitely should not occur here
          (= :default temporal-unit)
          (ends-with-temporal-unit? s temporal-unit))
    s
    (str s lib.display-name/column-display-name-separator (describe-temporal-unit temporal-unit))))

;;; TODO (Cam 6/13/25) -- only used outside of Lib; Lib doesn't use `snake_cased` keys. We should reconsider if this
;;; belongs in Lib in its current shape.
(defn ensure-temporal-unit-in-display-name
  "Append temporal unit into `column-metadata`'s `:display_name` when appropriate.

  This is expected to be called after `:unit` is added into column metadata, ie. in terms of annotate middleware, after
  the column metadata coming from a driver are merged with result of `column-info`."
  {:deprecated "0.57.0"}
  [column-metadata]
  (if-some [temporal-unit (:unit column-metadata)]
    (update column-metadata :display_name ensure-ends-with-temporal-unit temporal-unit)
    column-metadata))

(def ^:private valid-units-for-date     (conj lib.schema.temporal-bucketing/date-bucketing-units :default))
(def ^:private valid-units-for-time     (conj lib.schema.temporal-bucketing/time-bucketing-units :default))
(def ^:private valid-units-for-datetime lib.schema.temporal-bucketing/temporal-bucketing-units)

(defmulti valid-units-for-type
  "Returns valid temporal units for `a-type`."
  {:arglists '([a-type])}
  keyword)

(defmethod valid-units-for-type :type/*        [_] valid-units-for-datetime)
(defmethod valid-units-for-type :type/Date     [_] valid-units-for-date)
(defmethod valid-units-for-type :type/Time     [_] valid-units-for-time)
(defmethod valid-units-for-type :type/DateTime [_] valid-units-for-datetime)

(mu/defn compatible-temporal-unit?
  "Check whether some column of `a-type` can be bucketted by the`temporal-unit`. Any column can be bucketed by `nil`
  temporal unit."
  [a-type        :- ::lib.schema.common/base-type
   temporal-unit :- [:maybe ::lib.schema.temporal-bucketing/unit]]
  (or (nil? temporal-unit)
      (contains? (valid-units-for-type a-type) temporal-unit)))
