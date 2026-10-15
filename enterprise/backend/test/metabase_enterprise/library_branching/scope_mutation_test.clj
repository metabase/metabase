(ns metabase-enterprise.library-branching.scope-mutation-test
  "Mutations of the rules of scope. Each mutation removes or weakens one rule, and a test of scope must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.scope-property-test :as scope-property-test]
   [metabase-enterprise.library-branching.scope-test :as scope-test]))

(set! *warn-on-reflection* true)

(def mutations
  "Each mutation removes or weakens one rule of `scope`."
  [{:name   :collection-trash
    :doc    "A trashed collection stays in scope."
    :target [:method `scope/kind-query :collection]
    :edits  [[:remove '(unarchived :c.archived)]]}
   {:name   :card-trash
    :doc    "A trashed card stays in scope."
    :target `scope/card-query
    :edits  [[:remove '(unarchived :t.archived)]]}
   {:name   :snippet-trash
    :doc    "A trashed snippet stays in scope."
    :target [:method `scope/kind-query :snippet]
    :edits  [[:remove '(unarchived :t.archived)]]}
   {:name   :no-subtree
    :doc    "Only the Library collection itself is a root; its subtree is not in scope."
    :target `scope/in-tree
    :edits  [[:remove '[:like :c.location [:concat :r.location :r.id "/%"]]]]}
   {:name   :no-namespaces
    :doc    "The collections of the root namespaces are not in scope."
    :target `scope/in-namespaces
    :edits  [[:replace '[:in :c.namespace (mapv name (sort namespaces))] false]]}
   {:name   :no-root-level
    :doc    "No item at the root level of a namespace is in scope."
    :target `scope/root-level
    :edits  [[:replace 'condition false {:nth 1}]]}
   {:name   :any-root-level
    :doc    "The items at the root level are in scope also when their namespace is not a root."
    :target `scope/root-level
    :edits  [[:replace '(contains? namespaces (get root-level kind)) true]]}
   {:name   :card-anywhere
    :doc    "A card is in scope in any collection, not only in an in-scope one."
    :target `scope/card-query
    :edits  [[:remove '(in-scope roots :t.collection_id :collection)]]}
   {:name   :dashboard-anywhere
    :doc    "A dashboard is in scope in any collection."
    :target [:method `scope/kind-query :dashboard]
    :edits  [[:replace '(in-scope roots :t.collection_id :collection) true]]}
   {:name   :model-actions-at-root
    :doc    "An action of a model at the root level is in scope."
    :target [:method `scope/kind-query :action]
    :edits  [[:remove '[:= :t.model_id nil]]]}
   {:name   :unpublished-tables
    :doc    "A table in a Library collection is in scope also when it is not published."
    :target [:method `scope/kind-query :published-table]
    :edits  [[:remove '[:= :t.is_published true]]]}
   {:name   :built-in-tags
    :doc    "A built-in transform tag is in scope."
    :target [:method `scope/kind-query :transform-tag]
    :edits  [[:replace '[:= :t.built_in_type nil] true]]}
   {:name   :exploration-summaries
    :doc    "The summary document of an exploration is in scope."
    :target [:method `scope/kind-query :document]
    :edits  [[:remove '[:= :t.exploration_id nil]]]}
   {:name   :count-off-by-one
    :doc    "The count of a kind differs from the size of its scope."
    :target `scope/scope-count
    :edits  [[:edit '(library-branching.db/row-count (kind-query roots kind)) (fn [form] (list 'inc form))]]}])

(def ^:private tests
  [#'scope-test/library-tree-test
   #'scope-test/trash-test
   #'scope-test/outside-library-test
   #'scope-test/moved-out-of-library-test
   #'scope-test/namespace-roots-test
   #'scope-test/exploration-document-test
   #'scope-test/count-test
   #'scope-test/roots-test
   #'scope-property-test/scope-matches-reference-model-test])

(deftest scope-mutations-test
  (mut/check mutations {:tests tests :timeout-ms 120000}))

(deftest mutations-name-their-tests-test
  (testing "each mutation names the tests of its own rule"
    (is (every? (comp seq :tests) mutations)))
  (testing "no mutation runs the property test: it takes most of the time of a run, and kills no mutation that the
           tests of scope miss"
    (is (not-any? #(some #{#'scope-property-test/scope-matches-reference-model-test}
                         (:tests %))
                  mutations))))
