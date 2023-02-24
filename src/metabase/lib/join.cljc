(ns metabase.lib.join
  (:require
   [clojure.spec.alpha :as s]
   [metabase.lib.append :as lib.append]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defmulti ^:private ->join
  "Implementation for [[join]]. Convert something to an MBQL join map."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

;; TODO -- should the default implementation call [[metabase.lib.query/query]]? That way if we implement a method to
;; create an MBQL query from a `Table`, then we'd also get [[join]] support for free?

(defmethod ->join :mbql/query
  [query]
  (-> {:lib/type :mbql/join
       :stages   (:stages (lib.util/pipeline query))}
      lib.options/ensure-uuid))

(defmethod ->join :mbql.stage/mbql
  [stage]
  (-> {:lib/type :mbql/join
       :stages   [stage]}
      lib.options/ensure-uuid))

(defmethod lib.interface/resolve :mbql/join
  [join metadata]
  (cond-> join
    (:source-query join) (update :source-query lib.interface/resolve metadata)
    true                 (update :condition lib.interface/resolve metadata)))

(defn- query? [x]
  (and (map? x)
       (:type x)))

(s/def ::join-args
  (s/cat
   :query-stage (s/? (s/cat :query query?
                            :stage (s/? integer?)))
   :x           any?
   :condition   any?))

(mu/defn join
  "Create an MBQL join map from something that can conceptually be joined against. A `Table`? An MBQL or native query? A
  Saved Question? You should be able to join anything, and this should return a sensible MBQL join map.

  `condition` is currently required, but in the future I think we should make this smarter and try to infer a sensible
  default condition for things, e.g. when joining a Table B from Table A, if there is an FK relationship between A and
  B, join via that relationship. Not yet implemented! If/when we do implement this behavior, we'd probably have to do
  it when we [[metabase.lib.interface/resolve]] stuff.

  You can call this function in a few different ways: With no `query` or `stage`, you can create a join map in
  isolation, and [[metabase.lib.append/append]] it to a query later. By passing in `query`, you can create a join map
  and `append` it in place; this is a convenience meant to facilitate threading. When specifying `query`, the `stage`
  number to append it to is optional; if unspecified, this will append the join to the final stage of the
  query (creating a new MBQL stage if needed)."
  {:arglists '([x condition]
               [query stage? x condition])}
  [& args]
  (s/assert* ::join-args args)
  (let [{:keys [x condition], {:keys [query stage]} :query-stage} (s/conform ::join-args args)
        join                                                      (cond-> (->join x)
                                                                    condition (assoc :condition condition))]
    (if query
      (lib.append/append query (or stage -1) join)
      join)))

(defn- append-join [inner-query join]
  (update inner-query :joins (fn [joins]
                               (conj (vec joins) join))))

(defmethod lib.append/append* :mbql/join
  [inner-query join]
  (append-join inner-query join))

(mu/defn joins :- ::lib.schema.join/joins
  "Get all joins in a specific `stage` of a `query`. If `stage` is unspecified, returns joins in the final stage of the
  query."
  ([query]
   (joins query -1))
  ([query :- ::lib.schema/query
    stage :- ::lib.schema.common/int-greater-than-or-equal-to-zero]
   (not-empty (get (lib.util/query-stage query stage) :joins))))
