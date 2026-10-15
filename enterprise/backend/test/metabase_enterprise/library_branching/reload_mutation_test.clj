(ns metabase-enterprise.library-branching.reload-mutation-test
  "Mutations of the rules of the reload order. Each mutation removes one rule, and a test must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.reload-test :as reload-test]
   [metabase-enterprise.library-branching.reload-test-util :as reload-test-util]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation removes one rule of the reload order."
  [{:name   :no-dependents
    :doc    "The order holds only the changed namespaces: their dependents keep the old protocol."
    :target `reload-test-util/reload-order
    :edits  [[:replace '(ns.deps/transitive-dependents-set graph changed) #{}]]
    :tests  [#'reload-test/reload-order-set-test]}
   {:name   :unloaded-dependents
    :doc    "The order also holds the dependents that are not loaded: a reload loads namespaces that no one asked for."
    :target `reload-test-util/reload-order
    :edits  [[:remove '(filter loaded?)]]
    :tests  [#'reload-test/reload-order-set-test]}
   {:name   :no-sort
    :doc    "The order is not sorted: a dependent can load before the protocol that it implements."
    :target `reload-test-util/reload-order
    :edits  [[:remove '(sort (ns.deps/topo-comparator graph))]]
    :tests  [#'reload-test/reload-order-dependencies-first-test]}])

(deftest reload-order-mutations-test
  (mut/check mutations {}))
