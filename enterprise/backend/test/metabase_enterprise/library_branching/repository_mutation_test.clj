(ns metabase-enterprise.library-branching.repository-mutation-test
  "Mutations of the rules of the repository settings, the routes of the operations, the base keyed by URL, the hard
  time limit of a worker and the cleanup of old task rows. Each mutation removes or weakens one rule, and a test of
  that rule must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.base-url-test :as base-url-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.operations-test :as operations-test]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.repository-test :as repository-test]
   [metabase-enterprise.library-branching.task-cleanup :as task-cleanup]
   [metabase-enterprise.library-branching.task-cleanup-test :as task-cleanup-test]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-test :as tasks-test]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation removes or weakens one rule."
  [{:name   :obfuscated-token-written
    :doc    "A save writes the obfuscated token over the saved token."
    :target `repository/save-plan
    :edits  [[:replace '(and (= :remote-sync-token k) (obfuscated? v (:remote-sync-token saved))) false]]
    :tests  [#'repository-test/save-plan-laws-test #'repository-test/save-token-rules-test]}
   {:name   :environment-written
    :doc    "A save writes a setting whose value comes from an environment variable."
    :target `repository/save-plan
    :edits  [[:replace '(contains? env k) false]]
    :tests  [#'repository-test/save-plan-laws-test #'repository-test/save-keeps-values-from-environment-variables-test]}
   {:name   :turn-off-keeps-the-token
    :doc    "A blank URL clears only the URL: the token and the branch stay."
    :target `repository/save-plan
    :edits  [[:replace '{:remote-sync-url nil :remote-sync-token nil :remote-sync-branch nil} '{:remote-sync-url nil}]]
    :tests  [#'repository-test/save-plan-laws-test #'repository-test/turn-off-keeps-the-base-row-test]}
   {:name   :no-check-of-a-git-change
    :doc    "A change of the URL, the token, the type or the branch is saved with no check of the repository."
    :target `repository/save-plan
    :edits  [[:replace '(and (not off?) (some git-keys (keys body))) false]]
    :tests  [#'repository-test/save-plan-laws-test #'repository-test/save-refuses-what-does-not-connect-test]}
   {:name   :check-of-every-save
    :doc    "A save of a setting that is not about git calls the remote."
    :target `repository/save-plan
    :edits  [[:replace '(some git-keys (keys body)) true]]
    :tests  [#'repository-test/save-plan-laws-test #'repository-test/save-of-a-setting-not-about-git-calls-no-remote-test]}
   {:name   :no-default-branch
    :doc    "A blank branch stays blank: the save does not take the default branch of the repository."
    :target `repository/check-connection!
    :edits  [[:replace '(and default-branch? (store/default-branch s)) nil]]
    :tests  [#'repository-test/save-with-a-blank-branch-takes-the-default-branch-test]}
   {:name   :read-only-on-any-branch
    :doc    "A read-only instance saves a branch that the repository does not have."
    :target `repository/check-connection!
    :edits  [[:replace '(not (contains? branches branch)) false]]
    :tests  [#'repository-test/save-refuses-what-does-not-connect-test]}
   {:name   :save-while-a-task-runs
    :doc    "A save while a task runs calls the remote before the start of its task refuses it."
    :target `repository/save-settings!
    :edits  [[:remove '(when (tasks/live-task) (refuse! (tru "Library branching task in progress")))]]
    :tests  [#'repository-test/save-refuses-while-a-task-runs-test]}
   {:name   :test-connection-ignores-the-form
    :doc    "Test Connection uses the saved URL, not the URL of the form."
    :target `repository/connection
    :edits  [[:replace '(or (present (:remote-sync-url body)) (:url saved)) '(:url saved)]]
    :tests  [#'repository-test/test-connection-uses-the-values-of-the-form-test]}
   {:name   :test-connection-sends-the-obfuscated-token
    :doc    "Test Connection sends the obfuscated token as the token."
    :target `repository/connection
    :edits  [[:replace '(obfuscated? token (:token saved)) false]]
    :tests  [#'repository-test/test-connection-uses-the-values-of-the-form-test]}
   {:name   :no-timeout-setting
    :doc    "The store has the default network timeout, not the setting remote-sync-git-timeout-seconds."
    :target `repository/open-store
    :edits  [[:replace '(setting/get :remote-sync-git-timeout-seconds) 60]]
    :tests  [#'repository-test/open-store-has-the-saved-connection-and-the-timeout-setting-test]}
   {:name   :operation-on-a-read-only-instance
    :doc    "A push, a pull or a merge-branch starts on a read-only instance."
    :target `operations/check-start!
    :edits  [[:remove '(when-not (repository/read-write?)
                         (refuse! (tru "Push, pull, merge-branch and the branch operations are only allowed when remote-sync-type is read-write.")))]]
    :tests  [#'operations-test/start-preconditions-test]}
   {:name   :pull-with-no-fence
    :doc    "The apply of a pull commits although its task ended."
    :target `operations/pull-task!
    :edits  [[:replace '(tasks/fence id) nil]]
    :tests  [#'operations-test/workers-on-the-app-db-test]}
   {:name   :base-of-any-url
    :doc    "An instance takes the base of the base row whatever URL the row holds."
    :target `app-db/base
    :edits  [[:replace '(= url (:url row)) true]]
    :tests  [#'base-url-test/base-of-another-url-test #'base-url-test/base-keyed-by-url-law-test]}
   {:name   :move-from-the-base-of-another-url
    :doc    "A move of the base from a commit does not check the URL of the row."
    :target `library-branching.db/compare-and-set-base!
    :edits  [[:replace '(url-is url) true]]
    :tests  [#'base-url-test/base-of-another-url-test #'base-url-test/base-keyed-by-url-law-test]}
   {:name   :no-first-base-for-a-new-url
    :doc    "An instance of a new URL cannot set its first base while the row holds the base of another URL."
    :target `library-branching.db/compare-and-set-base!
    :edits  [[:replace '(url-is-not url) false]]
    :tests  [#'base-url-test/base-of-another-url-test #'base-url-test/base-keyed-by-url-law-test]}
   {:name   :no-hard-time-limit
    :doc    "A worker past the hard time limit is not stopped by a failure of its task."
    :target `tasks/submit!
    :edits  [[:replace '(fail! id (timeout-message timeout-ms)) false]]
    :tests  [#'tasks-test/submit-stops-a-worker-past-the-hard-time-limit-test]}
   {:name   :cleanup-of-open-tasks
    :doc    "The cleanup deletes an old task that is still open."
    :target `task-cleanup/delete-old-tasks!
    :edits  [[:replace 'tasks/ended-statuses '(into tasks/ended-statuses tasks/open-statuses)]]
    :tests  [#'task-cleanup-test/cleanup-deletes-old-ended-tasks-test]}])

(deftest repository-mutations-test
  (mut/check mutations {:timeout-ms 120000}))
