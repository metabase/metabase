(ns metabase.typed-schemas.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.api :as typed-schemas.api]
   [metabase.typed-schemas.api.render :as typed-schemas.api.render]
   [metabase.typed-schemas.api.schema.metric :as typed-schemas.api.schema.metric]
   [metabase.typed-schemas.api.schema.model :as typed-schemas.api.schema.model]
   [metabase.typed-schemas.api.schema.question :as typed-schemas.api.schema.question]
   [metabase.typed-schemas.api.schema.table :as typed-schemas.api.schema.table]
   [metabase.typed-schemas.api.scope :as typed-schemas.api.scope]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

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
                  typed-schemas.api.schema.model/model-schemas (fn [database-ids]
                                                                 (swap! model-database-ids conj database-ids)
                                                                 [])
                  typed-schemas.api.schema.question/question-schemas (fn
                                                                       ([_database-ids] [])
                                                                       ([_database-ids _collection-ids] []))
                  typed-schemas.api.schema.metric/metric-schemas (fn
                                                                   ([_database-ids] [])
                                                                   ([_database-ids _collection-ids] []))
                  typed-schemas.api.schema.table/select-tables (fn
                                                                 ([_database-ids] [])
                                                                 ([_database-ids _table-ids] []))
                  typed-schemas.api.schema.table/table-schemas (constantly [])]
      (#'typed-schemas.api/typed-schema {:database "Boba"})
      (#'typed-schemas.api/typed-schema {:database "Boba" :questions "true"})
      (is (= [#{42} #{42}] @model-database-ids)))))

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
                  typed-schemas.api.schema.model/model-schemas
                  (fn
                    ([_database-ids]
                     (is false "library-only schemas should not load models"))
                    ([_database-ids _collection-ids]
                     (is false "library-only schemas should not load models")))
                  typed-schemas.api.schema.metric/metric-schemas
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
                  typed-schemas.api.schema.model/model-schemas
                  (fn
                    ([_database-ids]
                     (is false "library-only schemas should not load models"))
                    ([_database-ids _collection-ids]
                     (is false "library-only schemas should not load models")))
                  typed-schemas.api.schema.metric/metric-schemas
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
  (with-redefs [typed-schemas.api.schema.model/model-schemas
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
                typed-schemas.api.schema.metric/metric-schemas
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
                  typed-schemas.api.schema.model/model-schemas (fn [database-ids]
                                                                 (swap! model-database-ids conj database-ids)
                                                                 [{:key     "databaseModel"
                                                                   :actions {"create" {:kind "action", :key "create", :id 1}}}])
                  typed-schemas.api.schema.question/question-schemas (fn
                                                                       ([_database-ids] [])
                                                                       ([_database-ids _collection-ids] []))
                  typed-schemas.api.schema.metric/metric-schemas (fn
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
                typed-schemas.api.schema.model/model-schemas
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
                typed-schemas.api.schema.model/model-schemas
                (fn
                  ([_database-ids]
                   (is false "question collection schemas should not load models"))
                  ([_database-ids _collection-ids]
                   (is false "question collection schemas should not load models")))
                typed-schemas.api.schema.metric/metric-schemas
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
                typed-schemas.api.schema.model/model-schemas
                (fn [database-ids]
                  (is (nil? database-ids))
                  [{:key     "selectedQuestionCollectionModel"
                    :actions {"create" {:kind "action", :key "create", :id 1}}}])
                typed-schemas.api.schema.metric/metric-schemas
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
