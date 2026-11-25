(ns metabase.remote-sync.worktrees
  "Remote sync worktrees, which the enterprise remote sync module keeps."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(defenterprise worktree-exists?
  "Whether the remote sync worktree with `worktree-id` exists, which none does without the `:remote-sync` feature."
  metabase-enterprise.remote-sync.db
  [_worktree-id]
  false)
