(ns metabase-enterprise.replacement.usages-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.graph.core :as graph]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

;;; ------------------------------------------------ In-memory graph helpers ------------------------------------------------

(defn- deps->adjacency-map
  "Convert a seq of dependency edges into an adjacency map for the dependents graph.

   Each edge is `[from-entity to-entity]` meaning `from-entity` depends on `to-entity`.
   For the dependents graph, we want `to-entity -> #{from-entity}` (who depends on me?).

   Example:
     (deps->adjacency-map [[[:card 2] [:card 1]]     ; card 2 depends on card 1
                           [[:card 3] [:card 2]]     ; card 3 depends on card 2
                           [[:dashboard 1] [:card 3]]]) ; dashboard 1 depends on card 3
     => {[:card 1] #{[:card 2]}
         [:card 2] #{[:card 3]}
         [:card 3] #{[:dashboard 1]}}"
  [edges]
  (reduce (fn [acc [from to]]
            (update acc to (fnil conj #{}) from))
          {}
          edges))

(defn- test-graph
  "Create an in-memory dependency graph from a seq of edges.

   Each edge is `[dependent dependency]` - meaning the first entity depends on the second.
   Returns a graph suitable for passing to `usages/transitive-usages`."
  [edges]
  (graph/in-memory (deps->adjacency-map edges)))

;;; ------------------------------------------------ Database-backed test helpers ------------------------------------------------

(defn- card-with-query
  "Create a card map for the given table keyword."
  [card-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
     :visualization_settings {}}))

(defn- card-sourced-from
  "Create a card map whose query sources `inner-card`."
  [card-name inner-card]
  (let [mp        (mt/metadata-provider)
        card-meta (lib.metadata/card mp (:id inner-card))]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp card-meta)
     :visualization_settings {}}))

(deftest usages-returns-dependent-cards-test
  (testing "usages returns cards that depend on a source card"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "usages-test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [source-card (card/create-card! (card-with-query "Source card" :products) user)
                  child-card  (card/create-card! (card-sourced-from "Child card" source-card) user)
                  found-usages (usages/transitive-usages [:card (:id source-card)])]
              (is (some #(= [:card (:id child-card)] %) found-usages)
                  "Child card should appear in usages"))))))))

(deftest usages-returns-transitive-dependents-test
  (testing "usages returns transitive dependents (grandchildren)"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "usages-transitive@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [source-card      (card/create-card! (card-with-query "Source card" :products) user)
                  child-card       (card/create-card! (card-sourced-from "Child card" source-card) user)
                  grandchild-card  (card/create-card! (card-sourced-from "Grandchild card" child-card) user)
                  found-usages     (usages/transitive-usages [:card (:id source-card)])]
              (is (some #(= [:card (:id child-card)] %) found-usages)
                  "Child card should appear in usages")
              (is (some #(= [:card (:id grandchild-card)] %) found-usages)
                  "Grandchild card should appear in usages"))))))))

(deftest usages-returns-empty-for-no-dependents-test
  (testing "usages returns empty seq for cards with no dependents"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "usages-empty@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [lonely-card  (card/create-card! (card-with-query "Lonely card" :products) user)
                  found-usages (usages/transitive-usages [:card (:id lonely-card)])]
              (is (empty? found-usages)
                  "Card with no dependents should have empty usages"))))))))

(deftest usages-returns-table-dependents-test
  (testing "usages returns cards that depend on a table"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "usages-table@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [card-on-table (card/create-card! (card-with-query "Card on products" :products) user)
                  found-usages  (usages/transitive-usages [:table (mt/id :products)])]
              (is (some #(= [:card (:id card-on-table)] %) found-usages)
                  "Card using table should appear in usages"))))))))

;;; ------------------------------------------------ In-memory graph tests ------------------------------------------------
;; These tests use an in-memory dependency graph, avoiding database transactions and event publishing.

(deftest ^:parallel transitive-usages-includes-dashboards-test
  (testing "transitive-usages returns dashboards that contain transitive dependent cards"
    ;; Graph: Table 1 <- Card A <- Card B <- Card C <- Dashboard D
    (let [graph (test-graph [[[:card 1] [:table 1]]       ; card 1 depends on table 1
                             [[:card 2] [:card 1]]        ; card 2 depends on card 1
                             [[:card 3] [:card 2]]        ; card 3 depends on card 2
                             [[:dashboard 1] [:card 3]]]) ; dashboard 1 depends on card 3
          found-usages (set (usages/transitive-usages graph [:table 1]))]
      (testing "Card A (direct dependent of table) is included"
        (is (contains? found-usages [:card 1])))
      (testing "Card B (depends on Card A) is included"
        (is (contains? found-usages [:card 2])))
      (testing "Card C (depends on Card B) is included"
        (is (contains? found-usages [:card 3])))
      (testing "Dashboard D (contains Card C) is included"
        (is (contains? found-usages [:dashboard 1]))))))

(deftest ^:parallel transitive-usages-includes-dashboards-from-card-source-test
  (testing "transitive-usages from a card source includes dashboards containing transitive dependents"
    ;; Graph: Card A <- Card B <- Card C <- Dashboard D
    (let [graph (test-graph [[[:card 2] [:card 1]]        ; card 2 depends on card 1
                             [[:card 3] [:card 2]]        ; card 3 depends on card 2
                             [[:dashboard 1] [:card 3]]]) ; dashboard 1 depends on card 3
          found-usages (set (usages/transitive-usages graph [:card 1]))]
      (testing "Card B (depends on Card A) is included"
        (is (contains? found-usages [:card 2])))
      (testing "Card C (depends on Card B) is included"
        (is (contains? found-usages [:card 3])))
      (testing "Dashboard D (contains Card C) is included"
        (is (contains? found-usages [:dashboard 1]))))))

(deftest ^:parallel transitive-usages-dashboard-not-included-if-only-contains-unrelated-cards-test
  (testing "transitive-usages does NOT include dashboards that only contain unrelated cards"
    ;; Graph: Card A depends on nothing relevant, Dashboard D contains unrelated Card X
    (let [graph (test-graph [[[:card 2] [:table 2]]       ; unrelated card depends on table 2
                             [[:dashboard 1] [:card 2]]]) ; dashboard depends on unrelated card
          found-usages (set (usages/transitive-usages graph [:card 1]))]
      (testing "Dashboard is NOT in the transitive usages since it doesn't contain dependent cards"
        (is (not (contains? found-usages [:dashboard 1])))))))
