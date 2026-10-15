(ns metabase-enterprise.library-branching.audit
  "The audit log of library branching: one entry for each push, pull, merge-branch, deploy, branch create and branch
  switch whose task succeeded, after its task ended. An entry has the topic of the matching operation of remote sync,
  the task as its object, the initiating user (none for a task of the system), and the branch."
  (:require
   [metabase.events.core :as events]))

(set! *warn-on-reflection* true)

(def topics
  "The audit-log topic of each kind of task that has an entry."
  {"push"          :event/remote-sync-export
   "pull"          :event/remote-sync-import
   "branch-switch" :event/remote-sync-import
   "deploy"        :event/remote-sync-import
   "branch-create" :event/remote-sync-create-branch
   "merge-branch"  :event/remote-sync-merge-branch})

(defn topic
  "The audit-log topic of a task of `kind`, or nil when the kind has no entry. `(:new-branch? opts)`: a push that
  creates its branch, the stash of remote sync."
  [kind {:keys [new-branch?]}]
  (if (and new-branch? (= "push" kind))
    :event/remote-sync-stash
    (get topics kind)))

(defn details
  "The details of the entry of a task of `kind` whose outcome is `outcome`: the kind, the branch, the commit as
  `:version`, the branch that a merge or a new branch came `:from`, and `:auto true` iff `auto?` (the schedule started
  the task)."
  [kind {:keys [branch commit from]} auto?]
  (cond-> {:task_type kind :branch branch}
    commit (assoc :version commit)
    from   (assoc :from from)
    auto?  (assoc :auto true)))

(defn record!
  "Publishes the audit-log event `topic` for task `task-id` of `kind`, initiated by the user `user-id` (nil: the
  system), with the [[details]] of `outcome` and `auto?`."
  [topic kind task-id user-id outcome auto?]
  ;; The audit log stores the name of a keyword model, and no name for a string; the task table has no Toucan model.
  (events/publish-event! topic {:model    :LibraryBranchingTask
                                :model-id task-id
                                :user-id  user-id
                                :details  (details kind outcome auto?)}))

(defn on-success
  "The success hook of `tasks/run-task!` for a task of `kind` of the user `user-id`: it records the entry of the task
  with its outcome. Nil when the kind has no entry. `opts`: `:new-branch?` (as in [[topic]]), `:auto?` (as in
  [[details]])."
  [kind user-id {:keys [auto?] :as opts}]
  (when-let [t (topic kind opts)]
    (fn [task-id {:keys [outcome]}]
      (record! t kind task-id user-id outcome auto?))))
