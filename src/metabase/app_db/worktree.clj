(ns metabase.app-db.worktree
  "The remote sync worktrees of the app DB rows: the rows of a worktree carry its id in `worktree_id`.")

(set! *warn-on-reflection* true)

(def default-worktree-id
  "The id of the default worktree, the row the migration creates and every worktree_id column defaults to."
  1)
