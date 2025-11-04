(ns metabase.links.schema
  "Malli schemas for collection links."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::id
  "Schema for a CollectionLink ID."
  ms/PositiveInt)

(mr/def ::target-model
  "Valid target model types for links."
  [:enum "card" "dashboard" "collection" "table" "metric" "document"])

(mr/def ::target-id
  "Schema for target object ID."
  ms/PositiveInt)

(mr/def ::collection-id
  "Schema for collection ID."
  ms/PositiveInt)

(mr/def ::name
  "Schema for link name."
  ms/NonBlankString)

(mr/def ::description
  "Schema for link description."
  [:maybe :string])

(mr/def ::entity-id
  "Schema for entity ID."
  :string)

(mr/def ::link-base
  "Base schema for a collection link."
  [:map
   [:target_model ::target-model]
   [:target_id ::target-id]])

(mr/def ::link-for-creation
  "Schema for creating a new collection link via POST API."
  [:merge
   ::link-base
   [:map
    [:collection_id ::collection-id]
    [:name ::name]
    [:description {:optional true} ::description]]])

(mr/def ::link-response
  "Schema for a collection link as returned by the API."
  [:merge
   ::link-base
   [:map
    [:id ::id]
    [:collection_id ::collection-id]
    [:name ::name]
    [:description [:maybe :string]]
    [:entity_id ::entity-id]
    [:created_at :any]
    [:updated_at :any]
    [:created_by_id {:optional true} [:maybe ms/PositiveInt]]]])
