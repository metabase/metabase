(ns metabase-enterprise.library-branching.pull-mutation-test
  "Mutations of the rules of the apply, the pull and merge-branch. Each mutation removes or weakens one rule, as a
  mutation of the formal model does, and a test must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.apply :as apply]
   [metabase-enterprise.library-branching.apply-test :as apply-test]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.kinds.snippet :as kinds.snippet]
   [metabase-enterprise.library-branching.merge-branch :as merge-branch]
   [metabase-enterprise.library-branching.merge-branch-test :as merge-branch-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.pull-app-db-test :as pull-app-db-test]
   [metabase-enterprise.library-branching.pull-test :as pull-test]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(def mutations
  "Each mutation removes or weakens one rule of the apply, the pull or merge-branch."
  [{:name   :nowitness
    :doc    "The apply checks no precondition (the TLA+ mutation nowitness): a save between the read of the pull and the
            apply is written over."
    :target `apply/satisfied?
    :edits  [[:replace '(and (= :live state) (= pre content)) true]]
    :tests  [#'pull-test/save-between-read-and-apply-is-not-lost-test]}
   {:name   :firstpull-notrash
    :doc    "With no base, a write of an item with no base content also takes a trashed identity (the TLA+ mutation
            firstpull-notrash, run v4c): a create and a trash during the first pull is written over."
    :target `apply/satisfied?
    :edits  [[:replace '(and base? (= :trashed state)) '(= :trashed state)]]
    :tests  [#'pull-test/create-and-trash-during-a-first-pull-is-not-lost-test
             #'apply-test/step-preconditions-test]}
   {:name   :no-restore
    :doc    "A write of an item with no base content needs an absent item also with a base: a later head that holds a
            trashed item again cannot restore it."
    :target `apply/satisfied?
    :edits  [[:replace '(and base? (= :trashed state)) false]]
    :tests  [#'pull-test/removed-item-in-use-goes-to-the-trash-and-comes-back-test
             #'apply-test/step-preconditions-test]}
   {:name   :no-key-check
    :doc    "The apply does not check the unique keys of the written items (Alloy ApplyKeepsUniqueKeysFails): a new
            snippet takes the name of a snippet in the trash."
    :target `apply/apply-plan
    :edits  [[:replace '(key-clashes (:key-holders ops) plan) nil]]
    :tests  [#'apply-test/apply-keeps-unique-keys-fails-test
             #'apply-test/apply-keeps-unique-keys-test
             #'pull-test/pull-refuses-a-name-that-a-trashed-snippet-holds-test
             #'pull-app-db-test/pull-refuses-the-name-of-a-trashed-snippet-test]}
   {:name   :trash-frees-key
    :doc    "The key check takes a snippet that the plan trashes as free of its name, but the trash keeps the row and
            its name."
    :target `apply/key-clashes
    :edits  [[:replace '(into #{} (map :id) steps) '(into #{} (map :id) plan)]]
    :tests  [#'apply-test/apply-keeps-unique-keys-fails-test]}
   {:name   :raw-key-at-apply
    :doc    "The key check compares the key of a written item as it is, not in the compared form of validate: a new
            snippet named \"filter\" takes the key of \"Filter\" in the trash."
    :target `apply/key-clashes
    :edits  [[:replace '(snapshot/unique-key snapshot/unique-keys write) '(get-in write (get-in snapshot/unique-keys [kind :path]))]]
    :tests  [#'apply-test/apply-keeps-unique-keys-fails-test
             #'apply-test/apply-keeps-unique-keys-test]}
   {:name   :raw-snippet-key-holders
    :doc    "The snippet kind gives its key holders by their names as they are, so on an app DB that compares names
            exactly a new snippet takes the key of a trashed snippet whose name differs in case or accents."
    :target `kinds.snippet/snippet-key-holders
    :edits  [[:replace '(snapshot/unique-key snapshot/unique-keys {:kind :snippet :name name}) 'name]]
    :tests  [#'pull-app-db-test/pull-refuses-a-name-that-differs-only-in-case-or-accents-test]}
   {:name   :trash-of-a-system-item
    :doc    "The apply carries out a trash step of a system item."
    :target `apply/apply-plan
    :edits  [[:replace '(seq (system-trashes plan)) nil]]
    :tests  [#'apply-test/plan-never-trashes-a-system-item-test]}
   {:name   :forcepush-norecheck
    :doc    "The apply does not read the branch head again (the TLA+ mutation forcepush-norecheck): after a rewrite of
            the branch during the pull, a save of the base content is written over."
    :target `apply/apply-plan
    :edits  [[:replace '(head-ok?) true]]
    :tests  [#'pull-test/force-push-during-the-pull-aborts-the-apply-test]}
   {:name   :no-fence
    :doc    "The apply does not ask whether its task may commit: a cancelled task still writes."
    :target `apply/apply-plan
    :edits  [[:replace '(fence) nil]]
    :tests  [#'pull-test/fenced-apply-writes-nothing-test]}
   {:name   :trash-needs-content
    :doc    "A trash step needs its base content also when its item is already out of scope: the pull starts again for
            no reason."
    :target `apply/satisfied?
    :edits  [[:replace '(not= :live state) false]]
    :tests  [#'pull-test/trash-of-an-item-that-is-already-gone-test]}
   {:name   :rename-of-a-gone-trash
    :doc    "The apply keeps the rename of an item whose trash step it skips, because the item is already gone: the
            rename makes the item again."
    :target `apply/apply-plan
    :edits  [[:replace '(or (:trash %) (:interim %)) '(:trash %)]]
    :tests  [#'pull-test/rename-of-an-item-that-is-already-gone-test]}
   {:name   :pullnovalidate
    :doc    "The pull does not check the head at the structural level (the TLA+ mutation pullnovalidate): an ill-formed
            text merge is applied."
    :target `pull/check-commit
    :edits  [[:replace '(validate/validate s {:roots (roots/root-ids s)}) []]]
    :tests  [#'pull-test/pull-refuses-an-ill-formed-head-test]}
   {:name   :decisions-replace
    :doc    "A keep-mine decision replaces the decisions before it (the TLA+ liveness counterexample): two conflicts
            alternate forever."
    :target `pull/decide
    :edits  [[:replace '(conj (vec decisions) {:id id :content content :head head})
              '[{:id id :content content :head head}]]]
    :tests  [#'pull-test/decisions-against-one-head-accumulate-test]}
   {:name   :decision-any-head
    :doc    "A keep-mine decision holds for every head, also one that changed the item again."
    :target `pull/decisions-for
    :edits  [[:replace '(= head (:head d)) true]]
    :tests  [#'pull-test/decision-is-bound-to-content-and-head-test]}
   {:name   :decision-any-content
    :doc    "decisions-for does not compare the content of a decision with the local content. The merge compares them
            again, so no test can see it."
    :target `pull/decisions-for
    :edits  [[:replace '(= content (get local id)) true]]
    :expect :survived
    :tests  [#'pull-test/decision-is-bound-to-content-and-head-test]}
   {:name   :digests-of-merge
    :doc    "The base cache gets the digests of the merge result, not of the head: a kept local change shows as synced."
    :target `pull/apply-merge!
    :edits  [[:replace '(writer/item-digests codecs r) '(writer/item-digests codecs (:ok merged))]]
    :tests  [#'pull-test/pull-applies-the-remote-changes-and-keeps-the-local-ones-test]}
   {:name   :no-retry
    :doc    "The pull stops at the first stale precondition, and does not read the instance again."
    :target `pull/apply-merge!
    :edits  [[:replace '(and (:stale result) (< attempt retries)) false]]
    :tests  [#'pull-test/save-between-read-and-apply-is-not-lost-test]}
   {:name   :no-stub
    :doc    "A new item on a reference cycle is written with its whole content before the items that it refers to."
    :target `apply/run-steps!
    :edits  [[:replace '(stub (:kind write) id write defer) 'write]]
    :tests  [#'pull-app-db-test/snippets-on-a-reference-cycle-test]}
   {:name   :apply-commits-any-result
    :doc    "The app DB apply commits a result that is not :ok: the writes before a refused step stay."
    :target `app-db/apply-plan!
    :edits  [[:replace '(when-not (contains? r :ok) (throw (ex-info "The apply writes nothing." {::app-db/rollback true}))) nil]]
    :tests  [#'pull-app-db-test/refused-step-writes-nothing-test]}
   {:name   :repeatable-read
    :doc    "The apply keeps the isolation of its connection. At REPEATABLE READ (the default of MySQL and MariaDB) a read
            after a lock sees the snapshot of the first read of the transaction, and a save that committed after it is
            written over. The app DB data source opens connections at READ COMMITTED, so only the direct test of the
            isolation can see the mutation."
    :target `library-branching.db/do-in-locking-transaction
    :edits  [[:replace '(.setTransactionIsolation conn Connection/TRANSACTION_READ_COMMITTED) nil]]
    :tests  [#'pull-app-db-test/apply-transaction-reads-committed-rows-test
             #'pull-app-db-test/save-of-an-item-not-locked-yet-is-seen-test]}
   {:name   :merge-branch-force
    :doc    "Merge-branch moves the branch from whatever head it has (a force push): a push during the merge is lost."
    :target `merge-branch/merge-branch!
    :edits  [[:replace '(store/cas-ref! store into c1 c)
              '(let [r (store/cas-ref! store into c1 c)]
                 (if (map? r) (store/cas-ref! store into (:moved r) c) r))]]
    :tests  [#'merge-branch-test/merge-branch-moves-the-branch-only-from-its-head-test]}
   {:name   :merge-branch-no-check
    :doc    "Merge-branch does not check the merge result with the fixed roots."
    :target `merge-branch/merge-branch!
    :edits  [[:replace '(validate/validate m {:roots (roots/root-ids m)}) []]]
    :tests  [#'merge-branch-test/merge-branch-refuses-an-item-at-the-root-that-is-no-root-test]}
   {:name   :foreign-files-dropped
    :doc    "Merge-branch drops the files that sync does not own."
    :target `merge-branch/merge-foreign
    :edits  [[:replace '{:ok (into {} (filter second) results)} {:ok {}}]]
    :tests  [#'merge-branch-test/merge-branch-test]}
   {:name   :merge-branch-foreign-paths-not-taken
    :doc    "The layout of merge-branch does not know the paths of the merged foreign files, so an item whose path a
            foreign file holds takes no suffix, and its file overwrites the foreign file."
    :target `merge-branch/merge-branch!
    :edits  [[:replace '(set (keys kept)) #{}]]
    :tests  [#'merge-branch-test/merge-branch-keeps-a-foreign-file-at-the-path-of-an-item-test]}
   {:name   :merge-branch-no-foreign-guard
    :doc    "Merge-branch writes a file at the path of a foreign file that no suffix avoids."
    :target `merge-branch/merge-branch!
    :edits  [[:replace '(push/foreign-clashes kept written) []]]
    :tests  [#'merge-branch-test/merge-branch-never-overwrites-a-foreign-file-test]}])

(deftest pull-mutations-test
  (mut/check mutations {:timeout-ms 180000}))
