(ns metabase-enterprise.remote-sync.models.worktree
  "Model for remote-sync worktrees. A worktree is a self-contained checkout of a git branch: its content lives in
  the same tables as the main app, tagged with a `worktree_id`, and is synced with the worktree's own `branch`.

  A worktree's content is kept out of the main app's lists: a request reads and writes the worktree its
  `X-Metabase-Worktree-Id` header names. Entering one at all is superuser-only."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.api.common :as api]
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.collections.core :as collections]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Worktree [_model] :worktree)

(doto :model/Worktree
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/define-after-insert :model/Worktree
  [worktree]
  (mdb.worktree/with-worktree (:id worktree)
    (collections/create-trash-collection!))
  worktree)

(defmethod mi/can-read? :model/Worktree
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-write? :model/Worktree
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-create? :model/Worktree
  [_model _instance]
  api/*is-superuser?*)

(methodical/defmethod t2/batched-hydrate [:model/Worktree :creator]
  [_model k worktrees]
  (mi/instances-with-hydrated-data
   worktrees k
   (fn []
     (when-let [ids (seq (distinct (keep :creator_id worktrees)))]
       (u/index-by :id (remote-sync.db/user-summaries ids))))
   :creator_id))
