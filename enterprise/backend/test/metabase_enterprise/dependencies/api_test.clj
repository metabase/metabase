(ns metabase-enterprise.dependencies.api-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.native-query-snippets.models.native-query-snippet.permissions :as snippet.perms]
   [metabase.permissions.core :as perms]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.util :as u]))

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

(defn wrap-two-cards
  "Construct a card depending on both `card1` and `card2` via a join."
  [card1 card2]
  (let [mp (mt/metadata-provider)
        card1-meta (lib.metadata/card mp (:id card1))
        card2-meta (lib.metadata/card mp (:id card2))
        base-query (lib/query mp card1-meta)
        card1-cols (lib/returned-columns base-query card1-meta)
        card2-cols (lib/returned-columns base-query card2-meta)
        join-clause (-> (lib/join-clause card2-meta)
                        (lib/with-join-alias "joined")
                        (lib/with-join-conditions
                         [(lib/= (first card1-cols)
                                 (-> (first card2-cols)
                                     (lib/with-join-alias "joined")))])
                        (lib/with-join-fields :all))]
    (card-with-query "Card with join" (lib/join base-query join-clause))))

(deftest check-card-test
  (testing "POST /api/ee/dependencies/check_card"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "me@wherever.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency]
          (let [card (card/create-card! (basic-card) user)
                response (mt/user-http-request :rasta :post 200 "ee/dependencies/check_card"
                                               (assoc (card/create-card! (basic-card "Product question" :products)
                                                                         user)
                                                      :id (:id card)))]
            (is (= {:bad_cards [], :bad_transforms [], :success true}
                   response))))))))

(deftest check-card-hydrates-dashboard-and-document-test
  (testing "POST /api/ee/dependencies/check_card hydrates dashboard and document for cards"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-current-user (mt/user->id :rasta)
          (mt/with-temp [:model/User user {:email "test@test.com"}
                         :model/Dashboard dashboard {}
                         :model/Document document {}]
            (mt/with-model-cleanup [:model/Card :model/Dependency]
              (let [metadata-provider (mt/metadata-provider)
                    ;; Create base card querying real orders table
                    base-card         (card/create-card! (basic-card) user)
                    ;; Create dependent cards that filter on TOTAL
                    base-card-meta    (lib.metadata/card metadata-provider (:id base-card))
                    dependent-query   (let [q (lib/query metadata-provider base-card-meta)
                                            cols (lib/filterable-columns q)
                                            total-col (m/find-first #(= (:id %) (mt/id :orders :total)) cols)]
                                        (lib/filter q (lib/> total-col 100)))
                    dashboard-card    (card/create-card!
                                       (merge (card-with-query "Dashboard card" dependent-query) {:dashboard_id (:id dashboard)})
                                       user)
                    document-card     (card/create-card!
                                       (merge (card-with-query "Document card" dependent-query) {:document_id (:id document)})
                                       user)
                    ;; Propose changing to products table (doesn't have TOTAL column, breaks downstream)
                    proposed-query    (lib/query metadata-provider (lib.metadata/table metadata-provider (mt/id :products)))
                    proposed-card     {:id (:id base-card)
                                       :type :question
                                       :dataset_query proposed-query
                                       :result_metadata nil}]
                (is (=? {:success       false
                         :bad_cards      [{:id           (:id dashboard-card)
                                           :dashboard_id (:id dashboard)
                                           :dashboard    (select-keys dashboard [:id :name])}
                                          {:id           (:id document-card)
                                           :document_id  (:id document)
                                           :document     (select-keys document [:id :name])}]
                         :bad_transforms []}
                        (mt/user-http-request :rasta :post 200 "ee/dependencies/check_card" proposed-card)))))))))))

(deftest check-card-removing-column-breaks-downstream-test
  (testing "POST /api/ee/dependencies/check_card detects when removing a column breaks downstream cards"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
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
          (mt/with-model-cleanup [:model/Card :model/Dependency]
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
          (mt/with-model-cleanup [:model/Card :model/Dependency]
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

(deftest check-card-skips-native-cards-test
  (testing "POST /api/ee/dependencies/check_card does not validate native cards"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [mp (mt/metadata-provider)
                  ;; Create base card querying real orders table
                  base-card (card/create-card! (basic-card) user)
                  ;; Create dependent card that filters on TOTAL
                  dependent-query (lib/native-query mp (str "select * from {{#"
                                                            (:id base-card)
                                                            "}} orders where total > 100"))
                  _dependent-card (card/create-card!
                                   (card-with-query "Dependent Card filtering on Total" dependent-query)
                                   user)
                  ;; Propose changing to products table (doesn't have TOTAL column, breaks downstream)
                  proposed-query (lib/query mp (lib.metadata/table mp (mt/id :products)))
                  proposed-card {:id (:id base-card)
                                 :type :question
                                 :dataset_query proposed-query
                                 :result_metadata nil}
                  response (mt/user-http-request :rasta :post 200 "ee/dependencies/check_card" proposed-card)]
              (is (=? {:success true
                       :bad_cards []
                       :bad_transforms []}
                      response)))))))))

(deftest check-transform-test
  (testing "POST /api/ee/dependencies/check_transform"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Transform {_transform-id :id :as transform} {}]
        (let [response (mt/user-http-request :crowberto :post 200 "ee/dependencies/check_transform" transform)]
          (is (= {:bad_cards [], :bad_transforms [], :success true}
                 response)))))))

(deftest check-snippet-test
  (testing "POST /api/ee/dependencies/check_snippet"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/NativeQuerySnippet {_snippet-id :id :as snippet} {:name "test-snippet"
                                                                              :content "WHERE ID > 10"}]
        (let [response (mt/user-http-request :crowberto :post 200 "ee/dependencies/check_snippet" snippet)]
          (is (= {:bad_cards [], :bad_transforms [], :success true}
                 response)))))))

(deftest check-snippet-content-change-doest-not-break-cards-test
  (testing "POST /api/ee/dependencies/check_snippet doesn't catch when a change would break a card, because native query validation is disabled"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "test@test.com"}
                       :model/NativeQuerySnippet {snippet-id :id snippet-name :name} {:name "filter-snippet"
                                                                                      :content "WHERE SUBTOTAL > 100"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [tag-name (str "snippet: " snippet-name)
                  mp (mt/metadata-provider)
                  native-query (-> (lib/native-query mp (format "SELECT * FROM ORDERS %s" (str "{{" tag-name "}}")))
                                   (lib/with-template-tags {tag-name {:name tag-name
                                                                      :display-name (str "Snippet: " snippet-name)
                                                                      :type :snippet
                                                                      :snippet-name snippet-name
                                                                      :snippet-id snippet-id}}))
                  _card (card/create-card! {:name "Card using snippet"
                                            :dataset_query native-query
                                            :display :table
                                            :visualization_settings {}}
                                           user)
                  proposed-content "WHERE NONEXISTENT_COLUMN > 100"
                  response (mt/user-http-request :rasta :post 200 "ee/dependencies/check_snippet"
                                                 {:id snippet-id
                                                  :content proposed-content})]
              (is (=? {:success true
                       :bad_cards []
                       :bad_transforms []}
                      response)))))))))

(deftest graph-test
  (testing "GET /api/ee/dependencies/graph"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card :model/Dependency]
        (mt/with-temp [:model/User user {:email "me@wherever.com"}]
          (let [{card-id-1 :id :as dependency-card} (card/create-card! (basic-card) user)
                {card-id-2 :id} (card/create-card! (wrap-card dependency-card) user)
                response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph" :id card-id-2 :type "card")
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

(deftest graph-transform-hydrates-creator-test
  (testing "GET /api/ee/dependencies/graph hydrates creator for transforms"
    (mt/with-premium-features #{:dependencies :transforms}
      (mt/with-temp [:model/Transform {transform-id :id} {:name "Test Transform"
                                                          :creator_id (mt/user->id :crowberto)}]
        (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                             :id transform-id
                                             :type "transform")
              transform-node (first (filter #(= (:type %) "transform") (:nodes response)))
              crowberto-id (mt/user->id :crowberto)]
          (testing "Transform node has creator hydrated"
            (is (some? transform-node))
            (is (map? (get-in transform-node [:data :creator])))
            (is (= crowberto-id (get-in transform-node [:data :creator :id])))))))))

(deftest graph-table-root-test
  (testing "GET /api/ee/dependencies/graph with table as root node"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/Card :model/Dependency]
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
      (mt/with-model-cleanup [:model/Card :model/Dependency]
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

(deftest graph-archived-card-test
  (testing "GET /api/ee/dependencies/graph with archived parameter"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card :model/Dependency]
        (mt/with-temp [:model/User user {:email "test@test.com"}]
          (let [base-card (card/create-card! (basic-card "Archived Base Card") user)
                dependent-card (card/create-card! (wrap-card base-card) user)]
            (card/update-card! {:card-before-update base-card
                                :card-updates {:archived true}})
            (testing "archived=false (default) excludes archived card from dependencies"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                   :id (:id dependent-card)
                                                   :type "card")
                    node-ids (set (map :id (:nodes response)))]
                (is (contains? node-ids (:id dependent-card)))
                (is (not (contains? node-ids (:id base-card))))))
            (testing "archived=true includes archived card in dependencies"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                   :id (:id dependent-card)
                                                   :type "card"
                                                   :archived true)
                    node-ids (set (map :id (:nodes response)))]
                (is (contains? node-ids (:id dependent-card)))
                (is (contains? node-ids (:id base-card)))
                (is (contains? node-ids (mt/id :orders)))))))))))

(deftest dependents-archived-card-test
  (testing "GET /api/ee/dependencies/graph/dependents with archived parameter"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card :model/Dependency]
        (mt/with-temp [:model/User user {:email "test@test.com"}]
          (let [base-card (card/create-card! (basic-card "Base Card") user)
                dependent-card (card/create-card! (wrap-card base-card) user)]
            (card/update-card! {:card-before-update dependent-card
                                :card-updates {:archived true}})
            (testing "archived=false (default) excludes archived dependent"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                   :id (:id base-card)
                                                   :type "card"
                                                   :dependent_type "card")]
                (is (empty? response))))
            (testing "archived=true includes archived dependent"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                   :id (:id base-card)
                                                   :type "card"
                                                   :dependent_type "card"
                                                   :dependent_card_type "question"
                                                   :archived true)
                    dependent-ids (set (map :id response))]
                (is (contains? dependent-ids (:id dependent-card)))))))))))

(deftest check-card-permissions-test
  (testing "POST /api/ee/dependencies/check_card requires read permissions on the input card"
    (mt/with-premium-features #{:dependencies}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection {}
                       :model/User user {:email "test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [card (card/create-card! (assoc (basic-card) :collection_id (u/the-id collection)) user)]
              (testing "Returns 403 when user lacks read permissions"
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :post 403 "ee/dependencies/check_card"
                                             (assoc card :name "Modified name")))))
              (testing "Returns 200 when user has read permissions"
                (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
                (is (=? {:success true}
                        (mt/user-http-request :rasta :post 200 "ee/dependencies/check_card"
                                              (assoc card :name "Modified name"))))))))))))

(deftest check-snippet-permissions-test
  (testing "POST /api/ee/dependencies/check_snippet requires native query execution permissions"
    (mt/with-premium-features #{:dependencies}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/NativeQuerySnippet snippet {:name "test snippet"
                                                          :content "SELECT 1"
                                                          :creator_id (mt/user->id :crowberto)}]
          ;; remove native permissions
          (with-redefs [snippet.perms/has-any-native-permissions? (constantly false)]
            (testing "Returns 403 when user lacks native query execution permissions"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :post 403 "ee/dependencies/check_snippet"
                                           {:id (:id snippet)
                                            :content "SELECT 2"})))))
          ;; Grant native query permissions
          (testing "Returns 200 when user has native query execution permissions"
            (mt/user-http-request :rasta :post 200 "ee/dependencies/check_snippet"
                                  {:id (:id snippet)
                                   :content "SELECT 2"})))))))

(deftest check-transform-permissions-test
  (testing "POST /api/ee/dependencies/check_transform requires read permissions on the input transform"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Transform transform {:name "test transform"}]
        (testing "Returns 403 when user is not an admin (only admins can read transforms)"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "ee/dependencies/check_transform"
                                       {:id (:id transform)
                                        :source (:source transform)
                                        :target (:target transform)}))))
        (testing "Returns 200 when user is an admin"
          (is (=? {:success true}
                  (mt/user-http-request :crowberto :post 200 "ee/dependencies/check_transform"
                                        {:id (:id transform)
                                         :source (:source transform)
                                         :target (:target transform)}))))))))

(deftest graph-permissions-test
  (testing "GET /api/ee/dependencies/graph requires read permissions on the starting entity"
    (mt/with-premium-features #{:dependencies}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection {}
                       :model/User user {:email "test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [card (card/create-card! (assoc (basic-card) :collection_id (u/the-id collection)) user)]
              (testing "Returns 403 when user lacks read permissions"
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :get 403 "ee/dependencies/graph"
                                             :id (:id card)
                                             :type "card"))))
              (testing "Returns 200 when user has read permissions"
                (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
                (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                      :id (:id card)
                                      :type "card")))))))))

(deftest graph-dependents-permissions-test
  (testing "GET /api/ee/dependencies/graph/dependents requires read permissions on the starting entity"
    (mt/with-premium-features #{:dependencies}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection {}
                       :model/User user {:email "test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [{card-id :id} (card/create-card! (assoc (basic-card) :collection_id (:id collection)) user)]
              (testing "Returns 403 when user lacks read permissions"
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :get 403 "ee/dependencies/graph/dependents"
                                             :id card-id
                                             :type "card"
                                             :dependent_type "card"
                                             :dependent_card_type "question"))))
              (testing "Returns 200 when user has read permissions"
                (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
                (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                      :id card-id
                                      :type "card"
                                      :dependent_type "card"
                                      :dependent_card_type "question")))))))))

(deftest graph-filtering-test
  (testing "GET /api/ee/dependencies/graph filters out upstream nodes the user cannot read"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection readable-collection {}
                         :model/Collection unreadable-collection {}
                         :model/User user {:email "test@test.com"}]
            (mt/with-model-cleanup [:model/Card :model/Dependency]
              (let [readable-base (card/create-card! (assoc (basic-card "Readable")
                                                            :collection_id (:id readable-collection)) user)
                    unreadable-base (card/create-card! (assoc (basic-card "Unreadable")
                                                              :collection_id (:id unreadable-collection)) user)
                    top-card (card/create-card! (assoc (wrap-two-cards readable-base unreadable-base)
                                                       :collection_id (:id readable-collection))
                                                user)]
                (perms/grant-collection-read-permissions! (perms/all-users-group) readable-collection)
                (testing "User sees complete upstream graph through readable path"
                  (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                       :id (:id top-card)
                                                       :type "card")
                        nodes (set (map (juxt :type :id) (:nodes response)))
                        expected-nodes #{["card" (:id top-card)] ["card" (:id readable-base)] ["table" (mt/id :orders)]}]
                    (is (= expected-nodes nodes)
                        "Should see top-card, readable-base, and :orders table")))
                (testing "Edges show complete readable dependency chain"
                  (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                       :id (:id top-card)
                                                       :type "card")
                        edges (set (:edges response))
                        expected-edges #{{:from_entity_id (:id top-card)
                                          :from_entity_type "card"
                                          :to_entity_id (:id readable-base)
                                          :to_entity_type "card"}
                                         {:from_entity_id (:id readable-base)
                                          :from_entity_type "card"
                                          :to_entity_id (mt/id :orders)
                                          :to_entity_type "table"}}]
                    (is (= expected-edges edges)
                        "Should have edges: top-card->readable-base and readable-base->orders")))))))))))

(deftest graph-dependents-filtering-test
  (testing "GET /api/ee/dependencies/graph/dependents filters out nodes the user cannot read"
    (mt/with-premium-features #{:dependencies}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection readable-collection {}
                       :model/Collection unreadable-collection {}
                       :model/User user {:email "test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [base-card (card/create-card! (assoc (basic-card) :collection_id (:id readable-collection)) user)
                  readable-dependent (card/create-card! (assoc (wrap-card base-card)
                                                               :collection_id (:id readable-collection))
                                                        user)
                  unreadable-dependent (card/create-card! (assoc (wrap-card base-card)
                                                                 :collection_id (:id unreadable-collection))
                                                          user)]
              (perms/grant-collection-read-permissions! (perms/all-users-group) readable-collection)
              (testing "User sees only readable dependents"
                (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                     :id (:id base-card)
                                                     :type "card"
                                                     :dependent_type "card"
                                                     :dependent_card_type "question")
                      dependent-ids (set (map :id response))]
                  (is (contains? dependent-ids (:id readable-dependent)))
                  (is (not (contains? dependent-ids (:id unreadable-dependent)))))))))))))

(deftest graph-multi-level-filtering-test
  (testing "GET /api/ee/dependencies/graph includes upstream nodes if ANY path to them is readable"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection readable-collection {}
                         :model/Collection unreadable-collection {}
                         :model/User user {:email "test@test.com"}]
            (mt/with-model-cleanup [:model/Card :model/Dependency]
              (let [base-card (card/create-card! (assoc (basic-card) :collection_id (:id readable-collection)) user)
                    unreadable-middle (card/create-card! (assoc (wrap-card base-card)
                                                                :collection_id (:id unreadable-collection))
                                                         user)
                    readable-alternate (card/create-card! (assoc (wrap-card base-card)
                                                                 :collection_id (:id readable-collection))
                                                          user)
                    end-card (card/create-card! (assoc (wrap-two-cards unreadable-middle readable-alternate)
                                                       :collection_id (:id readable-collection))
                                                user)]
                (perms/grant-collection-read-permissions! (perms/all-users-group) readable-collection)
                (testing "Diamond pattern: complete upstream graph via readable path"
                  (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                       :id (:id end-card)
                                                       :type "card")
                        nodes (set (map (juxt :type :id) (:nodes response)))
                        expected-nodes #{["card" (:id end-card)] ["card" (:id readable-alternate)]
                                         ["card" (:id base-card)] ["table" (mt/id :orders)]}]
                    (is (= expected-nodes nodes)
                        "Should see end-card, readable-alternate, base-card, and :orders table")))
                (testing "Edges show complete readable dependency chain"
                  (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                       :id (:id end-card)
                                                       :type "card")
                        edges (set (:edges response))
                        expected-edges #{{:from_entity_id (:id end-card)
                                          :from_entity_type "card"
                                          :to_entity_id (:id readable-alternate)
                                          :to_entity_type "card"}
                                         {:from_entity_id (:id readable-alternate)
                                          :from_entity_type "card"
                                          :to_entity_id (:id base-card)
                                          :to_entity_type "card"}
                                         {:from_entity_id (:id base-card)
                                          :from_entity_type "card"
                                          :to_entity_id (mt/id :orders)
                                          :to_entity_type "table"}}]
                    (is (= expected-edges edges)
                        "Should have edges through readable path only")))))))))))

(deftest graph-filtering-all-unreadable-test
  (testing "GET /api/ee/dependencies/graph returns only root node when all upstream dependencies are unreadable"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection readable-collection {}
                         :model/Collection unreadable-collection {}
                         :model/User user {:email "test@test.com"}]
            (mt/with-model-cleanup [:model/Card :model/Dependency]
              (let [unreadable-base (card/create-card! (assoc (basic-card "Unreadable")
                                                              :collection_id (:id unreadable-collection)) user)
                    top-card (card/create-card! (assoc (wrap-card unreadable-base)
                                                       :collection_id (:id readable-collection))
                                                user)]
                (perms/grant-collection-read-permissions! (perms/all-users-group) readable-collection)
                (testing "User sees only the top card in the graph"
                  (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                       :id (:id top-card)
                                                       :type "card")
                        nodes (set (map (juxt :type :id) (:nodes response)))]
                    (is (= #{["card" (:id top-card)]} nodes)
                        "Should see only top-card when all dependencies are unreadable")))
                (testing "No edges when all dependencies are filtered"
                  (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                       :id (:id top-card)
                                                       :type "card")]
                    (is (empty? (:edges response))
                        "Should have no edges when all dependencies are filtered out")))))))))))

(deftest graph-snippet-filtering-test
  (testing "GET /api/ee/dependencies/graph/dependents filters snippet dependents based on card permissions"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection readable-collection {}
                         :model/Collection unreadable-collection {}
                         :model/User user {:email "test@test.com"}
                         :model/NativeQuerySnippet {snippet-id :id snippet-name :name} {:name "test-snippet"
                                                                                        :content "WHERE ID > 10"}]
            (mt/with-model-cleanup [:model/Card :model/Dependency]
              (let [tag-name (str "snippet: " snippet-name)
                    mp (mt/metadata-provider)
                    native-query (fn []
                                   (-> (lib/native-query mp (format "SELECT * FROM ORDERS %s" (str "{{" tag-name "}}")))
                                       (lib/with-template-tags {tag-name {:name tag-name
                                                                          :display-name (str "Snippet: " snippet-name)
                                                                          :type :snippet
                                                                          :snippet-name snippet-name
                                                                          :snippet-id snippet-id}})))
                    readable-card (card/create-card! {:name "Readable card with snippet"
                                                      :dataset_query (native-query)
                                                      :display :table
                                                      :visualization_settings {}
                                                      :collection_id (:id readable-collection)}
                                                     user)
                    unreadable-card (card/create-card! {:name "Unreadable card with snippet"
                                                        :dataset_query (native-query)
                                                        :display :table
                                                        :visualization_settings {}
                                                        :collection_id (:id unreadable-collection)}
                                                       user)]
                (perms/grant-collection-read-permissions! (perms/all-users-group) readable-collection)
                (testing "User sees only readable cards as dependents of the snippet"
                  (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                       :id snippet-id
                                                       :type "snippet"
                                                       :dependent_type "card"
                                                       :dependent_card_type "question")
                        dependent-ids (set (map :id response))]
                    (is (contains? dependent-ids (:id readable-card))
                        "Should see readable card as dependent")
                    (is (not (contains? dependent-ids (:id unreadable-card)))
                        "Should not see unreadable card as dependent")))))))))))

(deftest graph-table-permission-filtering-test
  (testing "GET /api/ee/dependencies/graph filters out tables when user lacks table permissions"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection readable-collection {}
                         :model/User user {:email "test@test.com"}]
            (mt/with-temp-copy-of-db
              (mt/with-model-cleanup [:model/Card :model/Dependency]
                (mt/with-no-data-perms-for-all-users!
                  (perms/set-table-permission! (perms/all-users-group) (mt/id :orders) :perms/view-data :blocked)
                  (perms/set-table-permission! (perms/all-users-group) (mt/id :orders) :perms/create-queries :no)
                  (let [card (card/create-card! (assoc (basic-card "Card on orders")
                                                       :collection_id (:id readable-collection)) user)]
                    (perms/grant-collection-read-permissions! (perms/all-users-group) readable-collection)
                    (testing "User sees only the card, table is filtered out"
                      (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                           :id (:id card)
                                                           :type "card")
                            nodes (set (map (juxt :type :id) (:nodes response)))]
                        (is (= #{["card" (:id card)]} nodes)
                            "Should see only the card, not the unreadable table")))
                    (testing "No edges when table is filtered"
                      (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                           :id (:id card)
                                                           :type "card")]
                        (is (empty? (:edges response))
                            "Should have no edges when table is filtered out")))))))))))))

(deftest graph-returns-dashboard-for-cards-test
  (testing "Graph endpoints return dashboard data for cards in dashboards"
    (mt/with-premium-features #{:dependencies}
      (mt/with-current-user (mt/user->id :rasta)
        (mt/with-model-cleanup [:model/Card :model/Dependency]
          (mt/with-temp [:model/User user {:email "test@test.com"}
                         :model/Dashboard dashboard {:name "Test Dashboard"}]
            (let [base-card (card/create-card! (basic-card "Base Card") user)
                  dashboard-card (card/create-card! (assoc (wrap-card base-card)
                                                           :dashboard_id (:id dashboard))
                                                    user)]
              (testing "GET /api/ee/dependencies/graph returns dashboard with :id and :name"
                (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                                     :id (:id dashboard-card)
                                                     :type :card)
                      card-node (first (filter #(= (:id %) (:id dashboard-card)) (:nodes response)))]
                  (is (= {:id (:id dashboard) :name "Test Dashboard"}
                         (get-in card-node [:data :dashboard])))
                  (is (= (:id dashboard)
                         (get-in card-node [:data :dashboard_id])))))
              (testing "GET /api/ee/dependencies/graph/dependents returns dashboard with :id and :name"
                (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/dependents"
                                                     :id (:id base-card)
                                                     :type :card
                                                     :dependent_type :card
                                                     :dependent_card_type :question)
                      card-node (first (filter #(= (:id %) (:id dashboard-card)) response))]
                  (is (some? card-node))
                  (is (= {:id (:id dashboard) :name "Test Dashboard"}
                         (get-in card-node [:data :dashboard])))
                  (is (= (:id dashboard)
                         (get-in card-node [:data :dashboard_id]))))))))))))

(deftest graph-returns-document-for-cards-test
  (testing "Graph endpoints return document data for cards in documents"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card :model/Dependency]
        (mt/with-temp [:model/User user {:email "test@test.com"}
                       :model/Document document {:name "Test Document"}]
          (let [base-card (card/create-card! (basic-card "Base Card") user)
                document-card (card/create-card! (assoc (wrap-card base-card)
                                                        :document_id (:id document))
                                                 user)]
            (testing "GET /api/ee/dependencies/graph returns document with :id and :name"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                                   :id (:id document-card)
                                                   :type :card)
                    card-node (first (filter #(= (:id %) (:id document-card)) (:nodes response)))]
                (is (= {:id (:id document) :name "Test Document"}
                       (get-in card-node [:data :document])))
                (is (= (:id document)
                       (get-in card-node [:data :document_id])))))
            (testing "GET /api/ee/dependencies/graph/dependents returns document with :id and :name"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/dependents"
                                                   :id (:id base-card)
                                                   :type :card
                                                   :dependent_type :card
                                                   :dependent_card_type :question)
                    card-node (first (filter #(= (:id %) (:id document-card)) response))]
                (is (some? card-node))
                (is (= {:id (:id document) :name "Test Document"}
                       (get-in card-node [:data :document])))
                (is (= (:id document)
                       (get-in card-node [:data :document_id])))))))))))
