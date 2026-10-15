(ns metabase-enterprise.library-branching.pull-mutation-test
  "Mutations of the rules of the apply, the pull and merge-branch. Each mutation removes or weakens one rule, as a
  mutation of the formal model does, and a test must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.apply :as apply]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.merge-branch :as merge-branch]
   [metabase-enterprise.library-branching.merge-branch-test :as merge-branch-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.pull-app-db-test :as pull-app-db-test]
   [metabase-enterprise.library-branching.pull-test :as pull-test]
   [metabase.app-db.core :as mdb]))

(set! *warn-on-reflection* true)

(defn- repeatable-read-default?
  "True iff the app DB of this JVM reads at REPEATABLE READ by default."
  []
  (contains? #{:mysql} (mdb/db-type)))

(defn mutations
  "Each mutation removes or weakens one rule of the apply, the pull or merge-branch."
  []
  [{:name   :nowitness
    :doc    "The apply checks no precondition (the TLA+ mutation nowitness): a save between the read of the pull and the
            apply is written over."
    :target `apply/stale-ids
    :edits  [[:replace '(remove (fn [{:keys [id pre] :as step}] (= pre (current (step-kind step) id))))
              '(remove (constantly true))]]
    :tests  [#'pull-test/save-between-read-and-apply-is-not-lost-test]}
   {:name   :forcepush-norecheck
    :doc    "The apply does not read the branch head again (the TLA+ mutation forcepush-norecheck): after a rewrite of
            the branch during the pull, a save of the base content is written over."
    :target `apply/apply-plan
    :edits  [[:replace '(head-ok?) true]]
    :tests  [#'pull-test/force-push-during-the-pull-aborts-the-apply-test]}
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
   {:name   :no-base-lost
    :doc    "The pull makes a three-way merge from a base that is not in the history of the head (a force push): items
            that the instance did not change take the content of the rewritten head with no conflict."
    :target `pull/base-snapshot
    :edits  [[:replace '(not (store/ancestor? store b h)) false]]
    :tests  [#'pull-test/force-push-loses-the-base-test]}
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
    :doc    "The apply runs at the default isolation of the app DB. At REPEATABLE READ (MySQL, MariaDB) a read after a
            lock sees the snapshot of the first read of the transaction, and a save that committed after it is written
            over. Other app DBs read at READ COMMITTED by default, so the mutation survives there."
    :target `library-branching.db/do-in-locking-transaction
    :edits  [[:replace '(.setTransactionIsolation conn Connection/TRANSACTION_READ_COMMITTED) nil]]
    :expect (if (repeatable-read-default?) :killed :survived)
    :tests  [#'pull-app-db-test/save-of-an-item-not-locked-yet-is-seen-test]}
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
    :tests  [#'merge-branch-test/merge-branch-test]}])

(deftest pull-mutations-test
  (mut/check (mutations) {:timeout-ms 180000}))
