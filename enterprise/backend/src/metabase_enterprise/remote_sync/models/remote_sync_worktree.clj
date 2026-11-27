(ns metabase-enterprise.remote-sync.models.remote-sync-worktree
  "A remote sync worktree: a checkout of a branch whose content lives in the same tables as the main app. The main app
  is itself the default worktree."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Model setup ----------------------------------------------------

(methodical/defmethod t2/table-name :model/RemoteSyncWorktree [_model] :remote_sync_worktree)

(doto :model/RemoteSyncWorktree
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defmethod app-db-copy/spec :model/RemoteSyncWorktree [_model]
  {:skip? true})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-not-default
  "Throws a 400 when `default?`, for a write of the default worktree, the main app, which its migration creates and
  nothing changes."
  [default?]
  (when default?
    (throw (ex-info (tru (str "The default worktree, the main app, can''t be created, changed or deleted, and no other"
                              " worktree can become it."))
                    {:status-code 400}))))

(t2/define-before-insert :model/RemoteSyncWorktree
  [worktree]
  (check-not-default (:is_default worktree))
  worktree)

(t2/define-before-update :model/RemoteSyncWorktree
  [worktree]
  (check-not-default (or (:is_default (t2/original worktree)) (contains? (t2/changes worktree) :is_default)))
  worktree)

(t2/define-before-delete :model/RemoteSyncWorktree
  [worktree]
  (check-not-default (:is_default worktree))
  worktree)

;;; --------------------------------------------------- Permissions ----------------------------------------------------

(doto :model/RemoteSyncWorktree
  (derive ::mi/read-policy.superuser)
  (derive ::mi/create-policy.superuser))

(methodical/defmethod t2/simple-hydrate [:model/RemoteSyncWorktree :can_write]
  "A superuser writes a worktree, but no one writes the default one, the main app."
  [_model k worktree]
  (assoc worktree k (boolean (and (mi/superuser?) (not (:is_default worktree))))))

(defmethod mi/can-update? :model/RemoteSyncWorktree
  [worktree _changes]
  (mi/can-write? (t2/hydrate worktree :can_write)))

;;; ---------------------------------------------------- Hydration -----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/RemoteSyncWorktree :users]
  "The active users who checked out each worktree."
  [_model k worktrees]
  (mi/instances-with-hydrated-data
   worktrees k
   #(group-by :worktree_id (remote-sync.db/worktree-users (map :id worktrees)))
   :id
   {:default []}))

;;; ------------------------------------------------------ Reads -------------------------------------------------------

(defenterprise worktrees-enabled?
  "Whether a request can work in a worktree other than the default one, which it can with the `:remote-sync` feature."
  :feature :remote-sync
  []
  true)

(defenterprise non-default-worktrees
  "Every worktree but the default one."
  :feature :none
  []
  (remote-sync.db/worktrees))

(defenterprise non-default-worktree
  "The worktree other than the default one with `worktree-id`, or nil."
  :feature :none
  [worktree-id]
  (remote-sync.db/non-default-worktree worktree-id))

(defenterprise user-non-default-worktree-id
  "The id of the worktree other than the default one the user with `user-id` checked out, or nil."
  :feature :none
  [user-id]
  (remote-sync.db/checkout-worktree-id user-id))

;;; ------------------------------------------------------ Writes ------------------------------------------------------

(defenterprise delete-checkouts!
  "Delete the checkouts of the users with `user-ids`, who then work in the default worktree."
  :feature :none
  [user-ids]
  (remote-sync.db/delete-checkouts! user-ids))

(mu/defn create-remote-sync-worktree! :- ::remote-sync.schema/worktree
  "Inserts `worktree` and returns it, after creating in it the built-in rows that the main app's migrations create and
  the remote sync specs ensure."
  [worktree :- ::remote-sync.schema/worktree.update]
  (let [created (remote-sync.db/insert-worktree! worktree)]
    (mdb/with-worktree-scope {:type :worktree :worktree-id (:id created)}
      (remote-sync/ensure-built-ins!))
    created))

(mu/defn delete-remote-sync-worktree! :- :nil
  "Deletes the worktree with `worktree-id`, the database deleting its content and the checkouts of it."
  [worktree-id :- ms/PositiveInt]
  (remote-sync.db/delete-worktree! worktree-id)
  nil)

(mu/defn check-out-worktree! :- :nil
  "Makes the user with `user-id` work in the worktree with `worktree-id`, or in the main app when it is nil."
  [user-id     :- ms/PositiveInt
   worktree-id :- [:maybe ms/PositiveInt]]
  (t2/with-transaction [_conn]
    (remote-sync.db/delete-checkout! user-id)
    (when worktree-id
      (remote-sync.db/insert-checkout! user-id worktree-id)))
  nil)
