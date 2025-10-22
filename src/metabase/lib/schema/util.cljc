(ns metabase.lib.schema.util
  (:refer-clojure :exclude [ref run! every? mapv])
  (:require
   [medley.core :as m]
   [metabase.lib.options :as lib.options]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf :refer [run! every? mapv]]))

(declare collect-uuids*)

(defn- collect-uuids-in-map [m result]
  (when-let [our-uuid (or (:lib/uuid (lib.options/options m))
                          (:lib/uuid m))]
    ;; Keep duplicates in metadata of the result.
    (if (@result our-uuid)
      (vswap! result vary-meta update :duplicates (fnil conj #{}) our-uuid)
      (vswap! result conj our-uuid)))
  (reduce-kv (fn [_ k v]
               (when (not (qualified-keyword? k))
                 (collect-uuids* v result)))
             nil m))

(defn- collect-uuids-in-sequence [xs result]
  (run! #(collect-uuids* % result) xs))

(defn- collect-uuids* [x result]
  (cond
    (map? x)        (collect-uuids-in-map x result)
    (sequential? x) (collect-uuids-in-sequence x result)
    :else           nil))

(defn collect-uuids
  "Return all the `:lib/uuid`s in a part of an MBQL query (a clause or map) as a sequence. This will be used to ensure
  there are no duplicates."
  [x]
  (let [result (volatile! #{})]
    (collect-uuids* x result)
    @result))

(defn- find-duplicate-uuid [x]
  (:duplicates (meta (collect-uuids x))))

(defn unique-uuids?
  "True if all the `:lib/uuid`s in something are unique."
  [x]
  (empty? (find-duplicate-uuid x)))

;;; Malli schema for to ensure that all `:lib/uuid`s are unique.
(mr/def ::unique-uuids
  [:fn
   {:error/message "all :lib/uuids must be unique"
    :error/fn      (fn [{:keys [value]} _]
                     (str "Duplicate :lib/uuid " (pr-str (find-duplicate-uuid value))))}
   #'unique-uuids?])

(defn- mbql-clause?
  "Just check that `x` is in the general shape of an MBQL clause. This is to prevent things
  like [[distinct-mbql-clauses?]] from barfing when given invalid values."
  [x]
  (and (vector? x)
       (> (count x) 2)
       (keyword? (first x))
       (map? (second x))))

(defn- mbql-clauses?
  [xs]
  (and (sequential? xs)
       (or (empty? xs)
           (every? mbql-clause? xs))))

(defn- opts-distinct-key [opts]
  ;; Using reduce-kv to remove namespaced keys and some other keys to perform the comparison. This is allegedly faster.
  (reduce-kv (fn [acc k v]
               (if (or (qualified-keyword? k)
                       (#{:base-type :effective-type} k)
                       (and (#{:temporal-unit :inherited-temporal-unit} k)
                            (= v :default)))
                 (dissoc acc k)
                 acc))
             opts
             opts))

(mu/defn mbql-clause-distinct-key
  "For deduplicating MBQL clauses: keep just the keys in options that are essential to distinguish one clause from
  another. Removes namespaced keywords and type information keys like `:base-type`."
  [[tag opts & children]]
  (into [tag
         (opts-distinct-key opts)]
        (map (fn [child]
               (cond-> child
                 (mbql-clause? child) mbql-clause-distinct-key)))
        children))

(defn distinct-mbql-clauses?
  "Is a sequence of `mbql-clauses` distinct for the purposes of appearing in things like `:fields`, `:breakouts`, or
  `:order-by`? (Are they distinct ignoring keys that aren't important such as namespaced keys and type info?)"
  [mbql-clauses]
  (and (mbql-clauses? mbql-clauses)
       (or (< (count mbql-clauses) 2)
           (apply distinct? (map mbql-clause-distinct-key mbql-clauses)))))

(mr/def ::distinct-mbql-clauses
  [:fn
   {:error/message    "values must be distinct MBQL clauses ignoring namespaced keys and type info"
    :error/fn         (fn [{:keys [value]} _]
                        (if (mbql-clauses? value)
                          (str "values must be distinct MBQL clauses ignoring namespaced keys and type info: "
                               (pr-str (map mbql-clause-distinct-key value)))
                          "values must be valid MBQL clauses"))
    :decode/normalize (fn [xs]
                        (when (mbql-clauses? xs)
                          (into []
                                (m/distinct-by mbql-clause-distinct-key)
                                xs)))}
   distinct-mbql-clauses?])

(defn remove-lib-uuids
  "Recursively remove all uuids from `x`."
  [x]
  (perf/postwalk
   (fn [x]
     (cond-> x
       (map? x) (dissoc :lib/uuid)))
   x))

(defn indexed-order-bys-for-stage
  "Convert all order-bys in a stage to refer to aggregations by index instead of uuid"
  [{:keys [aggregation order-by] :as stage}]
  (if (and aggregation order-by)
    (let [agg-lookups (->> aggregation
                           (map-indexed (fn [i [_type {agg-uuid :lib/uuid}]]
                                          [agg-uuid i]))
                           (into {}))]
      (update stage :order-by (fn [order-bys]
                                (mapv (fn [[_dir _opts [order-type agg-opts agg-uuid] :as order-by]]
                                        (if (= order-type :aggregation)
                                          (assoc order-by 2 [order-type agg-opts (agg-lookups agg-uuid)])
                                          order-by))
                                      order-bys))))
    stage))

(defn pred-matches-form?
  "Check if `form` or any of its children forms match `pred`. This function is used for validation; during normal
  operation it will never match, so calling this function before `matching-locations` is more efficient."
  [form pred]
  (cond
    (pred form)        true
    (map? form)        (reduce-kv (fn [b _ v] (or b (pred-matches-form? v pred))) false form)
    (sequential? form) (reduce (fn [b x] (or b (pred-matches-form? x pred))) false form)
    :else              false))

(defn matching-locations
  "Find the forms matching pred, returns a list of tuples of location (as used in get-in) and the match."
  [form pred]
  ;; Surprisingly enough, a list works better as a stack here than a vector.
  (loop [stack (list [[] form]), matches []]
    (if-let [[loc form :as top] (peek stack)]
      (let [stack (pop stack)
            map-onto-stack #(transduce (map (fn [[k v]] [(conj loc k) v])) conj stack %)
            seq-onto-stack #(transduce (map-indexed (fn [i v] [(conj loc i) v])) conj stack %)]
        (cond
          (pred form)        (recur stack                 (conj matches top))
          (map? form)        (recur (map-onto-stack form) matches)
          (sequential? form) (recur (seq-onto-stack form) matches)
          :else              (recur stack                 matches)))
      matches)))
