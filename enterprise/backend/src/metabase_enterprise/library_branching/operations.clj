(ns metabase-enterprise.library-branching.operations
  "Push, pull and merge-branch on the configured repository and the app DB instance, each as a task: each start
  function checks the preconditions of its operation, starts its task, and returns the task at once; a worker runs the
  operation. The result of the operation ends the task: an outcome for a success, an error message for every other
  result."
  (:require
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.merge-branch :as merge-branch]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.settings :as settings]
   [metabase-enterprise.library-branching.tasks :as tasks]))

(set! *warn-on-reflection* true)

(defn- not-yet [f]
  (throw (ex-info (str "Not implemented yet: " f) {})))

(defn instance
  "The app DB instance, with its base keyed by the repository URL."
  []
  (not-yet "instance"))

(defn push-task-result
  "The task result of `result`, a result of `push/push!` on branch `branch`: `{:outcome o}` when the push landed or had
  nothing to push, else `{:error message}`."
  [_branch _result]
  (not-yet "push-task-result"))

(defn pull-task-result
  "The task result of `result`, a result of `pull/pull!` of branch `branch`: `{:outcome o}` when the pull applied or
  was up to date, else `{:error message}`."
  [_branch _result]
  (not-yet "pull-task-result"))

(defn merge-branch-task-result
  "The task result of `result`, a result of `merge-branch/merge-branch!` of branch `from` into branch `into`:
  `{:outcome o}` when the merge landed or was up to date, else `{:error message}`."
  [_into _from _result]
  (not-yet "merge-branch-task-result"))

(defn push-task!
  "Runs the push to branch `branch` with the commit message `message` (nil: the default) as the work of task `id`, and
  returns its task result ([[push-task-result]])."
  [_id _branch _message]
  (not-yet "push-task!"))

(defn pull-task!
  "Runs the pull of branch `branch` as the work of task `id`, and returns its task result ([[pull-task-result]]). The
  apply of the pull commits only while task `id` is running."
  [_id _branch]
  (not-yet "pull-task!"))

(defn merge-branch-task!
  "Runs the merge of branch `from` into branch `into` as the work of task `id`, and returns its task result
  ([[merge-branch-task-result]])."
  [_id _into _from]
  (not-yet "merge-branch-task!"))

(defn start-push!
  "Starts a push task of the synced snapshot to the configured branch, for the user `user-id`, with the commit message
  `message` (nil: the default), and returns the task. Throws ex-info with `:status-code` 400 when library branching is
  off or not configured, on a consumption instance, and while a task runs."
  [_user-id _message]
  (not-yet "start-push!"))

(defn start-pull!
  "Starts a pull task of the configured branch, for the user `user-id`, and returns the task. The apply of the pull
  commits only while its task is running. Throws as [[start-push!]]."
  [_user-id]
  (not-yet "start-pull!"))

(defn start-merge-branch!
  "Starts a task that merges branch `from` into branch `into` (nil: the configured branch), for the user `user-id`, and
  returns the task. Throws as [[start-push!]]."
  [_user-id _into _from]
  (not-yet "start-merge-branch!"))

(comment app-db/app-db-instance merge-branch/merge-branch! pull/pull! push/push! repository/url scope/roots
         settings/library-branching-enabled tasks/submit!)
