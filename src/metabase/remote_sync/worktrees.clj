(ns metabase.remote-sync.worktrees
  "Remote sync worktrees, which the enterprise remote sync module keeps."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.premium-features.defenterprise :refer [defenterprise]]
   [metabase.remote-sync.spec :as remote-sync.spec]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defenterprise non-default-worktree-exists?
  "Whether any worktree other than the default one exists, which none does without the enterprise code."
  metabase-enterprise.remote-sync.db
  []
  false)

(defenterprise worktree-ids
  "The ids of every worktree, the default one first, which is the only one without the enterprise code."
  metabase-enterprise.remote-sync.db
  []
  [mdb/default-worktree-id])

(defenterprise user-worktree-id
  "The id of the worktree other than the default one the user with `user-id` checked out, or nil."
  metabase-enterprise.remote-sync.db
  [_user-id]
  nil)

(defenterprise worktree-by-id
  "The worktree with `worktree-id`, or nil."
  metabase-enterprise.remote-sync.db
  [_worktree-id]
  nil)

(methodical/defmethod t2/simple-hydrate [:model/User :worktree]
  "The worktree other than the default one the user checked out, or nil when they work in the main app."
  [_model k user]
  (assoc user k (some-> (user-worktree-id (:id user)) worktree-by-id)))

(defn ensure-built-ins!
  "Creates the built-in rows the remote sync worktree this thread works in lacks, of every model whose spec has
  `:ensure-built-ins`."
  []
  (doseq [model (keys (dissoc (methods remote-sync.spec/spec) :default))
          :let  [ensure! (:ensure-built-ins (remote-sync.spec/spec model))]
          :when ensure!]
    (ensure!)))
