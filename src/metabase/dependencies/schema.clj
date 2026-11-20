(ns metabase.dependencies.schema
  "The schemas of what the dependencies specs of the models return."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::dependencies
  "Entities as `{entity-type #{entity-id}}`, such as the dependencies of a row."
  [:map-of :keyword [:set ms/PositiveInt]])
