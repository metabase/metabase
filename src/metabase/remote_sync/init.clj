(ns metabase.remote-sync.init
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.events]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/batched-hydrate [:perms/use-parent-collection-perms :is_remote_synced]
  "Batch hydration for whether an item is remote synced"
  [model k items]
  (mi/instances-with-hydrated-data items k
                                   #(into {}
                                          (map (juxt :id (comp api/bit->boolean :is_remote_synced))
                                               (t2/select [model :id [:c.is_remote_synced :is_remote_synced]]
                                                          {:where [:in (keyword (str (name (t2/table-name model)) ".id"))
                                                                   (map :id items)]
                                                           :join [[:collection :c]
                                                                  [:= :collection_id :c.id]]})))
                                   :id
                                   {:default false}))
