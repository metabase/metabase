(ns metabase-enterprise.snippet-collections.db
  "Application database queries for the snippet-collections module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn snippet-collection-id
  "The `:collection_id` of the NativeQuerySnippet with `id`, or nil."
  [id]
  (t2/select-one-fn :collection_id :model/NativeQuerySnippet :id id))
