(ns metabase.embedding.schema
  "Malli schemas for the embedding module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::embedding-theme.settings
  "The `:settings` column of a EmbeddingTheme, decoded."
  :map)

(mr/def ::embedding-theme
  "A EmbeddingTheme as selected from the app DB: every column of `:embedding_theme`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:entity_id  :string]
   [:name       :string]
   [:settings   ::embedding-theme.settings]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]])

(mr/def ::embedding-theme.update
  "What an update (or insert) of a EmbeddingTheme accepts: every column of `:embedding_theme` except `id`, all optional."
  [:map {:closed true}
   [:entity_id  {:optional true} [:maybe :string]]
   [:name       {:optional true} [:maybe :string]]
   [:settings   {:optional true} [:maybe ::embedding-theme.settings]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]])
