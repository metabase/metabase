(ns metabase-enterprise.snippet-collections.db
  "Application database queries for the snippet-collections module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn snippet-with-collection-id
  "The `:collection_id` of the NativeQuerySnippet with `id`, or nil if no such NativeQuerySnippet exists. Unlike a
  bare column lookup, this distinguishes a missing snippet (nil) from one filed under the root collection
  (`{:collection_id nil}`)."
  [id :- ::lib.schema.id/native-query-snippet]
  (t2/select-one [:model/NativeQuerySnippet :collection_id] :id id))
