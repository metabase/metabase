(ns metabase-enterprise.replacement.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]))

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

;;; ------------------------------------------------ check-replace-source ------------------------------------------------

(deftest check-replace-source-compatible-test
  (testing "POST /api/ee/replacement/check-replace-source — compatible cards on the same table"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card card-a (card-with-query "Card A" :products)
                       :model/Card card-b (card-with-query "Card B" :products)]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                               {:source_entity_id   (:id card-a)
                                                :source_entity_type :card
                                                :target_entity_id   (:id card-b)
                                                :target_entity_type :card})]
            (is (true? (:success response)))
            (is (empty? (:errors response)))))))))

(deftest check-replace-source-incompatible-test
  (testing "POST /api/ee/replacement/check-replace-source — incompatible cards (different tables)"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card card-a (card-with-query "Products card" :products)
                       :model/Card card-b (card-with-query "Orders card" :orders)]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                               {:source_entity_id   (:id card-a)
                                                :source_entity_type :card
                                                :target_entity_id   (:id card-b)
                                                :target_entity_type :card})]
            (is (false? (:success response)))
            (is (some #(= "column-mismatch" (:type %)) (:errors response)))))))))

(deftest check-replace-source-database-mismatch-test
  (testing "POST /api/ee/replacement/check-replace-source — database mismatch short-circuits"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Database other-db {:engine  :h2
                                                 :details (:details (mt/db))}
                       :model/Card card-a (card-with-query "Card A" :products)
                       :model/Card card-b {:name                   "Card B"
                                           :database_id            (:id other-db)
                                           :type                   :question
                                           :dataset_query          {:database (:id other-db)
                                                                    :type     :native
                                                                    :native   {:query "SELECT 1"}}
                                           :visualization_settings {}}]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                               {:source_entity_id   (:id card-a)
                                                :source_entity_type :card
                                                :target_entity_id   (:id card-b)
                                                :target_entity_type :card})]
            (is (false? (:success response)))
            (is (some #(= "database-mismatch" (:type %)) (:errors response)))))))))

(deftest check-replace-source-requires-premium-feature-test
  (testing "POST /api/ee/replacement/check-replace-source — requires :dependencies premium feature"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :post 402 "ee/replacement/check-replace-source"
                            {:source_entity_id   1
                             :source_entity_type :card
                             :target_entity_id   2
                             :target_entity_type :card}))))

;;; ------------------------------------------------ replace-source ------------------------------------------------

(deftest replace-source-returns-204-test
  (testing "POST /api/ee/replacement/replace-source — returns 204 on success"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  _child     (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (mt/user-http-request :crowberto :post 204 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id old-source)
                                     :source_entity_type :card
                                     :target_entity_id   (:id new-source)
                                     :target_entity_type :card}))))))))

(deftest replace-source-incompatible-returns-400-test
  (testing "POST /api/ee/replacement/replace-source — incompatible sources return 400"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-incompat@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Products card" :products) user)
                  new-source (card/create-card! (card-with-query "Orders card" :orders) user)]
              (mt/user-http-request :crowberto :post 400 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id old-source)
                                     :source_entity_type :card
                                     :target_entity_id   (:id new-source)
                                     :target_entity_type :card}))))))))

(deftest replace-source-database-mismatch-returns-400-test
  (testing "POST /api/ee/replacement/replace-source — database mismatch returns 400"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Database other-db {:engine  :h2
                                                 :details (:details (mt/db))}
                       :model/Card card-a (card-with-query "Card A" :products)
                       :model/Card card-b {:name                   "Card B"
                                           :database_id            (:id other-db)
                                           :type                   :question
                                           :dataset_query          {:database (:id other-db)
                                                                    :type     :native
                                                                    :native   {:query "SELECT 1"}}
                                           :visualization_settings {}}]
          (mt/user-http-request :crowberto :post 400 "ee/replacement/replace-source"
                                {:source_entity_id   (:id card-a)
                                 :source_entity_type :card
                                 :target_entity_id   (:id card-b)
                                 :target_entity_type :card}))))))

(deftest replace-source-requires-premium-feature-test
  (testing "POST /api/ee/replacement/replace-source — requires :dependencies premium feature"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :post 402 "ee/replacement/replace-source"
                            {:source_entity_id   1
                             :source_entity_type :card
                             :target_entity_id   2
                             :target_entity_type :card}))))
