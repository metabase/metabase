(ns metabase.native-query-snippets.schema
  (:require
   [malli.util :as mut]
   [metabase.collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.users.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::native-query-snippet
  "A NativeQuerySnippet as selected from the app DB: every column of `:native_query_snippet`, plus `:creator` and
  `:collection` some callers hydrate onto it."
  [:merge
   ::native-query-snippet.columns
   [:map {:closed true}
    [:id            ::lib.schema.id/native-query-snippet]
    [:creator       {:optional true} [:maybe :metabase.users.schema/user]]
    [:collection    {:optional true} [:maybe :metabase.collections.schema/collection]]]])

(mr/def ::native-query-snippet.columns
  "Every column of `:native_query_snippet` except `id`, all optional."
  [:map {:closed true}
   [:name          {:optional true} [:maybe :string]]
   [:description   {:optional true} [:maybe :string]]
   [:content       {:optional true} [:maybe :string]]
   [:creator_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:archived      {:optional true} [:maybe :boolean]]
   [:created_at    {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at    {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:entity_id     {:optional true} [:maybe :string]]
   [:template_tags {:optional true} [:maybe ::lib.schema.template-tag/template-tag-map]]])

(mr/def ::native-query-snippet.create
  "What an insert of a NativeQuerySnippet accepts."
  (mr/schema ::native-query-snippet.columns))

(mr/def ::native-query-snippet.update
  "What an update of a NativeQuerySnippet accepts: no immutable columns (`:creator_id`, `:entity_id`, and
  `:created_at` never change after creation)."
  (mut/select-keys (mr/schema ::native-query-snippet.columns)
                   [:name :description :content :archived :updated_at :collection_id :template_tags]))

(mr/def ::native-query-snippet.partial
  "A NativeQuerySnippet row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::native-query-snippet [:map {:closed true} [:id {:optional true} ::lib.schema.id/native-query-snippet]]])

(mr/def ::native-query-snippet.column
  "A column of `:native_query_snippet`, for the `:columns` option of the queries in
  [[metabase.native-query-snippets.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::native-query-snippet.columns))))
