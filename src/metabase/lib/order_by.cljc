(ns metabase.lib.order-by
  (:require
   [metabase.lib.append :as lib.append]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field :as lib.field]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema/keep-me)

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

(mu/defn with-direction :- :mbql/order-by
  [clause    :- :mbql/order-by
   direction :- [:or
                 :mbql/order-by-direction
                 [:enum "asc" "desc"]]]
  (assoc (vec clause) 0 (keyword direction)))

(defn order-by
  {:arglists '([x]
               [query x]
               [query stage? x direction?])}
  ([x]
   (->order-by x))
  ([query x]
   (lib.append/append query (->order-by x)))
  ([query a b]
   (let [[stage x direction] (if (integer? a)
                               [a b nil]
                               [-1 a b])]
     (order-by query stage x direction)))
  ([query stage x direction]
   (lib.append/append query stage (cond-> (->order-by x)
                                    direction (with-direction direction)))))

;;; TODO -- appending a duplicate order-by should no-op.
(mu/defn ^:private append-order-by :- :stage/mbql
  [inner-query :- :stage/mbql
   x]
  (update inner-query :order-by (fn [order-bys]
                                  (conj (vec order-bys) (->order-by x)))))

(defmethod lib.append/append* :asc
  [inner-query clause]
  (append-order-by inner-query clause))

(defmethod lib.append/append* :desc
  [inner-query clause]
  (append-order-by inner-query clause))

(mu/defn order-bys :- [:sequential :mbql/order-by]
  "Get the order-by clauses in a query."
  ([query :- lib.query/Query]
   (order-bys query -1))
  ([query :- lib.query/Query
    stage :- [:int]]
   (not-empty (get (lib.util/query-stage query stage) :order-by))))
