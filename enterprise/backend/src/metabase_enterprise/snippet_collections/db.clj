(ns metabase-enterprise.snippet-collections.db
  "Application database queries for the snippet-collections module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn collection-id-row
  "The `:collection_id` row of the instance of `model` with `id`, or nil."
  [model id]
  (t2/select-one [model :collection_id] :id id))
