(ns metabase.lib.order-by
  (:require
   [clojure.spec.alpha :as s]
   [metabase.lib.append :as lib.append]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defmethod lib.interface/resolve :asc
  [[direction options ref] metadata]
  [direction options (lib.interface/resolve ref metadata)])

(defmethod lib.interface/resolve :desc
  [[direction options ref] metadata]
  [direction options (lib.interface/resolve ref metadata)])

(defmulti ->order-by
  "Convert something to an MBQL `:order-by` clause."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->order-by :asc
  [clause]
  (lib.options/ensure-uuid clause))

(defmethod ->order-by :desc
  [clause]
  (lib.options/ensure-uuid clause))

(defmethod ->order-by :default
  [x]
  (lib.options/ensure-uuid [:asc x]))

(defmethod ->order-by :metadata/field
  [x]
  (->order-by (lib.field/field x)))

(mu/defn ^:private with-direction :- ::lib.schema.order-by/order-by
  "Update the direction of an order by clause."
  [clause    :- ::lib.schema.order-by/order-by
   direction :- ::lib.schema.order-by/direction]
  (assoc (vec clause) 0 direction))

(defn- query? [x]
  (and (map? x)
       (:type x)))

(s/def ::order-by-args
  (s/cat
   :query-stage (s/? (s/cat :query query?
                            :stage (s/? integer?)))
   :x           any?
   :direction   (s/? #{:asc :desc})))

(defn order-by
  "Create an MBQL order-by clause (i.e., `:asc` or `:desc`) from something that you can theoretically sort by -- maybe a
  Field, or `:field` clause, or expression of some sort, etc.

  You can call use this function in one of two ways:

  1. Without `query` to create a standalone order-by clause, that you can add to a query later, or

  2. With `query` (and optionally `stage` number) to create it and then immediately [[metabase.lib.append/append]] it
     to the query.

  You can teach Metabase lib how to generate order by clauses for different things by implementing the
  underlying [[->order-by]] multimethod."
  {:arglists '([x]
               [x direction?]
               [query stage? x direction?])}
  [& args]
  (s/assert* ::order-by-args args)
  (let [{:keys [x direction], {:keys [query stage]} :query-stage} (s/conform ::order-by-args args)
        order-by                                                  (cond-> (->order-by x)
                                                                    direction (with-direction direction))]
    (if query
      (lib.append/append query (or stage -1) order-by)
      order-by)))

;;; TODO -- appending a duplicate order-by should no-op.
(mu/defn ^:private append-order-by :- ::lib.schema/stage.mbql
  [inner-query :- ::lib.schema/stage.mbql
   x]
  (update inner-query :order-by (fn [order-bys]
                                  (conj (vec order-bys) (->order-by x)))))

(defmethod lib.append/append* :asc
  [inner-query clause]
  (append-order-by inner-query clause))

(defmethod lib.append/append* :desc
  [inner-query clause]
  (append-order-by inner-query clause))

(mu/defn order-bys :- [:sequential ::lib.schema.order-by/order-by]
  "Get the order-by clauses in a query."
  ([query :- ::lib.schema/query]
   (order-bys query -1))
  ([query :- ::lib.schema/query
    stage :- [:int]]
   (not-empty (get (lib.util/query-stage query stage) :order-by))))
