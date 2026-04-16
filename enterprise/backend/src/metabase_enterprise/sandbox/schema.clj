(ns metabase-enterprise.sandbox.schema
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::attribute-remappings
  "value must be a valid attribute remappings map (attribute name -> remapped name)"
  [:maybe
   [:map-of
    [:schema
     {:decode/normalize (fn [x]
                          (cond-> x
                            (keyword? x) u/qualified-name))}
     ms/NonBlankString]
    [:orn
     [:field-name       ms/NonBlankString]
     [:field-id         ::lib.schema.id/field]
     [:parameter-target [:ref ::lib.schema.parameter/target]]]]])

(defn normalize-attribute-remappings
  "Normalize the Sandbox `attribute_remappings` map."
  [attribute-remappings]
  (lib/normalize ::attribute-remappings attribute-remappings))

(def attribute-remappings-transform
  "Toucan transform spec for the Sandbox `attribute_remappings` column."
  {:in  (comp mi/json-in normalize-attribute-remappings)
   :out (comp normalize-attribute-remappings mi/json-out-without-keywordization)})

(mr/def ::sandbox
  [:map
   [:id ::lib.schema.id/sandbox]])
