(ns metabase.lib.temporal-bucket
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.util.malli :as mu]))

(defmulti temporal-bucket*
  "Implementation for [[temporal-bucket]]. Implement this to tell [[temporal-bucket]] how to add a bucket to a
  particular MBQL clause."
  {:arglists '([mbql-clause unit])}
  (fn [mbql-clause _unit]
    (lib.dispatch/dispatch-value mbql-clause)))

(mu/defn temporal-bucket
  "Add a temporal bucketing unit, e.g. `:day` or `:day-of-year`, to an MBQL clause or something that can be converted to
  an MBQL clause. E.g. for a Field or Field metadata or `:field` clause, this might do something like this:

    (temporal some-field :day)

    =>

    [:field 1 {:temporal-unit :day}]"
  [x unit :- ::temporal-bucketing/unit]
  (temporal-bucket* (lib.interface/->mbql x) unit))
