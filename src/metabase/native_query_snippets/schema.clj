(ns metabase.native-query-snippets.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::native-query-snippet
  "Schema for an instance of a `:model/NativeQuerySnippet`."
  [:map
   [:id ::lib.schema.id/snippet]
   [:name :string]
   [:content :string]
   [:description {:optional true} [:maybe :string]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   ;; TODO (Cam 2026-07-08) Change Native Query Snippets to store template tags as a list like we do in MBQL as of 63.
   [:template_tags [:ref ::lib.schema.template-tag/template-tag-map]]])

(mr/def ::native-query-snippet.update
  "What an update (or insert) of a NativeQuerySnippet accepts: every column of `:native_query_snippet` except `id`, all optional."
  [:map {:closed true}
   [:name          {:optional true} [:maybe :string]]
   [:description   {:optional true} [:maybe [:or :string :map sequential?]]]
   [:content       {:optional true} [:maybe [:or :string :map sequential?]]]
   [:creator_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:archived      {:optional true} [:maybe :boolean]]
   [:created_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:entity_id     {:optional true} [:maybe :string]]
   [:template_tags {:optional true} [:maybe [:or :string :map sequential?]]]])
