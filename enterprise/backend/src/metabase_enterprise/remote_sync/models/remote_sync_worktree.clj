(ns metabase-enterprise.remote-sync.models.remote-sync-worktree
  "Model for remote-sync worktrees. A worktree is a self-contained checkout of a git branch: its content lives
  in the same tables as the main app, tagged with a `worktree_id`, and is synced with the worktree's `branch`.

  Worktrees are superuser-only: read, write, and create all require admin."
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

;;; --------------------------------------------- Permission predicates ---------------------------------------------

(defmethod mi/can-read? :model/RemoteSyncWorktree
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-write? :model/RemoteSyncWorktree
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-create? :model/RemoteSyncWorktree
  [_model _instance]
  api/*is-superuser?*)

;;; -------------------------------------------------- Hydration ----------------------------------------------------

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

(methodical/defmethod t2/batched-hydrate [:model/RemoteSyncWorktree :users]
  [_model k worktrees]
  (mi/instances-with-hydrated-data
   worktrees k
   (fn []
     (when-let [ids (seq (map :id worktrees))]
       (group-by :worktree_id
                 (t2/select [:model/User :id :first_name :last_name :email
                             :date_joined :last_login :is_superuser :is_qbnewb :is_active :worktree_id]
                            :worktree_id [:in ids] :is_active true))))
   :id
   {:default []}))

;;; ---------------------------------------------------- Queries ----------------------------------------------------

(defn list-worktrees
  "Return every worktree with its `:creator` and assigned `:users` hydrated, ordered by id."
  []
  (t2/hydrate (t2/select :model/RemoteSyncWorktree {:order-by [[:id :asc]]}) :creator :users))

(defn get-worktree
  "Return the worktree with `id` and its `:creator` and assigned `:users` hydrated, or nil."
  [id]
  (when-let [worktree (t2/select-one :model/RemoteSyncWorktree :id id)]
    (t2/hydrate worktree :creator :users)))

(defn worktree-branch
  "Return the `branch` of the worktree with `id`, or nil."
  [id]
  (some-> id (->> (t2/select-one-fn :branch :model/RemoteSyncWorktree :id))))
