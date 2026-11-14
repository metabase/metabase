(ns metabase-enterprise.remote-sync.models.worktree
  "A worktree, a checkout of a remote sync branch whose content lives in the same tables as the main app, which
  row-level security tells apart by `worktree_id`."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Worktree [_model] :worktree)

(doto :model/Worktree
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/batched-hydrate [:model/Worktree :users]
  "The users working in each worktree."
  [_model k worktrees]
  (mi/instances-with-hydrated-data
   worktrees k
   #(group-by :worktree_id (remote-sync.db/worktree-users (map :id worktrees)))
   :id
   {:default []}))
