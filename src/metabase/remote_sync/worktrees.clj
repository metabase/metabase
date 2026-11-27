(ns metabase.remote-sync.worktrees
  "Remote sync worktrees, which the enterprise remote sync module keeps."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]
   [metabase.remote-sync.spec :as remote-sync.spec]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defenterprise non-default-worktrees
  "Every worktree but the default one, of which there are none without the enterprise code."
  metabase-enterprise.remote-sync.models.remote-sync-worktree
  []
  [])

(defenterprise non-default-worktree
  "The worktree other than the default one with `worktree-id`, or nil."
  metabase-enterprise.remote-sync.models.remote-sync-worktree
  [_worktree-id]
  nil)

(defenterprise user-non-default-worktree-id
  "The id of the worktree other than the default one the user with `user-id` checked out, or nil."
  metabase-enterprise.remote-sync.models.remote-sync-worktree
  [_user-id]
  nil)

(defenterprise delete-checkouts!
  "Delete the checkouts of the users with `user-ids`, who then work in the default worktree; there are none without the
  enterprise code."
  metabase-enterprise.remote-sync.models.remote-sync-worktree
  [_user-ids]
  nil)

(methodical/defmethod t2/simple-hydrate [:model/User :worktree]
  "The worktree other than the default one the user checked out, or nil when they work in the default worktree."
  [_model k user]
  (assoc user k (some-> (user-non-default-worktree-id (:id user)) non-default-worktree)))

(defn ensure-built-ins!
  "Creates the built-in rows the remote sync worktree this thread works in lacks, of every model whose spec has
  `:ensure-built-ins`."
  []
  (doseq [model (keys (dissoc (methods remote-sync.spec/spec) :default))
          :let  [ensure! (:ensure-built-ins (remote-sync.spec/spec model))]
          :when ensure!]
    (ensure!)))
