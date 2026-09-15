(ns metabase.embedding.schema
  "Malli schemas for the embedding module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::embedding-theme.settings
  "The `:settings` column of a EmbeddingTheme, decoded."
  ms/OpaqueJSONObject)

(mr/def ::embedding-theme
  "A EmbeddingTheme as selected from the app DB: every column of `:embedding_theme`."
  [:merge
   ::embedding-theme.update
   [:map {:closed true, :probe/id "src/metabase/embedding/schema.clj:15"}
    [:id         ms/PositiveInt]]])

(mr/def ::embedding-theme.update
  "What an update (or insert) of a EmbeddingTheme accepts: every column of `:embedding_theme` except `id`, all optional."
  [:map {:closed true}
   [:entity_id  {:optional true} [:maybe :string]]
   [:name       {:optional true} [:maybe :string]]
   [:settings   {:optional true} [:maybe ::embedding-theme.settings]]
   [:is_default {:optional true} [:maybe :boolean]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]])
