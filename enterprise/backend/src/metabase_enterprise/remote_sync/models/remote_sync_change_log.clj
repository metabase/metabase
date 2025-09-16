(ns metabase-enterprise.remote-sync.models.remote-sync-change-log
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncChangeLog [_model] :remote_sync_change_log)

(derive :model/RemoteSyncChangeLog :metabase/model)
