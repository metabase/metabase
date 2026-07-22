(ns metabase-enterprise.remote-sync.models.remote-sync-worktree
  "Model for remote sync worktrees: checked-out branches of the remote sync repository, each materialized
   as ordinary collection trees.

   The main app is not a worktree: main-app content (including default-branch remote sync) carries a NULL
   worktree reference, and the `remote_sync_worktree` table only holds real checkouts, one row per branch."
  (:require
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncWorktree [_model] :remote_sync_worktree)

(doto :model/RemoteSyncWorktree
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(mu/defn set-base-version! :- :nil
  "Record `version` (a git SHA) as `worktree-id`'s sync base — the commit local changes are built on."
  [worktree-id :- pos-int?
   version     :- [:maybe :string]]
  (when version
    (t2/update! :model/RemoteSyncWorktree worktree-id {:base_version version}))
  nil)
