(ns metabase-enterprise.worktree.db
  "Application database queries for the worktree module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [metabase-enterprise.worktree.schema :as worktree.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn worktrees
  "Every Worktree, oldest first."
  []
  (t2/select :model/Worktree {:order-by [[:id :asc]]}))

(mu/defn worktree
  "The Worktree with `worktree-id`, or nil."
  [worktree-id :- ms/PositiveInt]
  (t2/select-one :model/Worktree :id worktree-id))

(mu/defn worktree-exists?
  "Whether a Worktree with `worktree-id` exists."
  [worktree-id :- ms/PositiveInt]
  (t2/exists? :model/Worktree :id worktree-id))

(mu/defn worktree-branch
  "The branch the Worktree with `worktree-id` is checked out to, or nil."
  [worktree-id :- ms/PositiveInt]
  (t2/select-one-fn :branch :model/Worktree :id worktree-id))

(mu/defn worktree-branch-taken?
  "Whether a Worktree for `branch` already exists."
  [branch :- :string]
  (t2/exists? :model/Worktree :branch branch))

(mu/defn insert-worktree!
  "Insert the Worktree `row` and return the new instance."
  [row :- ::worktree.schema/worktree.update]
  (t2/insert-returning-instance! :model/Worktree row))

(mu/defn update-worktree-branch!
  "Point the Worktree with `worktree-id` at `branch`, returning the number updated."
  [worktree-id :- ms/PositiveInt
   branch      :- :string]
  (t2/update! :model/Worktree worktree-id {:branch branch}))

(mu/defn delete-worktree!
  "Delete the Worktree with `worktree-id`; every `worktree_id` FK cascades."
  [worktree-id :- ms/PositiveInt]
  (t2/delete! :model/Worktree :id worktree-id))
