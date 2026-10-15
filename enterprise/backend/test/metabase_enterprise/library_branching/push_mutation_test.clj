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
    :edits  [[:replace '(store/cas-ref! store branch b c)
              '(let [r (store/cas-ref! store branch b c)]
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
              '(instance/set-base! inst b c (writer/item-digests codecs (:snapshot (instance/read-snapshot inst))))]]}
   {:name   :no-validate
    :doc    "The push writes a snapshot with a structural finding, for example a reference to a trashed item."
    :target `push/push!
    :edits  [[:replace '(validate/validate s {:roots (roots/root-ids s)}) []]]}
   {:name   :every-file-foreign
    :doc    "The push keeps every file of the base tree: a file of a removed item, a moved file and the files of the
            old format stay."
    :target `push/foreign-files
    :edits  [[:replace '(claims/kept-files (claims/item-claims t)) 't]]}
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
   #'metabase-enterprise.library-branching.instance.base-test/set-base-is-a-compare-and-swap-test
   #'metabase-enterprise.library-branching.instance.base-test/concurrent-set-base-test
   #'metabase-enterprise.library-branching.push-app-db-test/push-refuses-a-library-metric-that-uses-a-trashed-metric-test
   #'metabase-enterprise.library-branching.push-app-db-test/save-during-push-of-the-app-db-test])

(deftest push-mutations-test
  (mut/check mutations {:tests tests :timeout-ms 180000}))
