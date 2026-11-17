(ns metabase.remote-sync.models.remote-sync-worktree
  "A remote sync worktree, a checkout of a branch whose content lives in the same tables as the main app."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.db :as remote-sync.db]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Model setup ----------------------------------------------------

(methodical/defmethod t2/table-name :model/RemoteSyncWorktree [_model] :remote_sync_worktree)

(doto :model/RemoteSyncWorktree
  (derive :metabase/model)
  (derive :hook/events)
  (derive :hook/timestamped?))

(defmethod events/spec :model/RemoteSyncWorktree
  [_model]
  {:create :event/remote-sync-worktree-create
   :update :event/remote-sync-worktree-update
   :delete :event/remote-sync-worktree-delete})

(defmethod app-db-copy/spec :model/RemoteSyncWorktree [_model]
  {:skip? false})

;;; --------------------------------------------------- Permissions ----------------------------------------------------

(doto :model/RemoteSyncWorktree
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

;;; ---------------------------------------------------- Hydration -----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/RemoteSyncWorktree :users]
  "The users working in each worktree."
  [_model k worktrees]
  (mi/instances-with-hydrated-data
   worktrees k
   #(group-by :worktree_id (remote-sync.db/worktree-users (map :id worktrees)))
   :id
   {:default []}))
