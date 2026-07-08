(ns metabase.native-query-snippets.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.util.malli.registry :as mr]))

(mr/def ::native-query-snippet
  "Schema for an instance of a `:model/NativeQuerySnippet`."
  [:map
   [:id ::lib.schema.id/snippet]
   [:name :string]
   [:content :string]
   [:description {:optional true} [:maybe :string]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:template_tags [:ref ::lib.schema.template-tag/template-tag-map]]])
