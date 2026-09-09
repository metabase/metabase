(ns metabase-enterprise.snippet-collections.db
  "Application database queries for the snippet-collections module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def ^:private SnippetWithCollectionId
  "Rows returned by [[snippet-with-collection-id]]."
  (mut/select-keys ::native-query-snippets.schema/native-query-snippet.row [:collection_id]))

(mu/defn snippet-with-collection-id :- [:maybe SnippetWithCollectionId]
  "The `:collection_id` of the NativeQuerySnippet with `id`, or nil if no such NativeQuerySnippet exists. Unlike a
  bare column lookup, this distinguishes a missing snippet (nil) from one filed under the root collection
  (`{:collection_id nil}`)."
  [id :- ::lib.schema.id/native-query-snippet]
  (t2/select-one [:model/NativeQuerySnippet :collection_id] :id id))
