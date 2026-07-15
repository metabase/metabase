(ns metabase.typed-schemas.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.actions.core :as actions]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.api :as typed-schemas.api]
   [metabase.typed-schemas.api.render :as typed-schemas.api.render]
   [metabase.typed-schemas.api.schema.common :as typed-schemas.api.schema.common]
   [metabase.typed-schemas.api.schema.question :as typed-schemas.api.schema.question]
   [metabase.typed-schemas.api.schema.table :as typed-schemas.api.schema.table]
   [metabase.typed-schemas.api.scope :as typed-schemas.api.scope]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

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
  (with-redefs [typed-schemas.api.schema.common/select-schema-cards
                (fn [card-type database-ids collection-ids]
                  (is (= :model card-type))
                  (is (= #{1} database-ids))
                  (is (nil? collection-ids))
                  [{:id 42 :name "Model 42"}
                   {:id 43 :name "Model 43"}])
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

(deftest typescript-endpoint-test
  (let [response (mt/user-http-request-full-response :crowberto :get 200 "typed-schemas/v1/typescript")]
    (is (= "text/typescript; charset=utf-8" (get-in response [:headers "Content-Type"])))
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

(deftest query-params-are-coerced-at-endpoint-test
  (with-redefs [typed-schemas.api/typed-schema identity
                typed-schemas.api.render/render-typescript pr-str]
    (let [response (-> (mt/user-http-request-full-response
                        :crowberto
                        :get
                        200
                        "typed-schemas/v1/typescript?include-models=true&questions=false&library-collections=1,2")
                       :body
                       read-string)]
      (is (true? (:include-models response)))
      (is (false? (:questions response)))
      (is (= "1,2" (:library-collections response))))))

(deftest database-filter-test
  (testing "a non-matching database name returns an empty semantic schema"
    (let [response (mt/user-http-request-full-response
                    :crowberto
                    :get
                    200
                    "typed-schemas/v1/typescript?database=__missing_database__")]
      (is (str/includes? (:body response) "schemaVersion: 2"))
      (is (str/includes? (:body response) "const questions = { }"))
      (is (str/includes? (:body response) "const tables = { }"))
      (is (str/includes? (:body response) "const metrics = { }"))))
  (testing "questions=true returns only questions for a numeric database id"
    (let [response (mt/user-http-request-full-response
                    :crowberto
                    :get
                    200
                    (format "typed-schemas/v1/typescript?database=%s&questions=true" (mt/id)))]
      (is (str/includes? (:body response) "schemaVersion: 2"))
      (is (str/includes? (:body response) "const questions = {"))
      (is (str/includes? (:body response) "const tables = { }"))
      (is (str/includes? (:body response) "const metrics = { }")))))

(deftest database-filter-scopes-models-test
  (let [model-database-ids (atom [])]
    (with-redefs [typed-schemas.api.scope/database-ids-for-value (constantly #{42})
                  typed-schemas.api/model-schemas (fn [database-ids]
                                                    (swap! model-database-ids conj database-ids)
                                                    [])
                  typed-schemas.api.schema.question/question-schemas (fn
                                                                       ([_database-ids] [])
                                                                       ([_database-ids _collection-ids] []))
                  typed-schemas.api/metric-schemas (fn
                                                     ([_database-ids] [])
                                                     ([_database-ids _collection-ids] []))
                  typed-schemas.api.schema.table/select-tables (fn
                                                                 ([_database-ids] [])
                                                                 ([_database-ids _table-ids] []))
                  typed-schemas.api.schema.table/table-schemas (constantly [])]
      (#'typed-schemas.api/typed-schema {:database "Boba"})
      (#'typed-schemas.api/typed-schema {:database "Boba" :questions "true"})
      (is (= [#{42} #{42}] @model-database-ids)))))

(deftest model-schema-surfaces-action-selection-errors-test
  (with-redefs [typed-schemas.api/raw-model-actions (constantly [])
                actions/select-actions (fn [& _]
                                         (throw (ex-info "action lookup failed"
                                                         {:status-code 500})))]
    (let [exception (is (thrown? clojure.lang.ExceptionInfo
                                 (#'typed-schemas.api/model-schema {:id             100
                                                                    :name           "Broken model"
                                                                    :result-columns []})))]
      (is (= "Failed to build action schemas for model \"Broken model\" (card 100): action lookup failed"
             (ex-message exception)))
      (is (= {:model-id      100
              :model-name    "Broken model"
              :status-code   500
              :cause-message "action lookup failed"}
             (select-keys (ex-data exception) [:model-id :model-name :status-code :cause-message]))))))

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
    (let [exception (is (thrown? clojure.lang.ExceptionInfo
                                 (#'typed-schemas.api/model-schema {:id             100
                                                                    :name           "Broken model"
                                                                    :result-columns []})))]
      (is (= "Failed to build action schema for action \"Broken action\" (action 200, type query) on model \"Broken model\" (card 100): action parameters are invalid"
             (ex-message exception)))
      (is (= {:model-id      100
              :model-name    "Broken model"
              :action-id     200
              :action-name   "Broken action"
              :action-type   :query
              :status-code   500
              :cause-message "action parameters are invalid"}
             (select-keys (ex-data exception) [:model-id :model-name :action-id :action-name :action-type :status-code :cause-message]))))))

(deftest model-schema-surfaces-dropped-action-errors-test
  (with-redefs [typed-schemas.api/raw-model-actions (constantly [{:id   200
                                                                  :name "Broken action"
                                                                  :type :broken}])
                actions/select-actions (constantly [])]
    (let [exception (is (thrown? clojure.lang.ExceptionInfo
                                 (#'typed-schemas.api/model-schema {:id             100
                                                                    :name           "Broken model"
                                                                    :result-columns []})))]
      (is (= "Failed to build action schemas for model \"Broken model\" (card 100): selected actions were dropped while normalizing action details: Broken action (action 200, type broken)"
             (ex-message exception)))
      (is (= {:model-id        100
              :model-name      "Broken model"
              :dropped-actions [{:id 200, :name "Broken action", :type :broken}]}
             (select-keys (ex-data exception) [:model-id :model-name :dropped-actions]))))))

(deftest library-and-database-are-mutually-exclusive-test
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/typescript?library=1&database=1")
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/typescript?library=1&questions=true")
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/typescript?questions=true"))

(deftest collection-query-params-are-mutually-exclusive-test
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/typescript?library-collections=1,2&database=1")
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/typescript?question-collections=1,2&questions=true")
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/typescript?library=1&library-collections=2"))

(deftest library-schema-includes-metric-mapped-tables-test
  (let [selected-table-ids (atom nil)]
    (with-redefs [typed-schemas.api.scope/library-collection-scope
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
                  typed-schemas.api.schema.table/select-library-tables
                  (constantly [{:id 10}])
                  typed-schemas.api.schema.table/select-tables
                  (fn [_database-ids table-ids]
                    (reset! selected-table-ids table-ids)
                    [{:id 10} {:id 42}])
                  typed-schemas.api.schema.table/table-schemas
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
    (with-redefs [typed-schemas.api.scope/library-collections-scope
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
                  typed-schemas.api.schema.table/select-library-tables
                  (fn [library-scope]
                    (is (= #{10} (:data-collection-ids library-scope)))
                    [{:id 10}])
                  typed-schemas.api.schema.table/select-tables
                  (fn [_database-ids table-ids]
                    (reset! selected-table-ids table-ids)
                    [{:id 10} {:id 42}])
                  typed-schemas.api.schema.table/table-schemas
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
                typed-schemas.api.schema.question/question-schemas
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
                typed-schemas.api.schema.table/select-tables
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
    (with-redefs [typed-schemas.api.scope/database-ids-for-value (constantly #{42})
                  typed-schemas.api/model-schemas (fn [database-ids]
                                                    (swap! model-database-ids conj database-ids)
                                                    [{:key     "databaseModel"
                                                      :actions {"create" {:kind "action", :key "create", :id 1}}}])
                  typed-schemas.api.schema.question/question-schemas (fn
                                                                       ([_database-ids] [])
                                                                       ([_database-ids _collection-ids] []))
                  typed-schemas.api/metric-schemas (fn
                                                     ([_database-ids] [])
                                                     ([_database-ids _collection-ids] []))
                  typed-schemas.api.schema.table/select-tables (fn
                                                                 ([_database-ids] [])
                                                                 ([_database-ids _table-ids] []))
                  typed-schemas.api.schema.table/table-schemas (constantly [])]
      (let [schema (#'typed-schemas.api/typed-schema {:database "Boba" :include-models "true"})]
        (is (= [#{42}] @model-database-ids))
        (is (= {"databaseModel" {:actions {"create" {:kind "action", :key "create", :id 1}}}}
               (:models schema)))))))

(deftest question-collections-schema-includes-selected-question-collections-test
  (with-redefs [typed-schemas.api.scope/collection-scope
                (fn [collection-values]
                  (is (= ["30" "40"] collection-values))
                  #{30 40})
                typed-schemas.api.schema.question/question-schemas
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
  (with-redefs [typed-schemas.api.scope/library-collections-scope
                (fn [collection-values]
                  (is (= ["10"] collection-values))
                  {:metric-collection-ids #{10}
                   :data-collection-ids   #{10}})
                typed-schemas.api.scope/collection-scope
                (fn [collection-values]
                  (is (= ["30"] collection-values))
                  #{30})
                typed-schemas.api.schema.question/question-schemas
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
                typed-schemas.api.schema.table/select-library-tables
                (constantly [{:id 3}])
                typed-schemas.api.schema.table/select-tables
                (constantly [{:id 3}])
                typed-schemas.api.schema.table/table-schemas
                (constantly [{:type "table", :key "orders", :id 3}])]
    (let [schema (#'typed-schemas.api/typed-schema {:library-collections  "10"
                                                    :question-collections "30"})]
      (is (= #{1} (->> (:questions schema) vals (map :id) set)))
      (is (= {} (:models schema)))
      (is (= #{3} (->> (:tables schema) vals (map :id) set)))
      (is (= #{2} (->> (:metrics schema) vals (map :id) set))))))

(deftest library-and-question-collections-can-be-combined-with-include-models-test
  (with-redefs [typed-schemas.api.scope/library-collections-scope
                (fn [collection-values]
                  (is (= ["10"] collection-values))
                  {:metric-collection-ids #{10}
                   :data-collection-ids   #{10}})
                typed-schemas.api.scope/collection-scope
                (fn [collection-values]
                  (is (= ["30"] collection-values))
                  #{30})
                typed-schemas.api.schema.question/question-schemas
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
                typed-schemas.api.schema.table/select-library-tables
                (constantly [{:id 3}])
                typed-schemas.api.schema.table/select-tables
                (constantly [{:id 3}])
                typed-schemas.api.schema.table/table-schemas
                (constantly [{:type "table", :key "orders", :id 3}])]
    (let [schema (#'typed-schemas.api/typed-schema {:library-collections  "10"
                                                    :question-collections "30"
                                                    :include-models        "true"})]
      (is (= #{1} (->> (:questions schema) vals (map :id) set)))
      (is (= {"selectedQuestionCollectionModel" {:actions {"create" {:kind "action", :key "create", :id 1}}}}
             (:models schema)))
      (is (= #{3} (->> (:tables schema) vals (map :id) set)))
      (is (= #{2} (->> (:metrics schema) vals (map :id) set))))))
