(ns metabase.embedding.schema
  "Malli schemas for the embedding module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::embedding-theme.settings
  "The `:settings` column of a EmbeddingTheme, decoded."
  ms/OpaqueJSONObject)

(mr/def ::embedding-theme
  "A EmbeddingTheme as selected from the app DB: every column of `:embedding_theme`."
  [:merge
   ::embedding-theme.columns
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::embedding-theme.partial
  "A EmbeddingTheme row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::embedding-theme [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::embedding-theme.columns
  "Every column of `:embedding_theme` except `id`, all optional."
  [:map {:closed true}
   [:entity_id  {:optional true} [:maybe :string]]
   [:name       {:optional true} [:maybe :string]]
   [:settings   {:optional true} [:maybe ::embedding-theme.settings]]
   [:is_default {:optional true} [:maybe :boolean]]
   [:created_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::embedding-theme.create
  "What an insert of a EmbeddingTheme accepts."
  (mut/select-keys (mr/schema ::embedding-theme.columns) [:name :settings :is_default :created_at :updated_at]))

(mr/def ::embedding-theme.update
  "What an update of a EmbeddingTheme accepts: no `:entity_id` or `:created_at`, which nothing ever updates."
  (mut/select-keys (mr/schema ::embedding-theme.columns) [:name :settings :is_default :updated_at]))

(mr/def ::embedding-theme.column
  "A column of `embedding_theme`, for the `:columns` option of the queries in [[metabase.embedding.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::embedding-theme.columns))))
