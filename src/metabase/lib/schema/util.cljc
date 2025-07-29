(ns metabase.lib.schema.util
  (:refer-clojure :exclude [ref])
  (:require
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.lib.options :as lib.options]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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
  "Just check that `x` is in the general shape of an MBQL clause. This is to prevent things like [[distinct-refs?]] from
  barfing when given invalid values."
  [x]
  (and (vector? x)
       (> (count x) 2)
       (keyword? (first x))
       (map? (second x))))

(defn- opts-distinct-key [opts]
  ;; Using reduce-kv to remove namespaced keys and some other keys to perform the comparison. This is allegedly faster.
  (reduce-kv (fn [acc k _v]
               (if (or (qualified-keyword? k)
                       (#{:base-type :effective-type} k))
                 (dissoc acc k)
                 acc))
             opts
             opts))

(mu/defn ref-distinct-key
  "For deduplicating refs: keep just the keys that are essential to distinguishing one ref from another."
  [ref :- [:fn {:error/message "MBQL clause "} mbql-clause?]]
  (lib.options/update-options ref opts-distinct-key))

(defn distinct-refs?
  "Is a sequence of `refs` distinct for the purposes of appearing in `:fields` or `:breakouts` (ignoring keys that
  aren't important such as namespaced keys and type info)?"
  [refs]
  (or
   (< (count refs) 2)
   (apply
    distinct?
    (map ref-distinct-key refs))))

(defn distinct-clauses-by
  [f message]
  [:fn
   {:error/message    message
    :error/fn         (fn [{:keys [value]} _]
                        (if (and (sequential? value)
                                 (every? mbql-clause? value))
                          (str message ": " (pr-str (map f value)))
                          "values must be valid MBQL clauses"))
    :decode/normalize (fn [xs]
                        (when (and (sequential? xs)
                                   (every? mbql-clause? xs))
                          (into []
                                (m/distinct-by f)
                                xs)))}
   (fn [xs]
     (and (sequential? xs)
          (every? mbql-clause? xs)
          (or (< (count xs) 2)
              (apply distinct? (map f xs)))))])

(mr/def ::distinct-refs
  (distinct-clauses-by ref-distinct-key "refs must be distinct"))

(defn mbql-clause-distinct-key
  "Walk `clause` and remove UUIDs and other non-distinct keys (namespaced keys, type info) from options maps."
  [clause]
  (walk/postwalk
   (fn [form]
     (cond-> form
       (map? form) opts-distinct-key))
   clause))

(mr/def ::distinct-mbql-clauses
  (distinct-clauses-by mbql-clause-distinct-key "values must be distinct ignoring uuids"))

(defn remove-lib-uuids
  "Recursively remove all uuids from `x`."
  [x]
  (walk/postwalk
   (fn [x]
     (cond-> x
       (map? x) (dissoc :lib/uuid)))
   x))

(defn- indexed-order-bys-for-stage
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

(defn indexed-order-bys
  "Convert all order-bys in a query to refer to aggregations by index instead of uuid. The result is
  not a valid query, but avoiding random uuids is important during hashing."
  [query]
  (if (:stages query)
    (update query :stages #(mapv indexed-order-bys-for-stage %))
    query))

(mr/def ::distinct-ignoring-uuids
  (distinct-clauses-by remove-lib-uuids "values must be distinct ignoring uuids"))

(defn distinct-ignoring-uuids
  "Add an additional constraint to `schema` that requires all elements to be distinct after removing uuids."
  [schema]
  [:and
   schema
   [:ref ::distinct-ignoring-uuids]])
