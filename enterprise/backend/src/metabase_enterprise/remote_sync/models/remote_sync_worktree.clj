(ns metabase-enterprise.remote-sync.models.remote-sync-worktree
  "A remote sync worktree: a checkout of a branch whose content lives in the same tables as the main app. The main app
  is itself the default worktree."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
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
  "The users working in each worktree, none on an app DB without worktrees, whose users have no current worktree."
  [_model k worktrees]
  (mi/instances-with-hydrated-data
   worktrees k
   #(if (mdb/worktrees-supported?)
      (group-by :current_worktree_id (remote-sync.db/worktree-users (map :id worktrees)))
      {})
   :id
   {:default []}))

;;; ------------------------------------------------------ Writes ------------------------------------------------------

(defn- check-not-in-transaction
  "Throws when this thread holds an open app DB transaction, whose connection would keep the main app's scope for the
  worktree's own rows."
  []
  (when (mdb/in-transaction?)
    (throw (ex-info "Can't create or delete a worktree inside an app DB transaction." {}))))

(mu/defn create-remote-sync-worktree! :- ::remote-sync.schema/worktree
  "Inserts `worktree` with its own built-in rows, which the main app's migrations create and the remote sync specs
  ensure, and returns it, creating the worktree schema with the first worktree. Hand-written and for one worktree,
  which is all anyone creates at once: the worktree's own rows are created in its scope, outside any transaction."
  [worktree :- ::remote-sync.schema/worktree.update]
  (check-not-in-transaction)
  (let [created (remote-sync.db/insert-worktree! worktree)]
    (when (= 1 (remote-sync.db/worktree-count))
      (mdb/recreate-worktree-views!))
    (mdb/with-worktree-scope (mdb/worktree-scope (:id created))
      (remote-sync/ensure-built-ins!))
    created))

(mu/defn delete-remote-sync-worktree! :- :nil
  "Deletes the worktree with `worktree-id`, the database deleting its content, and drops the worktree schema with the
  last worktree."
  [worktree-id :- ms/PositiveInt]
  (remote-sync.db/delete-worktree! worktree-id)
  (when (zero? (remote-sync.db/worktree-count))
    (mdb/drop-worktree-schema!))
  nil)
