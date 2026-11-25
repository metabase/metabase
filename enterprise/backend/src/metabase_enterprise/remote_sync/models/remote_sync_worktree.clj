(ns metabase-enterprise.remote-sync.models.remote-sync-worktree
  "A remote sync worktree: a checkout of a branch whose content lives in the same tables as the main app. The main app
  is itself the default worktree."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncWorktree [_model] :remote_sync_worktree)

(derive :model/RemoteSyncWorktree :metabase/model)

(defmethod app-db-copy/spec :model/RemoteSyncWorktree [_model]
  {:skip? true})
