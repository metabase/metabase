(ns metabase-enterprise.remote-sync.models.worktree
  "Model for remote-sync worktrees. A worktree is a self-contained checkout of a git branch: its content lives in the
  same tables as the main app, tagged with a `worktree_id`, and is synced with the worktree's own `branch`. Only
  transform content is checked out into a worktree for now.

  Worktrees need the `:remote-sync` application permission (held implicitly by admins): read, write, and create
  all require it, and so does every piece of content checked out into one."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Worktree [_model] :worktree)

(doto :model/Worktree
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defmethod mi/can-read? :model/Worktree
  ([_instance] (perms/current-user-can-access-worktrees?))
  ([_model _pk] (perms/current-user-can-access-worktrees?)))

(defmethod mi/can-write? :model/Worktree
  ([_instance] (perms/current-user-can-access-worktrees?))
  ([_model _pk] (perms/current-user-can-access-worktrees?)))

(defmethod mi/can-create? :model/Worktree
  [_model _instance]
  (perms/current-user-can-access-worktrees?))

(methodical/defmethod t2/batched-hydrate [:model/Worktree :creator]
  [_model k worktrees]
  (mi/instances-with-hydrated-data
   worktrees k
   (fn []
     (when-let [ids (seq (distinct (keep :creator_id worktrees)))]
       (u/index-by :id (remote-sync.db/user-summaries ids))))
   :creator_id))
