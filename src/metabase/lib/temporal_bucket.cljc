(ns metabase.lib.temporal-bucket
  (:require
   [clojure.string :as str]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defn unit->i18n
  "Get a translated description of a temporal bucketing unit."
  ([unit]
   (unit->i18n 1 unit))
  ([n unit]
   (case unit
     ;; TODO -- we're missing descriptions for all of the extract operation units like `:day-of-week`.
     :millisecond (i18n/trun "millisecond"         "milliseconds"         n)
     :second      (i18n/trun "second"              "seconds"              n)
     :minute      (i18n/trun "minute"              "minutes"              n)
     :hour        (i18n/trun "hour"                "hours"                n)
     :day         (i18n/trun "day"                 "days"                 n)
     :week        (i18n/trun "week"                "weeks"                n)
     :month       (i18n/trun "month"               "months"               n)
     :quarter     (i18n/trun "quarter of the year" "quarters of the year" n)
     :year        (i18n/trun "year"                "years"                n))))

(mu/defn interval->i18n :- ::lib.schema.common/non-blank-string
  "Get a translated description of a temporal bucketing interval."
  [n    :- [:or [:enum :current :last :next]]
   unit :- ::lib.schema.temporal-bucketing/unit.date-time.interval]
  (case n
    (0 :current) (i18n/tru "current {0}" (unit->i18n unit))
    :last        (i18n/tru "last {0}" (unit->i18n unit))
    :next        (i18n/tru "next {0}" (unit->i18n unit))
    (if (pos? n)
      (i18n/tru "next {0} {1}" (pr-str n) (unit->i18n n unit))
      (i18n/tru "last {0} {1}" (pr-str (abs n)) (unit->i18n (abs n) unit)))))

(defmulti temporal-bucket-method
  "Implementation for [[temporal-bucket]]. Implement this to tell [[temporal-bucket]] how to add a bucket to a
  particular MBQL clause."
  {:arglists '([x unit])}
  (fn [x _unit]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod temporal-bucket-method :dispatch-type/fn
  [f unit]
  (fn [query stage-number]
    (let [x (f query stage-number)]
      (temporal-bucket-method x unit))))

(mu/defn temporal-bucket
  "Add a temporal bucketing unit, e.g. `:day` or `:day-of-year`, to an MBQL clause or something that can be converted to
  an MBQL clause. E.g. for a Field or Field metadata or `:field` clause, this might do something like this:

    (temporal some-field :day)

    =>

    [:field 1 {:temporal-unit :day}]"
  [x unit :- ::lib.schema.temporal-bucketing/unit]
  (temporal-bucket-method x unit))

(defmulti current-temporal-bucket-method
  "Implementation of [[current-temporal-bucket]]. Return the current temporal bucketing unit associated with `x`."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod current-temporal-bucket-method :default
  [_x]
  nil)

(mu/defn current-temporal-bucket :- [:maybe ::lib.schema.temporal-bucketing/unit]
  "Get the current temporal bucketing unit associated with something, if any."
  [x]
  (current-temporal-bucket-method x))

(defmulti available-temporal-buckets-method
  "Implementation for [[available-temporal-buckets]]. Return a set of units from
  `:metabase.lib.schema.temporal-bucketing/unit` that are allowed to be used with `x`."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod available-temporal-buckets-method :default
  [_x]
  nil)

(mu/defn available-temporal-buckets :- [:maybe [:set {:min 1} [:ref ::lib.schema.temporal-bucketing/unit]]]
  "Get a set of available temporal bucketing units for `x`. Returns nil if no units are available."
  [x]
  (not-empty (temporal-bucket-method x)))

;;;; Alternate description implementation

;;; MLv1 had like 2 or maybe 3 duplicate versions of temporal description logic, no one is really sure why, but my
;;; strategy is to port first and then consolidate second. The stuff in this namespace is just simple ports of the JS
;;; code so I can bring everything into one place; after that I will consolidate things so we don't have so many
;;; duplicate implementations. [[unit->i18n]] and [[interval->i18n]] are ports of the JS query description logic from
;;; `frontend/src/metabase-lib/queries/utils/description.js`. The stuff below is a port of
;;; `frontend/src/metabase-lib/queries/utils/query-time.js`. Why two versions of the same stuff? Who knows!
;;;
;;; I know usually we want to export this via [[metabase.lib.js]], but these are hopefully short-term exports to
;;; replace stuff in the JS code that is going to eventually disappear entirely, so not really worth creating a JS
;;; wrapper for it now because this stuff is going to get consolidated soon and not hit directly from JS in the long
;;; run anyway
(defn ^:export format-bucketing
  "Temporal bucketing formatting logic ported from `frontend/src/metabase-lib/queries/utils/query-time.js`."
  ([]
   (format-bucketing nil 1))

  ([bucketing]
   (format-bucketing bucketing 1))

  ([bucketing n]
   (if-not bucketing
     ""
     (case (keyword bucketing)
       :default         (i18n/trun "Default period"  "Default periods"  n)
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
       (as-> (str/split (name bucketing) #"-") <>
         (update (vec <>) 0 str/capitalize)
         (str/join \space <>))))))

(defn- interval-n->int [n]
  (if (number? n)
    n
    (condp = (keyword n)
      :current 0
      :next    1
      0)))

(defn ^:export time-interval-description
  "Temporal bucketing formatting logic ported from `frontend/src/metabase-lib/queries/utils/query-time.js`."
  [n unit]
  (let [n    (interval-n->int n)
        unit (keyword unit)]
    (cond
      (zero? n) (cond
                  (= unit :day) (i18n/tru "Today")
                  unit          (i18n/tru "This {0}" (format-bucketing unit))
                  :else         (i18n/tru "Today"))
      (= n 1)   (if (= unit :day)
                  (i18n/tru "Tomorrow")
                  (i18n/tru "Next {0}" (format-bucketing unit)))
      (= n -1)  (if (= unit :day)
                  (i18n/tru "Yesterday")
                  (i18n/tru "Previous {0}" (format-bucketing unit)))
      (neg? n)  (i18n/tru "Previous {0} {1}" (- n) (format-bucketing unit (- n)))
      (pos? n)  (i18n/tru "Next {0} {1}" n (format-bucketing unit n)))))

(defn ^:export relative-datetime-description
  "Relative datetime formatting logic ported from `frontend/src/metabase-lib/queries/utils/query-time.js`.

  e.g. if the relative interval is `-1 days`, then `n` = `-1` and `unit` = `:days`."
  [n unit]
  (let [n    (interval-n->int n)
        unit (keyword unit)]
    (cond
      (zero? n)
      (i18n/tru "Now")

      (neg? n)
      ;; this should legitimately be lowercasing in the user locale. I know system locale isn't necessarily the same
      ;; thing, but it might be. This will have to do until we have some sort of user-locale lower-case functionality
      #_ {:clj-kondo/ignore [:discouraged-var]}
      (i18n/tru "{0} {1} ago" (- n) (str/lower-case (format-bucketing unit (- n))))

      :else
      #_ {:clj-kondo/ignore [:discouraged-var]}
      (i18n/tru "{0} {1} from now" n (str/lower-case (format-bucketing unit n))))))
