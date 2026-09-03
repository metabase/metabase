(ns metabase-enterprise.snippet-collections.db
  "Application database queries for the snippet-collections module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn snippet-with-collection-id
  "The `:collection_id` of the NativeQuerySnippet with `id`, or nil if no such NativeQuerySnippet exists. Unlike a
  bare column lookup, this distinguishes a missing snippet (nil) from one filed under the root collection
  (`{:collection_id nil}`)."
  [id]
  (t2/select-one [:model/NativeQuerySnippet :collection_id] :id id))
