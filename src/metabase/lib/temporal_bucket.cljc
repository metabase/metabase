(ns metabase.lib.temporal-bucket
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema :as lib.schema]
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
