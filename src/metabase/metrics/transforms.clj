(ns metabase.metrics.transforms
  "Shared JSON transform functions for dimension and dimension-mapping columns
   used by both Card and Measure models."
  (:require
   [clojure.set :as set]
   [metabase.models.interface :as mi]))

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

(defn normalize-dimension
  "Normalize a dimension after JSON parsing: rename any legacy kebab-case keys
   to their canonical snake_case form and convert string values to keywords."
  [dim]
  (let [dim (set/rename-keys dim dimension-key-renames)
        dim (cond-> dim
              (:group dim) (update :group set/rename-keys
                                   dimension-group-key-renames))]
    (cond-> dim
      (:status dim)         (update :status keyword)
      (:effective_type dim) (update :effective_type keyword)
      (:semantic_type dim)  (update :semantic_type keyword)
      (:sources dim)        (update :sources (fn [srcs] (mapv #(update % :type keyword) srcs))))))

(defn normalize-target-ref
  "Normalize a target ref after JSON parsing. Converts [\"field\" {...} id] to [:field {...} id]."
  [[clause-type opts & rest]]
  (into [(keyword clause-type)
         (cond-> opts
           (:base-type opts)      (update :base-type keyword)
           (:effective-type opts) (update :effective-type keyword))]
        rest))

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
