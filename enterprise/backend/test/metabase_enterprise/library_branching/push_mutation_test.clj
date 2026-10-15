(ns metabase-enterprise.library-branching.push-mutation-test
  "Mutations of the rules of the push and of the base row. Each mutation removes or weakens one rule, as a mutation of
  the formal model does, and a test of the push or of the base must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.base-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.push-app-db-test]
   [metabase-enterprise.library-branching.push-test]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation removes or weakens one rule of the push or of the base row."
  [{:name   :no-compare-and-swap
    :doc    "The push moves the branch from whatever head the remote has when it writes (a force push), not only from
            the base: a commit of someone else that lands during the push is written over."
    :target `push/commit!
    :edits  [[:replace '(store/cas-ref! store branch (when-not new-branch? b) c)
              '(let [r (store/cas-ref! store branch (when-not new-branch? b) c)]
                 (if (map? r) (store/cas-ref! store branch (:moved r) c) r))]]}
   {:name   :no-head-check
    :doc    "The push does not refuse at once a branch that is not at the base. The compare-and-swap still refuses it,
            with the same result, so no test can see it: the head check only saves the read and the commit."
    :target `push/push!
    :edits  [[:replace '(not= b h) false]]
    :expect :survived}
   {:name   :cachereread
    :doc    "After the push, the digests of the base come from a new read of the instance (the TLA+ mutation
            cachereread): a save during the push shows as synced, and the next push has nothing to push."
    :target `push/commit!
    :edits  [[:replace '(instance/set-base! inst b c digests)
              '(instance/set-base! inst b c (writer/item-digests kinds/codecs (:snapshot (instance/read-snapshot inst))))]]}
   {:name   :no-validate
    :doc    "The push writes a snapshot with a structural finding, for example a reference to a trashed item."
    :target `push/push!
    :edits  [[:replace '(validate/validate s {:roots (roots/root-ids s)}) []]]}
   {:name   :every-file-foreign
    :doc    "The push keeps every file of the base tree: a file of a removed item, a moved file and the files of the
            old format stay."
    :target `push/foreign-files
    :edits  [[:replace '(claims/kept-files (claims/item-claims t)) 't]]}
   {:name   :no-commit-point
    :doc    "The push does not move its task to committing before its remote compare-and-swap (the TLA+ mutation
            nocommitpoint): a push whose task an admin cancelled still lands."
    :target `push/commit!
    :edits  [[:replace '(tasks/mark-committing! task) :ok]]}
   {:name   :nocas
    :doc    "The record step moves the base from the base that it reads at that moment, not from the base that the push
            read (the TLA+ mutation nocas): a paused push that wakes up moves the base back."
    :target `push/commit!
    :edits  [[:replace '(instance/set-base! inst b c digests) '(instance/set-base! inst (instance/base inst) c digests)]]}
   {:name   :remote-refusal-interrupts
    :doc    "A push whose remote compare-and-swap refused ends its task as interrupted (the push may have landed), not
            as failed: the task record is not truthful."
    :target `push/commit!
    :edits  [[:replace '(tasks/fail-committing! task (remote-moved-message branch))
              '(tasks/fail! task (remote-moved-message branch))]]}
   {:name   :no-record-step
    :doc    "The push moves the base outside the record step of its task, so the task stays committing after the
            push landed."
    :target `push/commit!
    :edits  [[:replace '(tasks/record! task record) '(record)]]}
   {:name   :foreign-paths-not-taken
    :doc    "The layout of a push does not know the paths of the foreign files of the base tree, so an item whose path
            a foreign file holds takes no suffix."
    :target `push/tree
    :edits  [[:replace '(set (keys kept)) #{}]]}
   {:name   :no-foreign-guard
    :doc    "The push writes a file at the path of a foreign file that no suffix avoids: it overwrites the foreign
            file."
    :target `push/tree
    :edits  [[:replace '(foreign-clashes kept written) []]]}
   {:name   :base-not-compared
    :doc    "set-base! moves the base row whatever its commit id is."
    :target `library-branching.db/compare-and-set-base!
    :edits  [[:replace '(if expected
                          [:and (url-is url) [:= :commit_id [:auto/param expected]]]
                          [:or [:= :commit_id nil] (url-is-not url)]) true]]}])

(def ^:private tests
  [#'metabase-enterprise.library-branching.push-test/first-push-writes-the-snapshot-test
   #'metabase-enterprise.library-branching.push-test/push-writes-every-local-change-test
   #'metabase-enterprise.library-branching.push-test/nothing-to-push-test
   #'metabase-enterprise.library-branching.push-test/moved-remote-refuses-test
   #'metabase-enterprise.library-branching.push-test/remote-that-moves-during-the-push-refuses-test
   #'metabase-enterprise.library-branching.push-test/save-during-push-stays-a-local-change-test
   #'metabase-enterprise.library-branching.push-test/crash-between-branch-and-base-test
   #'metabase-enterprise.library-branching.push-test/push-refuses-a-reference-to-an-item-out-of-scope-test
   #'metabase-enterprise.library-branching.push-test/push-refuses-an-item-at-the-root-that-is-no-root-test
   #'metabase-enterprise.library-branching.push-test/foreign-files-stay-and-moved-files-go-back-test
   #'metabase-enterprise.library-branching.push-test/first-push-to-an-old-format-tree-test
   #'metabase-enterprise.library-branching.push-test/foreign-file-at-the-path-of-an-item-stays-test
   #'metabase-enterprise.library-branching.push-test/foreign-file-at-the-suffixed-path-too-test
   #'metabase-enterprise.library-branching.push-test/foreign-file-where-a-directory-of-an-item-is-test
   #'metabase-enterprise.library-branching.push-test/push-never-overwrites-a-foreign-file-test
   #'metabase-enterprise.library-branching.push-test/files-that-sync-does-not-own-stay-in-the-directory-of-an-item-test
   #'metabase-enterprise.library-branching.push-test/push-ends-its-task-past-the-commit-point-test
   #'metabase-enterprise.library-branching.push-test/cancel-before-the-commit-point-stops-the-push-test
   #'metabase-enterprise.library-branching.push-test/cancel-after-the-commit-point-is-refused-test
   #'metabase-enterprise.library-branching.push-test/remote-refusal-after-the-commit-point-fails-the-task-test
   #'metabase-enterprise.library-branching.push-test/paused-push-cannot-move-the-base-back-test
   #'metabase-enterprise.library-branching.instance.base-test/set-base-is-a-compare-and-swap-test
   #'metabase-enterprise.library-branching.instance.base-test/concurrent-set-base-test
   #'metabase-enterprise.library-branching.push-app-db-test/push-refuses-a-library-metric-that-uses-a-trashed-metric-test
   #'metabase-enterprise.library-branching.push-app-db-test/push-refuses-a-reference-out-of-the-library-test
   #'metabase-enterprise.library-branching.push-app-db-test/save-during-push-of-the-app-db-test
   #'metabase-enterprise.library-branching.push-app-db-test/paused-push-cannot-move-the-base-row-back-test])

(deftest push-mutations-test
  (mut/check mutations {:tests tests :timeout-ms 180000}))
