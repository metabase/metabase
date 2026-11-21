(ns metabase.native-query-snippets.schema
  (:require
   [metabase.collections.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.models.schema :as models.schema]
   [metabase.users.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::native-query-snippet
  "A NativeQuerySnippet as selected from the app DB: every column of `:native_query_snippet`, plus `:creator` and
  `:collection` some callers hydrate onto it."
  [:merge
   ::native-query-snippet.update
   [:map {:closed true}
    [:id            ::lib.schema.id/native-query-snippet]
    [:creator       {:optional true} [:maybe :metabase.users.schema/user]]
    [:can_write     {:optional true} [:maybe :boolean]]
    [:collection    {:optional true} [:maybe :metabase.collections.schema/collection]]]])

(mr/def ::native-query-snippet.update
  "What an update (or insert) of a NativeQuerySnippet accepts: every column of `:native_query_snippet` except `id`, all optional."
  [:map {:closed true}
   [:name          {:optional true} [:maybe :string]]
   [:description   {:optional true} [:maybe :string]]
   [:content       {:optional true} [:maybe :string]]
   [:creator_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:archived      {:optional true} [:maybe :boolean]]
   [:archived_directly {:optional true} [:maybe :boolean]]
   [:created_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:entity_id     {:optional true} [:maybe :string]]
   [:template_tags {:optional true} [:maybe ::lib.schema.template-tag/template-tag-map]]])

(mr/def ::template-tags.given
  "The `:template_tags` a caller gives with a snippet, which its write completes with those of its content: those of a
  snippet it refers to by name keep the ids given here when no stored snippet has the name."
  [:maybe [:map-of :string :map]])

(mr/def ::native-query-snippet.create
  "What a caller gives to create a NativeQuerySnippet."
  [:map {:closed true}
   [:name              :string]
   [:content           :string]
   [:description       {:optional true} [:maybe :string]]
   [:creator_id        {:optional true} [:maybe ::lib.schema.id/user]]
   [:archived          {:optional true} [:maybe :boolean]]
   [:archived_directly {:optional true} [:maybe :boolean]]
   [:collection_id     {:optional true} [:maybe ::lib.schema.id/collection]]
   [:entity_id         {:optional true} [:maybe :string]]
   [:template_tags     {:optional true} ::template-tags.given]])

(mr/def ::native-query-snippet.changes
  "The columns an update of a NativeQuerySnippet changes, its template tags as given."
  [:merge
   ::native-query-snippet.update
   [:map {:closed true}
    [:template_tags {:optional true} ::template-tags.given]]])

(mr/def ::native-query-snippet.row
  "A NativeQuerySnippet id and the columns to change, as an update of several snippets takes it."
  [:merge
   ::native-query-snippet.update
   [:map {:closed true}
    [:id            ::lib.schema.id/native-query-snippet]
    [:template_tags {:optional true} ::template-tags.given]]])

(mr/def ::external-native-query-snippet
  "A NativeQuerySnippet as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib-be.schema/external-registry}
   [:merge
    [:select-keys ::native-query-snippet [:archived :archived_directly :description :entity_id :name :collection_id :creator_id :content
                                          :template_tags]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]]]])
