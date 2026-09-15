(ns metabase.documents.schema
  (:require
   [metabase.collections.schema]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::document.id
  "Valid Document ID"
  pos-int?)

(mr/def ::document.document
  "The `:document` column of a Document, decoded."
  ::prose-mirror/ast)

(mr/def ::document
  "A Document as selected from the app DB: every column of `:document`, plus `:creator` and `:collection` some
  callers hydrate onto it."
  [:merge
   ::document.update
   [:map {:closed true, :probe/id "src/metabase/documents/schema.clj:22"}
    [:id                  ms/PositiveInt]
    [:creator             {:optional true} [:maybe :metabase.users.schema/user]]
    [:collection          {:optional true} [:maybe :metabase.collections.schema/collection-or-root]]
    [:can_write           {:optional true} :boolean]
    [:can_delete          {:optional true} :boolean]
    [:can_restore         {:optional true} :boolean]
    [:is_remote_synced    {:optional true} :boolean]]])

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
