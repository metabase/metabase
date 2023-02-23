(ns metabase.lib.join
  (:require
   [clojure.spec.alpha :as s]
   [metabase.lib.append :as lib.append]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]))

(defmulti ->join
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->join :lib/outer-query
  [query]
  (-> {:lib/type :lib/join
       :stages   (:stages (lib.util/pipeline query))}
      lib.options/ensure-uuid))

(defmethod ->join :stage/mbql
  [stage]
  (-> {:lib/type :lib/join
       :stages   [stage]}
      lib.options/ensure-uuid))

(defn with-condition [join condition]
  (assoc join :condition condition))

(defmethod lib.interface/resolve :lib/join
  [join metadata]
  (cond-> join
    (:source-query join) (update :source-query lib.interface/resolve metadata)
    true                 (update :condition lib.interface/resolve metadata)))

(defn- query? [x]
  (and (map? x)
       (:type x)))

(s/def ::join-args
  (s/cat
   :query-stage     (s/? (s/cat :query query?
                                :stage (s/? integer?)))
   :x         any?
   :condition any?))

(defn join
  {:arglists '([query? stage? x condition])}
  [& args]
  (s/assert* ::join-args args)
  (let [{:keys [x condition], {:keys [query stage]} :query-stage} (s/conform ::join-args args)
        join                                                      (cond-> (->join x)
                                                                    condition (with-condition condition))]
    (if query
      (lib.append/append query (or stage -1) join)
      join)))

(defn- append-join [inner-query join]
  (update inner-query :joins (fn [joins]
                               (conj (vec joins) join))))

(defmethod lib.append/append* :lib/join
  [inner-query join]
  (append-join inner-query join))

(defn joins
  ([outer-query]
   (joins outer-query -1))
  ([outer-query stage]
   (not-empty (get (lib.util/query-stage outer-query stage) :joins))))
