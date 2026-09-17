(ns metabase.documents.schema
  (:require
   [malli.util :as mut]
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
   ::document.columns
   [:map {:closed true}
    [:id                  ms/PositiveInt]
    [:creator             {:optional true} [:maybe :metabase.users.schema/user]]
    [:collection          {:optional true} [:maybe :metabase.collections.schema/collection-or-root]]
    [:can_write           {:optional true} :boolean]
    [:can_delete          {:optional true} :boolean]
    [:can_restore         {:optional true} :boolean]
    [:is_remote_synced    {:optional true} :boolean]]])

(mr/def ::document.columns
  "Every column of `:document` except `id`, all optional."
  [:map {:closed true}
   [:name                {:optional true} [:maybe :string]]
   [:created_at          {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:document            {:optional true} [:maybe ::document.document]]
   [:content_type        {:optional true} [:maybe [:or :keyword :string]]]
   [:creator_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:updated_at          {:optional true} [:maybe ms/TemporalInstantOrNow]]
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

(mr/def ::document.create
  "What an insert of a Document accepts."
  (mr/schema ::document.columns))

(mr/def ::document.update
  "What an update of a Document accepts: no immutable columns (`:entity_id`, `:created_at`, `:creator_id` and
  `:exploration_id` are all fixed at creation and never change after that)."
  (mut/select-keys (mr/schema ::document.columns)
                   [:name :document :content_type :updated_at :collection_id :archived :archived_directly
                    :last_viewed_at :view_count :collection_position :public_uuid :made_public_by_id
                    :public_uuid_prefix :is_placeholder]))

(mr/def ::document.partial
  "A Document row as selected, where a `:columns` narrowing may have left out any column. The `:document` AST is
  typed loosely here because a stored document may predate the current node shapes; writes still go through the
  strict schema above."
  [:merge
   ::document
   [:map {:closed true}
    [:id       {:optional true} ms/PositiveInt]
    [:document {:optional true} [:maybe [:map]]]]])

(mr/def ::document.column
  "A column of `:document`, for the `:columns` option of the queries in [[metabase.documents.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::document.columns))))
