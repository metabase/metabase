(ns metabase.embedding.schema
  "Malli schemas for the embedding module."
  (:require
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::embedding-theme.settings
  "The `:settings` column of a EmbeddingTheme, decoded."
  ms/OpaqueJSONObject)

(mr/def ::embedding-theme
  "A EmbeddingTheme as selected from the app DB: every column of `:embedding_theme`."
  [:merge
   ::embedding-theme.update
   [:map {:closed true}
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

(mr/def ::sdk-react-18-host.host
  "The `host` of a EmbeddingSdkReact18Host: a lowercase hostname, or an empty string when the host app page URL has no
  hostname."
  [:and :string [:fn {:error/message "must be lowercase"} #(= % (u/lower-case-en %))]])

(mr/def ::sdk-react-18-host
  "A EmbeddingSdkReact18Host as selected from the app DB: every column of `:embedding_sdk_react_18_host`. `host` is an
  empty string when the host app page URL has no hostname."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:host         ::sdk-react-18-host.host]
   [:created_at   ms/TemporalInstant]
   [:last_seen_at ms/TemporalInstant]])

(mr/def ::sdk-react-18-host.response
  "A EmbeddingSdkReact18Host as the API returns it: `host` is nil when the host app page URL has no hostname."
  [:merge
   ::sdk-react-18-host
   [:map {:closed true}
    [:host [:maybe :string]]]])
