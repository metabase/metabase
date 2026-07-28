(ns metabase.metrics.transforms
  "Shared JSON transform functions for dimension and dimension-mapping columns
   used by both Card and Measure models.

   Dimensions are kebab-case (`display-name`, `dimension-id`, …) everywhere — in memory,
   on the wire, and in the JSON at rest. See [[metabase.lib-metric.schema/persisted-dimension]]."
  (:require
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]))

(mu/defn normalize-dimension :- ::lib-metric.schema/persisted-dimension
  "Normalize a dimension after JSON parsing. Keys are kebab-case and type values are keywords.
  See [[lib-metric.schema/persisted-dimension]]."
  [dim :- :map]
  (cond-> dim
    (:status dim)           (update :status keyword)
    (:effective-type dim)   (update :effective-type keyword)
    (:semantic-type dim)    (update :semantic-type keyword)
    (:has-field-values dim) (update :has-field-values keyword)
    (:sources dim)          (update :sources (fn [srcs] (mapv #(update % :type keyword) srcs)))))

(defn normalize-target-ref
  "Normalize a target ref after JSON parsing, e.g. [\"field\" {...} id] to a well-formed
   MBQL 5 [:field {...} id] ref, via the ref schema."
  [target]
  (lib/normalize :metabase.lib.schema.ref/ref target))

(defn normalize-dimension-mapping
  "Normalize a dimension mapping after JSON parsing, converting string values to keywords."
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
