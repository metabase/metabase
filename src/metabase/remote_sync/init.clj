(ns metabase.remote-sync.init
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.events]
   [metabase.remote-sync.queries :as remote-sync.queries]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/batched-hydrate [:perms/use-parent-collection-perms :is_remote_synced]
  "Batch hydration for whether an item is remote synced"
  [model k items]
  (mi/instances-with-hydrated-data items k
                                   #(into {}
                                          (map (juxt :id (comp api/bit->boolean :is_remote_synced))
                                               (remote-sync.queries/is-remote-synced-by-id model (map :id items))))
                                   :id
                                   {:default false}))
