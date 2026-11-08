(ns metabase-enterprise.remote-sync.db
  "Application database queries for the remote sync module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))
