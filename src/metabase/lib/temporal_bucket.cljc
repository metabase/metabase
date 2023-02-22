(ns metabase.lib.temporal-bucket
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.schema]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema/keep-me)

(defmulti temporal-bucket*
  {:arglists '([x unit])}
  (fn [x _unit]
    (lib.dispatch/dispatch-value x)))

(mu/defn temporal-bucket
  [x unit :- :mbql/datetime-bucketing-unit]
  (temporal-bucket* x unit))
