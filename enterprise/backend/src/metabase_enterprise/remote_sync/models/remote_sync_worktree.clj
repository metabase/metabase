(ns metabase-enterprise.remote-sync.models.remote-sync-worktree
  "Model for remote sync worktrees: checked-out branches of the remote sync repository, each materialized
   as ordinary collection trees.

   The main app is not a worktree: main-app content (including default-branch remote sync) carries a NULL
   worktree reference, and the `remote_sync_worktree` table only holds real checkouts, one row per branch."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncWorktree [_model] :remote_sync_worktree)

(doto :model/RemoteSyncWorktree
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(mu/defn worktree-filter-clause :- [:sequential :any]
  "HoneySQL clause scoping a worktree_id-tagged table (remote_sync_object, remote_sync_task) to one
   worktree's rows. Nil `worktree-id` is the main app: rows with no worktree reference (including all
   pre-worktree history)."
  [worktree-id :- [:maybe pos-int?]]
  [:= :worktree_id worktree-id])

(mu/defn set-base-version! :- :nil
  "Record `version` (a git SHA) as `worktree-id`'s sync base — the commit local changes are built on."
  [worktree-id :- pos-int?
   version     :- [:maybe :string]]
  (when version
    (t2/update! :model/RemoteSyncWorktree worktree-id {:base_version version}))
  nil)

(mu/defn check-branch-not-checked-out! :- :nil
  "Throw a 400 when `branch` is checked out as a worktree. Making it the sync branch while its checkout
   copies exist would put two materializations of the same branch side by side, so the worktree must be
   deleted first."
  [branch :- :string]
  (when-let [worktree (t2/select-one :model/RemoteSyncWorktree :branch branch)]
    (throw (ex-info (format "Branch '%s' is checked out as a worktree. Delete the worktree before syncing it as the default branch."
                            branch)
                    {:status-code 400
                     :worktree_id (:id worktree)})))
  nil)

(mu/defn worktree-roots :- [:sequential [:map [:id pos-int?] [:name :string]]]
  "Root collections of `worktree-id`: member collections whose parent collection is not itself a member.
   A worktree can have several roots — the repository supports multiple managed top-level collections."
  [worktree-id :- pos-int?]
  (let [members (t2/select [:model/Collection :id :name :location] :remote_sync_worktree_id worktree-id)
        member? (into #{} (map :id) members)]
    (into []
          (comp (remove (fn [{:keys [location]}]
                          (some-> location collection/location-path->parent-id member?)))
                (map #(select-keys % [:id :name])))
          members)))

(mu/defn delete-worktree! :- :nil
  "Delete `worktree` and the collection trees it materialized. Root collections are deleted through the
   model (so content cleanup hooks run); the worktree's RemoteSyncObject rows go with the worktree row
   (FK cascade), and task history keeps its rows with a nulled worktree reference. Guards (dirty check)
   are the caller's responsibility."
  [worktree :- [:map [:id pos-int?]]]
  (t2/with-transaction [_conn]
    (doseq [root (worktree-roots (:id worktree))]
      (t2/delete! :model/Collection :id (:id root)))
    (t2/delete! :model/RemoteSyncWorktree :id (:id worktree)))
  nil)
