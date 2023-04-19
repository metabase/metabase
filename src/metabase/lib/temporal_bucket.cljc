(ns metabase.lib.temporal-bucket
  (:require
   [clojure.string :as str]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

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
       (as-> (str/split (name unit) #"-") <>
         (update (vec <>) 0 str/capitalize)
         (str/join \space <>))))))

(def ^:private TemporalIntervalAmount
  [:or [:enum :current :last :next] :int])

(defn- interval-n->int [n]
  (if (number? n)
    n
    (condp = n
      :current 0
      :next    1
      :last    -1
      0)))

(mu/defn describe-temporal-interval :- ::lib.schema.common/non-blank-string
  "Get a translated description of a temporal bucketing interval."
  [n    :- TemporalIntervalAmount
   unit :- [:maybe :keyword]]
  (let [n (interval-n->int n)]
    (cond
      (zero? n) (cond
                  (= unit :day) (i18n/tru "Today")
                  unit          (i18n/tru "This {0}" (describe-temporal-unit unit))
                  :else         (i18n/tru "Today"))
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

  e.g. if the relative interval is `-1 days`, then `n` = `-1` and `unit` = `:days`."
  [n    :- TemporalIntervalAmount
   unit :- [:maybe :keyword]]
  (let [n (interval-n->int n)]
    (cond
      (zero? n)
      (i18n/tru "Now")

      (neg? n)
      ;; this should legitimately be lowercasing in the user locale. I know system locale isn't necessarily the same
      ;; thing, but it might be. This will have to do until we have some sort of user-locale lower-case functionality
      #_ {:clj-kondo/ignore [:discouraged-var]}
      (i18n/tru "{0} {1} ago" (abs n) (str/lower-case (describe-temporal-unit (abs n) unit)))

      :else
      #_ {:clj-kondo/ignore [:discouraged-var]}
      (i18n/tru "{0} {1} from now" n (str/lower-case (describe-temporal-unit n unit))))))

(defmulti with-temporal-bucket-method
  "Implementation for [[temporal-bucket]]. Implement this to tell [[temporal-bucket]] how to add a bucket to a
  particular MBQL clause."
  {:arglists '([x unit])}
  (fn [x _unit]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod with-temporal-bucket-method :dispatch-type/fn
  [f unit]
  (fn [query stage-number]
    (let [x (f query stage-number)]
      (with-temporal-bucket-method x unit))))

(mu/defn with-temporal-bucket
  "Add a temporal bucketing unit, e.g. `:day` or `:day-of-year`, to an MBQL clause or something that can be converted to
  an MBQL clause. E.g. for a Field or Field metadata or `:field` clause, this might do something like this:

    (temporal some-field :day)

    =>

    [:field 1 {:temporal-unit :day}]

  Pass a `nil` `unit` to remove the temporal bucket."
  [x unit :- [:maybe ::lib.schema.temporal-bucketing/unit]]
  (with-temporal-bucket-method x unit))

(defmulti temporal-bucket-method
  "Implementation of [[temporal-bucket]]. Return the current temporal bucketing unit associated with `x`."
  {:arglists '([x])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defmethod temporal-bucket-method :default
  [_x]
  nil)

(mu/defn temporal-bucket :- [:maybe ::lib.schema.temporal-bucketing/unit]
  "Get the current temporal bucketing unit associated with something, if any."
  [x]
  (temporal-bucket-method x))

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

(mu/defn available-temporal-buckets :- [:set [:ref ::lib.schema.temporal-bucketing/unit]]
  "Get a set of available temporal bucketing units for `x`. Returns nil if no units are available."
  ([query x]
   (available-temporal-buckets query -1 x))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    x]
   (available-temporal-buckets-method query stage-number x)))
