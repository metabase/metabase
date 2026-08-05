(ns metabase.remote-sync.test-util
  "Helpers for testing worktree behaviour from OSS namespaces.

  `remote_sync_worktree` is an enterprise model, so OSS tests cannot go through `:model/RemoteSyncWorktree` --
  the rows are inserted and cleaned up directly instead. The `worktree_id` columns, their foreign keys, and the
  model hooks that guard them are all OSS, so the behaviour itself is testable on either edition."
  (:require
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn do-with-worktree
  "Impl of [[with-worktree]]."
  [f]
  (let [branch (str "test-branch-" (u/generate-nano-id))]
    (t2/query {:insert-into :remote_sync_worktree
               :values      [{:branch branch}]})
    (let [worktree-id (:id (first (t2/query {:select [:id]
                                             :from   [:remote_sync_worktree]
                                             :where  [:= :branch branch]})))]
      (try
        (f worktree-id)
        (finally
          ;; every worktree_id FK cascades, so this takes the checked-out content with it
          (t2/query {:delete-from :remote_sync_worktree
                     :where       [:= :id worktree-id]}))))))

(defmacro with-worktree
  "Binds `worktree-id-binding` to a fresh remote-sync worktree's id for the body, then deletes it."
  [[worktree-id-binding] & body]
  `(do-with-worktree (fn [~worktree-id-binding] ~@body)))
