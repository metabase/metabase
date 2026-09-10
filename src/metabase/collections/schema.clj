(ns metabase.collections.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def ^:constant trash-collection-type
  "The value of the `:type` field for the Trash collection that holds archived items."
  "trash")

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
                               "exploration"
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

(mr/def ::collection
  "A Collection as selected from the app DB: every column of `:collection`."
  [:map {:closed true}
   [:id                   ::lib.schema.id/collection]
   [:name                 :string]
   [:description          [:maybe :string]]
   [:archived             :boolean]
   [:location             :string]
   [:personal_owner_id    [:maybe ::lib.schema.id/user]]
   [:slug                 :string]
   [:namespace            [:maybe [:or :keyword :string]]]
   [:authority_level      [:maybe [:or :keyword :string]]]
   [:entity_id            :string]
   [:created_at           ms/TemporalInstant]
   [:type                 [:maybe [:or :keyword :string]]]
   [:is_sample            :boolean]
   [:archive_operation_id [:maybe :string]]
   [:archived_directly    [:maybe :boolean]]
   [:is_remote_synced     [:maybe :boolean]]])

(mr/def ::collection.update
  "What an update (or insert) of a Collection accepts: every column of `:collection` except `id`, all optional."
  [:map {:closed true}
   [:name                 {:optional true} [:maybe :string]]
   [:description          {:optional true} [:maybe :string]]
   [:archived             {:optional true} [:maybe :boolean]]
   [:location             {:optional true} [:maybe :string]]
   [:personal_owner_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:slug                 {:optional true} [:maybe :string]]
   [:namespace            {:optional true} [:maybe [:or :keyword :string]]]
   [:authority_level      {:optional true} [:maybe [:or :keyword :string]]]
   [:entity_id            {:optional true} [:maybe :string]]
   [:created_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:type                 {:optional true} [:maybe [:or :keyword :string]]]
   [:is_sample            {:optional true} [:maybe :boolean]]
   [:archive_operation_id {:optional true} [:maybe :string]]
   [:archived_directly    {:optional true} [:maybe :boolean]]
   [:is_remote_synced     {:optional true} [:maybe :boolean]]])
