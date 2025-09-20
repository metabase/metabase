(ns metabase.parameters.models.transforms
  (:require
   [metabase.models.interface :as mi]
   [metabase.parameters.schema :as parameters.schema]))

(def transform-parameters
  "Transform for parameters list."
  {:in  (comp mi/json-in #'parameters.schema/normalize-parameters)
   :out (comp (mi/catch-normalization-exceptions #'parameters.schema/normalize-parameters) mi/json-out-with-keywordization)})

(def transform-parameter-mappings
  "Transform for parameter mappings."
  {:in  (comp mi/json-in #'parameters.schema/normalize-parameter-mappings)
   :out (comp (mi/catch-normalization-exceptions #'parameters.schema/normalize-parameter-mappings) mi/json-out-with-keywordization)})
