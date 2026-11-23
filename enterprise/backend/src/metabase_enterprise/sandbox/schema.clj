(ns metabase-enterprise.sandbox.schema
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema]))

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
  ::attribute-remappings)

(mr/def ::sandbox
  "A Sandbox as selected from the app DB: every column of `:sandboxes`, plus `:table` some callers hydrate onto it."
  [:map {:closed true}
   [:id                   ms/PositiveInt]
   [:group_id             {:optional true} [:maybe ms/PositiveInt]]
   [:table_id             {:optional true} [:maybe ::lib.schema.id/table]]
   [:card_id              {:optional true} [:maybe ::lib.schema.id/card]]
   [:attribute_remappings {:optional true} [:maybe ::sandbox.attribute-remappings]]
   [:table                {:optional true} [:maybe :metabase.warehouse-schema.schema/table]]])

(mr/def ::sandbox.update
  "What an update of a Sandbox takes: its `:id` and the columns to set."
  [:map {:closed true}
   [:id                   ::lib.schema.id/sandbox]
   [:group_id             {:optional true} [:maybe ms/PositiveInt]]
   [:table_id             {:optional true} [:maybe ::lib.schema.id/table]]
   [:card_id              {:optional true} [:maybe ::lib.schema.id/card]]
   [:attribute_remappings {:optional true} [:maybe ::sandbox.attribute-remappings]]])

(mr/def ::sandbox.create
  "What creating a Sandbox takes: its group and Table, and the optional Card and attribute remappings."
  [:map {:closed true}
   [:table_id             ::lib.schema.id/table]
   [:group_id             ms/PositiveInt]
   [:card_id              {:optional true} [:maybe ::lib.schema.id/card]]
   [:attribute_remappings {:optional true} [:maybe ::sandbox.attribute-remappings]]])
