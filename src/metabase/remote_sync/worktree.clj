(ns metabase.remote-sync.worktree
  "The worktree standing for the main app.

  Kept apart from [[metabase.remote-sync.core]], which reaches premium-features and cannot be required from
  [[metabase.models.serialization]] without a cycle. `core` re-exports both vars."
  (:require
   [metabase.app-db.core :as mdb]
   [toucan2.core :as t2]))

(def ^{:arglists '([])} default-worktree-id
  "The id of the worktree standing for the main app. `worktree_id` is NOT NULL in every table that carries it, so
  main-app rows hold this id -- never `nil`. The row is created by a migration and never changes, so the lookup is
  memoized for as long as the application database is."
  (mdb/memoize-for-application-db
   (fn [] (t2/select-one-pk :model/RemoteSyncWorktree :is_default true))))

(defn default-worktree-id?
  "Whether `worktree-id` is the main app's, rather than a real worktree's."
  [worktree-id]
  (= worktree-id (default-worktree-id)))
