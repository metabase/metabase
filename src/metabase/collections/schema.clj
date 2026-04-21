(ns metabase.collections.schema
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::CollectionContentModel [:enum "card" "dataset" "metric"])

(mr/def ::CollectionType [:enum
                          "instance-analytics"
                          "trash"
                          "remote-synced"
                          "library"
                          "library-models"
                          "library-metrics"])

(mr/def ::CardType [:enum "model" "question" "metric"])

(mr/def ::CollectionItemModel [:enum
                               "card"
                               "dataset"
                               "metric"
                               "dashboard"
                               "snippet"
                               "collection"
                               "indexed-entity"
                               "indexed-entity"
                               "document"
                               "table"])

(mr/def ::Collection
  [:map
   [:id [:or :string ms/PositiveInt]]
   [:name :string]
   [:slug {:optional true} :string]
   [:entity_id {:optional true} :string]
   [:description [:maybe :string]]
   [:can_write :boolean]
   [:can_restore :boolean]
   [:can_delete :boolean]
   [:archived :boolean]
   [:children {:optional true} [:sequential [:ref ::Collection]]]
   [:authority_level {:optional true} [:maybe :string]]
   [:type {:optional true} ::CollectionType]
   [:is_remote_synced {:optional true} :boolean]

   [:parent_id {:optional true} [:maybe [:or :string ms/PositiveInt]]]
   [:personal_owner_id {:optional true} ms/PositiveInt]
   [:is_personal {:optional true} :boolean]
   [:is_sample {:optional true} :boolean]

   [:location [:maybe :string]]
   [:effective_location {:optional true} :string]
   [:effective_ancestors {:optional true} :map]

   [:here {:optional true} [:set ::CollectionItemModel]]
   [:below {:optional true} [:sequential ::CollectionItemModel]]

   [:git_sync_enabled {:optional true} :boolean]])

(mr/def ::LastEditInfo
  [:map
   [:id [:maybe ms/PositiveInt]]
   [:email [:maybe :string]]
   [:first_name [:maybe :string]]
   [:last_name [:maybe :string]]
   [:timestamp [:maybe :string]]])

(mr/def ::CollectionItem
  [:map
   [:id ms/PositiveInt]
   [:entity_id {:optional true} :string]
   [:model {:optional true} ::CollectionItemModel]
   [:name :string]
   [:description [:maybe :string]]
   [:archived :boolean]
   [:copy {:optional true} :boolean]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]
   [:collection_preview {:optional true} [:maybe :boolean]]
   [:fully_parameterized {:optional true} [:maybe :boolean]]
   [:based_on_upload {:optional true} [:maybe [:or ms/PositiveInt :string]]]
   [:collection {:optional true} [:maybe ::Collection]]
   [:collection_id {:optional true} [:maybe [:or ms/PositiveInt :string]]]
   [:display {:optional true} :string]
   [:personal_owner_id {:optional true} [:maybe ms/PositiveInt]]
   [:database_id {:optional true} [:maybe ms/PositiveInt]]
   [:moderated_status {:optional true} :string]
   [:type {:optional true} [:or ::CollectionType ::CardType]]
   [:here {:optional true} [:set ::CollectionItemModel]]
   [:below {:optional true} [:sequential ::CollectionItemModel]]
   [:can_write {:optional true} :boolean]
   [:can_restore {:optional true} :boolean]
   [:can_delete {:optional true} :boolean]
   [:last-edit-info {:optional true} ::LastEditInfo]
   [:location {:optional true} :string]
   [:effective_location {:optional true} :string]
   [:authority_level {:optional true} [:maybe :string]]
   [:dashboard_count {:optional true} [:maybe ms/PositiveInt]]])
