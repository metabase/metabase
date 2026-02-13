(ns metabase-enterprise.replacement.usages-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

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
                  found-usages (usages/usages [:card (:id source-card)])]
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
                  found-usages     (usages/usages [:card (:id source-card)])]
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
                  found-usages (usages/usages [:card (:id lonely-card)])]
              (is (empty? found-usages)
                  "Card with no dependents should have empty usages"))))))))

(deftest usages-returns-table-dependents-test
  (testing "usages returns cards that depend on a table"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "usages-table@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [card-on-table (card/create-card! (card-with-query "Card on products" :products) user)
                  found-usages  (usages/usages [:table (mt/id :products)])]
              (is (some #(= [:card (:id card-on-table)] %) found-usages)
                  "Card using table should appear in usages"))))))))
