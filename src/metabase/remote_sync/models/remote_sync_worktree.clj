(ns metabase.remote-sync.models.remote-sync-worktree
  "A remote sync worktree, a checkout of a branch whose content lives in the same tables as the main app."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.events.core :as events]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncWorktree [_model] :remote_sync_worktree)

(doto :model/RemoteSyncWorktree
  (derive :metabase/model)
  (derive :hook/events))

(defmethod events/spec :model/RemoteSyncWorktree
  [_model]
  {:create :event/remote-sync-worktree-create
   :update :event/remote-sync-worktree-update
   :delete :event/remote-sync-worktree-delete})

(defmethod app-db-copy/spec :model/RemoteSyncWorktree [_model]
  {:skip? false})
