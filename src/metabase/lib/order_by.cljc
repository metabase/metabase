(ns metabase.lib.order-by
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defmulti ^:private ->order-by-clause
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->order-by-clause :asc
  [_query _stage-number clause]
  (lib.options/ensure-uuid clause))

(defmethod ->order-by-clause :desc
  [_query _stage-number clause]
  (lib.options/ensure-uuid clause))

;;; by default, try to convert `x` to a Field clause and then order by `:asc`
(defmethod ->order-by-clause :default
  [query stage-number x]
  (let [field-clause (lib.field/field query stage-number x)]
    (lib.options/ensure-uuid [:asc field-clause])))

(defn order-by-clause
  "Create an order-by clause independently of a query, e.g. for `replace` or whatever."
  ([x]
   (fn [query stage-number]
     (order-by-clause query stage-number x)))
  ([query stage-number x]
   (->order-by-clause query stage-number x)))

(mu/defn ^:private with-direction :- ::lib.schema.order-by/order-by
  "Update the direction of an order by clause."
  [clause    :- ::lib.schema.order-by/order-by
   direction :- ::lib.schema.order-by/direction]
  (assoc (vec clause) 0 direction))

(mu/defn order-by
  "Create an MBQL order-by clause (i.e., `:asc` or `:desc`) from something that you can theoretically sort by -- maybe a
  Field, or `:field` clause, or expression of some sort, etc.

  You can teach Metabase lib how to generate order by clauses for different things by implementing the
  underlying [[->order-by]] multimethod."
  ([query x]
   (order-by query -1 x nil))

  ([query x direction]
   (order-by query -1 x direction))

  ([query
    stage-number :- [:maybe :int]
    x
    direction    :- [:maybe [:enum :asc :desc]]]
   (let [stage-number (or stage-number -1)
         new-order-by (cond-> (->order-by-clause query stage-number x)
                        direction (with-direction direction))]
     (lib.util/update-query-stage query stage-number update :order-by (fn [order-bys]
                                                                        (conj (vec order-bys) new-order-by))))))

(mu/defn order-bys :- [:sequential ::lib.schema.order-by/order-by]
  "Get the order-by clauses in a query."
  ([query :- ::lib.schema/query]
   (order-bys query -1))
  ([query :- ::lib.schema/query
    stage-number :- [:int]]
   (not-empty (get (lib.util/query-stage query stage-number) :order-by))))
