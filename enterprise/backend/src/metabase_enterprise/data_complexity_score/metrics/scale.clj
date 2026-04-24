(ns metabase-enterprise.data-complexity-score.metrics.scale
  "Scale dimension — raw size of the catalog. Polarity is neutral: a bigger instance is not a worse
   instance, but bigger still drives agent difficulty by expanding the choice space. Every other
   dimension's density variable normalizes against these counts.

   Variables:
     :entity-count         (scored)  count of entities in the catalog
     :field-count          (scored)  sum of active fields across tables
     :collection-tree-size (scored)  count of collections in the catalog scope
     :fields-per-entity    (value)   derived — field-count / entity-count
     :measure-to-dim-ratio (value)   derived — named-measure density relative to fields

  All variables in this namespace are tier 1 (cheap, DB-only, no embeddings)."
  (:require
   [metabase-enterprise.data-complexity-score.metrics.common :as common]))

(set! *warn-on-reflection* true)

(def weights
  "Per-variable weights contributing to the dimension sub-total."
  {:entity-count         10
   :field-count          1
   :collection-tree-size 1})

(defn- entity-count [entities]
  (common/scored (:entity-count weights) (count entities)))

(defn- field-count [entities]
  (common/scored (:field-count weights) (reduce + 0 (map #(or (:field-count %) 0) entities))))

(defn- collection-tree-size [{:keys [collection-count]}]
  (common/scored (:collection-tree-size weights) (or collection-count 0)))

(defn- fields-per-entity [entities]
  (let [n (count entities)
        f (reduce + 0 (map #(or (:field-count %) 0) entities))]
    (common/value (common/safe-ratio f n))))

(defn- measure-to-dim-ratio
  "`(count(named-measures) + count(metric-cards)) / count(fields)`.
   Captures how densely a catalog is curated as a semantic layer (intentional named metrics) vs.
   thin wrappers over raw data. nil when there are no fields to divide against."
  [entities]
  (let [measures   (reduce + 0 (map #(count (:measure-names %)) entities))
        metric-cards (count (filter #(= :metric (:kind %)) entities))
        fields     (reduce + 0 (map #(or (:field-count %) 0) entities))]
    (common/value (common/safe-ratio (+ measures metric-cards) fields))))

(defn score
  "Compute the Scale dimension block given a catalog's `entities` and `ctx` (`:collection-count`)."
  [entities ctx]
  (common/dimension-block
   [[:entity-count         (entity-count entities)]
    [:field-count          (field-count entities)]
    [:collection-tree-size (collection-tree-size ctx)]
    [:fields-per-entity    (fields-per-entity entities)]
    [:measure-to-dim-ratio (measure-to-dim-ratio entities)]]))
