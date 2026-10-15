(ns metabase-enterprise.library-branching.branch-mutation-test
  "Mutations of the rules of the branch operations and of the held base. Each mutation removes or weakens one rule, as
  a mutation of the formal model does, and a test must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.apply :as apply]
   [metabase-enterprise.library-branching.branch :as branch]
   [metabase-enterprise.library-branching.branch-test :as branch-test]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.operations-test :as operations-test]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.pull-test :as pull-test]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.repository-test :as repository-test]
   [metabase-enterprise.library-branching.status-test :as status-test]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(def mutations
  "Each mutation removes or weakens one rule of the branch operations or of the held base."
  [{:name   :anybase
    :doc    "The TLA+ mutation anybase: a pull merges against a base that no branch holds (after a force push), so items
            that the instance did not change take the content of the head with no conflict."
    :target `pull/base-snapshot
    :edits  [[:replace '(not (held? store b branch h)) false]]
    :tests  [#'pull-test/force-push-loses-the-base-test #'branch-test/switch-to-a-base-that-no-branch-holds-test]}
   {:name   :held-only-by-the-ancestry
    :doc    "Version 3 of the model: a base is held only when it is in the history of the head. A switch to a branch
            whose head does not descend from the base then merges two ways, and gives conflicts."
    :target `pull/held?
    :edits  [[:replace '(some (fn [other]
                                (when-let [x (and (not= other branch) (store/head store other))]
                                  (store/ancestor? store b x)))
                              (store/branches store))
              false]]
    :tests  [#'branch-test/switch-merges-against-the-held-base-test #'status-test/base-held-test]}
   {:name   :held-when-not-fetched
    :doc    "The held check asks about a base that is not in the local object store, and throws."
    :target `pull/held?
    :edits  [[:replace '(readable? store b) true]]
    :tests  [#'status-test/base-held-test #'branch-test/switch-to-a-base-that-no-branch-holds-test]}
   {:name   :no-held-recheck
    :doc    "The apply does not check again that a branch holds the base that the plan merged against: after a force
            push of the old branch during a switch, the merge against a base that no branch holds commits."
    :target `pull/apply-merge!
    :edits  [[:replace '(or lost (nil? b) (held? store b branch now)) true]]
    :tests  [#'branch-test/base-rewritten-away-during-the-switch-test]}
   {:name   :held-recheck-for-a-lost-base
    :doc    "The first form of the check of the model (run v4d): the apply also checks the held base of a plan made with
            a lost base, so a pull after a force push aborts on every try."
    :target `pull/apply-merge!
    :edits  [[:replace '(or lost (nil? b) (held? store b branch now)) '(or (nil? b) (held? store b branch now))]]
    :tests  [#'pull-test/force-push-loses-the-base-test]}
   {:name   :no-on-commit
    :doc    "The apply does not call its commit hook: a switch that applies leaves the branch setting."
    :target `apply/apply-plan
    :edits  [[:replace '(on-commit) nil]]
    :tests  [#'branch-test/switch-commits-the-hook-with-the-apply-test #'operations-test/branch-operations-on-the-app-db-test]}
   {:name   :switch-writes-the-branch-on-failure
    :doc    "A switch writes the branch setting whatever its result: a failed switch changes the branch."
    :target `operations/switch-task!
    :edits  [[:replace '(not= :up-to-date result) '(do (write-branch! branch) (not= :up-to-date result))]]
    :tests  [#'operations-test/branch-operations-on-the-app-db-test]}
   {:name   :switch-at-the-base-writes-no-branch
    :doc    "A switch to a branch whose head is the base does not write the branch setting."
    :target `operations/switch-task!
    ;; the hook of the apply is a fn literal, so the one call that matches is the one in the commit of the task
    :edits  [[:remove '(write-branch! branch)]]
    :tests  [#'operations-test/branch-operations-on-the-app-db-test]}
   {:name   :switch-with-no-fence
    :doc    "The apply of a switch commits although its task ended."
    :target `operations/switch-task!
    :edits  [[:replace '(tasks/fence id) nil]]
    :tests  [#'operations-test/branch-operations-on-the-app-db-test]}
   {:name   :create-over-an-existing-branch
    :doc    "A branch creation moves a branch that exists."
    :target `branch/create-branch!
    :edits  [[:replace '(when h (store/head store branch-name)) nil]
             [:replace '(store/cas-ref! store branch-name nil h) '(store/cas-ref! store branch-name (store/head store branch-name) h)]]
    :tests  [#'branch-test/create-branch-test]}
   {:name   :create-with-no-commit-point
    :doc    "A branch creation does not ask its task whether it may change the remote."
    :target `branch/create-branch!
    ;; match 0 is the vector [commit-point] of the destructuring, which equals the list
    :edits  [[:replace '(commit-point) nil {:nth 1}]]
    :tests  [#'branch-test/create-branch-stops-at-its-commit-point-test]}
   {:name   :create-writes-no-branch
    :doc    "A branch creation leaves the branch setting."
    :target `operations/create-branch-task!
    :edits  [[:replace '(write-branch! branch-name) nil]]
    :tests  [#'operations-test/branch-operations-on-the-app-db-test]}
   {:name   :new-branch-records-no-branch
    :doc    "The record step of a push does not call its hook, so a push to a new branch leaves the branch setting."
    :target `push/commit!
    :edits  [[:replace '(on-record) nil]]
    :tests  [#'branch-test/push-to-a-new-branch-records-in-one-step-test #'operations-test/branch-operations-on-the-app-db-test]}
   {:name   :new-branch-records-on-a-moved-base
    :doc    "The record step calls its hook also when another task moved the base: the branch setting changes with no
            move of the base."
    :target `push/commit!
    :edits  [[:replace '{:result :base-moved :commit c :base (:moved set-base) :outcome (outcome branch c shadowed)}
              '(do (on-record)
                   {:result :base-moved :commit c :base (:moved set-base) :outcome (outcome branch c shadowed)})]]
    :tests  [#'branch-test/push-to-a-new-branch-records-in-one-step-test]}
   {:name   :new-branch-from-the-base-ref
    :doc    "A push to a new branch moves the new ref from the base, as a push to the branch of the base does."
    :target `push/commit!
    :edits  [[:replace '(when-not new-branch? b) 'b]]
    :tests  [#'branch-test/push-to-a-new-branch-test]}
   {:name   :new-branch-checks-no-branch
    :doc    "A push to a new branch does not check first that the branch is free. The compare-and-swap from no ref still
            refuses it, so no test can see it."
    :target `push/push!
    :edits  [[:replace '(and new-branch? h) false]]
    :expect :survived
    :tests  [#'branch-test/push-to-a-new-branch-that-exists-test]}
   {:name   :settings-change-the-branch
    :doc    "A save of the settings of a creation instance changes its branch with no switch."
    :target `repository/save-settings!
    :edits  [[:replace '(branch-change-refused? body (saved-values) (env-keys)) false]]
    :tests  [#'repository-test/save-refuses-a-change-of-the-branch-of-a-creation-instance-test]}
   {:name   :guard-ignores-the-repository
    :doc    "The guard refuses a branch of another repository, for which the instance has no base."
    :target `repository/branch-change-refused?
    :edits  [[:replace '(= url-new url-now) true]]
    :tests  [#'repository-test/branch-change-refused-examples-test]}
   {:name   :guard-ignores-the-type
    :doc    "The guard refuses a change of the branch of a consumption instance."
    :target `repository/branch-change-refused?
    :edits  [[:replace '(= :read-write type) true]]
    :tests  [#'repository-test/branch-change-refused-examples-test]}])

(deftest branch-mutations-test
  (mut/check mutations {:timeout-ms 180000}))
