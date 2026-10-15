(ns metabase-enterprise.library-branching.gates-mutation-test
  "Mutations of the rules of the edit gates. Each mutation removes or weakens one rule, and a test must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.gates :as gates]
   [metabase-enterprise.library-branching.gates-test :as gates-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(def mutations
  "Each mutation removes or weakens one rule of the edit gates."
  [{:name   :creation-instance-gated
    :doc    "The gates do not ask for the role: a creation instance refuses edits of the Library."
    :target `gates/consumption-instance?
    :edits  [[:replace '(not (repository/read-write?)) true]]
    :tests  [#'gates-test/library-content-is-read-only-on-a-consumption-instance-test]}
   {:name   :no-repository-gated
    :doc    "The gates do not ask for a repository URL: an instance that syncs with no repository refuses edits."
    :target `gates/consumption-instance?
    :edits  [[:replace '(repository/configured?) true]]
    :tests  [#'gates-test/model-editable-hooks-test]}
   {:name   :every-collection-gated
    :doc    "The collection gate does not ask the scope function: content outside the Library is read-only too."
    :target `gates/collection-editable?
    :edits  [[:replace '(scope/row-in-scope? :collection (row-id collection)) true]]
    :tests  [#'gates-test/library-content-is-read-only-on-a-consumption-instance-test]}
   {:name   :every-published-table-gated
    :doc    "The table gate does not ask the scope function: a table published outside the Library is read-only."
    :target `gates/table-editable?
    :edits  [[:replace '(scope/row-in-scope? :published-table (row-id table)) true]]
    :tests  [#'gates-test/published-table-is-read-only-on-a-consumption-instance-test]}
   {:name   :row-by-place
    :doc    "The gate of an existing row asks for its place, not for the row: a trashed snippet stays read-only."
    :target `gates/synced?
    :edits  [[:replace '(scope/row-in-scope? kind id) '(scope/place-in-scope? kind (:collection_id instance))]]
    :tests  [#'gates-test/batch-of-snippets-test]}
   {:name   :transforms-never-gated
    :doc    "A consumption instance takes edits of transforms."
    :target `gates/transforms-editable?
    :edits  [[:replace '(not (consumption-instance?)) true]]
    :tests  [#'gates-test/transforms-are-read-only-on-a-consumption-instance-test]}])

(deftest gates-mutations-test
  (mut/check mutations {:timeout-ms 300000}))
