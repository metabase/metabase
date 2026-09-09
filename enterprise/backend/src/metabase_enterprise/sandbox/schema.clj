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

(mr/def ::sandbox.attribute-remappings
  "The `:attribute_remappings` column of a Sandbox, decoded."
  :map)

(mr/def ::sandbox
  "A Sandbox as selected from the app DB: every column of `:sandboxes`."
  [:map {:closed true}
   [:id                   ms/PositiveInt]
   [:group_id             ms/PositiveInt]
   [:table_id             ::lib.schema.id/table]
   [:card_id              [:maybe ::lib.schema.id/card]]
   [:attribute_remappings [:maybe ::sandbox.attribute-remappings]]])

(mr/def ::sandbox.update
  "What an update (or insert) of a Sandbox accepts: every column of `:sandboxes` except `id`, all optional."
  [:map {:closed true}
   [:group_id             {:optional true} [:maybe ms/PositiveInt]]
   [:table_id             {:optional true} [:maybe ::lib.schema.id/table]]
   [:card_id              {:optional true} [:maybe ::lib.schema.id/card]]
   [:attribute_remappings {:optional true} [:maybe ::sandbox.attribute-remappings]]])
