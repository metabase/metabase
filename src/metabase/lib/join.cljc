(ns metabase.lib.join
  (:require
   [clojure.spec.alpha :as s]
   [metabase.lib.append :as lib.append]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]
   [clojure.set :as set]
   [metabase.lib.resolve :as lib.resolve]))

(defmulti ->join
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->join :lib/outer-query
  [query]
  (-> {:source-query (if (= (:type query) :native)
                       (set/rename-keys (:native query) {:query :native})
                       (:query query))
       :lib/type     :lib/join}
      lib.options/ensure-uuid))

(defn with-condition [join condition]
  (assoc join :condition condition))

(defmethod lib.resolve/resolve :lib/join
  [metadata join]
  (cond-> join
    (:source-query join) (update :source-query (partial lib.resolve/resolve metadata))
    true                 (update :condition (partial lib.resolve/resolve metadata))))

(defn- query? [x]
  (and (map? x)
       (:type x)))

(s/def ::join-args
  (s/cat
   :query-stage     (s/? (s/cat :query query?
                                :stage (s/? integer?)))
   :x         any?
   :condition (s/? vector?)))

(defn join
  {:arglists '([query? stage? x condition?])}
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
