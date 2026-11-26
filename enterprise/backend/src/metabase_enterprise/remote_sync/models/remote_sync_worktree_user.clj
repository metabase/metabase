(ns metabase-enterprise.remote-sync.models.remote-sync-worktree-user
  "The remote sync worktree other than the default one a user has checked out, at most one per user."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncWorktreeUser [_model] :remote_sync_worktree_user)

(derive :model/RemoteSyncWorktreeUser :metabase/model)

(defmethod app-db-copy/spec :model/RemoteSyncWorktreeUser [_model]
  {:skip? true})
