(ns metabase-enterprise.remote-sync.write
  "Creating and deleting worktrees under a cluster lock, turning row-level security on for the tables of worktree rows
  with the first worktree and off with the last, so the main app pays for it only while worktrees exist."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.app-db.core :as mdb]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- sync-row-level-security-locked!
  "On Postgres, turns row-level security on for the tables of worktree rows while a worktree exists, and off when none
  does, with the worktrees lock held."
  []
  (when (= :postgres (mdb/db-type))
    (let [tables  (remote-sync.db/worktree-tables)
          secured (remote-sync.db/row-level-security-tables)]
      (if (pos? (remote-sync.db/worktree-count))
        (run! remote-sync.db/enable-row-level-security! (remove secured tables))
        (run! remote-sync.db/disable-row-level-security! (filter secured tables))))))

(mu/defn sync-row-level-security!
  "Turns row-level security on for the tables of worktree rows while a worktree exists, and off when none does."
  []
  (cluster-lock/with-cluster-lock ::worktrees
    (sync-row-level-security-locked!)))

(mu/defn create-worktree! :- ::remote-sync.schema/worktree
  "Inserts the worktree `worktree`, turning row-level security on when it is the first, and returns it."
  [worktree :- ::remote-sync.schema/worktree.update]
  (cluster-lock/with-cluster-lock ::worktrees
    (u/prog1 (remote-sync.db/insert-worktree! worktree)
      (sync-row-level-security-locked!))))

(mu/defn delete-worktree!
  "Deletes the worktree with `worktree-id`, the database deleting its content, turning row-level security off when it
  was the last."
  [worktree-id :- ms/PositiveInt]
  (cluster-lock/with-cluster-lock ::worktrees
    (remote-sync.db/delete-worktree! worktree-id)
    (sync-row-level-security-locked!)))
