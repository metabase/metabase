(ns metabase-enterprise.dependencies.api-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]))

(defn card-with-query
  "Create a card map with the given name and dataset query."
  [card-name dataset-query]
  {:name card-name
   :database_id (mt/id)
   :display :table
   :query_type :query
   :type :question
   :dataset_query dataset-query
   :visualization_settings {}})

(defn basic-card
  "Construct a basic card for dependency testing."
  ([]
   (basic-card "Test card"))
  ([card-name]
   (basic-card card-name :orders))
  ([card-name table-keyword]
   (let [mp (mt/metadata-provider)]
     (card-with-query card-name (lib/query mp (lib.metadata/table mp (mt/id table-keyword)))))))

(defn wrap-card
  "Construct a card depending on `inner-card` for dependency testing."
  [inner-card]
  (let [mp (mt/metadata-provider)
        card-meta (lib.metadata/card mp (:id inner-card))]
    (card-with-query "Downstream card" (lib/query mp card-meta))))

(deftest check-card-test
  (testing "POST /api/ee/dependencies/check_card"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "me@wherever.com"}]
        (mt/with-model-cleanup [:model/Card]
          (let [card (card/create-card! (basic-card) user)
                response (mt/user-http-request :rasta :post 200 "ee/dependencies/check_card"
                                               (assoc (card/create-card! (basic-card "Product question" :products)
                                                                         user)
                                                      :id (:id card)))]
            (is (= {:bad_cards [], :bad_transforms [], :success true}
                   response))))))))

(deftest check-card-removing-column-breaks-downstream-test
  (testing "POST /api/ee/dependencies/check_card detects when removing a column breaks downstream cards"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "test@test.com"}]
          (mt/with-model-cleanup [:model/Card]
            (let [mp (mt/metadata-provider)
                  ;; Create base card querying real orders table
                  base-card (card/create-card! (basic-card) user)
                  ;; Create dependent card that filters on TOTAL
                  base-card-meta (lib.metadata/card mp (:id base-card))
                  dependent-query (let [q (lib/query mp base-card-meta)
                                        cols (lib/filterable-columns q)
                                        total-col (m/find-first #(= (:id %) (mt/id :orders :total)) cols)]
                                    (lib/filter q (lib/> total-col 100)))
                  dependent-card (card/create-card!
                                  (card-with-query "Dependent Card filtering on Total" dependent-query)
                                  user)
                  ;; Propose changing to products table (doesn't have TOTAL column, breaks downstream)
                  proposed-query (lib/query mp (lib.metadata/table mp (mt/id :products)))
                  proposed-card {:id (:id base-card)
                                 :type :question
                                 :dataset_query proposed-query
                                 :result_metadata nil}
                  response (mt/user-http-request :rasta :post 200 "ee/dependencies/check_card" proposed-card)]
              (is (=? {:success false
                       :bad_cards [{:id (:id dependent-card)}]
                       :bad_transforms []}
                      response)))))))))

(deftest check-card-renaming-expression-breaks-downstream-test
  (testing "POST /api/ee/dependencies/check_card detects when renaming an expression breaks downstream cards"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "test@test.com"}]
          (mt/with-model-cleanup [:model/Card]
            (let [mp (mt/metadata-provider)
                  orders-query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                  base-query (-> orders-query
                                 (lib/expression "Tax Rate"
                                                 (lib// (lib.metadata/field mp (mt/id :orders :tax))
                                                        (lib.metadata/field mp (mt/id :orders :subtotal)))))
                  base-card (card/create-card!
                             (card-with-query "Base Card with Tax Rate" base-query)
                             user)
                  dependent-query (let [q (lib/query mp (lib.metadata/card mp (:id base-card)))
                                        cols (lib/filterable-columns q)
                                        tax-rate-col (m/find-first #(= (:lib/deduplicated-name %) "Tax Rate") cols)]
                                    (lib/filter q (lib/> tax-rate-col 0.06)))
                  dependent-card (card/create-card!
                                  (card-with-query "Dependent Card filtering on Tax Rate" dependent-query)
                                  user)
                  ;; renaming "Tax Rate" to "Sales Tax" should break downstream reference
                  proposed-query (-> orders-query
                                     (lib/expression "Sales Tax"
                                                     (lib// (lib.metadata/field mp (mt/id :orders :tax))
                                                            (lib.metadata/field mp (mt/id :orders :subtotal)))))
                  proposed-card {:id (:id base-card)
                                 :type :question
                                 :dataset_query proposed-query
                                 :result_metadata nil}
                  response (mt/user-http-request :rasta :post 200 "ee/dependencies/check_card"
                                                 proposed-card)]
              (is (=? {:success false
                       :bad_cards [{:id (:id dependent-card)}]
                       :bad_transforms []}
                      response)))))))))

(deftest check-card-breaks-multiple-downstream-cards-test
  (testing "POST /api/ee/dependencies/check_card detects when one change breaks multiple downstream cards"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "test@test.com"}]
          (mt/with-model-cleanup [:model/Card]
            (let [mp (mt/metadata-provider)
                  ;; Create base card querying real orders table
                  base-card (card/create-card! (basic-card) user)
                  ;; Create first dependent card filtering on TOTAL
                  base-card-meta (lib.metadata/card mp (:id base-card))
                  dependent-query-1 (let [q (lib/query mp base-card-meta)
                                          total-col (m/find-first #(= (:id %) (mt/id :orders :total))
                                                                  (lib/filterable-columns q))]
                                      (lib/filter q (lib/> total-col 100)))
                  dependent-card-1 (card/create-card!
                                    (card-with-query "First Dependent Card" dependent-query-1)
                                    user)
                  ;; Create second dependent card also using TOTAL
                  dependent-query-2 (let [q (lib/query mp base-card-meta)
                                          total-col (m/find-first #(= (:id %) (mt/id :orders :total))
                                                                  (lib/filterable-columns q))]
                                      (lib/filter q (lib/< total-col 50)))
                  dependent-card-2 (card/create-card!
                                    (card-with-query "Second Dependent Card" dependent-query-2)
                                    user)
                  ;; Propose changing to products table (no TOTAL, breaks both downstream cards)
                  proposed-query (lib/query mp (lib.metadata/table mp (mt/id :products)))
                  proposed-card {:id (:id base-card)
                                 :type :question
                                 :dataset_query proposed-query
                                 :result_metadata nil}
                  response (mt/user-http-request :rasta :post 200 "ee/dependencies/check_card" proposed-card)]
              (is (=? {:success false
                       :bad_cards #{(:id dependent-card-1) (:id dependent-card-2)}
                       :bad_transforms []}
                      (update response :bad_cards #(into #{} (map :id) %)))))))))))

(deftest check-transform-test
  (testing "POST /api/ee/dependencies/check_transform"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Transform {_transform-id :id :as transform} {}]
        (let [response (mt/user-http-request :rasta :post 200 "ee/dependencies/check_transform" transform)]
          (is (= {:bad_cards [], :bad_transforms [], :success true}
                 response)))))))

(deftest check-snippet-test
  (testing "POST /api/ee/dependencies/check_snippet"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/NativeQuerySnippet {_snippet-id :id :as snippet} {}]
        (let [response (mt/user-http-request :rasta :post 200 "ee/dependencies/check_snippet" snippet)]
          (is (= {:bad_cards [], :bad_transforms [], :success true}
                 response)))))))

(deftest check-snippet-content-change-breaks-cards-test
  (testing "POST /api/ee/dependencies/check_snippet detects when snippet content changes break dependent cards"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "test@test.com"}
                       :model/NativeQuerySnippet {snippet-id :id snippet-name :name} {:name "filter-snippet"
                                                                                      :content "WHERE SUBTOTAL > 100"}]
          (mt/with-model-cleanup [:model/Card]
            (let [tag-name (str "snippet: " snippet-name)
                  mp (mt/metadata-provider)
                  native-query (-> (lib/native-query mp (format "SELECT * FROM ORDERS %s" (str "{{" tag-name "}}")))
                                   (lib/with-template-tags {tag-name {:name tag-name
                                                                      :display-name (str "Snippet: " snippet-name)
                                                                      :type :snippet
                                                                      :snippet-name snippet-name
                                                                      :snippet-id snippet-id}}))
                  card (card/create-card! {:name "Card using snippet"
                                           :dataset_query native-query
                                           :display :table
                                           :visualization_settings {}}
                                          user)
                  proposed-content "WHERE NONEXISTENT_COLUMN > 100"
                  response (mt/user-http-request :rasta :post 200 "ee/dependencies/check_snippet"
                                                 {:id snippet-id
                                                  :content proposed-content})]
              (is (=? {:success false
                       :bad_cards [{:id (:id card)}]
                       :bad_transforms []}
                      response)))))))))

(deftest graph-test
  (testing "GET /api/ee/dependencies/graph"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/User user {:email "me@wherever.com"}]
          (let [{card-id-1 :id :as dependency-card} (card/create-card! (basic-card) user)
                {card-id-2 :id} (card/create-card! (wrap-card dependency-card) user)
                response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph" :id card-id-2 :type "card")
                creator {:email "me@wherever.com"
                         :id (:id user)}]
            (is (=? {:edges
                     #{{:from_entity_id card-id-2, :from_entity_type "card"
                        :to_entity_id card-id-1, :to_entity_type "card"}
                       {:from_entity_id card-id-1, :from_entity_type "card"
                        :to_entity_id (mt/id :orders), :to_entity_type "table"}}
                     :nodes
                     [{:data {:collection
                              {:metabase.collections.models.collection.root/is-root? true}
                              :collection_id nil
                              :creator creator
                              :database_id (mt/id)
                              :last-edit-info creator}
                       :dependents_count {:question 1}
                       :id card-id-1
                       :type "card"}
                      {:data {:collection
                              {:metabase.collections.models.collection.root/is-root? true}
                              :creator creator
                              :database_id (mt/id)
                              :last-edit-info creator
                              :name "Downstream card"}
                       :dependents_count nil
                       :id card-id-2
                       :type "card"}
                      {:data {:db
                              {:id (mt/id)}
                              :db_id (mt/id)}
                       :dependents_count {:question int?}
                       :id (mt/id :orders)
                       :type "table"}]}
                    (-> response
                        (update :edges set)
                        (update :nodes #(sort-by :type %)))))))))))

(deftest graph-table-root-test
  (testing "GET /api/ee/dependencies/graph with table as root node"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/Card]
          (mt/with-temp [:model/User user {:email "test@test.com"}]
            (let [_card-1 (card/create-card! (basic-card "Card 1" :orders) user)
                  _card-2 (card/create-card! (basic-card "Card 2" :orders) user)
                  response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                 :id (mt/id :orders)
                                                 :type "table")]
              (testing "table has no upstream dependencies, so only the table node is returned"
                (is (=? {:nodes [{:id (mt/id :orders)
                                  :type "table"
                                  :data {:db_id (mt/id)}
                                  :dependents_count {:question #(and (int? %) (>= % 2))}}]
                         :edges #{}}
                        (update response :edges set)))))))))))

(deftest dependents-test
  (testing "GET /api/ee/dependencies/graph/dependents"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/User user {:email "me@wherever.com"}]
          (let [{card-id-1 :id :as dependency-card} (card/create-card! (basic-card) user)
                {card-id-2 :id} (card/create-card! (wrap-card dependency-card) user)
                response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                               :id card-id-1
                                               :type "card"
                                               :dependent_type "card"
                                               :dependent_card_type "question")]
            (is (=? [{:data
                      {:collection
                       {:id "root"
                        :metabase.collections.models.collection.root/is-root? true}
                       :creator
                       {:email "me@wherever.com"
                        :id (:id user)}
                       :database_id (mt/id)
                       :display "table"
                       :last-edit-info
                       {:email "me@wherever.com"
                        :id (:id user)}
                       :name "Downstream card"
                       :type "question"}
                      :dependents_count nil
                      :id card-id-2
                      :type "card"}]
                    response))))))))
