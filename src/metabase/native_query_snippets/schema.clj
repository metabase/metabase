(ns metabase.native-query-snippets.schema
  (:require
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
   ::native-query-snippet.update
   [:map {:closed true, :probe/id "src/metabase/native_query_snippets/schema.clj:15"}
    [:id            ::lib.schema.id/native-query-snippet]
    [:creator       {:optional true} [:maybe :metabase.users.schema/user]]
    [:collection    {:optional true} [:maybe :metabase.collections.schema/collection]]]])

(mr/def ::native-query-snippet.update
  "What an update (or insert) of a NativeQuerySnippet accepts: every column of `:native_query_snippet` except `id`, all optional."
  [:map {:closed true}
   [:name          {:optional true} [:maybe :string]]
   [:description   {:optional true} [:maybe :string]]
   [:content       {:optional true} [:maybe :string]]
   [:creator_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:archived      {:optional true} [:maybe :boolean]]
   [:created_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:entity_id     {:optional true} [:maybe :string]]
   [:template_tags {:optional true} [:maybe ::lib.schema.template-tag/template-tag-map]]])
