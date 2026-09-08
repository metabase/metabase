(ns metabase.documents.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::document.id
  "Valid Document ID"
  pos-int?)

(mr/def ::document
  "Schema for an instance of a `:model/Document`."
  [:map
   [:id ::document.id]])

(mr/def ::document.update
  "What an update (or insert) of a Document accepts: every column of `:document` except `id`, all optional."
  [:map {:closed true}
   [:name                {:optional true} [:maybe [:or :string :map sequential?]]]
   [:created_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:document            {:optional true} [:maybe [:or :string :map sequential?]]]
   [:content_type        {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:creator_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:updated_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:collection_id       {:optional true} [:maybe ::lib.schema.id/collection]]
   [:archived            {:optional true} [:maybe :boolean]]
   [:archived_directly   {:optional true} [:maybe :boolean]]
   [:entity_id           {:optional true} [:maybe :string]]
   [:last_viewed_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:view_count          {:optional true} [:maybe :int]]
   [:collection_position {:optional true} [:maybe :int]]
   [:public_uuid         {:optional true} [:maybe [:or :string uuid?]]]
   [:made_public_by_id   {:optional true} [:maybe ms/PositiveInt]]
   [:public_uuid_prefix  {:optional true} [:maybe :string]]
   [:exploration_id      {:optional true} [:maybe ms/PositiveInt]]
   [:is_placeholder      {:optional true} [:maybe :boolean]]])
