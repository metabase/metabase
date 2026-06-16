(ns metabase.typed-schemas.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.api :as typed-schemas.api]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest column-schema-includes-description-test
  (is (= {:name          "name"
          :displayName   "Name"
          :baseType      "type/Text"
          :jsType        "string"
          :description   "Name of the customer"}
         (#'typed-schemas.api/column-schema {:name         "name"
                                             :display_name "Name"
                                             :base_type    "type/Text"
                                             :description  "Name of the customer"}))))

(deftest metric-dimension-schema-uses-dimension-id-test
  (is (= {:name          "category"
          :displayName   "Category"
          :baseType      "type/Text"
          :jsType        "string"
          :key           "category"
          :id            "550e8400-e29b-41d4-a716-446655440001"
          :fieldId       3815
          :tableId       12
          :metricId      247}
         (#'typed-schemas.api/dimension-schema
          {:id             "550e8400-e29b-41d4-a716-446655440001"
           :name           "category"
           :display-name   "Category"
           :effective-type :type/Text
           :table-id       12
           :sources        [{:type :field, :field-id 3815}]}
          247))))

(deftest field-schema-uses-field-id-test
  (is (= {:name          "created_at"
          :displayName   "Created At"
          :baseType      "type/DateTime"
          :jsType        "Date"
          :key           "createdAt"
          :id            42
          :fieldId       42
          :tableId       10}
         (#'typed-schemas.api/field-schema {:id             42
                                            :table_id       10
                                            :name           "created_at"
                                            :display_name   "Created At"
                                            :base_type      "type/DateTime"}))))

(deftest table-schema-keys-fields-test
  (is (= {:kind         "table"
          :key          "orders"
          :id           10
          :name         "Orders"
          :databaseId   1
          :databaseName "Boba"
          :tableName    "orders"
          :fields       {"createdAt" {:name          "created_at"
                                      :displayName   "Created At"
                                      :baseType      "type/DateTime"
                                      :jsType        "Date"
                                      :key           "createdAt"
                                      :id            42
                                      :fieldId       42
                                      :tableId       10}}}
         (#'typed-schemas.api/table-schema
          {:id            10
           :name          "orders"
           :display_name  "Orders"
           :database_id   1
           :database_name "Boba"
           :fields        [{:id           42
                            :table_id     10
                            :name         "created_at"
                            :display_name "Created At"
                            :base_type    "type/DateTime"}]}))))

(deftest keyed-map-disambiguates-duplicate-keys-with-readable-suffix-test
  (is (= {"channelOrderItems" {:key     "channelOrderItems"
                               :id      "40f15584-bca0-4557-910d-e5e789757f23"
                               :tableId 261}
          "channelOrders"     {:key     "channelOrders"
                               :id      "ca9bef16-d484-4add-8245-ddbc78287e8f"
                               :tableId 167}}
         (#'typed-schemas.api/keyed-map
          [{:key     "channel"
            :id      "ca9bef16-d484-4add-8245-ddbc78287e8f"
            :tableId 167
            :keyDisambiguator "Orders"}
           {:key     "channel"
            :id      "40f15584-bca0-4557-910d-e5e789757f23"
            :tableId 261
            :keyDisambiguator "OrderItems"}]))))

(deftest keyed-map-falls-back-to-id-when-readable-suffix-does-not-disambiguate-test
  (is (= {"channelOrders1" {:key     "channelOrders1"
                            :id      1
                            :tableId 167}
          "channelOrders2" {:key     "channelOrders2"
                            :id      2
                            :tableId 168}}
         (#'typed-schemas.api/keyed-map
          [{:key     "channel"
            :id      1
            :tableId 167
            :keyDisambiguator "Orders"}
           {:key     "channel"
            :id      2
            :tableId 168
            :keyDisambiguator "Orders"}]))))

(deftest metric-schema-keys-dimensions-test
  (with-redefs [typed-schemas.api/metric-result-column (constantly nil)
                typed-schemas.api/metric-dimensions
                (constantly [{:id             "550e8400-e29b-41d4-a716-446655440001"
                              :name           "orders"
                              :display-name   "Orders"
                              :effective-type :type/Integer
                              :table-id       10
                              :sources        [{:type :field, :field-id 42}]}])]
    (is (= {:kind           "metric"
            :key            "customerLifetimeValue"
            :id             247
            :name           "Customer Lifetime Value"
            :columns        [{:name "Customer Lifetime Value", :displayName "Customer Lifetime Value", :jsType "unknown"}]
            :mappedTableIds [10]
            :dimensions     {"orders" {:name        "orders"
                                       :displayName "Orders"
                                       :baseType    "type/Integer"
                                       :jsType      "number"
                                       :key         "orders"
                                       :id          "550e8400-e29b-41d4-a716-446655440001"
                                       :fieldId     42
                                       :tableId     10
                                       :metricId    247}}}
           (#'typed-schemas.api/metric-schema
            {:id   247
             :name "Customer Lifetime Value"}
            {:id 247})))))

(deftest measure-schema-uses-result-column-test
  (testing "measure result columns come from the measure definition when available"
    (with-redefs [typed-schemas.api/measure-result-column
                  (constantly {:name         "sum"
                               :display_name "Sum of Total"
                               :base_type    "type/Decimal"})]
      (is (= {:kind    "measure"
              :key     "totalRevenue"
              :id      1
              :tableId 10
              :name    "Total Revenue"
              :columns [{:name        "sum"
                         :displayName "Sum of Total"
                         :baseType    "type/Decimal"
                         :jsType      "number"}]}
             (#'typed-schemas.api/measure-schema
              10
              2
              {:id   1
               :name "Total Revenue"})))))
  (testing "measure result columns fall back to the measure name"
    (with-redefs [typed-schemas.api/measure-result-column (constantly nil)]
      (is (= {:kind    "measure"
              :key     "totalRevenue"
              :id      1
              :tableId 10
              :name    "Total Revenue"
              :columns [{:name "Total Revenue", :displayName "Total Revenue", :jsType "unknown"}]}
             (#'typed-schemas.api/measure-schema
              10
              2
              {:id   1
               :name "Total Revenue"}))))))

(deftest javascript-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/javascript")]
    (is (= "text/javascript; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (str/starts-with? (:body response) "export default {"))
    (is (str/includes? (:body response) "\n  schemaVersion: 2"))
    (is (str/includes? (:body response) "\n  questions: {"))
    (is (str/includes? (:body response) "\n  tables: {"))
    (is (str/includes? (:body response) "\n  metrics: {"))
    (is (str/ends-with? (:body response) "};\n"))
    (is (not (str/includes? (:body response) "\"schemaVersion\"")))
    (is (not (str/includes? (:body response) "operators: [ ]")))
    (is (not (str/includes? (:body response) "parameters: [ ]")))
    (is (not (str/includes? (:body response) "verified: false")))))

(deftest typescript-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/typescript")]
    (is (= "text/typescript; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (str/starts-with? (:body response) "export default {"))
    (is (str/includes? (:body response) "\n  schemaVersion: 2"))
    (is (str/ends-with? (:body response) "} as const;\n"))))

(deftest typescript-renderer-compacts-runtime-objects-test
  (let [body (#'typed-schemas.api/render-typescript
              {:schemaVersion 2
               :tables        {"orders" {:kind         "table"
                                         :key          "orders"
                                         :id           10
                                         :name         "Orders"
                                         :databaseId   1
                                         :databaseName "Boba"
                                         :fields       {"paymentMethod" {:name         "payment_method"
                                                                         :displayName  "Payment Method"
                                                                         :baseType     "type/Text"
                                                                         :semanticType "type/Category"
                                                                         :jsType       "string"
                                                                         :key          "paymentMethod"
                                                                         :id           3970
                                                                         :fieldId      3970
                                                                         :tableId      10}}}}
               :metrics       {"revenue" {:kind           "metric"
                                          :key            "revenue"
                                          :id             5
                                          :name           "Revenue"
                                          :databaseId     1
                                          :sourceTableId  10
                                          :description    "Total order revenue"
                                          :mappedTableIds [10]
                                          :dimensions     {"createdAt" {:name        "created_at"
                                                                        :displayName "Created At"
                                                                        :baseType    "type/DateTime"
                                                                        :jsType      "Date"
                                                                        :key         "createdAt"
                                                                        :id          "dimension-uuid"
                                                                        :fieldId     3971
                                                                        :tableId     10
                                                                        :metricId    5}}}}})]
    (is (str/includes? body (str "/" "/ Display name: Payment Method")))
    (is (str/includes? body (str "/" "/ Semantic type: type/Category")))
    (is (not (str/includes? body (str "/" "/ id: 3970"))))
    (is (str/includes? body "paymentMethod: {\n          name: \"payment_method\""))
    (is (str/includes? body "fieldId: 3970"))
    (is (str/includes? body "tableId: 10"))
    (is (not (str/includes? body "displayName: \"Payment Method\"")))
    (is (not (str/includes? body "baseType: \"type/Text\"")))
    (is (str/includes? body (str "/" "/ Description: Total order revenue")))
    (is (str/includes? body "databaseId: 1"))
    (is (str/includes? body "sourceTableId: 10"))
    (is (str/includes? body "createdAt: {\n          id: \"dimension-uuid\""))
    (is (str/includes? body "fieldId: 3971"))
    (is (str/includes? body "metricId: 5"))))

(deftest json-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/json")]
    (is (= "application/json; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (= 2 (get-in response [:body :schemaVersion])))
    (is (map? (get-in response [:body :questions])))
    (is (map? (get-in response [:body :tables])))
    (is (map? (get-in response [:body :metrics])))))

(deftest database-filter-test
  (testing "a non-matching database name returns an empty semantic schema"
    (let [response (mt/user-http-request-full-response
                    :crowberto
                    :get
                    200
                    "typed-schemas/v1/json?database=__missing_database__")]
      (is (= 2 (get-in response [:body :schemaVersion])))
      (is (= {} (get-in response [:body :questions])))
      (is (= {} (get-in response [:body :tables])))
      (is (= {} (get-in response [:body :metrics])))))
  (testing "questions=true returns only questions for a numeric database id"
    (let [response (mt/user-http-request-full-response
                    :crowberto
                    :get
                    200
                    (format "typed-schemas/v1/json?database=%s&questions=true" (mt/id)))]
      (is (= 2 (get-in response [:body :schemaVersion])))
      (is (map? (get-in response [:body :questions])))
      (is (= {} (get-in response [:body :tables])))
      (is (= {} (get-in response [:body :metrics]))))))

(deftest database-filter-scopes-models-test
  (let [model-database-ids (atom [])]
    (with-redefs [typed-schemas.api/database-ids-for-value (constantly #{42})
                  typed-schemas.api/model-schemas (fn [database-ids]
                                                    (swap! model-database-ids conj database-ids)
                                                    [])
                  typed-schemas.api/question-schemas (fn
                                                       ([_database-ids] [])
                                                       ([_database-ids _collection-ids] []))
                  typed-schemas.api/metric-schemas (fn
                                                     ([_database-ids] [])
                                                     ([_database-ids _collection-ids] []))
                  typed-schemas.api/select-tables (fn
                                                    ([_database-ids] [])
                                                    ([_database-ids _table-ids] []))
                  typed-schemas.api/table-schemas (constantly [])]
      (#'typed-schemas.api/typed-schema {:database "Boba"})
      (#'typed-schemas.api/typed-schema {:database "Boba" :questions "true"})
      (is (= [#{42} #{42}] @model-database-ids)))))

(deftest library-and-database-are-mutually-exclusive-test
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/json?library=1&database=1")
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/json?library=1&questions=true")
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/json?questions=true"))

(deftest collection-query-params-are-mutually-exclusive-test
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/json?library-collections=1,2&database=1")
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/json?question-collections=1,2&questions=true")
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/json?library=1&library-collections=2"))

(deftest library-collection-scope-accepts-subcollection-id-test
  (mt/with-temp [:model/Collection root  {:name "Library"
                                          :type "library"
                                          :location "/"}
                 :model/Collection data  {:name "Data"
                                          :type "library-data"
                                          :location (collection/children-location root)}
                 :model/Collection child {:name "Boba Data"
                                          :type "library-data"
                                          :location (collection/children-location data)}]
    (mt/with-test-user :crowberto
      (is (= {:collection-ids        #{(:id child)}
              :data-collection-ids   #{(:id child)}
              :metric-collection-ids #{}}
             (select-keys (#'typed-schemas.api/library-collection-scope (str (:id child)))
                          [:collection-ids :data-collection-ids :metric-collection-ids]))))))

(deftest library-collections-scope-accepts-comma-separated-subcollection-ids-test
  (mt/with-temp [:model/Collection root          {:name "Library"
                                                  :type "library"
                                                  :location "/"}
                 :model/Collection data          {:name "Data"
                                                  :type "library-data"
                                                  :location (collection/children-location root)}
                 :model/Collection metrics       {:name "Metrics"
                                                  :type "library-metrics"
                                                  :location (collection/children-location root)}
                 :model/Collection data-child    {:name "Boba Data"
                                                  :type "library-data"
                                                  :location (collection/children-location data)}
                 :model/Collection data-grandkid {:name "Boba Data Nested"
                                                  :type "library-data"
                                                  :location (collection/children-location data-child)}
                 :model/Collection metric-child  {:name "Boba Metrics"
                                                  :type "library-metrics"
                                                  :location (collection/children-location metrics)}]
    (mt/with-test-user :crowberto
      (is (= {:collection-ids        #{(:id data-child) (:id data-grandkid) (:id metric-child)}
              :data-collection-ids   #{(:id data-child) (:id data-grandkid)}
              :metric-collection-ids #{(:id metric-child)}}
             (select-keys (#'typed-schemas.api/library-collections-scope
                           (#'typed-schemas.api/query-library-collection-values
                            {:library-collections (format "%d, %d"
                                                          (:id data-child)
                                                          (:id metric-child))}))
                          [:collection-ids :data-collection-ids :metric-collection-ids]))))))

(deftest library-collections-scope-accepts-representation-entity-ids-test
  (mt/with-temp [:model/Collection root         {:name "Library"
                                                 :type "library"
                                                 :location "/"}
                 :model/Collection data         {:name "Data"
                                                 :type "library-data"
                                                 :location (collection/children-location root)}
                 :model/Collection website      {:name      "Website"
                                                 :type      "library-data"
                                                 :entity_id "g-jLnamuHKdezZMthJ-z7"
                                                 :location  (collection/children-location data)}
                 :model/Collection website-page {:name "Website Page"
                                                 :type "library-data"
                                                 :location (collection/children-location website)}]
    (mt/with-test-user :crowberto
      (is (= {:collection-ids        #{(:id website) (:id website-page)}
              :data-collection-ids   #{(:id website) (:id website-page)}
              :metric-collection-ids #{}}
             (select-keys (#'typed-schemas.api/library-collections-scope ["g-jLnamuHKdezZMthJ-z7"])
                          [:collection-ids :data-collection-ids :metric-collection-ids]))))))

(deftest library-scope-includes-canonical-data-and-metrics-libraries-test
  (with-redefs [typed-schemas.api/library-data-entity-id    "test-library-data"
                typed-schemas.api/library-metrics-entity-id "test-library-metrics"]
    (mt/with-temp [:model/Collection root         {:name "Library"
                                                   :type "library"
                                                   :location "/"}
                   :model/Collection data         {:name      "Data"
                                                   :type      "library-data"
                                                   :entity_id "test-library-data"
                                                   :location  (collection/children-location root)}
                   :model/Collection metrics      {:name      "Metrics"
                                                   :type      "library-metrics"
                                                   :entity_id "test-library-metrics"
                                                   :location  (collection/children-location root)}
                   :model/Collection data-child   {:name "Boba Data"
                                                   :type "library-data"
                                                   :location (collection/children-location data)}
                   :model/Collection metric-child {:name "Boba Metrics"
                                                   :type "library-metrics"
                                                   :location (collection/children-location metrics)}]
      (mt/with-test-user :crowberto
        (is (= {:collection-ids        #{(:id data) (:id data-child) (:id metrics) (:id metric-child)}
                :data-collection-ids   #{(:id data) (:id data-child)}
                :metric-collection-ids #{(:id metrics) (:id metric-child)}}
               (select-keys (#'typed-schemas.api/library-scope
                             {:includeDataLibrary   "true"
                              :includeMetricLibrary "true"})
                            [:collection-ids :data-collection-ids :metric-collection-ids])))))))

(deftest query-collection-values-accept-camel-case-aliases-test
  (is (= ["1" "2"]
         (#'typed-schemas.api/query-library-collection-values {:libraryCollections "1, 2"})))
  (is (= ["3" "4"]
         (#'typed-schemas.api/query-question-collection-values {:questionCollections "3, 4"}))))

(deftest question-collection-scope-accepts-comma-separated-collection-ids-test
  (mt/with-temp [:model/Collection parent {:name "Question Parent"
                                           :location "/"}
                 :model/Collection child  {:name "Question Child"
                                           :location (collection/children-location parent)}]
    (mt/with-test-user :crowberto
      (is (= #{(:id parent) (:id child)}
             (#'typed-schemas.api/collection-scope
              (#'typed-schemas.api/query-question-collection-values
               {:question-collections (str (:id parent))})))))))

(deftest library-schema-includes-metric-mapped-tables-test
  (let [selected-table-ids (atom nil)]
    (with-redefs [typed-schemas.api/library-collection-scope
                  (constantly {:metric-collection-ids #{20}
                               :data-collection-ids   #{10}})
                  typed-schemas.api/model-schemas
                  (fn
                    ([_database-ids]
                     (is false "library-only schemas should not load models"))
                    ([_database-ids _collection-ids]
                     (is false "library-only schemas should not load models")))
                  typed-schemas.api/metric-schemas
                  (fn [_database-ids collection-ids]
                    (is (= #{20} collection-ids))
                    [{:kind           "metric"
                      :key            "revenue"
                      :id             1
                      :name           "Revenue"
                      :columns        [{:name "Revenue", :displayName "Revenue", :jsType "number"}]
                      :mappedTableIds [42]}])
                  typed-schemas.api/select-library-tables
                  (constantly [{:id 10}])
                  typed-schemas.api/select-tables
                  (fn [_database-ids table-ids]
                    (reset! selected-table-ids table-ids)
                    [{:id 10} {:id 42}])
                  typed-schemas.api/table-schemas
                  (constantly [{:kind "table", :key "publishedTable", :id 10}
                               {:kind "table", :key "mappedTable", :id 42}])]
      (let [schema (#'typed-schemas.api/typed-schema {:library "123"})]
        (is (= #{10 42} @selected-table-ids))
        (is (= {} (:questions schema)))
        (is (= {} (:models schema)))
        (is (= #{10 42} (->> (:tables schema) vals (map :id) set)))
        (is (= #{1} (->> (:metrics schema) vals (map :id) set)))))))

(deftest collections-schema-includes-selected-data-and-metric-collections-test
  (let [selected-table-ids (atom nil)]
    (with-redefs [typed-schemas.api/library-collections-scope
                  (fn [collection-values]
                    (is (= ["10" "20"] collection-values))
                    {:metric-collection-ids #{20}
                     :data-collection-ids   #{10}})
                  typed-schemas.api/model-schemas
                  (fn
                    ([_database-ids]
                     (is false "library-only schemas should not load models"))
                    ([_database-ids _collection-ids]
                     (is false "library-only schemas should not load models")))
                  typed-schemas.api/metric-schemas
                  (fn [_database-ids collection-ids]
                    (is (= #{20} collection-ids))
                    [{:kind           "metric"
                      :key            "revenue"
                      :id             1
                      :name           "Revenue"
                      :columns        [{:name "Revenue", :displayName "Revenue", :jsType "number"}]
                      :mappedTableIds [42]}])
                  typed-schemas.api/select-library-tables
                  (fn [library-scope]
                    (is (= #{10} (:data-collection-ids library-scope)))
                    [{:id 10}])
                  typed-schemas.api/select-tables
                  (fn [_database-ids table-ids]
                    (reset! selected-table-ids table-ids)
                    [{:id 10} {:id 42}])
                  typed-schemas.api/table-schemas
                  (constantly [{:kind "table", :key "publishedTable", :id 10}
                               {:kind "table", :key "mappedTable", :id 42}])]
      (let [schema (#'typed-schemas.api/typed-schema {:library-collections "10, 20"})]
        (is (= #{10 42} @selected-table-ids))
        (is (= {} (:questions schema)))
        (is (= {} (:models schema)))
        (is (= #{10 42} (->> (:tables schema) vals (map :id) set)))
        (is (= #{1} (->> (:metrics schema) vals (map :id) set)))))))

(deftest question-collections-schema-includes-selected-question-collections-test
  (with-redefs [typed-schemas.api/collection-scope
                (fn [collection-values]
                  (is (= ["30" "40"] collection-values))
                  #{30 40})
                typed-schemas.api/question-schemas
                (fn [database-ids collection-ids]
                  (is (nil? database-ids))
                  (is (= #{30 40} collection-ids))
                  [{:kind "question", :key "ordersByMonth", :id 1}])
                typed-schemas.api/model-schemas
                (fn [database-ids collection-ids]
                  (is (nil? database-ids))
                  (is (= #{30 40} collection-ids))
                  [{:kind "model", :key "selectedQuestionCollectionModel", :id 100}])]
    (let [schema (#'typed-schemas.api/typed-schema {:question-collections "30, 40"})]
      (is (= #{1} (->> (:questions schema) vals (map :id) set)))
      (is (= #{100} (->> (:models schema) vals (map :id) set)))
      (is (= {} (:tables schema)))
      (is (= {} (:metrics schema))))))

(deftest library-and-question-collections-can-be-combined-test
  (with-redefs [typed-schemas.api/library-collections-scope
                (fn [collection-values]
                  (is (= ["10"] collection-values))
                  {:metric-collection-ids #{10}
                   :data-collection-ids   #{10}})
                typed-schemas.api/collection-scope
                (fn [collection-values]
                  (is (= ["30"] collection-values))
                  #{30})
                typed-schemas.api/question-schemas
                (fn [database-ids collection-ids]
                  (is (nil? database-ids))
                  (is (= #{30} collection-ids))
                  [{:kind "question", :key "ordersByMonth", :id 1}])
                typed-schemas.api/model-schemas
                (fn [database-ids collection-ids]
                  (is (nil? database-ids))
                  (is (= #{30} collection-ids))
                  [{:kind "model", :key "selectedQuestionCollectionModel", :id 100}])
                typed-schemas.api/metric-schemas
                (constantly [{:kind "metric", :key "revenue", :id 2}])
                typed-schemas.api/select-library-tables
                (constantly [{:id 3}])
                typed-schemas.api/select-tables
                (constantly [{:id 3}])
                typed-schemas.api/table-schemas
                (constantly [{:kind "table", :key "orders", :id 3}])]
    (let [schema (#'typed-schemas.api/typed-schema {:library-collections  "10"
                                                    :question-collections "30"})]
      (is (= #{1} (->> (:questions schema) vals (map :id) set)))
      (is (= #{100} (->> (:models schema) vals (map :id) set)))
      (is (= #{3} (->> (:tables schema) vals (map :id) set)))
      (is (= #{2} (->> (:metrics schema) vals (map :id) set))))))
