(ns metabase.lib.temporal-bucket
  (:require
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

(defmulti temporal-bucket*
  "Implementation for [[temporal-bucket]]. Implement this to tell [[temporal-bucket]] how to add a bucket to a
  particular MBQL clause."
  {:arglists '([x unit])}
  (fn [x _unit]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod temporal-bucket* :dispatch-type/fn
  [f unit]
  (fn [query stage-number]
    (let [x (f query stage-number)]
      (temporal-bucket* x unit))))

(mu/defn temporal-bucket
  "Add a temporal bucketing unit, e.g. `:day` or `:day-of-year`, to an MBQL clause or something that can be converted to
  an MBQL clause. E.g. for a Field or Field metadata or `:field` clause, this might do something like this:

    (temporal some-field :day)

    =>

    [:field 1 {:temporal-unit :day}]"
  [x unit :- ::lib.schema.temporal-bucketing/unit]
  (temporal-bucket* x unit))
