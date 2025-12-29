(ns metabase.lib.schema.util
  (:refer-clojure :exclude [ref run! every? mapv empty? first second])
  (:require
   [medley.core :as m]
   [metabase.lib.options :as lib.options]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf :refer [run! every? mapv empty? first second]]))

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
  [clause]
  (let [tag (first clause)
        opts (second clause)
        f #(cond-> %
             (mbql-clause? %) mbql-clause-distinct-key)]
    (if (= (count clause) 3)
      ;; Fastpath: this verbosity was introduced for performance reasons. Most clauses have only one child, and
      ;; constructing a vector directly is more efficient than appending to a vector with `into`.
      [tag (opts-distinct-key opts) (f (nth clause 2))]
      (into [tag (opts-distinct-key opts)]
            (map f)
            (drop 2 clause)))))

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

(defn sorted-maps
  "Recursively convert all maps in `x` to sorted maps using the same comparator
   as [[metabase.lib.schema.common/unfussy-sorted-map]]. This ensures consistent
   JSON serialization order regardless of how maps were constructed."
  [x sorted-map-fn]
  (perf/postwalk
   (fn [x]
     (if (and (map? x) (not (sorted? x)))
       (into (sorted-map-fn) x)
       x))
   x))

(defn- aggregation-ref?
  "Check if `x` is an aggregation ref clause `[:aggregation opts uuid-string]`."
  [x]
  (and (vector? x)
       (= :aggregation (first x))
       (>= (count x) 3)
       (map? (second x))
       (string? (nth x 2))))

(defn- replace-aggregation-ref-uuids
  "Walk `form` recursively, replacing aggregation ref UUIDs with indices.
   Only descends into vectors (MBQL clauses), not maps."
  [form agg-lookups]
  (cond
    (aggregation-ref? form)
    (update form 2 #(get agg-lookups % %))

    (vector? form)
    (mapv #(replace-aggregation-ref-uuids % agg-lookups) form)

    :else
    form))

(def ^:private stage-keys-with-clauses
  "Stage keys that can contain MBQL clauses with aggregation refs."
  [:aggregation :breakout :expressions :fields :filters :order-by])

(defn indexed-aggregation-refs-for-stage
  "Convert all aggregation refs in a stage to refer to aggregations by index instead of uuid.
   This ensures that semantically identical queries with different UUIDs hash the same."
  [{:keys [aggregation joins] :as stage}]
  (if-not aggregation
    stage
    (let [agg-lookups (into {}
                            (map-indexed (fn [i [_type {agg-uuid :lib/uuid}]]
                                           [agg-uuid i]))
                            aggregation)
          replace-in-clauses (fn [clauses]
                               (mapv #(replace-aggregation-ref-uuids % agg-lookups) clauses))
          result (cond-> (reduce (fn [stage k]
                                   (cond-> stage
                                     (get stage k) (update k replace-in-clauses)))
                                 stage
                                 stage-keys-with-clauses)
                   ;; Also handle join conditions
                   joins (update :joins (fn [joins]
                                          (mapv #(m/update-existing % :conditions replace-in-clauses)
                                                joins))))]
      result)))

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
