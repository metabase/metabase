(ns metabase.typed-schemas.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.actions.core :as actions]
   [metabase.collections.models.collection :as collection]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.api :as typed-schemas.api]
   [metabase.typed-schemas.api.common :as typed-schemas.api.common]
   [metabase.typed-schemas.api.query-params :as typed-schemas.api.query-params]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest column-schema-includes-description-test
  (is (= {:type          "column"
          :name          "name"
          :displayName   "Name"
          :baseType      "type/Text"
          :jsType        "string"
          :description   "Name of the customer"}
         (#'typed-schemas.api.common/column-schema {:name         "name"
                                                    :display_name "Name"
                                                    :base_type    "type/Text"
                                                    :description  "Name of the customer"}))))

(deftest column-schema-maps-metabase-types-test
  (are [column js-type] (= js-type
                           (:jsType (#'typed-schemas.api.common/column-schema column)))
    {:name "bool", :base_type :type/Boolean}        "boolean"
    {:name "int", :base_type :type/Integer}         "number"
    {:name "date", :base_type :type/DateTime}       "Date"
    {:name "uuid", :base_type :type/UUID}           "string"
    {:name "string", :base_type "type/Text"}        "string"
    {:name "decimal", :base_type "Decimal"}         "number"
    {:name "effective", :effective_type :type/Text} "string"
    {:name "unknown", :base_type :type/Structured}  "unknown"))

(deftest metric-dimension-schema-uses-dimension-id-test
  (is (= {:type          "column"
          :name          "category"
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

(deftest metric-dimension-schema-preserves-source-field-id-test
  (is (= 102
         (:sourceFieldId
          (#'typed-schemas.api/dimension-schema
           {:id              "550e8400-e29b-41d4-a716-446655440001"
            :name            "category"
            :display-name    "Category"
            :effective-type  :type/Text
            :table-id        12
            :source-field-id 102
            :sources         [{:type :field, :field-id 3815}]}
           247)))))

(deftest field-schema-uses-field-id-test
  (is (= {:name          "created_at"
          :type          "column"
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
  (is (= {:type         "table"
          :key          "orders"
          :id           10
          :name         "Orders"
          :databaseName "Boba"
          :tableName    "orders"
          :fields       {"createdAt" {:type          "column"
                                      :name          "created_at"
                                      :sourceName   "orders"
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

(deftest segment-schema-uses-type-discriminator-test
  (is (= {:type    "segment"
          :key     "completedOrders"
          :id      12
          :tableId 10
          :name    "Completed Orders"}
         (#'typed-schemas.api/segment-schema
          10
          {:id           12
           :name         "Completed Orders"
           :display-name "Completed Orders"}))))

(deftest question-schema-uses-card-source-discriminator-test
  (is (= {:type    "card"
          :key     "ordersQuestion"
          :id      41
          :name    "Orders question"
          :display "table"
          :columns [{:type "column", :name "count", :displayName "Count", :jsType "number"}]}
         (#'typed-schemas.api/question-schema
          {:id             41
           :name           "Orders question"
           :display        "table"
           :result-columns [{:name "count", :display_name "Count", :type :number}]}))))

(deftest model-schema-includes-actions-test
  (with-redefs [typed-schemas.api/model-actions
                (fn [model]
                  (is (= 42 (:id model)))
                  [{:kind "action", :key "create", :id 5}])]
    (is (= {:key              "ordersModel"
            :keyDisambiguator 42
            :actions          {"create" {:kind "action", :key "create", :id 5}}}
           (#'typed-schemas.api/model-schema
            {:id             42
             :name           "Orders model"})))))

(deftest model-schemas-includes-actionable-models-test
  (with-redefs [typed-schemas.api/select-cards
                (fn [card-type database-ids collection-ids]
                  (is (= :model card-type))
                  (is (= #{1} database-ids))
                  (is (nil? collection-ids))
                  [{:id 42} {:id 43}])
                typed-schemas.api/question-details
                (fn [card]
                  {:id   (:id card)
                   :name (str "Model " (:id card))})
                typed-schemas.api/model-actions
                (fn [model]
                  (when (= (:id model) 42)
                    [{:kind "action", :key "create", :id 5}]))]
    (is (= #{"model42"}
           (->> (#'typed-schemas.api/model-schemas #{1})
                (map :key)
                set)))))

(deftest metric-source-id-test
  (testing "integer source-table emits sourceTableId but not sourceCardId"
    (let [card {:dataset_query {:query {:source-table 10}}}]
      (is (= 10 (#'typed-schemas.api/source-table-id card)))
      (is (nil? (#'typed-schemas.api/source-card-id card)))))
  (testing "card source-table emits sourceCardId but not sourceTableId"
    (let [card {:dataset_query {:query {:source-table "card__42"}}}]
      (is (nil? (#'typed-schemas.api/source-table-id card)))
      (is (= 42 (#'typed-schemas.api/source-card-id card)))))
  (testing "stage source-card emits sourceCardId"
    (is (= 42 (#'typed-schemas.api/source-card-id
               {:dataset_query {:stages [{:source-card 42}]}})))))

(deftest keyed-map-disambiguates-duplicate-keys-with-readable-suffix-test
  (is (= {"channelOrderItems" {:key     "channelOrderItems"
                               :id      "40f15584-bca0-4557-910d-e5e789757f23"
                               :tableId 261}
          "channelOrders"     {:key     "channelOrders"
                               :id      "ca9bef16-d484-4add-8245-ddbc78287e8f"
                               :tableId 167}}
         (#'typed-schemas.api.common/keyed-map
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
         (#'typed-schemas.api.common/keyed-map
          [{:key     "channel"
            :id      1
            :tableId 167
            :keyDisambiguator "Orders"}
           {:key     "channel"
            :id      2
            :tableId 168
            :keyDisambiguator "Orders"}]))))

(deftest table-source-names-filters-unreadable-tables-test
  (with-redefs [t2/select (constantly [{:id 10 :name "orders" :display_name "Orders"}
                                       {:id 20 :name "franchises" :display_name "Franchises"}])
                mi/can-read? (fn [{:keys [id]}] (= id 10))]
    (is (= {10 "orders"}
           (#'typed-schemas.api/table-source-names [10 20])))
    (is (= {10 "Orders"}
           (#'typed-schemas.api/table-key-disambiguators [10 20])))))

(deftest metric-schema-keys-dimensions-test
  (with-redefs [typed-schemas.api/metric-result-column (constantly nil)
                typed-schemas.api/readable-table-source-rows
                (constantly [{:id 10 :name "orders" :display_name "Orders"}])
                typed-schemas.api/metric-dimensions
                (constantly [{:id             "550e8400-e29b-41d4-a716-446655440001"
                              :name           "orders"
                              :display-name   "Orders"
                              :effective-type :type/Integer
                              :table-id       10
                              :sources        [{:type :field, :field-id 42}]}])]
    (is (= {:type           "metric"
            :key            "customerLifetimeValue"
            :id             247
            :name           "Customer Lifetime Value"
            :columns        [{:type        "column"
                              :name        "Customer Lifetime Value"
                              :displayName "Customer Lifetime Value"
                              :jsType      "unknown"}]
            :mappedTableIds [10]
            :dimensions     {"orders" {:type        "column"
                                       :name        "orders"
                                       :sourceName "orders"
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

(deftest metric-schema-reuses-table-source-rows-test
  (let [table-select-count (atom 0)]
    (with-redefs [typed-schemas.api/metric-result-column (constantly nil)
                  typed-schemas.api/metric-dimensions
                  (constantly [{:id             "550e8400-e29b-41d4-a716-446655440001"
                                :name           "orders"
                                :display-name   "Orders"
                                :effective-type :type/Integer
                                :table-id       10
                                :sources        [{:type :field, :field-id 42}]}])
                  mi/can-read? (constantly true)
                  t2/select (fn [columns & _args]
                              (when (= columns [:model/Table :id :name :display_name])
                                (swap! table-select-count inc)
                                [{:id 10 :name "orders" :display_name "Orders"}]))]
      (#'typed-schemas.api/metric-schema
       {:id   247
        :name "Customer Lifetime Value"}
       {:id 247})
      (is (= 1 @table-select-count)))))

(deftest source-card-metric-schema-omits-mapped-table-dimensions-test
  (with-redefs [typed-schemas.api/metric-result-column (constantly nil)
                typed-schemas.api/table-source-names (constantly {10 "employee_store_roster"})
                typed-schemas.api/metric-dimensions
                (constantly [{:id   "count-dimension-uuid"
                              :name "count"}
                             {:id             "store-name-dimension-uuid"
                              :name           "store_name"
                              :display-name   "Store Name"
                              :effective-type :type/Text
                              :table-id       10
                              :sources        [{:type :field, :field-id 42}]}])]
    (is (= {:type         "metric"
            :key          "storesWithOver5Employees"
            :id           259
            :name         "Stores with Over 5 Employees"
            :columns      [{:type "column"
                            :name "Stores with Over 5 Employees"
                            :displayName "Stores with Over 5 Employees"
                            :jsType "unknown"}]
            :sourceCardId 258
            :dimensions   {"count" {:type        "column"
                                    :name        "count"
                                    :displayName "count"
                                    :jsType      "unknown"
                                    :key         "count"
                                    :id          "count-dimension-uuid"
                                    :metricId    259}}}
           (#'typed-schemas.api/metric-schema
            {:id   259
             :name "Stores with Over 5 Employees"}
            {:id            259
             :dataset_query {:stages [{:source-card 258}]}})))))

(deftest measure-schema-uses-result-column-test
  (testing "measure result columns come from the measure definition when available"
    (with-redefs [typed-schemas.api/measure-result-column
                  (constantly {:name         "sum"
                               :display_name "Sum of Total"
                               :base_type    "type/Decimal"})]
      (is (= {:type    "measure"
              :key     "totalRevenue"
              :id      1
              :tableId 10
              :name    "Total Revenue"
              :columns [{:type        "column"
                         :name        "sum"
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
      (is (= {:type    "measure"
              :key     "totalRevenue"
              :id      1
              :tableId 10
              :name    "Total Revenue"
              :columns [{:type "column", :name "Total Revenue", :displayName "Total Revenue", :jsType "unknown"}]}
             (#'typed-schemas.api/measure-schema
              10
              2
              {:id   1
               :name "Total Revenue"}))))))

(deftest javascript-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/javascript")]
    (is (= "text/javascript; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (str/starts-with? (:body response) "const questions = "))
    (is (str/includes? (:body response) "\nconst schema = {"))
    (is (str/includes? (:body response) "\n  schemaVersion: 2"))
    (is (str/includes? (:body response) "\n  questions: questions"))
    (is (str/includes? (:body response) "\n  tables: tables"))
    (is (str/includes? (:body response) "\n  metrics: metrics"))
    (is (str/ends-with? (:body response) "export default schema;\n"))
    (is (not (str/includes? (:body response) "\"schemaVersion\"")))
    (is (not (str/includes? (:body response) "operators: [ ]")))
    (is (not (str/includes? (:body response) "parameters: [ ]")))
    (is (not (str/includes? (:body response) "verified: false")))))

(deftest typescript-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/typescript")]
    (is (= "text/typescript; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (str/starts-with? (:body response) "const questions = "))
    (is (str/includes? (:body response) "\nconst schema = {"))
    (is (str/includes? (:body response) "\n  schemaVersion: 2"))
    (is (str/ends-with? (:body response) "export default schema;\n"))))

(deftest typescript-renderer-compacts-runtime-objects-test
  (let [body (#'typed-schemas.api/render-typescript
              {:schemaVersion 2
               :questions     {"ordersQuestion" {:type        "card"
                                                 :key         "ordersQuestion"
                                                 :id          41
                                                 :name        "Orders question"
                                                 :display     "table"
                                                 :description "Saved orders"
                                                 :columns     [{:type "column" :name "count" :jsType "number"}]}}
               :tables        {"orders"     {:type         "table"
                                             :key          "orders"
                                             :id           10
                                             :name         "Orders"
                                             :databaseName "Boba"
                                             :tableName    "orders"
                                             :fields       {"paymentMethod" {:type         "column"
                                                                             :name         "payment_method"
                                                                             :source-name  "orders"
                                                                             :displayName  "Payment Method"
                                                                             :baseType     "type/Text"
                                                                             :semanticType "type/Category"
                                                                             :jsType       "string"
                                                                             :key          "paymentMethod"
                                                                             :id           3970
                                                                             :fieldId      3970
                                                                             :tableId      10}}}
                               "franchises" {:type       "table"
                                             :key        "franchises"
                                             :id         20
                                             :name       "Franchises"
                                             :fields     {"name" {:type        "column"
                                                                  :name        "name"
                                                                  :displayName "Name"
                                                                  :baseType    "type/Text"
                                                                  :jsType      "string"
                                                                  :key         "name"
                                                                  :id          500
                                                                  :fieldId     500
                                                                  :tableId     20}
                                                          "ownerName" {:type        "column"
                                                                       :name        "owner_name"
                                                                       :displayName "Owner Name"
                                                                       :baseType    "type/Text"
                                                                       :jsType      "string"
                                                                       :key         "ownerName"
                                                                       :id          501
                                                                       :fieldId     501
                                                                       :tableId     20}}}}
               :metrics       {"revenue" {:type           "metric"
                                          :key            "revenue"
                                          :id             5
                                          :name           "Revenue"
                                          :databaseId     1
                                          :sourceTableId  10
                                          :description    "Total order revenue"
                                          :mappedTableIds [10 20]
                                          :dimensions     {"paymentMethod" {:name        "payment_method"
                                                                            :displayName "Payment Method"
                                                                            :baseType    "type/Text"
                                                                            :semanticType "type/Category"
                                                                            :jsType      "string"
                                                                            :key         "paymentMethod"
                                                                            :id          "dimension-uuid"
                                                                            :fieldId     3970
                                                                            :tableId     10
                                                                            :metricId    5}
                                                           "franchiseName" {:name          "name"
                                                                            :displayName   "Name"
                                                                            :baseType      "type/Text"
                                                                            :jsType        "string"
                                                                            :key           "franchiseName"
                                                                            :id            "franchise-dimension-uuid"
                                                                            :fieldId       500
                                                                            :tableId       20
                                                                            :sourceFieldId 42
                                                                            :metricId      5}
                                                           "franchiseOwnerName" {:name          "owner_name"
                                                                                 :displayName   "Owner Name"
                                                                                 :baseType      "type/Text"
                                                                                 :jsType        "string"
                                                                                 :key           "franchiseOwnerName"
                                                                                 :id            "franchise-owner-dimension-uuid"
                                                                                 :fieldId       501
                                                                                 :tableId       20
                                                                                 :sourceFieldId 42
                                                                                 :metricId      5}}}
                               "modelRevenue" {:type          "metric"
                                               :key           "modelRevenue"
                                               :id            6
                                               :name          "Model Revenue"
                                               :databaseId    1
                                               :sourceCardId  42
                                               :mappedTableIds [10]
                                               :columns       [{:type "column" :name "count" :jsType "number"}]
                                               :dimensions    {"createdAt" {:type        "column"
                                                                            :name        "created_at"
                                                                            :sourceName "orders"
                                                                            :baseType    "type/DateTime"
                                                                            :jsType      "Date"
                                                                            :key         "createdAt"
                                                                            :id          "model-dimension-uuid"
                                                                            :fieldId     3971
                                                                            :tableId     10
                                                                            :metricId    6}}}}})]
    (is (str/includes? body (str "/" "/ Display name: Payment Method")))
    (is (str/includes? body (str "/" "/ Semantic type: type/Category")))
    (is (not (str/includes? body (str "/" "/ Generated key:"))))
    (is (not (str/includes? body (str "/" "/ Table: orders"))))
    (is (not (str/includes? body (str "/" "/ id: 3970"))))
    (is (str/includes? body "paymentMethod: {\n        type: \"column\""))
    (is (str/includes? body "name: \"payment_method\""))
    (is (str/includes? body "sourceName: \"orders\""))
    (is (str/includes? body "type: \"table\""))
    (is (not (str/includes? body "kind: \"table\"")))
    (is (str/includes? body "ordersQuestion: {\n    type: \"card\""))
    (is (str/includes? body "id: 41"))
    (is (not (str/includes? body "kind: \"question\"")))
    (is (str/includes? body (str "/" "/ Description: Saved orders")))
    (is (str/includes? body "fieldId: 3970"))
    (is (str/includes? body "tableId: 10"))
    (is (not (str/includes? body "displayName: \"Payment Method\"")))
    (is (str/includes? body "baseType: \"type/Text\""))
    (is (str/includes? body (str "/" "/ Description: Total order revenue")))
    (is (str/includes? body "databaseId: 1"))
    (is (str/includes? body "sourceTableId: 10"))
    (is (str/includes? body "sourceCardId: 42"))
    (is (str/includes? body "fields: {\n        createdAt: {\n          type: \"column\""))
    (is (str/includes? body "sourceName: \"orders\""))
    (is (str/includes? body "mappedTableIds: [ 10, 20 ]"))
    (is (str/includes? body "function pickFields"))
    (is (str/includes? body "const field = fields[key] as { tableId?: number };"))
    (is (str/includes? body "const { tableId, ...joinedField } = field;"))
    (is (str/includes? body "dimensions: {\n      orders: pickFields(tables.orders.fields, [ \"paymentMethod\" ])"))
    (is (str/includes? body "franchises: pickFields(tables.franchises.fields, [ \"name\", \"ownerName\" ], { sourceFieldId: 42 })"))
    (is (= 1 (count (re-seq #"sourceFieldId: 42" body))))
    (is (not (str/includes? body "dimensionIds")))
    (is (not (str/includes? body "metricId: 5")))
    (is (not (str/includes? body "metricId: 6")))))

(deftest json-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/json")]
    (is (= "application/json; charset=utf-8" (get-in response [:headers "Content-Type"])))
    (is (= 2 (get-in response [:body :schemaVersion])))
    (is (map? (get-in response [:body :questions])))
    (is (map? (get-in response [:body :tables])))
    (is (map? (get-in response [:body :metrics])))))

(deftest query-params-are-coerced-at-endpoint-test
  (with-redefs [typed-schemas.api/typed-schema identity]
    (let [response (mt/user-http-request
                    :crowberto
                    :get
                    200
                    "typed-schemas/v1/json?include-models=true&questions=false&library-collections=1,2")]
      (is (true? (:include-models response)))
      (is (false? (:questions response)))
      (is (= "1,2" (:library-collections response))))))

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
    (with-redefs [typed-schemas.api.query-params/database-ids-for-value (constantly #{42})
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

(deftest model-schemas-surface-detail-errors-test
  (with-redefs [typed-schemas.api/select-cards (constantly [{:id 100 :type "model" :name "Broken model"}])
                entity-details/get-report-details (constantly {:output "source table not found"
                                                               :status-code 404})]
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (doall (#'typed-schemas.api/model-schemas #{1}))))]
      (is (= "Failed to build schema details for model \"Broken model\" (card 100): source table not found"
             (ex-message e)))
      (is (= {:card-id       100
              :card-name     "Broken model"
              :card-type     "model"
              :status-code   404
              :error-message "source table not found"}
             (select-keys (ex-data e) [:card-id :card-name :card-type :status-code :error-message]))))))

(deftest model-schemas-surface-detail-exceptions-test
  (with-redefs [typed-schemas.api/select-cards (constantly [{:id 100 :type "model" :name "Broken model"}])
                entity-details/get-report-details (fn [_]
                                                    (throw (ex-info "Invalid output: [\"Valid Table metadata, got: nil\"]"
                                                                    {:status-code 500})))]
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (doall (#'typed-schemas.api/model-schemas #{1}))))]
      (is (= "Failed to build schema details for model \"Broken model\" (card 100): Invalid output: [\"Valid Table metadata, got: nil\"]"
             (ex-message e)))
      (is (= {:card-id       100
              :card-name     "Broken model"
              :card-type     "model"
              :status-code   500
              :cause-message "Invalid output: [\"Valid Table metadata, got: nil\"]"}
             (select-keys (ex-data e) [:card-id :card-name :card-type :status-code :cause-message]))))))

(deftest model-schema-surfaces-action-selection-errors-test
  (with-redefs [typed-schemas.api/raw-model-actions (constantly [])
                actions/select-actions (fn [& _]
                                         (throw (ex-info "action lookup failed"
                                                         {:status-code 500})))]
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (#'typed-schemas.api/model-schema {:id             100
                                                            :name           "Broken model"
                                                            :result-columns []})))]
      (is (= "Failed to build action schemas for model \"Broken model\" (card 100): action lookup failed"
             (ex-message e)))
      (is (= {:model-id      100
              :model-name    "Broken model"
              :status-code   500
              :cause-message "action lookup failed"}
             (select-keys (ex-data e) [:model-id :model-name :status-code :cause-message]))))))

(deftest model-schema-surfaces-action-rendering-errors-test
  (with-redefs [actions/select-actions (constantly [{:id   200
                                                     :name "Broken action"
                                                     :type :query}])
                typed-schemas.api/raw-model-actions (constantly [{:id   200
                                                                  :name "Broken action"
                                                                  :type :query}])
                typed-schemas.api/action-schema (fn [& _]
                                                  (throw (ex-info "action parameters are invalid"
                                                                  {:status-code 500})))]
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (#'typed-schemas.api/model-schema {:id             100
                                                            :name           "Broken model"
                                                            :result-columns []})))]
      (is (= "Failed to build action schema for action \"Broken action\" (action 200, type query) on model \"Broken model\" (card 100): action parameters are invalid"
             (ex-message e)))
      (is (= {:model-id      100
              :model-name    "Broken model"
              :action-id     200
              :action-name   "Broken action"
              :action-type   :query
              :status-code   500
              :cause-message "action parameters are invalid"}
             (select-keys (ex-data e) [:model-id :model-name :action-id :action-name :action-type :status-code :cause-message]))))))

(deftest model-schema-surfaces-dropped-action-errors-test
  (with-redefs [typed-schemas.api/raw-model-actions (constantly [{:id   200
                                                                  :name "Broken action"
                                                                  :type :broken}])
                actions/select-actions (constantly [])]
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (#'typed-schemas.api/model-schema {:id             100
                                                            :name           "Broken model"
                                                            :result-columns []})))]
      (is (= "Failed to build action schemas for model \"Broken model\" (card 100): selected actions were dropped while normalizing action details: Broken action (action 200, type broken)"
             (ex-message e)))
      (is (= {:model-id        100
              :model-name      "Broken model"
              :dropped-actions [{:id 200, :name "Broken action", :type :broken}]}
             (select-keys (ex-data e) [:model-id :model-name :dropped-actions]))))))

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
             (select-keys (#'typed-schemas.api.query-params/library-collection-scope (str (:id child)))
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
             (select-keys (#'typed-schemas.api.query-params/library-collections-scope
                           (#'typed-schemas.api.query-params/query-library-collection-values
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
             (select-keys (#'typed-schemas.api.query-params/library-collections-scope ["g-jLnamuHKdezZMthJ-z7"])
                          [:collection-ids :data-collection-ids :metric-collection-ids]))))))

(deftest library-scope-includes-canonical-data-and-metrics-libraries-test
  (with-redefs [typed-schemas.api.query-params/library-data-entity-id    "test-library-data"
                typed-schemas.api.query-params/library-metrics-entity-id "test-library-metrics"]
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
               (select-keys (#'typed-schemas.api.query-params/library-scope
                             {:include-data-library   "true"
                              :include-metric-library "true"})
                            [:collection-ids :data-collection-ids :metric-collection-ids])))))))

(deftest ^:parallel query-collection-values-use-kebab-case-params-test
  (is (= ["1" "2"]
         (#'typed-schemas.api.query-params/query-library-collection-values {:library-collections "1, 2"})))
  (is (= ["3" "4"]
         (#'typed-schemas.api.query-params/query-question-collection-values {:question-collections "3, 4"})))
  (is (true?
       (#'typed-schemas.api.query-params/query-include-models? {:include-models "true"})))
  (is (nil?
       (#'typed-schemas.api.query-params/query-library-collection-values {:libraryCollections "1, 2"})))
  (is (nil?
       (#'typed-schemas.api.query-params/query-question-collection-values {:questionCollections "3, 4"})))
  (is (false?
       (#'typed-schemas.api.query-params/query-include-models? {:includeModels "true"}))))

(deftest question-collection-scope-accepts-comma-separated-collection-ids-test
  (mt/with-temp [:model/Collection parent {:name "Question Parent"
                                           :location "/"}
                 :model/Collection child  {:name "Question Child"
                                           :location (collection/children-location parent)}]
    (mt/with-test-user :crowberto
      (is (= #{(:id parent) (:id child)}
             (#'typed-schemas.api.query-params/collection-scope
              (#'typed-schemas.api.query-params/query-question-collection-values
               {:question-collections (str (:id parent))})))))))

(deftest question-collection-scope-accepts-representation-entity-ids-test
  (mt/with-temp [:model/Collection parent {:name      "Question Parent"
                                           :entity_id "question-entity-id-1"
                                           :location  "/"}
                 :model/Collection child  {:name "Question Child"
                                           :location (collection/children-location parent)}]
    (mt/with-test-user :crowberto
      (is (= #{(:id parent) (:id child)}
             (#'typed-schemas.api.query-params/collection-scope ["question-entity-id-1"]))))))

(deftest question-collection-scope-rejects-missing-collection-ref-test
  (mt/with-test-user :crowberto
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (#'typed-schemas.api.query-params/collection-scope ["missing-entity-id-1"])))]
      (is (= 404 (:status-code (ex-data e)))))))

(deftest library-schema-includes-metric-mapped-tables-test
  (let [selected-table-ids (atom nil)]
    (with-redefs [typed-schemas.api.query-params/library-collection-scope
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
                    [{:type           "metric"
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
                  (constantly [{:type "table", :key "publishedTable", :id 10}
                               {:type "table", :key "mappedTable", :id 42}])]
      (let [schema (#'typed-schemas.api/typed-schema {:library "123"})]
        (is (= #{10 42} @selected-table-ids))
        (is (= {} (:questions schema)))
        (is (= {} (:models schema)))
        (is (= #{10 42} (->> (:tables schema) vals (map :id) set)))
        (is (= #{1} (->> (:metrics schema) vals (map :id) set)))))))

(deftest collections-schema-includes-selected-data-and-metric-collections-test
  (let [selected-table-ids (atom nil)]
    (with-redefs [typed-schemas.api.query-params/library-collections-scope
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
                    [{:type           "metric"
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
                  (constantly [{:type "table", :key "publishedTable", :id 10}
                               {:type "table", :key "mappedTable", :id 42}])]
      (let [schema (#'typed-schemas.api/typed-schema {:library-collections "10, 20"})]
        (is (= #{10 42} @selected-table-ids))
        (is (= {} (:questions schema)))
        (is (= {} (:models schema)))
        (is (= #{10 42} (->> (:tables schema) vals (map :id) set)))
        (is (= #{1} (->> (:metrics schema) vals (map :id) set)))))))

(deftest include-models-schema-includes-actionable-models-test
  (with-redefs [typed-schemas.api/model-schemas
                (fn [database-ids]
                  (is (nil? database-ids))
                  [{:key     "actionableModel"
                    :actions {"create" {:kind "action", :key "create", :id 1}}}])
                typed-schemas.api/question-schemas
                (fn
                  ([_database-ids]
                   (is false "include-models-only schemas should not load questions"))
                  ([_database-ids _collection-ids]
                   (is false "include-models-only schemas should not load questions")))
                typed-schemas.api/metric-schemas
                (fn
                  ([_database-ids]
                   (is false "include-models-only schemas should not load metrics"))
                  ([_database-ids _collection-ids]
                   (is false "include-models-only schemas should not load metrics")))
                typed-schemas.api/select-tables
                (fn
                  ([_database-ids]
                   (is false "include-models-only schemas should not load tables"))
                  ([_database-ids _table-ids]
                   (is false "include-models-only schemas should not load tables")))]
    (let [schema (#'typed-schemas.api/typed-schema {:include-models "true"})]
      (is (= {} (:questions schema)))
      (is (= {"actionableModel" {:actions {"create" {:kind "action", :key "create", :id 1}}}}
             (:models schema)))
      (is (= {} (:tables schema)))
      (is (= {} (:metrics schema))))))

(deftest include-models-with-database-scopes-models-test
  (let [model-database-ids (atom [])]
    (with-redefs [typed-schemas.api.query-params/database-ids-for-value (constantly #{42})
                  typed-schemas.api/model-schemas (fn [database-ids]
                                                    (swap! model-database-ids conj database-ids)
                                                    [{:key     "databaseModel"
                                                      :actions {"create" {:kind "action", :key "create", :id 1}}}])
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
      (let [schema (#'typed-schemas.api/typed-schema {:database "Boba" :include-models "true"})]
        (is (= [#{42}] @model-database-ids))
        (is (= {"databaseModel" {:actions {"create" {:kind "action", :key "create", :id 1}}}}
               (:models schema)))))))

(deftest question-collections-schema-includes-selected-question-collections-test
  (with-redefs [typed-schemas.api.query-params/collection-scope
                (fn [collection-values]
                  (is (= ["30" "40"] collection-values))
                  #{30 40})
                typed-schemas.api/question-schemas
                (fn [database-ids collection-ids]
                  (is (nil? database-ids))
                  (is (= #{30 40} collection-ids))
                  [{:type "card", :key "ordersByMonth", :id 1}])
                typed-schemas.api/model-schemas
                (fn
                  ([_database-ids]
                   (is false "question collection schemas should not load models"))
                  ([_database-ids _collection-ids]
                   (is false "question collection schemas should not load models")))]
    (let [schema (#'typed-schemas.api/typed-schema {:question-collections "30, 40"})]
      (is (= #{1} (->> (:questions schema) vals (map :id) set)))
      (is (= {} (:models schema)))
      (is (= {} (:tables schema)))
      (is (= {} (:metrics schema))))))

(deftest library-and-question-collections-can-be-combined-test
  (with-redefs [typed-schemas.api.query-params/library-collections-scope
                (fn [collection-values]
                  (is (= ["10"] collection-values))
                  {:metric-collection-ids #{10}
                   :data-collection-ids   #{10}})
                typed-schemas.api.query-params/collection-scope
                (fn [collection-values]
                  (is (= ["30"] collection-values))
                  #{30})
                typed-schemas.api/question-schemas
                (fn [database-ids collection-ids]
                  (is (nil? database-ids))
                  (is (= #{30} collection-ids))
                  [{:type "card", :key "ordersByMonth", :id 1}])
                typed-schemas.api/model-schemas
                (fn
                  ([_database-ids]
                   (is false "question collection schemas should not load models"))
                  ([_database-ids _collection-ids]
                   (is false "question collection schemas should not load models")))
                typed-schemas.api/metric-schemas
                (constantly [{:type "metric", :key "revenue", :id 2}])
                typed-schemas.api/select-library-tables
                (constantly [{:id 3}])
                typed-schemas.api/select-tables
                (constantly [{:id 3}])
                typed-schemas.api/table-schemas
                (constantly [{:type "table", :key "orders", :id 3}])]
    (let [schema (#'typed-schemas.api/typed-schema {:library-collections  "10"
                                                    :question-collections "30"})]
      (is (= #{1} (->> (:questions schema) vals (map :id) set)))
      (is (= {} (:models schema)))
      (is (= #{3} (->> (:tables schema) vals (map :id) set)))
      (is (= #{2} (->> (:metrics schema) vals (map :id) set))))))

(deftest library-and-question-collections-can-be-combined-with-include-models-test
  (with-redefs [typed-schemas.api.query-params/library-collections-scope
                (fn [collection-values]
                  (is (= ["10"] collection-values))
                  {:metric-collection-ids #{10}
                   :data-collection-ids   #{10}})
                typed-schemas.api.query-params/collection-scope
                (fn [collection-values]
                  (is (= ["30"] collection-values))
                  #{30})
                typed-schemas.api/question-schemas
                (fn [database-ids collection-ids]
                  (is (nil? database-ids))
                  (is (= #{30} collection-ids))
                  [{:type "card", :key "ordersByMonth", :id 1}])
                typed-schemas.api/model-schemas
                (fn [database-ids]
                  (is (nil? database-ids))
                  [{:key     "selectedQuestionCollectionModel"
                    :actions {"create" {:kind "action", :key "create", :id 1}}}])
                typed-schemas.api/metric-schemas
                (constantly [{:type "metric", :key "revenue", :id 2}])
                typed-schemas.api/select-library-tables
                (constantly [{:id 3}])
                typed-schemas.api/select-tables
                (constantly [{:id 3}])
                typed-schemas.api/table-schemas
                (constantly [{:type "table", :key "orders", :id 3}])]
    (let [schema (#'typed-schemas.api/typed-schema {:library-collections  "10"
                                                    :question-collections "30"
                                                    :include-models        "true"})]
      (is (= #{1} (->> (:questions schema) vals (map :id) set)))
      (is (= {"selectedQuestionCollectionModel" {:actions {"create" {:kind "action", :key "create", :id 1}}}}
             (:models schema)))
      (is (= #{3} (->> (:tables schema) vals (map :id) set)))
      (is (= #{2} (->> (:metrics schema) vals (map :id) set))))))
