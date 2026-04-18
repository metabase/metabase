(ns metabase.agent-lib.refs
  "Walk a structured program and collect every metadata id (table, field, card, metric, measure)
  it actually references. Used by the runtime builder to scope metadata loading to entities the
  program touches, instead of materializing the whole database."
  (:require
   [metabase.agent-lib.schema :as schema]))

(set! *warn-on-reflection* true)

(def ^:private empty-refs
  {:table-ids   #{}
   :field-ids   #{}
   :card-ids    #{}
   :metric-ids  #{}
   :measure-ids #{}})

(declare collect-program-refs)

(defn- collect-source-refs
  [acc source]
  (if (and (map? source) (:type source))
    (case (:type source)
      "table"             (cond-> acc (pos-int? (:id source)) (update :table-ids conj (:id source)))
      ("card" "dataset")  (cond-> acc (pos-int? (:id source)) (update :card-ids conj (:id source)))
      "metric"            (cond-> acc (pos-int? (:id source)) (update :metric-ids conj (:id source)))
      "program"           (if (:program source) (collect-program-refs acc (:program source)) acc)
      acc)
    acc))

(defn- ref-key-for-op
  "Map a reference operator name to the refs key it populates."
  [op]
  (case op
    "table"   :table-ids
    "field"   :field-ids
    "card"    :card-ids
    "metric"  :metric-ids
    "measure" :measure-ids
    nil))

(defn- collect-form
  [acc form]
  (cond
    ;; Operator tuple — `["op" arg ...]`. Reference ops have an int id as their first arg
    ;; (after repair-normalize); other ops we just recurse into.
    (and (vector? form) (string? (first form)))
    (let [[op & args] form
          ref-key     (ref-key-for-op op)]
      (if (and ref-key (pos-int? (first args)))
        (-> (update acc ref-key conj (first args))
            ;; Still recurse into remaining args — `(field id)` has none, but
            ;; e.g. `(with-temporal-bucket (field id) "month")` is a different op
            ;; whose recursion is handled by the non-ref branch below.
            (cond-> (next args) (as-> $ (reduce collect-form $ (next args)))))
        (reduce collect-form acc args)))

    ;; Nested program literal — `{:program {...}}`.
    (and (map? form) (schema/program-literal? form))
    (collect-program-refs acc (:program form))

    ;; Plain map — recurse into values (covers per-stage option maps, etc.).
    (map? form)
    (reduce-kv (fn [a _k v] (collect-form a v)) acc form)

    ;; Sequential — recurse element-wise.
    (sequential? form)
    (reduce collect-form acc form)

    :else acc))

(defn collect-program-refs
  "Walk `program` and return `{:table-ids #{...} :field-ids #{...} :card-ids #{...}
  :metric-ids #{...} :measure-ids #{...}}` containing every numeric metadata id referenced
  anywhere in its source or operations.

  Assumes the program has been through `repair/repair-program` so that all `[op id]` reference
  forms carry positive integer ids."
  ([program]
   (collect-program-refs empty-refs program))
  ([acc program]
   (-> acc
       (collect-source-refs (:source program))
       (as-> $ (reduce collect-form $ (:operations program))))))
