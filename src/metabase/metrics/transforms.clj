(ns metabase.metrics.transforms
  "Shared JSON transform functions for dimension and dimension-mapping columns
   used by both Card and Measure models."
  (:require
   [metabase.models.interface :as mi]))

(defn normalize-dimension
  "Normalize a dimension after JSON parsing, converting string values to keywords."
  [dim]
  (cond-> dim
    (:status dim)         (update :status keyword)
    (:effective-type dim) (update :effective-type keyword)
    (:semantic-type dim)  (update :semantic-type keyword)
    (:sources dim)        (update :sources (fn [srcs] (mapv #(update % :type keyword) srcs)))))

(defn normalize-target-ref
  "Normalize a target ref after JSON parsing. Converts [\"field\" {...} id] to [:field {...} id]."
  [[clause-type opts & rest]]
  (into [(keyword clause-type)
         (cond-> opts
           (:base-type opts)      (update :base-type keyword)
           (:effective-type opts) (update :effective-type keyword))]
        rest))

(defn normalize-dimension-mapping
  "Normalize a dimension mapping after JSON parsing."
  [mapping]
  (-> mapping
      (update :type keyword)
      (update :target normalize-target-ref)))

(def transform-dimensions
  "Transform for dimensions column. Handles JSON serialization/deserialization."
  {:in mi/json-in
   :out (fn [dims]
          (some->> dims
                   mi/json-out-with-keywordization
                   (mapv normalize-dimension)))})

(def transform-dimension-mappings
  "Transform for dimension_mappings column. Handles JSON serialization/deserialization."
  {:in mi/json-in
   :out (fn [mappings]
          (some->> mappings
                   mi/json-out-with-keywordization
                   (mapv normalize-dimension-mapping)))})
