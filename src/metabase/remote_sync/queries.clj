(ns metabase.remote-sync.queries
  "Application database queries for the remote sync module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (hydration definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn remote-synced-collection-ids
  "The ids among `collection-ids` of Collections that are remote synced, or nil."
  [collection-ids]
  (t2/select-pks-set :model/Collection :id [:in collection-ids] :is_remote_synced true))

(defn is-remote-synced-by-id
  "The `:id` and the containing Collection's `:is_remote_synced` of the `model` rows with `ids`."
  [model ids]
  (t2/select [model :id [:c.is_remote_synced :is_remote_synced]]
             {:where [:in (keyword (str (name (t2/table-name model)) ".id")) ids]
              :join  [[:collection :c] [:= :collection_id :c.id]]}))
