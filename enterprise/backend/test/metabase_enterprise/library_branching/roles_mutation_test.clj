(ns metabase-enterprise.library-branching.roles-mutation-test
  "Mutations of the rules of the instance roles, the boot checks and the discard of drift. Each mutation removes or
  weakens one rule, as a mutation of the formal model does, and a test must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.deploy :as deploy]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.roles-operations-test :as roles-operations-test]
   [metabase-enterprise.library-branching.roles-test :as roles-test]
   [metabase-enterprise.library-branching.status :as status]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(def mutations
  "Each mutation removes or weakens one rule of the instance roles."
  [{:name   :switch-ignores-drift
    :doc    "A switch of a creation instance to read-only does not check its local changes: the next deploy stops on
            them, or an admin's discard loses them (M12-028)."
    :target `repository/save-settings!
    :edits  [[:replace '(switches-to-read-only? body (saved-values) (env-keys)) false]]
    :tests  [#'roles-operations-test/switch-to-read-only-refuses-local-changes-test]}
   {:name   :boot-ignores-drift
    :doc    "A consumption instance with drift starts with no choice of the admin (M9-011)."
    :target `operations/check-boot!
    :edits  [[:replace '(seq (boot-drift (instance) branch)) nil]]
    :tests  [#'roles-operations-test/boot-of-a-consumption-instance-with-drift-test]}
   {:name   :boot-ignores-no-branch
    :doc    "A consumption instance with a repository and no branch starts (M9-010)."
    :target `operations/check-boot!
    :edits  [[:negate 'branch {:nth 1}]]
    :tests  [#'roles-operations-test/boot-of-a-consumption-instance-with-no-branch-test]}
   {:name   :boot-does-not-discard
    :doc    "With MB_REMOTE_SYNC_ALLOW=overwrite-unpublished, the boot deploy does not discard the drift, so the instance
            stays on its drift."
    :target `operations/start-initial-deploy!
    :edits  [[:replace '(boolean discard?) false]]
    :tests  [#'roles-operations-test/boot-of-a-consumption-instance-with-drift-test]}
   {:name   :discard-at-the-base-is-up-to-date
    :doc    "A discard when the head is the base does nothing: the admin cannot discard drift until main moves."
    :target `deploy/deploy!
    :edits  [[:replace '(and (= b h) (not discard-drift?)) '(= b h)]]
    :tests  [#'roles-test/discard-with-the-head-at-the-base-restores-the-base-test]}
   {:name   :discard-keeps-the-name
    :doc    "A discard trashes a snippet of the drift with its name, which the head gives to a snippet of another
            identity: the trash keeps the name, so the discard never reaches the head."
    :target `plan/plan
    :edits  [[:replace '(trash-renames unique-keys l m removed written) []]]
    :tests  [#'roles-test/discard-frees-the-name-of-a-drift-snippet-test
             #'roles-operations-test/discard-frees-the-name-of-a-drift-snippet-test]}
   {:name   :drift-trusts-equal-digests-of-nothing
    :doc    "The drift before a deploy is empty whenever the instance has a base: the boot and the role switch miss it."
    :target `deploy/instance-drift
    :edits  [[:replace '(= digests (writer/item-digests codecs l)) true]]
    :tests  [#'roles-test/instance-drift-test]}
   {:name   :no-base-drift-against-the-instance
    :doc    "With no base, the drift is against the instance itself, not the head: it is always empty."
    :target `deploy/instance-drift
    :edits  [[:replace '(head-snapshot s codecs (pull/decode-opts inst) branch) 'l]]
    :tests  [#'roles-test/instance-drift-test]}
   {:name   :status-shows-no-drift
    :doc    "The status of a consumption instance does not list its drift (M9-006)."
    :target `status/status
    :edits  [[:replace '(deploy/drift inst store codecs b l (:snapshot checked)) []]]
    :tests  [#'roles-test/status-of-a-consumption-instance-reports-drift-test]}])

(deftest roles-mutations-test
  (mut/check mutations {:timeout-ms 180000}))
