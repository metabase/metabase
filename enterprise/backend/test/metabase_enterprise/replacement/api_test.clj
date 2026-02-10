(ns metabase-enterprise.replacement.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.api :as replacement.api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
        (mt/with-temp [:model/Card card-a (card-with-query "Card A" :products)]
          (with-redefs [replacement.api/fetch-source
                        (fn [entity-type entity-id]
                          ;; Return different database-id values to trigger the mismatch
                          (if (= entity-id (:id card-a))
                            {:mp nil :source nil :database-id 1}
                            {:mp nil :source nil :database-id 999}))]
            (mt/with-temp [:model/Card card-b (card-with-query "Card B" :products)]
              (let [response (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                                   {:source_entity_id   (:id card-a)
                                                    :source_entity_type :card
                                                    :target_entity_id   (:id card-b)
                                                    :target_entity_type :card})]
                (is (false? (:success response)))
                (is (some #(= "database-mismatch" (:type %)) (:errors response)))))))))))

(deftest check-replace-source-requires-premium-feature-test
  (testing "POST /api/ee/replacement/check-replace-source — requires :dependencies premium feature"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :post 402 "ee/replacement/check-replace-source"
                            {:source_entity_id   1
                             :source_entity_type :card
                             :target_entity_id   2
                             :target_entity_type :card}))))

;;; ------------------------------------------------ replace-source ------------------------------------------------

(deftest replace-source-swaps-card-references-test
  (testing "POST /api/ee/replacement/replace-source — swaps child card references"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            ;; Use create-card! so that dependency events fire and seed the Dependency table
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (mt/user-http-request :crowberto :post 204 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id old-source)
                                     :source_entity_type :card
                                     :target_entity_id   (:id new-source)
                                     :target_entity_type :card})
              ;; The child card's query should now reference new-source
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                    source-card   (get-in updated-query [:stages 0 :source-card])]
                (is (= (:id new-source) source-card))))))))))

(deftest replace-source-requires-premium-feature-test
  (testing "POST /api/ee/replacement/replace-source — requires :dependencies premium feature"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :post 402 "ee/replacement/replace-source"
                            {:source_entity_id   1
                             :source_entity_type :card
                             :target_entity_id   2
                             :target_entity_type :card}))))
