(ns metabase-enterprise.snippet-collections.db
  "Application database queries for the snippet-collections module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn snippet-with-collection-id :- [:maybe [:map {:closed true} [:collection_id [:maybe ms/PositiveInt]]]]
  "The `:collection_id` of the NativeQuerySnippet with `id`, or nil if no such NativeQuerySnippet exists. Unlike a
  bare column lookup, this distinguishes a missing snippet (nil) from one filed under the root collection
  (`{:collection_id nil}`)."
  [id :- ms/PositiveInt]
  (t2/select-one [:model/NativeQuerySnippet :collection_id] :id id))
