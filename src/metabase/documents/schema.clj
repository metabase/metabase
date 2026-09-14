(ns metabase.documents.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::document.id
  "Valid Document ID"
  pos-int?)

(mr/def ::document.document
  "The `:document` column of a Document, decoded."
  :map)

(mr/def ::document
  "A Document as selected from the app DB: every column of `:document`."
  [:map {:closed true}
   [:id                  ms/PositiveInt]
   [:name                :string]
   [:created_at          ms/TemporalInstant]
   [:document            [:maybe ::document.document]]
   [:content_type        [:or :keyword :string]]
   [:creator_id          ::lib.schema.id/user]
   [:updated_at          ms/TemporalInstant]
   [:collection_id       [:maybe ::lib.schema.id/collection]]
   [:archived            :boolean]
   [:archived_directly   [:maybe :boolean]]
   [:entity_id           :string]
   [:last_viewed_at      ms/TemporalInstant]
   [:view_count          :int]
   [:collection_position [:maybe :int]]
   [:public_uuid         [:maybe :string]]
   [:made_public_by_id   [:maybe ms/PositiveInt]]
   [:public_uuid_prefix  [:maybe :string]]
   [:exploration_id      [:maybe ms/PositiveInt]]
   [:is_placeholder      :boolean]])

(mr/def ::document.update
  "What an update (or insert) of a Document accepts: every column of `:document` except `id`, all optional."
  [:map {:closed true}
   [:name                {:optional true} [:maybe :string]]
   [:created_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:document            {:optional true} [:maybe ::document.document]]
   [:content_type        {:optional true} [:maybe [:or :keyword :string]]]
   [:creator_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:updated_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:collection_id       {:optional true} [:maybe ::lib.schema.id/collection]]
   [:archived            {:optional true} [:maybe :boolean]]
   [:archived_directly   {:optional true} [:maybe :boolean]]
   [:entity_id           {:optional true} [:maybe :string]]
   [:last_viewed_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:view_count          {:optional true} [:maybe :int]]
   [:collection_position {:optional true} [:maybe :int]]
   [:public_uuid         {:optional true} [:maybe :string]]
   [:made_public_by_id   {:optional true} [:maybe ms/PositiveInt]]
   [:public_uuid_prefix  {:optional true} [:maybe :string]]
   [:exploration_id      {:optional true} [:maybe ms/PositiveInt]]
   [:is_placeholder      {:optional true} [:maybe :boolean]]])
