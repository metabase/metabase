(ns metabase-enterprise.remote-sync.models.remote-sync-worktree
  "Model for remote sync worktrees: checked-out branches of the remote sync repository, each materialized
   as ordinary collection trees.

   The *default worktree* is the row whose branch matches the `remote-sync-branch` setting — the content
   all user-less traffic sees. It is created lazily rather than by a migration because the branch setting
   can come from an env var (`MB_REMOTE_SYNC_BRANCH`) that a SQL migration cannot read."
  (:require
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase.collections.models.collection :as collection]
   [metabase.settings.core :as setting]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncWorktree [_model] :remote_sync_worktree)

(doto :model/RemoteSyncWorktree
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(defn- backfill-worktree-references!
  "Point pre-worktree rows (collections flagged `is_remote_synced`, remote sync objects, and task history
   with no worktree) at `worktree-id`. Idempotent: only touches rows whose worktree reference is null."
  [worktree-id]
  (t2/query {:update (t2/table-name :model/Collection)
             :set    {:remote_sync_worktree_id worktree-id}
             :where  [:and
                      [:= :is_remote_synced true]
                      [:= :remote_sync_worktree_id nil]]})
  (t2/query {:update (t2/table-name :model/RemoteSyncObject)
             :set    {:worktree_id worktree-id}
             :where  [:= :worktree_id nil]})
  (t2/query {:update (t2/table-name :model/RemoteSyncTask)
             :set    {:worktree_id worktree-id}
             :where  [:= :worktree_id nil]}))

(mu/defn ensure-default-worktree! :- [:maybe [:map [:id pos-int?]]]
  "Get or create the worktree row for the current `remote-sync-branch`, backfilling worktree references on
   rows that predate it. Returns the worktree, or nil when no branch is configured."
  []
  (when-let [branch (setting/get :remote-sync-branch)]
    (or (t2/select-one :model/RemoteSyncWorktree :branch branch)
        (when-let [worktree (try
                              ;; seed the sync base from task history so pre-worktree instances don't
                              ;; regress to a full import on their first post-upgrade sync
                              (t2/insert-returning-instance! :model/RemoteSyncWorktree
                                                             {:branch       branch
                                                              :base_version (remote-sync.task/last-version)})
                              (catch Exception _
                                ;; lost a race with another node/thread inserting the same branch
                                (t2/select-one :model/RemoteSyncWorktree :branch branch)))]
          ;; only on first creation: pre-worktree rows exist exactly when the row didn't
          (backfill-worktree-references! (:id worktree))
          worktree))))

(mu/defn default-worktree-id :- [:maybe pos-int?]
  "ID of the default worktree — the row whose branch matches the `remote-sync-branch` setting — creating
   it (and backfilling references) if needed. Nil when no branch is configured."
  []
  (when-let [branch (setting/get :remote-sync-branch)]
    (or (t2/select-one-fn :id :model/RemoteSyncWorktree :branch branch)
        (:id (ensure-default-worktree!)))))

(mu/defn set-base-version! :- :nil
  "Record `version` (a git SHA) as `worktree-id`'s sync base — the commit local changes are built on."
  [worktree-id :- pos-int?
   version     :- [:maybe :string]]
  (when version
    (t2/update! :model/RemoteSyncWorktree worktree-id {:base_version version}))
  nil)

(mu/defn default-base-version :- [:maybe :string]
  "The git SHA local changes are built on, for the default worktree. Nil when remote sync is not
   configured or nothing has synced yet.

   Derived from task history scoped to the default worktree (not from the `base_version` column, which
   is written but stays dormant until per-worktree sync reads it): task rows share their lifecycle with
   the rest of sync bookkeeping, while the worktree row deliberately outlives it."
  []
  (when-let [worktree-id (default-worktree-id)]
    (remote-sync.task/last-version worktree-id)))

(defn- repoint-worktree-content! [from-id to-id]
  (t2/query {:update (t2/table-name :model/Collection)
             :set    {:remote_sync_worktree_id to-id}
             :where  [:= :remote_sync_worktree_id from-id]})
  (t2/query {:update (t2/table-name :model/RemoteSyncObject)
             :set    {:worktree_id to-id}
             :where  [:= :worktree_id from-id]}))

(mu/defn default-worktree? :- :boolean
  "Is `worktree` the default worktree — the one whose branch the `remote-sync-branch` setting names?"
  [worktree :- [:map [:branch :string]]]
  (= (:branch worktree) (setting/get :remote-sync-branch)))

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

(mu/defn worktree-dirty-rows :- [:sequential :map]
  "RemoteSyncObject rows of `worktree-id` with local changes not yet pushed (status other than synced)."
  [worktree-id :- pos-int?]
  (t2/select :model/RemoteSyncObject :worktree_id worktree-id :status [:not= "synced"]))

(mu/defn delete-worktree! :- :nil
  "Delete `worktree` and the collection trees it materialized. Its RemoteSyncObject rows go with the
   worktree row (FK cascade); task history keeps its rows with a nulled worktree reference. Guards
   (default-worktree refusal, dirty check) are the caller's responsibility."
  [worktree :- [:map [:id pos-int?]]]
  (t2/with-transaction [_conn]
    (doseq [root (worktree-roots (:id worktree))]
      (t2/delete! :model/Collection :id (:id root)))
    (t2/delete! :model/RemoteSyncWorktree :id (:id worktree)))
  nil)

(mu/defn set-default-branch! :- [:maybe [:map [:id pos-int?]]]
  "Point remote sync at `branch`: updates the `remote-sync-branch` setting, ensures a worktree row for
   the new branch, and moves default-worktree bookkeeping (collection membership, sync-object ledger)
   onto that row. Task history keeps its original worktree. Returns the new default worktree.

   Every code path that writes the `remote-sync-branch` setting must go through this function so the
   setting and the worktree table cannot drift."
  [branch :- :string]
  (let [old-id (default-worktree-id)]
    (setting/set! :remote-sync-branch branch)
    (when-let [worktree (ensure-default-worktree!)]
      (when (and old-id (not= old-id (:id worktree)))
        (repoint-worktree-content! old-id (:id worktree)))
      worktree)))
