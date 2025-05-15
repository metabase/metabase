(ns metabase.parameters.schema
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def :parameters/human-readable-remapping-map
  "Schema for the map of actual value -> human-readable value. Cannot be empty."
  [:map-of {:min 1} :any [:maybe :string]])
