(ns metabase-enterprise.library-branching.scope-mutation-test
  "Mutations of the rules of scope. Each mutation removes or weakens one rule, and one of the tests that it names must
  fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.instance.kinds-test :as kinds-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.scope-property-test :as scope-property-test]
   [metabase-enterprise.library-branching.scope-test :as scope-test]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

;; Each mutation names the tests of the rule that it removes. The property test of scope is in no list: it kills no
;; mutation that these tests miss, and it takes most of the time of a run.
(def mutations
  "Each mutation removes or weakens one rule of `scope`."
  [{:name   :collection-trash
    :doc    "A trashed collection stays in scope."
    :target [:method `scope/kind-query :collection]
    :edits  [[:remove '(unarchived :c.archived)]]
    :tests  [#'scope-test/trash-test
             #'scope-test/namespace-roots-test]}
   {:name   :card-trash
    :doc    "A trashed card stays in scope."
    :target `scope/card-query
    :edits  [[:remove '(unarchived :t.archived)]]
    :tests  [#'scope-test/trash-test]}
   {:name   :snippet-trash
    :doc    "A trashed snippet stays in scope."
    :target [:method `scope/kind-query :snippet]
    :edits  [[:remove '(unarchived :t.archived)]]
    :tests  [#'scope-test/namespace-roots-test]}
   {:name   :no-subtree
    :doc    "Only the Library collection itself is a root; its subtree is not in scope."
    :target `scope/in-tree
    :edits  [[:remove '[:like :c.location [:concat :r.location :r.id "/%"]]]]
    :tests  [#'scope-test/library-tree-test
             #'scope-test/moved-out-of-library-test]}
   {:name   :no-namespaces
    :doc    "The collections of the root namespaces are not in scope."
    :target `scope/in-namespaces
    :edits  [[:replace '[:in :c.namespace (mapv name (sort namespaces))] false]]
    :tests  [#'scope-test/namespace-roots-test
             #'scope-test/roots-test]}
   {:name   :no-root-level
    :doc    "No item at the root level of a namespace is in scope."
    :target `scope/root-level
    :edits  [[:replace 'condition false {:nth 1}]]
    :tests  [#'scope-test/namespace-roots-test
             #'scope-test/roots-test]}
   {:name   :any-root-level
    :doc    "The items at the root level are in scope also when their namespace is not a root."
    :target `scope/root-level
    :edits  [[:replace '(contains? namespaces (get root-level kind)) true]]
    :tests  [#'scope-test/roots-test]}
   {:name   :card-anywhere
    :doc    "A card is in scope in any collection, not only in an in-scope one."
    :target `scope/card-query
    :edits  [[:remove '(in-scope roots :t.collection_id :collection)]]
    :tests  [#'scope-test/outside-library-test]}
   {:name   :dashboard-anywhere
    :doc    "A dashboard or a timeline is in scope in any collection."
    :target `scope/collection-item-query
    :edits  [[:replace '(in-scope roots :t.collection_id :collection) true]]
    :tests  [#'scope-test/outside-library-test
             #'scope-test/timeline-test]}
   {:name   :collection-item-trash
    :doc    "A trashed dashboard or timeline stays in scope."
    :target `scope/collection-item-query
    :edits  [[:remove '(unarchived :t.archived)]]
    :tests  [#'scope-test/timeline-test]}
   {:name   :transform-test-anywhere
    :doc    "A transform test is in scope also when its transform is not."
    :target [:method `scope/kind-query :transform-test]
    :edits  [[:replace '(in-scope roots :t.transform_id :transform) true]]
    :tests  [#'scope-test/transform-test-test]}
   {:name   :archived-tables-leave
    :doc    "A published table that warehouse sync archives leaves scope, so a push deletes its publication."
    :target [:method `scope/kind-query :published-table]
    :edits  [[:edit '[:= :t.is_published true] (fn [form] [:and form [:= :t.archived_at nil]])]]
    :tests  [#'scope-test/archived-published-table-test]}
   {:name   :archived-table-new-key
    :doc    "The key of a table that warehouse sync archived is its new name, so the archive is a delete and a create."
    :target `library-branching.db/table-key
    :edits  [[:replace '(str/replace table archive-suffix "") 'table]]
    :tests  [#'kinds-test/archived-published-table-test]}
   {:name   :archived-table-shadowed
    :doc    "A later table with the name of an archived published table takes its key, so the item reads an unpublished
            table."
    :target `library-branching.db/key-row
    :edits  [[:remove '(comp not published? :is_published)]]
    :tests  [#'kinds-test/archived-published-table-test]}
   {:name   :archived-table-not-found
    :doc    "A lookup by natural key does not find a table that warehouse sync archived."
    :target `library-branching.db/table-named
    :edits  [[:remove '[:and [:not= archived-column nil] [:like name-column (str table "__mbarchiv__%")]]]]
    :tests  [#'kinds-test/archived-published-table-test]}
   {:name   :key-owner-ignored
    :doc    "A published table stays in scope when another published table owns its key, so scope counts two tables for
            one item of the snapshot, and a push drops the content of one of them."
    :target [:method `scope/kind-query :published-table]
    :edits  [[:remove '[:not (library-branching.db/shadowed-table :t :d)]]]
    :tests  [#'scope-test/archived-table-key-owner-test]}
   {:name   :newest-owns-key
    :doc    "The newest published table of a key owns it, also when it is archived and an older one is live."
    :target `library-branching.db/shadowed-table
    :edits  [[:replace '[:and [:not o-archived?] t-archived?] false]
             [:replace '[:or [:not o-archived?] t-archived?] true]]
    :tests  [#'scope-test/database-name-key-owner-test]}
   {:name   :archived-key-by-name
    :doc    "The key of an archived table is its new name when scope looks for its owner, so a live table of the same
            key does not take it out of scope."
    :target `library-branching.db/shadowed-table
    :edits  [[:replace '(table-key-name (tc :name) (tc :archived_at)) '(tc :name)]]
    :tests  [#'scope-test/archived-table-key-owner-test]}
   {:name   :database-id-in-key
    :doc    "Two tables of two databases with one name have different keys, so both are in scope for one item."
    :target `library-branching.db/shadowed-table
    :edits  [[:replace '(exact= :od.name (column d :name)) '[:= :o.db_id (tc :db_id)]]]
    :tests  [#'scope-test/database-name-key-owner-test]}
   {:name   :shadowed-tables-unnamed
    :doc    "Scope names every published table as left out, not only the tables whose key another table owns."
    :target `scope/shadowed-tables
    :edits  [[:remove '(library-branching.db/shadowed-table :t :d)]]
    :tests  [#'scope-test/archived-table-key-owner-test]}
   {:name   :model-actions-at-root
    :doc    "An action of a model at the root level is in scope."
    :target [:method `scope/kind-query :action]
    :edits  [[:remove '[:= :t.model_id nil]]]
    :tests  [#'scope-test/namespace-roots-test]}
   {:name   :unpublished-tables
    :doc    "A table in a Library collection is in scope also when it is not published."
    :target [:method `scope/kind-query :published-table]
    :edits  [[:remove '[:= :t.is_published true]]]
    :tests  [#'scope-test/outside-library-test]}
   {:name   :built-in-tags
    :doc    "A built-in transform tag is in scope."
    :target [:method `scope/kind-query :transform-tag]
    :edits  [[:replace '[:= :t.built_in_type nil] true]]
    :tests  [#'scope-test/namespace-roots-test]}
   {:name   :exploration-summaries
    :doc    "The summary document of an exploration is in scope."
    :target [:method `scope/kind-query :document]
    :edits  [[:remove '[:= :t.exploration_id nil]]]
    :tests  [#'scope-test/exploration-document-test]}
   {:name   :no-glossary
    :doc    "No glossary term is in scope, so a push leaves the glossary out."
    :target `scope/unplaced
    :edits  [[:replace '(contains? unplaced-kinds kind) false]]
    :tests  [#'scope-test/glossary-test]}
   {:name   :count-off-by-one
    :doc    "The count of a kind differs from the size of its scope."
    :target `scope/scope-count
    :edits  [[:edit '(library-branching.db/row-count (kind-query roots kind)) (fn [form] (list 'inc form))]]
    :tests  [#'scope-test/count-test
             #'scope-test/roots-test]}])

(deftest scope-mutations-test
  (mut/check mutations {}))

(deftest mutations-name-their-tests-test
  (testing "each mutation names the tests of its own rule"
    (is (every? (comp seq :tests) mutations)))
  (testing "no mutation runs the property test: it takes most of the time of a run, and kills no mutation that the
           tests of scope miss"
    (is (not-any? #(some #{#'scope-property-test/scope-matches-reference-model-test}
                         (:tests %))
                  mutations))))
