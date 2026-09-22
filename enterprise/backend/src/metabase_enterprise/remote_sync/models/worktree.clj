(ns metabase-enterprise.remote-sync.models.worktree
  "Model for remote-sync worktrees. A worktree is a self-contained checkout of a git branch: its content lives in
  the same tables as the main app, tagged with a `worktree_id`, and is synced with the worktree's own `branch`.

  Nothing but a pull puts content into a worktree -- no API creates it -- and what a worktree holds is kept out of
  every list, so the main app never shows it. Managing the worktrees themselves is superuser-only."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Worktree [_model] :worktree)

(doto :model/Worktree
  (derive :metabase/model)
  (derive :hook/timestamped?))

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
