(ns metabase.metrics.transforms
  "Shared JSON transform functions for dimension and dimension-mapping columns
   used by both Card and Measure models."
  (:require
   [clojure.set :as set]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]))

(def ^:private dimension-key-renames
  "Rename legacy kebab-case keys (carried over from older JSON rows) to the
   canonical snake_case shape used everywhere from this point on."
  {:display-name     :display_name
   :effective-type   :effective_type
   :semantic-type    :semantic_type
   :has-field-values :has_field_values
   :status-message   :status_message})

(def ^:private dimension-group-key-renames
  {:display-name :display_name})

(def ^:private dimension-mapping-key-renames
  {:dimension-id :dimension_id
   :table-id     :table_id})

(mu/defn normalize-dimension :- ::lib-metric.schema/persisted-dimension
  "Normalize a dimension after JSON parsing. This is the single boundary at which the canonical
   shape consumed downstream is enforced — keys are snake_case and type values (`:effective_type`,
   `:semantic_type`, `:has_field_values`, `:status`, `:sources[].type`) are keywords, and the
   output conforms to [[lib-metric.schema/persisted-dimension]] (validated by `mu/defn`).
   Downstream readers should trust the shape and skip defensive kw/str coercion."
  [dim :- :map]
  (let [dim (set/rename-keys dim dimension-key-renames)
        dim (cond-> dim
              (:group dim) (update :group set/rename-keys
                                   dimension-group-key-renames))]
    (cond-> dim
      (:status dim)           (update :status keyword)
      (:effective_type dim)   (update :effective_type keyword)
      (:semantic_type dim)    (update :semantic_type keyword)
      (:has_field_values dim) (update :has_field_values keyword)
      (:sources dim)          (update :sources (fn [srcs] (mapv #(update % :type keyword) srcs))))))

(defn normalize-target-ref
  "Normalize a target ref after JSON parsing, e.g. [\"field\" {...} id] to a well-formed
   MBQL 5 [:field {...} id] ref, via the ref schema."
  [target]
  (lib/normalize :metabase.lib.schema.ref/ref target))

(defn normalize-dimension-mapping
  "Normalize a dimension mapping after JSON parsing: rename legacy kebab-case
   keys to snake_case and convert string values to keywords."
  [mapping]
  (-> mapping
      (set/rename-keys dimension-mapping-key-renames)
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
