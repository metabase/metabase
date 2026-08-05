(ns metabase-enterprise.remote-sync.models.remote-sync-worktree
  "Model for remote-sync worktrees. A worktree is a self-contained checkout of a git branch: its content lives in the
  same tables as the main app, tagged with a `worktree_id`, and is synced with the worktree's own `branch`. Only
  transform content is checked out into a worktree for now.

  Worktrees are superuser-only: read, write, and create all require admin, and so does every piece of content
  checked out into one."
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncWorktree [_model] :remote_sync_worktree)

(doto :model/RemoteSyncWorktree
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defmethod mi/can-read? :model/RemoteSyncWorktree
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-write? :model/RemoteSyncWorktree
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-create? :model/RemoteSyncWorktree
  [_model _instance]
  api/*is-superuser?*)

(methodical/defmethod t2/batched-hydrate [:model/RemoteSyncWorktree :creator]
  [_model k worktrees]
  (mi/instances-with-hydrated-data
   worktrees k
   (fn []
     (when-let [ids (seq (distinct (keep :creator_id worktrees)))]
       (u/index-by :id
                   (t2/select [:model/User :id :first_name :last_name :email
                               :date_joined :last_login :is_superuser :is_qbnewb :is_active]
                              :id [:in ids]))))
   :creator_id))
