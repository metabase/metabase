(ns metabase-enterprise.dependencies.api-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.dependencies.api :as deps.api]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.dependencies.findings :as dependencies.findings]
   [metabase-enterprise.dependencies.task.backfill :as dependencies.backfill]
   [metabase.collections.models.collection :as collection]
   [metabase.core.core :as mbc]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.native-query-snippets.models.native-query-snippet.permissions :as snippet.perms]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(defn- card-with-query
  "Create a card map with the given name and dataset query."
  [card-name dataset-query]
  {:name card-name
   :database_id (mt/id)
   :display :table
   :query_type :query
   :type :question
   :dataset_query dataset-query
   :visualization_settings {}})

(defn- basic-card
  "Construct a basic card for dependency testing."
  ([]
   (basic-card "Test card"))
  ([card-name]
   (basic-card card-name :orders))
  ([card-name table-keyword]
   (let [mp (mt/metadata-provider)]
     (card-with-query card-name (lib/query mp (lib.metadata/table mp (mt/id table-keyword)))))))

(defn- wrap-card-query
  "Construct a query depending on `inner-card` for dependency testing."
  [inner-card]
  (let [mp (mt/metadata-provider)
        card-meta (lib.metadata/card mp (:id inner-card))]
    (lib/query mp card-meta)))

(defn- wrap-card
  "Construct a card depending on `inner-card` for dependency testing."
  [inner-card]
  (card-with-query "Downstream card" (wrap-card-query inner-card)))

(defn- wrap-two-cards
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

(defn broken-mbql-query
  "Construct a broken MBQL query that references a field from a wrong table."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :total)))))))

(defn- create-model-card!
  "Create a model card with the given name and optional collection-id.
   Returns the created card."
  [user card-name & {:keys [collection-id archived]}]
  (let [mp (mt/metadata-provider)
        orders (lib.metadata/table mp (mt/id :orders))]
    (card/create-card! (m/assoc-some {:name card-name
                                      :database_id (mt/id)
                                      :display :table
                                      :query_type :query
                                      :type :model
                                      :dataset_query (lib/query mp orders)
                                      :visualization_settings {}}
                                     :collection_id collection-id
                                     :archived archived)
                       user)))

(defn- create-dependent-card-on-model!
  [user model-card card-name & {:keys [collection-id table] :or {table :orders}}]
  (let [mp (mt/metadata-provider)
        model-meta (lib.metadata/card mp (:id model-card))
        q (lib/query mp model-meta)
        cols (lib/filterable-columns q)
        filter-col-name (case table
                          :products :price
                          :total)

        filter-col (m/find-first #(= (:id %) (mt/id table filter-col-name)) cols)
        dependent-query (lib/filter q (lib/> filter-col 100))]
    (card/create-card! (cond-> (card-with-query card-name dependent-query)
                         collection-id (assoc :collection_id collection-id))
                       user)))

(defn- break-model-card!
  "Update a model card to query the products table instead of orders.
   This breaks any downstream cards that depend on columns only in the orders table (like TOTAL)."
  [model-card]
  (let [mp (mt/metadata-provider)
        products (lib.metadata/table mp (mt/id :products))]
    (card/update-card! {:card-before-update model-card
                        :card-updates {:dataset_query (lib/query mp products)}})))

(defn- run-analysis-for-card!
  "Run analysis for a specific card to detect broken references.
   Must be called within lib-be/with-metadata-provider-cache."
  [card-id]
  (dependencies.findings/upsert-analysis! (t2/select-one :model/Card :id card-id)))

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
    (mt/with-premium-features #{:dependencies :transforms}
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
                        (update :nodes #(sort-by (juxt :type :id) %)))))))))))

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
                                               :dependent_types "card"
                                               :dependent_card_types "question")]
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

(deftest ^:sequential dependents-multiple-types-test
  (testing "GET /api/ee/dependencies/graph/dependents with multiple dependent_types"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card :model/Dependency :model/DashboardCard]
        (mt/with-temp [:model/User user {:email "test@test.com"}
                       :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}]
          (let [{card-id-1 :id :as dependency-card} (card/create-card! (basic-card "Base card - multi") user)
                _dependent-card (card/create-card! (wrap-card dependency-card) user)]
            (t2/insert! :model/DashboardCard {:dashboard_id dashboard-id
                                              :card_id card-id-1
                                              :row 0
                                              :col 0
                                              :size_x 4
                                              :size_y 4})
            (while (#'dependencies.backfill/backfill-dependencies!))
            (testing "single dependent_types value (backward compatibility)"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                   :id card-id-1
                                                   :type "card"
                                                   :dependent_types "card")]
                (is (= 1 (count response)))
                (is (every? #(= "card" (:type %)) response))))
            (testing "multiple dependent_types via repeated params"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                   :id card-id-1
                                                   :type "card"
                                                   :dependent_types "card"
                                                   :dependent_types "dashboard")]
                (is (= 2 (count response)))
                (is (= #{"card" "dashboard"} (set (map :type response))))))
            (testing "no dependent_types returns all types"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                   :id card-id-1
                                                   :type "card")]
                (is (>= (count response) 2))
                (is (contains? (set (map :type response)) "card"))
                (is (contains? (set (map :type response)) "dashboard"))))))))))

(deftest ^:sequential dependents-multiple-card-types-test
  (testing "GET /api/ee/dependencies/graph/dependents with multiple dependent_card_types"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card :model/Dependency]
        (mt/with-temp [:model/User user {:email "test@test.com"}]
          (let [{dependency-card-id :id :as dependency-card} (card/create-card! (basic-card "Base card - cardtypes") user)
                _question-card (card/create-card! (assoc (wrap-card dependency-card) :name "Question card") user)
                _model-card (card/create-card! (assoc (wrap-card dependency-card) :name "Model card" :type :model) user)]
            (testing "single dependent_card_types value"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                   :id dependency-card-id
                                                   :type "card"
                                                   :dependent_types "card"
                                                   :dependent_card_types "question")]
                (is (= 1 (count response)))
                (is (= "question" (-> response first :data :type)))))
            (testing "multiple dependent_card_types via repeated params"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                   :id dependency-card-id
                                                   :type "card"
                                                   :dependent_types "card"
                                                   :dependent_card_types "question"
                                                   :dependent_card_types "model")]
                (is (= 2 (count response)))
                (is (= #{"question" "model"} (set (map #(-> % :data :type) response))))))
            (testing "no dependent_card_types returns all card types"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                   :id dependency-card-id
                                                   :type "card"
                                                   :dependent_types "card")]
                (is (= 2 (count response)))
                (is (= #{"question" "model"} (set (map #(-> % :data :type) response))))))
            (testing "dependent_card_types ignored when dependent_types doesn't include card"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                   :id dependency-card-id
                                                   :type "card"
                                                   :dependent_types "dashboard"
                                                   :dependent_card_types "question")]
                (is (every? #(= "dashboard" (:type %)) response))))))))))

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
                                                   :dependent_types "card")]
                (is (empty? response))))
            (testing "archived=true includes archived dependent"
              (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                                   :id (:id base-card)
                                                   :type "card"
                                                   :dependent_types "card"
                                                   :dependent_card_types "question"
                                                   :archived true)
                    dependent-ids (set (map :id response))]
                (is (contains? dependent-ids (:id dependent-card)))))))))))

(deftest ^:sequential dependents-broken-parameter-test
  (testing "GET /api/ee/dependencies/graph/dependents?broken=true - only returns entities that are broken"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create cards in one metadata provider cache session
          (let [[model-card dependent-card] (lib-be/with-metadata-provider-cache
                                              (let [model-card (create-model-card! user "Model Card - brokentest")
                                                    dependent-card (create-dependent-card-on-model! user model-card "Dependent Card - brokentest")]
                                                [model-card dependent-card]))]
            ;; Run analysis in a fresh metadata provider cache session to detect the broken reference
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card)
              (let [next-card (create-dependent-card-on-model! user model-card "Another Dependent Card - brokentest" {:table :products})]
                (while (#'dependencies.backfill/backfill-dependencies!))
                (run-analysis-for-card! (:id next-card))
                (run-analysis-for-card! (:id dependent-card))
                (let [response2 (mt/user-http-request :crowberto :get 200 (str "ee/dependencies/graph/dependents?broken=true&type=card&id=" (:id model-card)))]
                  (is (= [(:id dependent-card)] (mapv :id response2))
                      "There should be one broken dependent"))
                (let [response2 (mt/user-http-request :crowberto :get 200 (str "ee/dependencies/graph/dependents?broken=false&type=card&id=" (:id model-card)))]
                  (is (= #{(:id dependent-card) (:id next-card)} (set (map :id response2)))
                      "There should two dependents total"))))))))))

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
    (mt/with-premium-features #{:dependencies :transforms}
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
                                             :dependent_types "card"
                                             :dependent_card_types "question"))))
              (testing "Returns 200 when user has read permissions"
                (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
                (mt/user-http-request :rasta :get 200 "ee/dependencies/graph/dependents"
                                      :id card-id
                                      :type "card"
                                      :dependent_types "card"
                                      :dependent_card_types "question")))))))))

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
                                                     :dependent_types "card"
                                                     :dependent_card_types "question")
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
                                                       :dependent_types "card"
                                                       :dependent_card_types "question")
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
                                                     :dependent_types :card
                                                     :dependent_card_types :question)
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
                                                   :dependent_types :card
                                                   :dependent_card_types :question)
                    card-node (first (filter #(= (:id %) (:id document-card)) response))]
                (is (some? card-node))
                (is (= {:id (:id document) :name "Test Document"}
                       (get-in card-node [:data :document])))
                (is (= (:id document)
                       (get-in card-node [:data :document_id])))))))))))

(deftest graph-segment-root-test
  (testing "GET /api/ee/dependencies/graph with segment as root node"
    (mt/with-test-user :crowberto
      (mt/with-premium-features #{:dependencies}
        (let [products-id (mt/id :products)
              price-field-id (mt/id :products :price)]
          (mt/with-temp [:model/Segment {segment-id :id :as segment} {:name "High Value Products"
                                                                      :table_id products-id
                                                                      :definition {:filter [:> [:field price-field-id nil] 50]}}]
            (events/publish-event! :event/segment-create {:object segment :user-id (mt/user->id :crowberto)})
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                                 :id segment-id
                                                 :type "segment")
                  node-types (set (map :type (:nodes response)))]
              (testing "returns segment and table nodes"
                (is (contains? node-types "segment"))
                (is (contains? node-types "table")))
              (testing "segment node has correct data"
                (let [segment-node (first (filter #(= (:type %) "segment") (:nodes response)))]
                  (is (= segment-id (:id segment-node))))))))))))

(deftest graph-segment-dependents-test
  (testing "GET /api/ee/dependencies/graph/dependents with segment"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card :model/Dependency]
        (let [products-id (mt/id :products)
              price-field-id (mt/id :products :price)]
          (mt/with-temp [:model/Segment {segment-id :id :as segment} {:name "High Value Products"
                                                                      :table_id products-id
                                                                      :definition {:filter [:> [:field price-field-id nil] 50]}}
                         :model/User user {:email "test@test.com"}]
            (mt/with-test-user :crowberto
              (events/publish-event! :event/segment-create {:object segment :user-id (mt/user->id :crowberto)}))
            (let [mp (mt/metadata-provider)
                  products (lib.metadata/table mp products-id)
                  query-with-segment (-> (lib/query mp products)
                                         (lib/filter (lib.metadata/segment mp segment-id)))
                  card (card/create-card! (card-with-query "Card using segment" query-with-segment) user)
                  response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/dependents"
                                                 :id segment-id
                                                 :type "segment"
                                                 :dependent_types "card"
                                                 :dependent_card_types "question")]
              (testing "returns card that uses the segment"
                (is (= 1 (count response)))
                (is (= (:id card) (:id (first response))))))))))))

(deftest graph-measure-root-test
  (testing "GET /api/ee/dependencies/graph with measure as root node"
    (mt/with-test-user :crowberto
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              products (lib.metadata/table mp products-id)
              price (lib.metadata/field mp (mt/id :products :price))]
          (mt/with-temp [:model/Measure {measure-id :id :as measure} {:name "Total Price"
                                                                      :table_id products-id
                                                                      :definition (-> (lib/query mp products)
                                                                                      (lib/aggregate (lib/sum price)))}]
            (events/publish-event! :event/measure-create {:object measure :user-id (mt/user->id :crowberto)})
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                                 :id measure-id
                                                 :type "measure")
                  node-types (set (map :type (:nodes response)))]
              (testing "returns measure and table nodes"
                (is (contains? node-types "measure"))
                (is (contains? node-types "table")))
              (testing "measure node has correct data"
                (let [measure-node (first (filter #(= (:type %) "measure") (:nodes response)))]
                  (is (= measure-id (:id measure-node))))))))))))

(deftest graph-measure-with-measure-dependency-test
  (testing "GET /api/ee/dependencies/graph with measure depending on another measure"
    (mt/with-test-user :crowberto
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              products (lib.metadata/table mp products-id)
              price (lib.metadata/field mp (mt/id :products :price))
              rating (lib.metadata/field mp (mt/id :products :rating))]
          (mt/with-temp [:model/Measure {measure-a-id :id :as measure-a} {:name "Measure A"
                                                                          :table_id products-id
                                                                          :definition (-> (lib/query mp products)
                                                                                          (lib/aggregate (lib/sum price)))}]
            (events/publish-event! :event/measure-create {:object measure-a :user-id (mt/user->id :crowberto)})
            (let [mp' (mt/metadata-provider)]
              (mt/with-temp [:model/Measure {measure-b-id :id :as measure-b} {:name "Measure B"
                                                                              :table_id products-id
                                                                              :definition (-> (lib/query mp' products)
                                                                                              (lib/aggregate (lib/+ (lib.metadata/measure mp' measure-a-id)
                                                                                                                    (lib/sum rating))))}]
                (events/publish-event! :event/measure-create {:object measure-b :user-id (mt/user->id :crowberto)})
                (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                                     :id measure-b-id
                                                     :type "measure")
                      node-ids (set (map :id (:nodes response)))
                      node-types (set (map :type (:nodes response)))]
                  (testing "returns both measures and table"
                    (is (contains? node-ids measure-a-id))
                    (is (contains? node-ids measure-b-id))
                    (is (contains? node-types "table")))
                  (testing "edges show measure-b depends on measure-a"
                    (is (some #(and (= (:from_entity_type %) "measure")
                                    (= (:from_entity_id %) measure-b-id)
                                    (= (:to_entity_type %) "measure")
                                    (= (:to_entity_id %) measure-a-id))
                              (:edges response)))))))))))))

(deftest graph-measure-dependents-test
  (testing "GET /api/ee/dependencies/graph/dependents with measure"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card :model/Dependency]
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              products (lib.metadata/table mp products-id)
              price (lib.metadata/field mp (mt/id :products :price))]
          (mt/with-temp [:model/Measure {measure-id :id :as measure} {:name "Total Price"
                                                                      :table_id products-id
                                                                      :definition (-> (lib/query mp products)
                                                                                      (lib/aggregate (lib/sum price)))}
                         :model/User user {:email "test@test.com"}]
            (mt/with-test-user :crowberto
              (events/publish-event! :event/measure-create {:object measure :user-id (mt/user->id :crowberto)}))
            (let [mp' (mt/metadata-provider)
                  query-with-measure (-> (lib/query mp' products)
                                         (lib/aggregate (lib.metadata/measure mp' measure-id)))
                  card (card/create-card! (card-with-query "Card using measure" query-with-measure) user)
                  response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/dependents"
                                                 :id measure-id
                                                 :type "measure"
                                                 :dependent_types "card"
                                                 :dependent_card_types "question")]
              (testing "returns card that uses the measure"
                (is (= 1 (count response)))
                (is (= (:id card) (:id (first response))))))))))))

;; TODO (AlexP 01/15/26) -- fix and unskip this test
#_(deftest ^:sequential graph-archived-measure-in-chain-test
    (testing "GET /api/ee/dependencies/graph when a measure in the chain is archived"
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/Measure]
          (let [mp (mt/metadata-provider)
                products-id (mt/id :products)
                products (lib.metadata/table mp products-id)
                price (lib.metadata/field mp (mt/id :products :price))
              ;; Create measure A (base measure) via API
                {measure-a-id :id} (mt/user-http-request :crowberto :post 200 "measure"
                                                         {:name "Measure A"
                                                          :table_id products-id
                                                          :definition (-> (lib/query mp products)
                                                                          (lib/aggregate (lib/sum price)))})
                mp' (mt/metadata-provider)
              ;; Create measure B that depends on measure A
                {measure-b-id :id} (mt/user-http-request :crowberto :post 200 "measure"
                                                         {:name "Measure B"
                                                          :table_id products-id
                                                          :definition (-> (lib/query mp' products)
                                                                          (lib/aggregate (lib/* (lib.metadata/measure mp' measure-a-id)
                                                                                                2)))})
                mp'' (mt/metadata-provider)
              ;; Create measure C that depends on measure B
                {measure-c-id :id} (mt/user-http-request :crowberto :post 200 "measure"
                                                         {:name "Measure C"
                                                          :table_id products-id
                                                          :definition (-> (lib/query mp'' products)
                                                                          (lib/aggregate (lib/+ (lib.metadata/measure mp'' measure-b-id)
                                                                                                100)))})]
            (testing "before archiving, all three measures appear in the dependency graph"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                                   :id measure-c-id
                                                   :type "measure")
                    node-ids (set (map :id (:nodes response)))
                    edges (:edges response)]
                (is (contains? node-ids measure-a-id))
                (is (contains? node-ids measure-b-id))
                (is (contains? node-ids measure-c-id))
                (is (contains? node-ids products-id))
              ;; Verify the edge from B to A exists
                (is (some #(and (= (:from_entity_type %) "measure")
                                (= (:from_entity_id %) measure-b-id)
                                (= (:to_entity_type %) "measure")
                                (= (:to_entity_id %) measure-a-id))
                          edges)
                    "Edge from B to A should exist")))
          ;; Archive measure B (the middle of the chain)
            (mt/user-http-request :crowberto :put 200 (str "measure/" measure-b-id)
                                  {:archived true :revision_message "Archive middle measure"})
            (while (#'dependencies.backfill/backfill-dependencies!))
            (testing "after archiving measure B, it and measure A are excluded (chain broken)"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                                   :id measure-c-id
                                                   :type "measure")
                    node-ids (set (map :id (:nodes response)))]
                (is (contains? node-ids measure-c-id) "measure C should still appear")
                (is (not (contains? node-ids measure-b-id)) "archived measure B should be excluded")
                (is (not (contains? node-ids measure-a-id)) "measure A should be excluded (unreachable)")
              ;; products table still appears because measure C has a direct dependency on it
                (is (contains? node-ids products-id) "products table still appears (direct dep from C)")))
            (testing "with archived=true, the full chain is visible again"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                                   :id measure-c-id
                                                   :type "measure"
                                                   :archived true)
                    node-ids (set (map :id (:nodes response)))]
                (is (contains? node-ids measure-a-id) "measure A should appear with archived=true")
                (is (contains? node-ids measure-b-id) "measure B should appear with archived=true")
                (is (contains? node-ids measure-c-id) "measure C should appear")
                (is (contains? node-ids products-id) "products table should appear"))))))))

(deftest ^:sequential graph-view-count-test
  (testing "GET /api/ee/dependencies/graph should return :view_count for :card"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/Card {card-id :id} {}]
        (events/publish-event! :event/card-read {:object-id card-id :user-id user-id :context :question})
        (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                             :id card-id
                                             :type "card")]
          (is (=? {:nodes [{:id card-id
                            :data {:view_count 1}}]}
                  response))))))
  (testing "GET /api/ee/dependencies/graph should return :view_count for :dashboard"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User      {user-id :id}      {}
                     :model/Dashboard {dashboard-id :id} {}]
        (events/publish-event! :event/dashboard-read {:object-id dashboard-id :user-id user-id})
        (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                             :id dashboard-id
                                             :type "dashboard")]
          (is (=? {:nodes [{:id dashboard-id
                            :data {:view_count 1}}]}
                  response))))))
  (testing "GET /api/ee/dependencies/graph should return :view_count for :document"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User     {user-id :id}      {}
                     :model/Document {document-id :id} {}]
        (events/publish-event! :event/document-read {:object-id document-id :user-id user-id})
        (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                             :id document-id
                                             :type "document")]
          (is (=? {:nodes [{:id document-id
                            :data {:view_count 1}}]}
                  response)))))))

(deftest ^:sequential unreferenced-questions-test
  (testing "GET /api/ee/dependencies/unreferenced - only unreferenced questions are returned"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)
            products (lib.metadata/table mp (mt/id :products))]
        (mt/with-temp [:model/Card {referenced-card-id :id} {:name "Referenced Card - unreftest"
                                                             :type :question
                                                             :dataset_query (lib/query mp products)}
                       :model/Card {unreffed-card-id :id} {:name "Unreferenced Card - unreftest"
                                                           :type :question
                                                           :dataset_query (->> referenced-card-id
                                                                               (lib.metadata/card mp)
                                                                               (lib/query mp))}]
          (while (#'dependencies.backfill/backfill-dependencies!))
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=card&card_types=question&query=unreftest")]
            (is (=? {:data [{:id unreffed-card-id
                             :type "card"
                             :data {:name "Unreferenced Card - unreftest"}}]}
                    response))))))))

(deftest ^:sequential unreferenced-tables-test
  (testing "GET /api/ee/dependencies/unreferenced - only unreferenced tables are returned"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Table {unreffed-table-id :id} {:name "Unreferenced Table - unreftest"}
                       :model/Table {referenced-table-id :id} {:name "Referenced Table - unreftest"}
                       :model/Card _card {:name "Referencing Card"
                                          :type :question
                                          :dataset_query (lib/query mp (lib.metadata/table mp referenced-table-id))}]
          (while (#'dependencies.backfill/backfill-dependencies!))
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=table&query=unreftest")]
            (is (=? {:data [{:id unreffed-table-id
                             :type "table"
                             :data {:name "Unreferenced Table - unreftest"}}]}
                    response))))))))

(deftest ^:sequential unreferenced-transforms-test
  (testing "GET /api/ee/dependencies/unreferenced - only unreferenced transforms are returned"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)
            products (lib.metadata/table mp (mt/id :products))]
        (mt/with-temp [:model/Transform {unreffed-transform-id :id} {:name "Unreferenced Transform - unreftest"
                                                                     :source {:type :query
                                                                              :query (lib/query mp products)}
                                                                     :target {:schema "PUBLIC"
                                                                              :name "unreferenced_transform_table"}}
                       :model/Transform {referenced-transform-id :id} {:name "Referenced Transform - unreftest"
                                                                       :source {:type :query
                                                                                :query (lib/query mp products)}
                                                                       :target {:schema "PUBLIC"
                                                                                :name "referenced_transform_table"}}
                       :model/Table _ {:name "referenced_transform_table"
                                       :db_id (mt/id)
                                       :schema "PUBLIC"}]
          (events/publish-event! :event/transform-run-complete
                                 {:object {:db-id (mt/id)
                                           :output-schema "PUBLIC"
                                           :output-table "referenced_transform_table"
                                           :transform-id referenced-transform-id}})
          (while (#'dependencies.backfill/backfill-dependencies!))
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=transform&query=unreftest")]
            (is (=? {:data [{:id unreffed-transform-id
                             :type "transform"
                             :data {:name "Unreferenced Transform - unreftest"}}]}
                    response))))))))

(deftest ^:sequential unreferenced-snippets-test
  (testing "GET /api/ee/dependencies/unreferenced - only unreferenced snippets are returned"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/NativeQuerySnippet {unreffed-snippet-id :id} {:name "Unreferenced Snippet - unreftest"
                                                                            :content "WHERE ID > 10"}
                       :model/NativeQuerySnippet {referenced-snippet-id :id snippet-name :name} {:name "Referenced Snippet - unreftest"
                                                                                                 :content "WHERE ID > 20"}]
          (let [tag-name (str "snippet: " snippet-name)
                native-query (-> (lib/native-query mp (format "SELECT * FROM PRODUCTS %s" (str "{{" tag-name "}}")))
                                 (lib/with-template-tags {tag-name {:name tag-name
                                                                    :display-name (str "Snippet: " snippet-name)
                                                                    :type :snippet
                                                                    :snippet-name snippet-name
                                                                    :snippet-id referenced-snippet-id}}))]
            (mt/with-temp [:model/Card _card {:name "Card using snippet"
                                              :type :question
                                              :dataset_query native-query}]
              (while (#'dependencies.backfill/backfill-dependencies!))
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=snippet&query=unreftest")]
                (is (=? {:data   [{:id unreffed-snippet-id
                                   :type "snippet"
                                   :data {:name "Unreferenced Snippet - unreftest"}}]}
                        response))))))))))

(deftest ^:sequential unreferenced-dashboards-test
  (testing "GET /api/ee/dependencies/unreferenced - only unreferenced dashboards are returned"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Dashboard {unreffed-dashboard-id :id} {:name "Unreferenced Dashboard - unreftest"}
                     :model/Dashboard {referenced-dashboard-id :id} {:name "Referenced Dashboard - unreftest"}
                     :model/Document _ {:name "Document with dashboard link"
                                        :dependency_analysis_version 0
                                        :document {:type "doc"
                                                   :content [{:type "paragraph"
                                                              :content [{:type "smartLink"
                                                                         :attrs {:entityId referenced-dashboard-id
                                                                                 :model "dashboard"}}]}]}
                                        :content_type "application/json+vnd.prose-mirror"}]
        (while (#'dependencies.backfill/backfill-dependencies!))
        (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=dashboard&query=unreftest")]
          (is (=? {:data [{:id unreffed-dashboard-id
                           :type "dashboard"
                           :data {:name "Unreferenced Dashboard - unreftest"}}]}
                  response)))))))

(deftest ^:sequential unreferenced-documents-test
  (testing "GET /api/ee/dependencies/unreferenced - only unreferenced documents are returned"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Document {referenced-document-id :id} {:name "Referenced Document - unreftest"}
                     :model/Document {unreffed-document-id :id} {:name "Unreferenced Document - unreftest"
                                                                 :document {:type "doc"
                                                                            :content [{:type "paragraph"
                                                                                       :content [{:type "smartLink"
                                                                                                  :attrs {:entityId referenced-document-id
                                                                                                          :model "document"}}]}]}
                                                                 :content_type "application/json+vnd.prose-mirror"}]
        (while (#'dependencies.backfill/backfill-dependencies!))
        (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=document&query=unreftest")]
          (is (=? {:data [{:id unreffed-document-id
                           :type "document"
                           :data {:name "Unreferenced Document - unreftest"}}]}
                  response)))))))

(deftest ^:sequential unreferenced-sandboxes-test
  (testing "GET /api/ee/dependencies/unreferenced - unreferenced sandboxes are returned"
    (mt/with-premium-features #{:dependencies :sandboxes}
      (let [mp (mt/metadata-provider)
            products (lib.metadata/table mp (mt/id :products))]
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Sandbox Group - unreftest"}
                       :model/Card {sandbox-card-id :id} {:name "Sandbox Card - unreftest"
                                                          :type :question
                                                          :dataset_query (lib/query mp products)}
                       :model/Sandbox {sandbox-id :id} {:group_id group-id
                                                        :table_id (mt/id :products)
                                                        :card_id sandbox-card-id}]
          (while (#'dependencies.backfill/backfill-dependencies!))
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=sandbox")]
            (is (=? {:data [{:id sandbox-id
                             :type "sandbox"
                             :data {:table {:name "PRODUCTS"}}}]}
                    response))))))))

(deftest ^:sequential unreferenced-card-types-test
  (testing "GET /api/ee/dependencies/unreferenced - unreferenced models and metrics are filtered by card_types and pagination"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)
            products (lib.metadata/table mp (mt/id :products))]
        (mt/with-temp [:model/Card {unreffed-model-id :id} {:name "A - Unreferenced Model - cardtype"
                                                            :type :model
                                                            :dataset_query (lib/query mp products)}
                       :model/Card {unreffed-metric-id :id} {:name "B - Unreferenced Metric - cardtype"
                                                             :type :metric
                                                             :dataset_query (lib/query mp products)}]
          (while (#'dependencies.backfill/backfill-dependencies!))
          (testing "filtering by model only"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=card&card_types=model&query=cardtype")]
              (is (=? {:data [{:id unreffed-model-id
                               :type "card"
                               :data {:name "A - Unreferenced Model - cardtype"
                                      :type "model"}}]}
                      response))))
          (testing "filtering by metric only"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=card&card_types=metric&query=cardtype")]
              (is (=? {:data [{:id unreffed-metric-id
                               :type "card"
                               :data {:name "B - Unreferenced Metric - cardtype"
                                      :type "metric"}}]}
                      response))))
          (testing "filtering by model and metric as the default card types"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=card&query=cardtype")]
              (is (=? {:data [{:id unreffed-model-id
                               :type "card"
                               :data {:name "A - Unreferenced Model - cardtype"
                                      :type "model"}}
                              {:id unreffed-metric-id
                               :type "card"
                               :data {:name "B - Unreferenced Metric - cardtype"
                                      :type "metric"}}]}
                      response)))))))))

(deftest ^:sequential unreferenced-archived-card-test
  (testing "GET /api/ee/dependencies/graph/unreferenced with archived parameter"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)
            products (lib.metadata/table mp (mt/id :products))]
        (mt/with-temp [:model/Card {unreffed-card-id :id} {:name "Unreferenced Card - archivedtest"
                                                           :type :question
                                                           :dataset_query (lib/query mp products)}
                       :model/Card {archived-card-id :id} {:name "Archived Unreferenced Card - archivedtest"
                                                           :type :question
                                                           :archived true
                                                           :dataset_query (lib/query mp products)}]
          (while (#'dependencies.backfill/backfill-dependencies!))
          (testing "archived=false (default) excludes archived card"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=card&card_types=question&query=archivedtest")
                  card-ids (set (map :id (:data response)))]
              (is (contains? card-ids unreffed-card-id))
              (is (not (contains? card-ids archived-card-id)))))
          (testing "archived=true includes archived card"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=card&card_types=question&query=archivedtest&archived=true")
                  card-ids (set (map :id (:data response)))]
              (is (contains? card-ids unreffed-card-id))
              (is (contains? card-ids archived-card-id)))))))))

(deftest ^:sequential unreferenced-archived-dashboard-test
  (testing "GET /api/ee/dependencies/graph/unreferenced with archived parameter for dashboards"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Dashboard {unreffed-dashboard-id :id} {:name "Unreferenced Dashboard - archivedtest"}
                     :model/Dashboard {archived-dashboard-id :id} {:name "Archived Unreferenced Dashboard - archivedtest"
                                                                   :archived true}]
        (while (#'dependencies.backfill/backfill-dependencies!))
        (testing "archived=false (default) excludes archived dashboard"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=dashboard&query=archivedtest")
                dashboard-ids (set (map :id (:data response)))]
            (is (contains? dashboard-ids unreffed-dashboard-id))
            (is (not (contains? dashboard-ids archived-dashboard-id)))))
        (testing "archived=true includes archived dashboard"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=dashboard&query=archivedtest&archived=true")
                dashboard-ids (set (map :id (:data response)))]
            (is (contains? dashboard-ids unreffed-dashboard-id))
            (is (contains? dashboard-ids archived-dashboard-id))))))))

(deftest ^:sequential unreferenced-archived-document-test
  (testing "GET /api/ee/dependencies/graph/unreferenced with archived parameter for documents"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Document {unreffed-document-id :id} {:name "Unreferenced Document - archivedtest"}
                     :model/Document {archived-document-id :id} {:name "Archived Unreferenced Document - archivedtest"
                                                                 :archived true}]
        (while (#'dependencies.backfill/backfill-dependencies!))
        (testing "archived=false (default) excludes archived document"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=document&query=archivedtest")
                document-ids (set (map :id (:data response)))]
            (is (contains? document-ids unreffed-document-id))
            (is (not (contains? document-ids archived-document-id)))))
        (testing "archived=true includes archived document"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=document&query=archivedtest&archived=true")
                document-ids (set (map :id (:data response)))]
            (is (contains? document-ids unreffed-document-id))
            (is (contains? document-ids archived-document-id))))))))

(deftest ^:sequential unreferenced-archived-snippet-test
  (testing "GET /api/ee/dependencies/graph/unreferenced with archived parameter for snippets"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/NativeQuerySnippet {unreffed-snippet-id :id} {:name "Unreferenced Snippet - archivedtest"
                                                                          :content "WHERE ID > 10"}
                     :model/NativeQuerySnippet {archived-snippet-id :id} {:name "Archived Unreferenced Snippet - archivedtest"
                                                                          :content "WHERE ID > 20"
                                                                          :archived true}]
        (while (#'dependencies.backfill/backfill-dependencies!))
        (testing "archived=false (default) excludes archived snippet"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=snippet&query=archivedtest")
                snippet-ids (set (map :id (:data response)))]
            (is (contains? snippet-ids unreffed-snippet-id))
            (is (not (contains? snippet-ids archived-snippet-id)))))
        (testing "archived=true includes archived snippet"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=snippet&query=archivedtest&archived=true")
                snippet-ids (set (map :id (:data response)))]
            (is (contains? snippet-ids unreffed-snippet-id))
            (is (contains? snippet-ids archived-snippet-id))))))))

(deftest ^:sequential unreferenced-archived-segment-test
  (testing "GET /api/ee/dependencies/graph/unreferenced with archived parameter for segments"
    (mt/with-premium-features #{:dependencies}
      (let [products-id (mt/id :products)
            price-field-id (mt/id :products :price)]
        (mt/with-temp [:model/Segment {unreffed-segment-id :id :as unreffed-segment} {:name "Unreferenced Segment - archivedtest"
                                                                                      :table_id products-id
                                                                                      :definition {:filter [:> [:field price-field-id nil] 50]}}
                       :model/Segment {archived-segment-id :id :as archived-segment} {:name "Archived Unreferenced Segment - archivedtest"
                                                                                      :table_id products-id
                                                                                      :definition {:filter [:> [:field price-field-id nil] 100]}
                                                                                      :archived true}]
          (events/publish-event! :event/segment-create {:object unreffed-segment :user-id (mt/user->id :crowberto)})
          (events/publish-event! :event/segment-create {:object archived-segment :user-id (mt/user->id :crowberto)})
          (while (#'dependencies.backfill/backfill-dependencies!))
          (testing "archived=false (default) excludes archived segment"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=segment&query=archivedtest")
                  segment-ids (set (map :id (:data response)))]
              (is (contains? segment-ids unreffed-segment-id))
              (is (not (contains? segment-ids archived-segment-id)))))
          (testing "archived=true includes archived segment"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=segment&query=archivedtest&archived=true")
                  segment-ids (set (map :id (:data response)))]
              (is (contains? segment-ids unreffed-segment-id))
              (is (contains? segment-ids archived-segment-id)))))))))

(deftest ^:sequential unreferenced-archived-table-test
  (testing "GET /api/ee/dependencies/graph/unreferenced with archived parameter for tables"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Table {active-table-id :id} {:name "Active Unreferenced Table - archivedtest"
                                                         :db_id (mt/id)
                                                         :active true}
                     :model/Table {inactive-table-id :id} {:name "Inactive Unreferenced Table - archivedtest"
                                                           :db_id (mt/id)
                                                           :active false}
                     :model/Table {hidden-table-id :id} {:name "Hidden Unreferenced Table - archivedtest"
                                                         :db_id (mt/id)
                                                         :active true
                                                         :visibility_type "hidden"}]
        (while (#'dependencies.backfill/backfill-dependencies!))
        (testing "archived=false (default) excludes inactive and hidden tables"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=table&query=archivedtest")
                table-ids (set (map :id (:data response)))]
            (is (contains? table-ids active-table-id))
            (is (not (contains? table-ids inactive-table-id)))
            (is (not (contains? table-ids hidden-table-id)))))
        (testing "archived=true includes inactive and hidden tables"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=table&query=archivedtest&archived=true")
                table-ids (set (map :id (:data response)))]
            (is (contains? table-ids active-table-id))
            (is (contains? table-ids inactive-table-id))
            (is (contains? table-ids hidden-table-id))))))))

(deftest ^:sequential unreferenced-pagination-test
  (testing "GET /api/ee/dependencies/unreferenced - should paginate results"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Table {table1-id :id} {:name "Table 1 - unreftest"}
                     :model/Table {table2-id :id} {:name "Table 2 - unreftest"}
                     :model/Table {table3-id :id} {:name "Table 3 - unreftest"}]
        (while (#'dependencies.backfill/backfill-dependencies!))
        (is (=? {:data   [{:id table1-id} {:id table2-id}]
                 :total  3
                 :offset 0
                 :limit  2}
                (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=table&query=unreftest&offset=0&limit=2")))
        (is (=? {:data   [{:id table3-id}]
                 :total  3
                 :offset 2
                 :limit  2}
                (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=table&query=unreftest&offset=2&limit=2")))))))

(deftest ^:sequential unreferenced-sample-db-test
  (testing "GET /api/ee/dependencies/unreferenced - should not return tables from the sample database"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Database {db-id :id} {:is_sample true}
                     :model/Table    _           {:db_id db-id :name "Sample DB table - unreftest"}]
        (is (=? {:data   []
                 :total  0}
                (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=table&query=unreftest")))))))

(deftest ^:sequential unreferenced-audit-db-test
  (testing "GET /api/ee/dependencies/unreferenced - should not return tables from the audit database"
    (mt/with-premium-features #{:dependencies}
      (mt/with-empty-h2-app-db!
        (mbc/ensure-audit-db-installed!)
        (is (=? {:data   []
                 :total  0}
                (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=table&query=notification")))))))

(deftest ^:sequential unreferenced-archived-measure-test
  (testing "GET /api/ee/dependencies/graph/unreferenced with archived parameter for measures"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)
            products-id (mt/id :products)
            products (lib.metadata/table mp products-id)
            price (lib.metadata/field mp (mt/id :products :price))
            measure-definition (-> (lib/query mp products)
                                   (lib/aggregate (lib/sum price)))]
        (mt/with-temp [:model/Measure {unreffed-measure-id :id :as unreffed-measure} {:name "Unreferenced Measure - archivedtest"
                                                                                      :table_id products-id
                                                                                      :definition measure-definition}
                       :model/Measure {archived-measure-id :id :as archived-measure} {:name "Archived Unreferenced Measure - archivedtest"
                                                                                      :table_id products-id
                                                                                      :definition measure-definition
                                                                                      :archived true}]
          (events/publish-event! :event/measure-create {:object unreffed-measure :user-id (mt/user->id :crowberto)})
          (events/publish-event! :event/measure-create {:object archived-measure :user-id (mt/user->id :crowberto)})
          (while (#'dependencies.backfill/backfill-dependencies!))
          (testing "archived=false (default) excludes archived measure"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=measure&query=archivedtest")
                  measure-ids (set (map :id (:data response)))]
              (is (contains? measure-ids unreffed-measure-id))
              (is (not (contains? measure-ids archived-measure-id)))))
          (testing "archived=true includes archived measure"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=measure&query=archivedtest&archived=true")
                  measure-ids (set (map :id (:data response)))]
              (is (contains? measure-ids unreffed-measure-id))
              (is (contains? measure-ids archived-measure-id)))))))))

(deftest ^:sequential unreferenced-personal-collection-card-test
  (testing "GET /api/ee/dependencies/graph/unreferenced with include_personal_collections parameter for cards"
    (mt/with-premium-features #{:dependencies}
      (binding [collection/*allow-deleting-personal-collections* true]
        (let [mp (mt/metadata-provider)
              products (lib.metadata/table mp (mt/id :products))]
          (mt/with-temp [:model/User {user-id :id} {}
                         :model/Collection {personal-coll-id :id} {:personal_owner_id user-id
                                                                   :name "Test Personal Collection"}
                         :model/Collection {sub-personal-coll-id :id} {:name "Sub Personal Collection"
                                                                       :location (format "/%d/" personal-coll-id)}
                         :model/Card {card-in-personal :id} {:name "Card in Personal - personalcolltest"
                                                             :type :question
                                                             :collection_id personal-coll-id
                                                             :dataset_query (lib/query mp products)}
                         :model/Card {card-in-sub-personal :id} {:name "Card in Sub Personal - personalcolltest"
                                                                 :type :question
                                                                 :collection_id sub-personal-coll-id
                                                                 :dataset_query (lib/query mp products)}
                         :model/Card {card-regular :id} {:name "Card Regular - personalcolltest"
                                                         :type :question
                                                         :dataset_query (lib/query mp products)}]
            (while (#'dependencies.backfill/backfill-dependencies!))
            (testing "include_personal_collections=false (default) excludes cards in personal collections"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=card&card_types=question&query=personalcolltest")
                    card-ids (set (map :id (:data response)))]
                (is (not (contains? card-ids card-in-personal)))
                (is (not (contains? card-ids card-in-sub-personal)))
                (is (contains? card-ids card-regular))))
            (testing "include_personal_collections=true includes cards in personal collections"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=card&card_types=question&query=personalcolltest&include_personal_collections=true")
                    card-ids (set (map :id (:data response)))]
                (is (contains? card-ids card-in-personal))
                (is (contains? card-ids card-in-sub-personal))
                (is (contains? card-ids card-regular))))))))))

(deftest ^:sequential unreferenced-personal-collection-dashboard-test
  (testing "GET /api/ee/dependencies/graph/unreferenced with include_personal_collections parameter for dashboards"
    (mt/with-premium-features #{:dependencies}
      (binding [collection/*allow-deleting-personal-collections* true]
        (mt/with-temp [:model/User {user-id :id} {}
                       :model/Collection {personal-coll-id :id} {:personal_owner_id user-id
                                                                 :name "Test Personal Collection"}
                       :model/Dashboard {dash-in-personal :id} {:name "Dashboard in Personal - personalcolltest"
                                                                :collection_id personal-coll-id}
                       :model/Dashboard {dash-regular :id} {:name "Dashboard Regular - personalcolltest"}]
          (while (#'dependencies.backfill/backfill-dependencies!))
          (testing "include_personal_collections=false (default) excludes dashboards in personal collections"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=dashboard&query=personalcolltest")
                  dashboard-ids (set (map :id (:data response)))]
              (is (not (contains? dashboard-ids dash-in-personal)))
              (is (contains? dashboard-ids dash-regular))))
          (testing "include_personal_collections=true includes dashboards in personal collections"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/unreferenced?types=dashboard&query=personalcolltest&include_personal_collections=true")
                  dashboard-ids (set (map :id (:data response)))]
              (is (contains? dashboard-ids dash-in-personal))
              (is (contains? dashboard-ids dash-regular)))))))))

(deftest ^:sequential unreferenced-sort-by-name-test
  (testing "GET /api/ee/dependencies/graph/unreferenced - sorting by name"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card               _ {:name "A Card sorttest"}
                     :model/Table              _ {:name "B Table sorttest"
                                                  :display_name "B Table sorttest"}
                     :model/Transform          _ {:name "C Transform sorttest"}
                     :model/NativeQuerySnippet _ {:name "D Snippet sorttest"}
                     :model/Dashboard          _ {:name "E Dashboard sorttest"}
                     :model/Document           _ {:name "F Document sorttest"}
                     :model/Segment            _ {:name "G Segment sorttest"}
                     :model/Measure            _ {:name "H Measure sorttest"}]
        (while (#'dependencies.backfill/backfill-dependencies!))
        (doseq [sort-direction [:asc :desc]]
          (let [response (mt/user-http-request :crowberto :get 200
                                               "ee/dependencies/graph/unreferenced"
                                               :query "sorttest"
                                               :sort_column :name
                                               :sort_direction sort-direction)
                names (mapv #(get-in % [:data :name]) (:data response))]
            (is (= (cond-> ["A Card sorttest"
                            "B Table sorttest"
                            "C Transform sorttest"
                            "D Snippet sorttest"
                            "E Dashboard sorttest"
                            "F Document sorttest"
                            "G Segment sorttest"
                            "H Measure sorttest"]
                     (= sort-direction :desc) reverse)
                   names))))))))

(deftest ^:sequential unreferenced-sort-by-location-test
  (testing "GET /api/ee/dependencies/graph/unreferenced - sorting by location"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [;; locations
                     :model/Database   {db-id :id}          {:name "A Database"}
                     :model/Table      {table1-id :id}      {:name "B Table"
                                                             :display_name "B Table"
                                                             :db_id db-id}
                     :model/Table      {table2-id :id}      {:name "C Table"
                                                             :display_name "C Table"
                                                             :db_id db-id}
                     :model/Collection {collection1-id :id} {:name "D Collection"}
                     :model/Collection {collection2-id :id} {:name "E Collection"
                                                             :namespace :transforms}
                     :model/Collection {collection3-id :id} {:name "F Collection"
                                                             :namespace :snippets}
                     :model/Collection {collection4-id :id} {:name "G Collection"}
                     :model/Collection {collection5-id :id} {:name "H Collection"}
                     :model/Dashboard  {dashboard-id :id}   {:name "I Dashboard"
                                                             :collection_id collection1-id}
                     :model/Document   {document-id :id}    {:name "J Document"
                                                             :collection_id collection1-id}
                     ;; entities
                     :model/Card               _ {:name          "Card with Collection 1 sorttest"
                                                  :collection_id collection1-id}
                     :model/Card               _ {:name          "Card with Dashboard sorttest"
                                                  :collection_id collection1-id
                                                  :dashboard_id  dashboard-id}
                     :model/Card               _ {:name          "Card with Document sorttest"
                                                  :collection_id collection1-id
                                                  :document_id   document-id}
                     :model/Table              _ {:name         "Table with Database sorttest"
                                                  :display_name "Table sorttest"
                                                  :db_id        db-id}
                     :model/Transform          _ {:name          "Transform with Collection 2 sorttest"
                                                  :collection_id collection2-id}
                     :model/NativeQuerySnippet _ {:name          "Snippet with Collection 3 sorttest"
                                                  :collection_id collection3-id}
                     :model/Dashboard          _ {:name          "Dashboard with Collection 4 sorttest"
                                                  :collection_id collection4-id}
                     :model/Document           _ {:name          "Document with Collection 5 sorttest"
                                                  :collection_id collection5-id}
                     :model/Segment            _ {:name     "Segment with Table 1 sorttest"
                                                  :table_id table1-id}
                     :model/Measure            _ {:name     "Measure with Table 2 sorttest"
                                                  :table_id table2-id}]
        (while (#'dependencies.backfill/backfill-dependencies!))
        (doseq [sort-direction [:asc :desc]]
          (let [response (mt/user-http-request :crowberto :get 200
                                               "ee/dependencies/graph/unreferenced"
                                               :query "sorttest"
                                               :sort_column :location
                                               :sort_direction sort-direction)
                names (mapv #(get-in % [:data :name]) (:data response))]
            (is (= (cond-> ["Table with Database sorttest"
                            "Segment with Table 1 sorttest"
                            "Measure with Table 2 sorttest"
                            "Card with Collection 1 sorttest"
                            "Transform with Collection 2 sorttest"
                            "Snippet with Collection 3 sorttest"
                            "Dashboard with Collection 4 sorttest"
                            "Document with Collection 5 sorttest"
                            "Card with Dashboard sorttest"
                            "Card with Document sorttest"]
                     (= sort-direction :desc) reverse)
                   names))))))))

(deftest ^:sequential unreferenced-sort-by-location-with-root-collection-test
  (testing "GET /api/ee/dependencies/graph/unreferenced - sorting by location with root collection"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Collection {collection1-id :id} {:name "Collection 1"}
                     :model/Card               _ {:name "Our analytics sorttest"}
                     :model/Card               _ {:name "Collection 1 sorttest"
                                                  :collection_id collection1-id}
                     :model/NativeQuerySnippet _ {:name "SQL snippets sorttest"}
                     :model/Transform          _ {:name "Transforms sorttest"}]
        (while (#'dependencies.backfill/backfill-dependencies!))
        (doseq [sort-direction [:asc :desc]]
          (let [response (mt/user-http-request :crowberto :get 200
                                               "ee/dependencies/graph/unreferenced"
                                               :query "sorttest"
                                               :sort_column :location
                                               :sort_direction sort-direction)
                names (mapv #(get-in % [:data :name]) (:data response))]
            (is (= (cond-> ["Collection 1 sorttest"
                            "Our analytics sorttest"
                            "SQL snippets sorttest"
                            "Transforms sorttest"]
                     (= sort-direction :desc) reverse)
                   names))))))))

(deftest ^:sequential breaking-entities-returns-source-of-errors-test
  (testing "GET /api/ee/dependencies/graph/breaking - returns entities that are SOURCE of downstream errors"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create cards in one metadata provider cache session
          (let [[model-card dependent-card]
                (lib-be/with-metadata-provider-cache
                  (let [model-card (create-model-card! user "Model Card - brokentest")
                        dependent-card (create-dependent-card-on-model! user model-card "Dependent Card - brokentest")]
                    [model-card dependent-card]))]
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card))
            ;; Run analysis in a fresh metadata provider cache session to detect the broken reference
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card)))
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/breaking?types=card&query=brokentest")]
              (is (= [(:id model-card)] (mapv :id (:data response)))
                  "Model card should appear as a breaking entity"))))))))

(deftest ^:sequential breaking-entities-types-filtering-test
  (testing "GET /api/ee/dependencies/graph/breaking - types parameter filters results"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create cards in one metadata provider cache session
          (let [[model-card-1 model-card-2 dependent-card-1 dependent-card-2]
                (lib-be/with-metadata-provider-cache
                  (let [model-card-1 (create-model-card! user "Model Card 1 - typesfiltertest")
                        model-card-2 (create-model-card! user "Model Card 2 - typesfiltertest")
                        dependent-card-1 (create-dependent-card-on-model! user model-card-1 "Dependent Card 1 - typesfiltertest")
                        dependent-card-2 (create-dependent-card-on-model! user model-card-2 "Dependent Card 2 - typesfiltertest")]
                    [model-card-1 model-card-2 dependent-card-1 dependent-card-2]))]
            ;; Break both models
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card-1)
              (break-model-card! model-card-2))
            ;; Run analysis in a fresh metadata provider cache session to detect broken references
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card-1))
              (run-analysis-for-card! (:id dependent-card-2)))
            (testing "filtering by card returns only card sources"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/breaking?types=card&query=typesfiltertest")
                    ids (set (map :id (:data response)))]
                (is (contains? ids (:id model-card-1)) "Model card 1 should be in results")
                (is (contains? ids (:id model-card-2)) "Model card 2 should be in results")))
            (testing "filtering by table returns empty (no table sources in this test)"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/breaking?types=table&query=typesfiltertest")
                    ids (set (map :id (:data response)))]
                (is (empty? ids) "No tables should be in results")))))))))

(deftest ^:sequential breaking-entities-archived-card-test
  (testing "GET /api/ee/dependencies/graph/breaking with archived parameter for source cards"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create cards in one metadata provider cache session
          (let [[active-model archived-model dependent-card-1 dependent-card-2]
                (lib-be/with-metadata-provider-cache
                  (let [active-model (create-model-card! user "Active Model - archivedbrokentestcard")
                        archived-model (create-model-card! user "Archived Model - archivedbrokentestcard")
                        dependent-card-1 (create-dependent-card-on-model! user active-model "Dependent of Active - archivedbrokentestcard")
                        dependent-card-2 (create-dependent-card-on-model! user archived-model "Dependent of Archived - archivedbrokentestcard")]
                    [active-model archived-model dependent-card-1 dependent-card-2]))]
            ;; Archive the second model
            (card/update-card! {:card-before-update archived-model
                                :card-updates {:archived true}})
            ;; Break both models
            (lib-be/with-metadata-provider-cache
              (break-model-card! active-model)
              (break-model-card! (t2/select-one :model/Card :id (:id archived-model))))
            ;; Run analysis in a fresh metadata provider cache session to detect broken references
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card-1))
              (run-analysis-for-card! (:id dependent-card-2)))
            (testing "archived=false (default) excludes archived source card"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/breaking?types=card&query=archivedbrokentestcard")
                    card-ids (set (map :id (:data response)))]
                (is (contains? card-ids (:id active-model)))
                (is (not (contains? card-ids (:id archived-model))))))
            (testing "archived=true includes archived source card"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/breaking?types=card&query=archivedbrokentestcard&archived=true")
                    card-ids (set (map :id (:data response)))]
                (is (contains? card-ids (:id active-model)))
                (is (contains? card-ids (:id archived-model)))))))))))

(deftest ^:sequential breaking-entities-multiple-dependents-test
  (testing "GET /api/ee/dependencies/graph/breaking - model breaking multiple dependents appears once"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create cards in one metadata provider cache session
          (let [[model-card dependent-card-1 dependent-card-2]
                (lib-be/with-metadata-provider-cache
                  (let [model-card (create-model-card! user "Model Card - multipledependents")
                        dependent-card-1 (create-dependent-card-on-model! user model-card "Dependent 1 - multipledependents")
                        dependent-card-2 (create-dependent-card-on-model! user model-card "Dependent 2 - multipledependents")]
                    [model-card dependent-card-1 dependent-card-2]))]
            ;; Break the model
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card))
            ;; Run analysis in a fresh metadata provider cache session to detect broken references
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card-1))
              (run-analysis-for-card! (:id dependent-card-2)))
            (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/breaking?types=card&query=multipledependents")
                  model-ids (filter #(= (:id %) (:id model-card)) (:data response))]
              (is (= 1 (count model-ids)) "Model should appear exactly once even with multiple broken dependents"))))))))

(deftest ^:sequential breaking-entities-personal-collection-card-test
  (testing "GET /api/ee/dependencies/graph/breaking with include_personal_collections parameter"
    (mt/with-premium-features #{:dependencies}
      (binding [collection/*allow-deleting-personal-collections* true]
        (mt/with-temp [:model/User {user-id :id} {}
                       :model/User creator {:email "creator@test.com"}
                       :model/Collection {personal-coll-id :id} {:personal_owner_id user-id
                                                                 :name "Test Personal Collection"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
            ;; Create cards in one metadata provider cache session
            (let [[model-in-personal model-regular dependent-card-1 dependent-card-2]
                  (lib-be/with-metadata-provider-cache
                    (let [model-in-personal (create-model-card! creator "Model in Personal - personalcollbrokentest"
                                                                :collection-id personal-coll-id)
                          model-regular (create-model-card! creator "Model Regular - personalcollbrokentest")
                          dependent-card-1 (create-dependent-card-on-model! creator model-in-personal "Dependent of Personal - personalcollbrokentest")
                          dependent-card-2 (create-dependent-card-on-model! creator model-regular "Dependent of Regular - personalcollbrokentest")]
                      [model-in-personal model-regular dependent-card-1 dependent-card-2]))]
              ;; Break both models
              (lib-be/with-metadata-provider-cache
                (break-model-card! model-in-personal)
                (break-model-card! model-regular))
              ;; Run analysis in a fresh metadata provider cache session to detect broken references
              (lib-be/with-metadata-provider-cache
                (while (#'dependencies.backfill/backfill-dependencies!))
                (run-analysis-for-card! (:id dependent-card-1))
                (run-analysis-for-card! (:id dependent-card-2)))
              (testing "include_personal_collections=false (default) excludes source cards in personal collections"
                (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/breaking?types=card&query=personalcollbrokentest")
                      card-ids (set (map :id (:data response)))]
                  (is (not (contains? card-ids (:id model-in-personal))))
                  (is (contains? card-ids (:id model-regular)))))
              (testing "include_personal_collections=true includes source cards in personal collections"
                (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/breaking?types=card&query=personalcollbrokentest&include_personal_collections=true")
                      card-ids (set (map :id (:data response)))]
                  (is (contains? card-ids (:id model-in-personal)))
                  (is (contains? card-ids (:id model-regular))))))))))))

(deftest ^:sequential breaking-entities-pagination-test
  (testing "GET /api/ee/dependencies/graph/breaking - should paginate results"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create cards in one metadata provider cache session
          (let [[model-card-1 model-card-2 dependent-card-1 dependent-card-2]
                (lib-be/with-metadata-provider-cache
                  (let [model-card-1 (create-model-card! user "A Model Card - paginationtest")
                        model-card-2 (create-model-card! user "B Model Card - paginationtest")
                        dependent-card-1 (create-dependent-card-on-model! user model-card-1 "Dependent Card 1 - paginationtest")
                        dependent-card-2 (create-dependent-card-on-model! user model-card-2 "Dependent Card 2 - paginationtest")]
                    [model-card-1 model-card-2 dependent-card-1 dependent-card-2]))]
            ;; Break both models
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card-1)
              (break-model-card! model-card-2))
            ;; Run analysis in a fresh metadata provider cache session to detect broken references
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card-1))
              (run-analysis-for-card! (:id dependent-card-2)))
            (is (=? {:data   [{:id (:id model-card-1)}]
                     :total  2
                     :offset 0
                     :limit  1}
                    (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/breaking?types=card&query=paginationtest&offset=0&limit=1")))
            (is (=? {:data   [{:id (:id model-card-2)}]
                     :total  2
                     :offset 1
                     :limit  1}
                    (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/breaking?types=card&query=paginationtest&offset=1&limit=1")))))))))

(deftest ^:sequential breaking-entities-sort-by-name-test
  (testing "GET /api/ee/dependencies/graph/breaking - sorting by name"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create cards in one metadata provider cache session
          (let [[model-card-a model-card-b dependent-card-a dependent-card-b]
                (lib-be/with-metadata-provider-cache
                  (let [model-card-a (create-model-card! user "A Card sortnametest")
                        model-card-b (create-model-card! user "B Card sortnametest")
                        dependent-card-a (create-dependent-card-on-model! user model-card-a "Dependent A - sortnametest")
                        dependent-card-b (create-dependent-card-on-model! user model-card-b "Dependent B - sortnametest")]
                    [model-card-a model-card-b dependent-card-a dependent-card-b]))]
            ;; Break both models
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card-a)
              (break-model-card! model-card-b))
            ;; Run analysis in a fresh metadata provider cache session to detect broken references
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card-a))
              (run-analysis-for-card! (:id dependent-card-b)))
            (doseq [sort-direction [:asc :desc]]
              (let [response (mt/user-http-request :crowberto :get 200
                                                   "ee/dependencies/graph/breaking"
                                                   :types "card"
                                                   :query "sortnametest"
                                                   :sort_column :name
                                                   :sort_direction sort-direction)
                    names (mapv #(get-in % [:data :name]) (:data response))]
                (is (= (cond-> ["A Card sortnametest"
                                "B Card sortnametest"]
                         (= sort-direction :desc) reverse)
                       names))))))))))

(deftest ^:sequential breaking-entities-sort-by-location-test
  (testing "GET /api/ee/dependencies/graph/breaking - sorting by location"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}
                     :model/Collection {collection1-id :id} {:name "B Collection"}
                     :model/Collection {collection2-id :id} {:name "A Collection"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create cards in one metadata provider cache session
          (let [[model-in-coll1 model-in-coll2 dependent-card-1 dependent-card-2]
                (lib-be/with-metadata-provider-cache
                  (let [model-in-coll1 (create-model-card! user "Card with Collection 1 sortloctest" :collection-id collection1-id)
                        model-in-coll2 (create-model-card! user "Card with Collection 2 sortloctest" :collection-id collection2-id)
                        dependent-card-1 (create-dependent-card-on-model! user model-in-coll1 "Dependent of Coll1 - sortloctest")
                        dependent-card-2 (create-dependent-card-on-model! user model-in-coll2 "Dependent of Coll2 - sortloctest")]
                    [model-in-coll1 model-in-coll2 dependent-card-1 dependent-card-2]))]
            ;; Break both models
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-in-coll1)
              (break-model-card! model-in-coll2))
            ;; Run analysis in a fresh metadata provider cache session to detect broken references
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card-1))
              (run-analysis-for-card! (:id dependent-card-2)))
            (doseq [sort-direction [:asc :desc]]
              (let [response (mt/user-http-request :crowberto :get 200
                                                   "ee/dependencies/graph/breaking"
                                                   :types "card"
                                                   :query "sortloctest"
                                                   :sort_column :location
                                                   :sort_direction sort-direction)
                    names (mapv #(get-in % [:data :name]) (:data response))]
                (is (= (cond-> ["Card with Collection 2 sortloctest"
                                "Card with Collection 1 sortloctest"]
                         (= sort-direction :desc) reverse)
                       names))))))))))

(deftest ^:sequential breaking-entities-sort-by-dependents-with-errors-count-test
  (testing "GET /api/ee/dependencies/graph/breaking - sorting by dependents with errors count"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create cards in one metadata provider cache session
          (let [[model-card-1 model-card-2 dependent-card-1a dependent-card-1b dependent-card-2a]
                (lib-be/with-metadata-provider-cache
                  (let [model-card-1 (create-model-card! user "Card 1 sortdepstest")
                        model-card-2 (create-model-card! user "Card 2 sortdepstest")
                        ;; Model 1 has 2 dependents, Model 2 has 1 dependent
                        dependent-card-1a (create-dependent-card-on-model! user model-card-1 "Dependent 1a - sortdepstest")
                        dependent-card-1b (create-dependent-card-on-model! user model-card-1 "Dependent 1b - sortdepstest")
                        dependent-card-2a (create-dependent-card-on-model! user model-card-2 "Dependent 2a - sortdepstest")]
                    [model-card-1 model-card-2 dependent-card-1a dependent-card-1b dependent-card-2a]))]
            ;; Break both models
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card-1)
              (break-model-card! model-card-2))
            ;; Run analysis in a fresh metadata provider cache session to detect broken references
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card-1a))
              (run-analysis-for-card! (:id dependent-card-1b))
              (run-analysis-for-card! (:id dependent-card-2a)))
            (doseq [sort-direction [:asc :desc]]
              (let [response (mt/user-http-request :crowberto :get 200
                                                   "ee/dependencies/graph/breaking"
                                                   :types "card"
                                                   :query "sortdepstest"
                                                   :sort_column :dependents-with-errors
                                                   :sort_direction sort-direction)
                    names (mapv #(get-in % [:data :name]) (:data response))]
                (is (= (cond-> ["Card 2 sortdepstest"
                                "Card 1 sortdepstest"]
                         (= sort-direction :desc) reverse)
                       names))))))))))

(deftest ^:sequential breaking-entities-sort-by-dependents-with-errors-test
  (testing "GET /api/ee/dependencies/graph/breaking - sorting by dependents with errors count"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create cards in one metadata provider cache session
          ;; Model 1 breaks 2 dependent cards (2 unique analyzed entities with errors)
          ;; Model 2 breaks 1 dependent card (1 unique analyzed entity with errors)
          (let [[model-card-1 model-card-2 dependent-card-1a dependent-card-1b dependent-card-2a]
                (lib-be/with-metadata-provider-cache
                  (let [model-card-1 (create-model-card! user "Card 1 sorterrorstest")
                        model-card-2 (create-model-card! user "Card 2 sorterrorstest")
                        dependent-card-1a (create-dependent-card-on-model! user model-card-1 "Dependent 1a - sorterrorstest")
                        dependent-card-1b (create-dependent-card-on-model! user model-card-1 "Dependent 1b - sorterrorstest")
                        dependent-card-2a (create-dependent-card-on-model! user model-card-2 "Dependent 2a - sorterrorstest")]
                    [model-card-1 model-card-2 dependent-card-1a dependent-card-1b dependent-card-2a]))]
            ;; Break both models
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card-1)
              (break-model-card! model-card-2))
            ;; Run analysis in a fresh metadata provider cache session to detect broken references
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card-1a))
              (run-analysis-for-card! (:id dependent-card-1b))
              (run-analysis-for-card! (:id dependent-card-2a)))
            (doseq [sort-direction [:asc :desc]]
              (let [response (mt/user-http-request :crowberto :get 200
                                                   "ee/dependencies/graph/breaking"
                                                   :types "card"
                                                   :query "sorterrorstest"
                                                   :sort_column :dependents-with-errors
                                                   :sort_direction sort-direction)
                    names (mapv #(get-in % [:data :name]) (:data response))]
                ;; Card 2 has 1 broken dependent, Card 1 has 2 broken dependents
                ;; Ascending: fewer errors first, Descending: more errors first
                (is (= (cond-> ["Card 2 sorterrorstest"
                                "Card 1 sorterrorstest"]
                         (= sort-direction :desc) reverse)
                       names))))))))))

(defn- get-dependents
  "Helper to call the /graph/dependents endpoint."
  [base-card-id & opts]
  (apply mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/dependents"
         :id base-card-id :type "card" opts))

(defn- create-dependent!
  "Create a dependent card with the given name."
  [base-card user card-name & opts]
  (card/create-card! (apply assoc (wrap-card base-card) :name card-name opts) user))

(defmacro ^:private with-dependents-test!
  [[user-binding base-card-binding] & body]
  `(mt/with-premium-features #{:dependencies}
     (mt/with-model-cleanup [:model/Card :model/Dependency]
       (mt/with-temp [:model/User user# {:email "test@test.com"}]
         (let [~user-binding user#
               ~base-card-binding (card/create-card! (basic-card "Base") user#)]
           ~@body)))))

(deftest ^:sequential dependents-query-filter-test
  (testing "GET /api/ee/dependencies/graph/dependents with query parameter"
    (with-dependents-test! [user {base-card-id :id :as base-card}]
      (create-dependent! base-card user "Alpha")
      (create-dependent! base-card user "Beta")
      (create-dependent! base-card user "Gamma")
      (testing "filters by name"
        (is (=? [{:data {:name "Alpha"}}]
                (get-dependents base-card-id :query "Alpha"))))
      (testing "query is case-insensitive"
        (is (=? [{:data {:name "Beta"}}]
                (get-dependents base-card-id :query "BETA"))))
      (testing "no query returns all dependents"
        (is (= 3 (count (get-dependents base-card-id))))))))

(deftest ^:sequential dependents-query-filter-by-location-test
  (testing "GET /api/ee/dependencies/graph/dependents query filters by location (collection name)"
    (with-dependents-test! [user {base-card-id :id :as base-card}]
      (mt/with-temp [:model/Collection {coll-id :id} {:name "SpecialCollection"}]
        (create-dependent! base-card user "Card in root")
        (create-dependent! base-card user "Card in collection" :collection_id coll-id)
        (is (=? [{:data {:name "Card in collection"}}]
                (get-dependents base-card-id :query "SpecialCollection")))))))

(deftest ^:sequential dependents-personal-collections-test
  (testing "GET /api/ee/dependencies/graph/dependents with include_personal_collections parameter"
    (binding [collection/*allow-deleting-personal-collections* true]
      (with-dependents-test! [{user-id :id :as user} {base-card-id :id :as base-card}]
        (mt/with-temp [:model/Collection {personal-coll-id :id} {:personal_owner_id user-id}
                       :model/Collection {sub-coll-id :id} {:location (format "/%d/" personal-coll-id)}]
          (create-dependent! base-card user "In Personal" :collection_id personal-coll-id)
          (create-dependent! base-card user "In Sub" :collection_id sub-coll-id)
          (create-dependent! base-card user "Regular")
          (testing "default excludes personal collections"
            (is (=? [{:data {:name "Regular"}}]
                    (get-dependents base-card-id))))
          (testing "include_personal_collections=true includes them"
            (is (= 3 (count (get-dependents base-card-id :include_personal_collections true))))))))))

(deftest ^:sequential dependents-sort-by-name-test
  (testing "GET /api/ee/dependencies/graph/dependents - sorting by name"
    (with-dependents-test! [user {base-card-id :id :as base-card}]
      (create-dependent! base-card user "C Card")
      (create-dependent! base-card user "A Card")
      (create-dependent! base-card user "B Card")
      (is (=? [{:data {:name "A Card"}} {:data {:name "B Card"}} {:data {:name "C Card"}}]
              (get-dependents base-card-id :sort_column :name :sort_direction :asc)))
      (is (=? [{:data {:name "C Card"}} {:data {:name "B Card"}} {:data {:name "A Card"}}]
              (get-dependents base-card-id :sort_column :name :sort_direction :desc))))))

(deftest ^:sequential dependents-sort-by-location-test
  (testing "GET /api/ee/dependencies/graph/dependents - sorting by location"
    (with-dependents-test! [user {base-card-id :id :as base-card}]
      (mt/with-temp [:model/Collection {coll-a :id} {:name "A Collection"}
                     :model/Collection {coll-b :id} {:name "B Collection"}
                     :model/Collection {coll-c :id} {:name "C Collection"}]
        (create-dependent! base-card user "In C" :collection_id coll-c)
        (create-dependent! base-card user "In A" :collection_id coll-a)
        (create-dependent! base-card user "In B" :collection_id coll-b)
        (is (=? [{:data {:name "In A"}} {:data {:name "In B"}} {:data {:name "In C"}}]
                (get-dependents base-card-id :sort_column :location :sort_direction :asc)))
        (is (=? [{:data {:name "In C"}} {:data {:name "In B"}} {:data {:name "In A"}}]
                (get-dependents base-card-id :sort_column :location :sort_direction :desc)))))))

(deftest ^:sequential dependents-sort-by-view-count-test
  (testing "GET /api/ee/dependencies/graph/dependents - sorting by view-count"
    (with-dependents-test! [user {base-card-id :id :as base-card}]
      (let [{low-id :id} (create-dependent! base-card user "Low")
            {mid-id :id} (create-dependent! base-card user "Mid")
            {high-id :id} (create-dependent! base-card user "High")]
        (t2/update! :model/Card low-id {:view_count 10})
        (t2/update! :model/Card mid-id {:view_count 50})
        (t2/update! :model/Card high-id {:view_count 100})
        (is (=? [{:data {:view_count 10}} {:data {:view_count 50}} {:data {:view_count 100}}]
                (get-dependents base-card-id :sort_column :view-count :sort_direction :asc)))
        (is (=? [{:data {:view_count 100}} {:data {:view_count 50}} {:data {:view_count 10}}]
                (get-dependents base-card-id :sort_column :view-count :sort_direction :desc)))))))

(deftest ^:sequential dependents-sort-view-count-mixed-types-test
  (testing "GET /api/ee/dependencies/graph/dependents - view-count sorting with mixed entity types"
    (with-dependents-test! [user {base-card-id :id :as base-card}]
      (mt/with-model-cleanup [:model/DashboardCard]
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Dashboard" :view_count 200}]
          (let [{low-id :id} (create-dependent! base-card user "Low")
                {high-id :id} (create-dependent! base-card user "High")]
            (t2/insert! :model/DashboardCard {:dashboard_id dashboard-id :card_id base-card-id
                                              :row 0 :col 0 :size_x 4 :size_y 4})
            (while (#'dependencies.backfill/backfill-dependencies!))
            (t2/update! :model/Card low-id {:view_count 10})
            (t2/update! :model/Card high-id {:view_count 100})
            (is (=? [{:data {:view_count 10}} {:data {:view_count 100}} {:data {:view_count 200}}]
                    (get-dependents base-card-id :sort_column :view-count :sort_direction :asc)))
            (is (=? [{:data {:view_count 200}} {:data {:view_count 100}} {:data {:view_count 10}}]
                    (get-dependents base-card-id :sort_column :view-count :sort_direction :desc)))))))))

(deftest ^:sequential dependents-query-and-sort-combined-test
  (testing "GET /api/ee/dependencies/graph/dependents with query and sort together"
    (with-dependents-test! [user {base-card-id :id :as base-card}]
      (create-dependent! base-card user "C Match")
      (create-dependent! base-card user "A Match")
      (create-dependent! base-card user "B Match")
      (create-dependent! base-card user "Should not appear")
      (is (=? [{:data {:name "A Match"}} {:data {:name "B Match"}} {:data {:name "C Match"}}]
              (get-dependents base-card-id :query "Match" :sort_column :name :sort_direction :asc))))))

(deftest ^:sequential node-errors-filtering-test
  (testing "node-errors filters by source visibility"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Collection {coll-id :id}     {}
                     :model/Card       {card-id :id}     {:collection_id coll-id}
                     :model/Card       {visible-src :id} {:collection_id coll-id}
                     :model/Card       {archived-src :id} {:collection_id coll-id :archived true}]
        ;; Create errors: one with visible source, one with archived source, one with nil source
        (t2/insert! :model/AnalysisFindingError
                    [{:analyzed_entity_type "card"
                      :analyzed_entity_id   card-id
                      :source_entity_type   "card"
                      :source_entity_id     visible-src
                      :error_type           "missing-column"
                      :error_detail         "col1"}
                     {:analyzed_entity_type "card"
                      :analyzed_entity_id   card-id
                      :source_entity_type   "card"
                      :source_entity_id     archived-src
                      :error_type           "missing-column"
                      :error_detail         "col2"}
                     {:analyzed_entity_type "card"
                      :analyzed_entity_id   card-id
                      :source_entity_type   nil
                      :source_entity_id     nil
                      :error_type           "invalid-query"}])
        (let [result      (#'deps.api/node-errors {:card [card-id]})
              card-errors (get result [:card card-id])]
          (testing "includes errors with visible source"
            (is (contains? card-errors {:type :missing-column :detail "col1"})))
          (testing "excludes errors with archived source"
            (is (not (contains? card-errors {:type :missing-column :detail "col2"}))))
          (testing "includes errors with nil source"
            (is (contains? card-errors {:type :invalid-query}))))))))

(deftest ^:sequential node-downstream-errors-filtering-test
  (testing "node-downstream-errors filters by analyzed entity visibility"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Collection {coll-id :id}       {}
                     :model/Card       {source-card :id}   {:collection_id coll-id}
                     :model/Card       {visible-card :id}  {:collection_id coll-id}
                     :model/Card       {archived-card :id} {:collection_id coll-id :archived true}]
        ;; Create errors: one with visible analyzed entity, one with archived analyzed entity
        (t2/insert! :model/AnalysisFindingError
                    [{:analyzed_entity_type "card"
                      :analyzed_entity_id   visible-card
                      :source_entity_type   "card"
                      :source_entity_id     source-card
                      :error_type           "missing-column"}
                     {:analyzed_entity_type "card"
                      :analyzed_entity_id   archived-card
                      :source_entity_type   "card"
                      :source_entity_id     source-card
                      :error_type           "missing-column"}])
        (let [result      (#'deps.api/node-downstream-errors {:card [source-card]})
              card-errors (get result [:card source-card])]
          (testing "includes errors with visible analyzed entity"
            (is (= 1 (count card-errors))))
          (testing "the included error is the visible one"
            (is (= visible-card (:analyzed_entity_id (first card-errors))))))))))

(deftest ^:sequential broken-endpoint-error-visibility-filtering-test
  (testing "GET /api/ee/dependencies/graph/breaking - pagination and sorting work with error visibility filtering"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create cards in one metadata provider cache session
          (let [[model-card-a model-card-b visible-dep-a visible-dep-b archived-dep-a archived-dep-b]
                (lib-be/with-metadata-provider-cache
                  (let [model-card-a (create-model-card! user "A Model - errvistest")
                        model-card-b (create-model-card! user "B Model - errvistest")
                        ;; Create visible dependents
                        visible-dep-a (create-dependent-card-on-model! user model-card-a "Visible Dep A - errvistest")
                        visible-dep-b (create-dependent-card-on-model! user model-card-b "Visible Dep B - errvistest")
                        ;; Create archived dependents
                        archived-dep-a (create-dependent-card-on-model! user model-card-a "Archived Dep A - errvistest")
                        archived-dep-b (create-dependent-card-on-model! user model-card-b "Archived Dep B - errvistest")]
                    [model-card-a model-card-b visible-dep-a visible-dep-b archived-dep-a archived-dep-b]))]
            ;; Archive the archived dependents
            (t2/update! :model/Card (:id archived-dep-a) {:archived true})
            (t2/update! :model/Card (:id archived-dep-b) {:archived true})
            ;; Break both models
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card-a)
              (break-model-card! model-card-b))
            ;; Run analysis to detect broken references
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id visible-dep-a))
              (run-analysis-for-card! (:id visible-dep-b))
              (run-analysis-for-card! (:id archived-dep-a))
              (run-analysis-for-card! (:id archived-dep-b)))
            (testing "pagination works correctly with error filtering"
              ;; Both model cards should appear in results with only visible errors
              (let [page-1 (mt/user-http-request :crowberto :get 200
                                                 "ee/dependencies/graph/breaking"
                                                 :types "card"
                                                 :query "errvistest"
                                                 :offset 0
                                                 :limit 1
                                                 :sort_column "name"
                                                 :sort_direction "asc")
                    page-2 (mt/user-http-request :crowberto :get 200
                                                 "ee/dependencies/graph/breaking"
                                                 :types "card"
                                                 :query "errvistest"
                                                 :offset 1
                                                 :limit 1
                                                 :sort_column "name"
                                                 :sort_direction "asc")]
                (testing "total count reflects all breaking entities"
                  (is (= 2 (:total page-1)))
                  (is (= 2 (:total page-2))))
                (testing "pagination returns different entities"
                  (is (= (:id model-card-a) (-> page-1 :data first :id)))
                  (is (= (:id model-card-b) (-> page-2 :data first :id))))))
            (testing "dependents_errors contains only errors for visible entities"
              (let [response (mt/user-http-request :crowberto :get 200
                                                   "ee/dependencies/graph/breaking"
                                                   :types "card"
                                                   :query "errvistest")
                    model-a-result (first (filter #(= (:id %) (:id model-card-a)) (:data response)))
                    model-b-result (first (filter #(= (:id %) (:id model-card-b)) (:data response)))
                    model-a-error-entities (set (map :analyzed_entity_id (:dependents_errors model-a-result)))
                    model-b-error-entities (set (map :analyzed_entity_id (:dependents_errors model-b-result)))]
                (testing "errors for visible dependents are included"
                  (is (contains? model-a-error-entities (:id visible-dep-a)))
                  (is (contains? model-b-error-entities (:id visible-dep-b))))
                (testing "errors for archived dependents are excluded"
                  (is (not (contains? model-a-error-entities (:id archived-dep-a))))
                  (is (not (contains? model-b-error-entities (:id archived-dep-b)))))))
            (testing "sorting by dependents-errors works with filtering"
              ;; Add extra errors to model-b so it has more visible errors
              (t2/insert! :model/AnalysisFindingError
                          {:analyzed_entity_type "card"
                           :analyzed_entity_id   (:id visible-dep-b)
                           :source_entity_type   "card"
                           :source_entity_id     (:id model-card-b)
                           :error_type           "missing-column"
                           :error_detail         "extra_col"})
              (let [asc-response (mt/user-http-request :crowberto :get 200
                                                       "ee/dependencies/graph/breaking"
                                                       :types "card"
                                                       :query "errvistest"
                                                       :sort_column "dependents-errors"
                                                       :sort_direction "asc")
                    desc-response (mt/user-http-request :crowberto :get 200
                                                        "ee/dependencies/graph/breaking"
                                                        :types "card"
                                                        :query "errvistest"
                                                        :sort_column "dependents-errors"
                                                        :sort_direction "desc")]
                (testing "ascending order puts fewer errors first"
                  (is (= (:id model-card-a) (-> asc-response :data first :id))))
                (testing "descending order puts more errors first"
                  (is (= (:id model-card-b) (-> desc-response :data first :id))))))))))))

(deftest ^:sequential broken-endpoint-sort-by-visible-errors-only-test
  (testing "GET /api/ee/dependencies/graph/breaking - sorting counts only visible errors, not archived"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Setup: Model A has fewer VISIBLE errors but more TOTAL errors (due to archived dependents)
          ;;        Model B has more VISIBLE errors but fewer TOTAL errors
          ;; If sorting counts all errors: A (3 total) > B (2 total) -> B first in asc
          ;; If sorting counts only visible: A (1 visible) < B (2 visible) -> A first in asc
          (let [[model-card-a model-card-b visible-dep-a visible-dep-b archived-dep-a-1 archived-dep-a-2]
                (lib-be/with-metadata-provider-cache
                  (let [model-card-a (create-model-card! user "A Model - sortviserr")
                        model-card-b (create-model-card! user "B Model - sortviserr")
                        visible-dep-a (create-dependent-card-on-model! user model-card-a "Visible Dep A - sortviserr")
                        visible-dep-b (create-dependent-card-on-model! user model-card-b "Visible Dep B - sortviserr")
                        archived-dep-a-1 (create-dependent-card-on-model! user model-card-a "Archived Dep A1 - sortviserr")
                        archived-dep-a-2 (create-dependent-card-on-model! user model-card-a "Archived Dep A2 - sortviserr")]
                    [model-card-a model-card-b visible-dep-a visible-dep-b archived-dep-a-1 archived-dep-a-2]))]
            ;; Archive model-a's extra dependents
            (t2/update! :model/Card (:id archived-dep-a-1) {:archived true})
            (t2/update! :model/Card (:id archived-dep-a-2) {:archived true})
            ;; Insert errors directly to ensure we control exactly what's in the DB
            ;; Model A: 1 visible error, 2 archived errors = 3 total
            ;; Model B: 2 visible errors = 2 total
            (t2/insert! :model/AnalysisFindingError
                        [{:analyzed_entity_type "card"
                          :analyzed_entity_id   (:id visible-dep-a)
                          :source_entity_type   "card"
                          :source_entity_id     (:id model-card-a)
                          :error_type           "missing-column"
                          :error_detail         "col1"}
                         {:analyzed_entity_type "card"
                          :analyzed_entity_id   (:id archived-dep-a-1)
                          :source_entity_type   "card"
                          :source_entity_id     (:id model-card-a)
                          :error_type           "missing-column"
                          :error_detail         "col2"}
                         {:analyzed_entity_type "card"
                          :analyzed_entity_id   (:id archived-dep-a-2)
                          :source_entity_type   "card"
                          :source_entity_id     (:id model-card-a)
                          :error_type           "missing-column"
                          :error_detail         "col3"}
                         {:analyzed_entity_type "card"
                          :analyzed_entity_id   (:id visible-dep-b)
                          :source_entity_type   "card"
                          :source_entity_id     (:id model-card-b)
                          :error_type           "missing-column"
                          :error_detail         "col4"}
                         {:analyzed_entity_type "card"
                          :analyzed_entity_id   (:id visible-dep-b)
                          :source_entity_type   "card"
                          :source_entity_id     (:id model-card-b)
                          :error_type           "missing-column"
                          :error_detail         "col5"}])
            (let [asc-response (mt/user-http-request :crowberto :get 200
                                                     "ee/dependencies/graph/breaking"
                                                     :types "card"
                                                     :query "sortviserr"
                                                     :sort_column "dependents-errors"
                                                     :sort_direction "asc")]
              (testing "ascending order should put A first (1 visible error < 2 visible errors)"
                ;; BUG: Without fix, this fails because sort counts total errors (A=3, B=2)
                ;; so B comes first. With fix, sort counts visible errors (A=1, B=2) so A comes first.
                (is (= (:id model-card-a) (-> asc-response :data first :id)))))))))))

(deftest ^:sequential unreferenced-pagination-with-archived-items-test
  (testing "GET /api/ee/dependencies/graph/unreferenced - pagination works correctly with archived items"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Dependency]
        (mt/with-temp [:model/Card _              {:name "A Card - unreftest" :archived true}
                       :model/Card {card2-id :id} {:name "B Card - unreftest"}
                       :model/Card {card3-id :id} {:name "C Card - unreftest"}]
          (while (#'dependencies.backfill/backfill-dependencies!))
          (let [response (mt/user-http-request :crowberto :get 200
                                               "ee/dependencies/graph/unreferenced"
                                               :types "card"
                                               :query "unreftest"
                                               :offset 0
                                               :limit 2
                                               :sort_column "name"
                                               :sort_direction "asc")]
            (is (=? {:data   [{:id card2-id} {:id card3-id}]
                     :total  2
                     :offset 0
                     :limit  2}
                    response))))))))

(deftest ^:sequential unreferenced-pagination-with-archived-dependents-test
  (testing "GET /api/ee/dependencies/graph/unreferenced - should return items if all dependents are archived"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Dependency]
        (mt/with-temp [:model/Card {card1-id :id, :as card1} {:name "A Card - unreftest"}
                       :model/Card card2                     {:name "B Card - unreftest"}
                       :model/Card _                         {:name "C Card - unreftest"
                                                              :dataset_query (wrap-card-query card1)
                                                              :archived true}
                       :model/Card {card4-id :id}            {:name "D Card - unreftest"
                                                              :dataset_query (wrap-card-query card2)}
                       :model/Card _                         {:name "E Card - unreftest"
                                                              :dataset_query (wrap-card-query card2)
                                                              :archived true}]
          (while (#'dependencies.backfill/backfill-dependencies!))
          (let [response (mt/user-http-request :crowberto :get 200
                                               "ee/dependencies/graph/unreferenced"
                                               :types "card"
                                               :query "unreftest"
                                               :sort_column "name"
                                               :sort_direction "asc")]
            (is (=? {:data  [{:id card1-id}, {:id card4-id}]
                     :total 2}
                    response))))))))

;;; ------------------------------------------------ Table API Tests -------------------------------------------------
;;; Tests for dependency-related filtering on the /api/table endpoint

(deftest unused-only-filter-test
  (mt/with-premium-features #{:dependencies}
    (testing "GET /api/table?unused-only=true"
      (testing "filters tables that have no non-transform dependents"
        (mt/with-temp [:model/Database {db-id :id} {}
                       :model/Table {table-1-id :id} {:db_id db-id, :name "table_1", :active true}
                       :model/Table {table-2-id :id} {:db_id db-id, :name "table_2", :active true}]
          (testing "both tables returned without filter"
            (is (= #{table-1-id table-2-id}
                   (->> (mt/user-http-request :crowberto :get 200 "table")
                        (filter #(= (:db_id %) db-id))
                        (map :id)
                        set))))

          (testing "both tables returned with unused_only=false"
            (is (= #{table-1-id table-2-id}
                   (->> (mt/user-http-request :crowberto :get 200 "table" :unused-only false)
                        (filter #(= (:db_id %) db-id))
                        (map :id)
                        set))))

          (mt/with-temp [:model/Card card {:database_id   db-id
                                           :table_id      table-1-id
                                           :dataset_query {:database db-id
                                                           :type     :query
                                                           :query    {:source-table table-1-id}}}]
            (events/publish-event! :event/card-create {:object card :user-id (:creator_id card)})
            (testing "after creating card that depends on table-1, only table-2 is unused"
              (is (= #{table-2-id}
                     (->> (mt/user-http-request :crowberto :get 200 "table" :unused-only true)
                          (filter #(= (:db_id %) db-id))
                          (map :id)
                          set))))))))))

;;; --------------------------------------------- /graph/broken tests ---------------------------------------------
;;; Tests for the /graph/broken endpoint that returns broken dependents for a specific source entity.

(deftest ^:synchronized broken-dependents-source-filtering-test
  (testing "GET /api/ee/dependencies/graph/broken - returns broken dependents filtered by source"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Setup: two models, each with one dependent
          (let [[model-card-1 model-card-2 dependent-card-1 dependent-card-2]
                (lib-be/with-metadata-provider-cache
                  (let [model-card-1 (create-model-card! user "Model Card 1 - sourcefiltertest")
                        model-card-2 (create-model-card! user "Model Card 2 - sourcefiltertest")
                        dependent-card-1 (create-dependent-card-on-model! user model-card-1
                                                                          "Dependent 1 - sourcefiltertest")
                        dependent-card-2 (create-dependent-card-on-model! user model-card-2
                                                                          "Dependent 2 - sourcefiltertest")]
                    [model-card-1 model-card-2 dependent-card-1 dependent-card-2]))]
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card-1)
              (break-model-card! model-card-2))
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card-1))
              (run-analysis-for-card! (:id dependent-card-2)))
            (testing "returns only broken dependents for the specified source (not other sources)"
              (let [response (mt/user-http-request :crowberto :get 200
                                                   (str "ee/dependencies/graph/broken?id=" (:id model-card-1)
                                                        "&type=card"))]
                (is (= [(:id dependent-card-1)] (mapv :id response))
                    "Should return only dependent-card-1, not dependent-card-2 with errors from model-2")))))))))

(deftest ^:synchronized broken-count-and-sorting-test
  (testing "GET /api/ee/dependencies/graph/broken - count matches and sorting works"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Setup: one model with two dependents (named for sorting)
          (let [[model-card dependent-card-a dependent-card-b]
                (lib-be/with-metadata-provider-cache
                  (let [model-card (create-model-card! user "Model Card - countsorttest")
                        dependent-card-a (create-dependent-card-on-model! user model-card
                                                                          "A Dependent - countsorttest")
                        dependent-card-b (create-dependent-card-on-model! user model-card
                                                                          "B Dependent - countsorttest")]
                    [model-card dependent-card-a dependent-card-b]))]
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card))
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card-a))
              (run-analysis-for-card! (:id dependent-card-b)))
            (testing "count matches dependents-with-errors from /graph/breaking"
              (let [breaking-response (mt/user-http-request
                                       :crowberto :get 200
                                       "ee/dependencies/graph/breaking?types=card&query=countsorttest")
                    model-entry (first (filter #(= (:id %) (:id model-card)) (:data breaking-response)))
                    dependents-with-errors-count (count (:dependents_errors model-entry))
                    ;; Get actual broken dependents from new /graph/broken endpoint
                    broken-response (mt/user-http-request :crowberto :get 200
                                                          (str "ee/dependencies/graph/broken?id=" (:id model-card)
                                                               "&type=card"))]
                (is (= dependents-with-errors-count (count broken-response))
                    "Count from /graph/broken should match dependents_errors count from /graph/breaking")))
            (testing "sort by name ascending"
              (let [response (mt/user-http-request :crowberto :get 200
                                                   (str "ee/dependencies/graph/broken?id=" (:id model-card)
                                                        "&type=card&sort_column=name&sort_direction=asc"))
                    names (mapv #(get-in % [:data :name]) response)]
                (is (= ["A Dependent - countsorttest" "B Dependent - countsorttest"] names))))
            (testing "sort by name descending"
              (let [response (mt/user-http-request :crowberto :get 200
                                                   (str "ee/dependencies/graph/broken?id=" (:id model-card)
                                                        "&type=card&sort_column=name&sort_direction=desc"))
                    names (mapv #(get-in % [:data :name]) response)]
                (is (= ["B Dependent - countsorttest" "A Dependent - countsorttest"] names))))))))))

(deftest ^:parallel broken-requires-id-and-type-test
  (testing "GET /api/ee/dependencies/graph/broken - requires id and type parameters"
    (mt/with-premium-features #{:dependencies}
      (testing "missing both id and type returns 400"
        (mt/user-http-request :crowberto :get 400 "ee/dependencies/graph/broken"))
      (testing "missing type returns 400"
        (mt/user-http-request :crowberto :get 400 "ee/dependencies/graph/broken?id=1"))
      (testing "missing id returns 400"
        (mt/user-http-request :crowberto :get 400 "ee/dependencies/graph/broken?type=card")))))

(deftest ^:synchronized broken-requires-read-permission-test
  (testing "GET /api/ee/dependencies/graph/broken - requires read permission on source entity"
    (mt/with-premium-features #{:dependencies}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/User user {:email "test@test.com"}
                       :model/Collection {coll-id :id} {:name "Private Collection"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
            (let [[model-card dependent-card]
                  (lib-be/with-metadata-provider-cache
                    (let [model-card (create-model-card! user "Model Card - permtest" :collection-id coll-id)
                          dependent-card (create-dependent-card-on-model! user model-card "Dependent Card - permtest"
                                                                          :collection-id coll-id)]
                      [model-card dependent-card]))]
              (lib-be/with-metadata-provider-cache
                (break-model-card! model-card))
              (lib-be/with-metadata-provider-cache
                (while (#'dependencies.backfill/backfill-dependencies!))
                (run-analysis-for-card! (:id dependent-card)))
              ;; Admin can access
              (is (sequential? (mt/user-http-request :crowberto :get 200
                                                     (str "ee/dependencies/graph/broken?id=" (:id model-card)
                                                          "&type=card"))))
              ;; Regular user without collection access gets 403
              (mt/user-http-request :rasta :get 403
                                    (str "ee/dependencies/graph/broken?id=" (:id model-card) "&type=card")))))))))

(deftest ^:synchronized broken-no-transitive-breakage-test
  (testing "GET /api/ee/dependencies/graph/broken - does not report transitive breakage"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          ;; Create chain: model-1 -> model-2 -> card
          ;; When model-1 breaks:
          ;;   - model-2 gets error with source_entity_id=model-1
          ;;   - card gets error with source_entity_id=model-2 (NOT model-1)
          (let [[model-card-1 model-card-2 dependent-card]
                (lib-be/with-metadata-provider-cache
                  (let [model-card-1 (create-model-card! user "Model 1 - transitivetest")
                        ;; Create model-2 as a model that depends on model-1
                        model-card-2-question (create-dependent-card-on-model! user model-card-1
                                                                               "Model 2 - transitivetest")
                        model-card-2 (card/update-card! {:card-before-update model-card-2-question
                                                         :card-updates {:type :model}})
                        ;; Create card that depends on model-2
                        dependent-card (create-dependent-card-on-model! user model-card-2 "Card - transitivetest")]
                    [model-card-1 model-card-2 dependent-card]))]
            ;; Break model-1
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card-1))
            ;; Run analysis for both model-2 and dependent-card
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id model-card-2))
              (run-analysis-for-card! (:id dependent-card)))
            ;; Query /graph/broken for model-1 - should only return model-2, not dependent-card
            ;; because dependent-card's error source is model-2, not model-1
            (let [response (mt/user-http-request :crowberto :get 200
                                                 (str "ee/dependencies/graph/broken?id=" (:id model-card-1)
                                                      "&type=card"))]
              (is (= [(:id model-card-2)] (mapv :id response))
                  "Should return only model-2 (direct dependent), not card (transitive)"))))))))

(deftest ^:synchronized broken-filter-by-dependent-types-test
  (testing "GET /api/ee/dependencies/graph/broken - filters by dependent_types"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/User user {:email "test@test.com"}]
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
          (let [[model-card dependent-card]
                (lib-be/with-metadata-provider-cache
                  (let [model-card (create-model-card! user "Model Card - deptypestest")
                        dependent-card (create-dependent-card-on-model! user model-card "Dependent Card - deptypestest")]
                    [model-card dependent-card]))]
            (lib-be/with-metadata-provider-cache
              (break-model-card! model-card))
            (lib-be/with-metadata-provider-cache
              (while (#'dependencies.backfill/backfill-dependencies!))
              (run-analysis-for-card! (:id dependent-card)))
            (testing "filtering by card type returns the dependent card"
              (let [response (mt/user-http-request :crowberto :get 200
                                                   (str "ee/dependencies/graph/broken?id=" (:id model-card)
                                                        "&type=card&dependent_types=card&dependent_card_types=question"))]
                (is (= [(:id dependent-card)] (mapv :id response)))))
            (testing "filtering by dashboard returns empty (no dashboards in this test)"
              (let [response (mt/user-http-request :crowberto :get 200
                                                   (str "ee/dependencies/graph/broken?id=" (:id model-card)
                                                        "&type=card&dependent_types=dashboard"))]
                (is (empty? response))))))))))

(deftest ^:synchronized broken-personal-collections-test
  (testing "GET /api/ee/dependencies/graph/broken with include_personal_collections parameter"
    (mt/with-premium-features #{:dependencies}
      (binding [collection/*allow-deleting-personal-collections* true]
        (mt/with-temp [:model/User {user-id :id} {}
                       :model/User creator {:email "creator@test.com"}
                       :model/Collection {personal-coll-id :id} {:personal_owner_id user-id
                                                                 :name "Test Personal Collection"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/AnalysisFinding :model/AnalysisFindingError]
            ;; one model, two dependents: one in personal collection, one in regular collection
            (let [[model-card dependent-in-personal dependent-regular]
                  (lib-be/with-metadata-provider-cache
                    (let [model-card (create-model-card! creator "Model - personalcollbrokentest2")
                          dependent-in-personal (create-dependent-card-on-model! creator model-card
                                                                                 "Dependent in Personal - personalcollbrokentest2"
                                                                                 :collection-id personal-coll-id)
                          dependent-regular (create-dependent-card-on-model! creator model-card
                                                                             "Dependent Regular - personalcollbrokentest2")]
                      [model-card dependent-in-personal dependent-regular]))]
              (lib-be/with-metadata-provider-cache
                (break-model-card! model-card))
              (lib-be/with-metadata-provider-cache
                (while (#'dependencies.backfill/backfill-dependencies!))
                (run-analysis-for-card! (:id dependent-in-personal))
                (run-analysis-for-card! (:id dependent-regular)))
              (testing "include_personal_collections=false (default) excludes broken dependents in personal collections"
                (let [response (mt/user-http-request :crowberto :get 200
                                                     (str "ee/dependencies/graph/broken?id=" (:id model-card) "&type=card"))
                      card-ids (set (map :id response))]
                  (is (not (contains? card-ids (:id dependent-in-personal))))
                  (is (contains? card-ids (:id dependent-regular)))))
              (testing "include_personal_collections=true includes broken dependents in personal collections"
                (let [response (mt/user-http-request :crowberto :get 200
                                                     (str "ee/dependencies/graph/broken?id=" (:id model-card)
                                                          "&type=card&include_personal_collections=true"))
                      card-ids (set (map :id response))]
                  (is (contains? card-ids (:id dependent-in-personal)))
                  (is (contains? card-ids (:id dependent-regular))))))))))))

(deftest ^:sequential unreferenced-table-owner-test
  (testing "GET /api/ee/dependencies/unreferenced - table owner is returned"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Dependency]
        (mt/with-temp [:model/Table {table1-id :id} {:name          "User Owned Table - ownertest"
                                                     :owner_user_id (mt/user->id :crowberto)}
                       :model/Table {table2-id :id} {:name        "Email Owned Table - ownertest"
                                                     :owner_email "external@example.com"}]
          (while (#'dependencies.backfill/backfill-dependencies!))
          (let [response (mt/user-http-request :crowberto :get 200
                                               "ee/dependencies/graph/unreferenced"
                                               :types "table" :query "ownertest"
                                               :sort_column "name" :sort_direction "asc")]
            (is (=? {:data [{:id   table2-id
                             :type "table"
                             :data {:name  "Email Owned Table - ownertest"
                                    :owner {:email "external@example.com"}}}
                            {:id   table1-id
                             :type "table"
                             :data {:name  "User Owned Table - ownertest"
                                    :owner {:id    (mt/user->id :crowberto)
                                            :email "crowberto@metabase.com"}}}]}
                    response))))))))

(deftest ^:sequential unreferenced-transform-owner-test
  (testing "GET /api/ee/dependencies/unreferenced - transform owner is returned"
    (mt/with-premium-features #{:dependencies}
      (let [mp       (mt/metadata-provider)
            products (lib.metadata/table mp (mt/id :products))]
        (mt/with-model-cleanup [:model/Dependency]
          (mt/with-temp [:model/Transform {transform1-id :id} {:name          "User Owned Transform - ownertest"
                                                               :owner_user_id (mt/user->id :crowberto)
                                                               :source        {:type  :query
                                                                               :query (lib/query mp products)}
                                                               :target        {:schema "PUBLIC"
                                                                               :name   "user_owned_transform_table"}}
                         :model/Transform {transform2-id :id} {:name        "Email Owned Transform - ownertest"
                                                               :owner_email "external@example.com"
                                                               :source      {:type  :query
                                                                             :query (lib/query mp products)}
                                                               :target      {:schema "PUBLIC"
                                                                             :name   "email_owned_transform_table"}}]
            (while (#'dependencies.backfill/backfill-dependencies!))
            (let [response (mt/user-http-request :crowberto :get 200
                                                 "ee/dependencies/graph/unreferenced"
                                                 :types "transform" :query "ownertest"
                                                 :sort_column "name" :sort_direction "asc")]
              (is (=? {:data [{:id   transform2-id
                               :type "transform"
                               :data {:name  "Email Owned Transform - ownertest"
                                      :owner {:email "external@example.com"}}}
                              {:id   transform1-id
                               :type "transform"
                               :data {:name  "User Owned Transform - ownertest"
                                      :owner {:id    (mt/user->id :crowberto)
                                              :email "crowberto@metabase.com"}}}]}
                      response)))))))))

(deftest data-analyst-can-access-dependency-graph-test
  (mt/with-premium-features #{:data-studio :dependencies}
    (testing "Data analysts can access dependency diagnostics endpoints"
      (let [data-analyst-group-id (:id (perms-group/data-analyst))]
        (mt/with-temp [:model/User {analyst-id :id} {:first_name "Data"
                                                     :last_name "Analyst"
                                                     :email "data-analyst@metabase.com"
                                                     :is_data_analyst true}
                       :model/PermissionsGroupMembership _ {:user_id analyst-id
                                                            :group_id data-analyst-group-id}
                       :model/Database {db-id :id} {}
                       :model/Table {_table-id :id} {:db_id db-id}
                       :model/Transform {transform-id :id} {:source_db_id db-id
                                                            :name "Test Transform"}]
          (testing "graph/unreferenced"
            (is (map? (mt/user-http-request analyst-id :get 200
                                            "ee/dependencies/graph/unreferenced"))))
          (testing "graph/breaking"
            (is (map? (mt/user-http-request analyst-id :get 200
                                            "ee/dependencies/graph/breaking"))))
          (testing "graph with transform"
            (is (map? (mt/user-http-request analyst-id :get 200
                                            (str "ee/dependencies/graph?type=transform&id=" transform-id))))))))))
