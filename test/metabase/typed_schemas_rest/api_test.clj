(ns metabase.typed-schemas-rest.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas :as typed-schemas]
   [metabase.typed-schemas.schema.metric :as typed-schemas.schema.metric]
   [metabase.typed-schemas.schema.model :as typed-schemas.schema.model]
   [metabase.typed-schemas.schema.question :as typed-schemas.schema.question]
   [metabase.typed-schemas.schema.table :as typed-schemas.schema.table]
   [metabase.typed-schemas.scope :as typed-schemas.scope]))

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

(deftest query-params-are-decoded-at-endpoint-test
  (with-redefs [typed-schemas/build-semantic-schema identity
                typed-schemas/render-typescript pr-str]
    (let [response (-> (mt/user-http-request-full-response
                        :crowberto
                        :get
                        200
                        "typed-schemas/v1/typescript?include-models=true&questions=false&library-collections=1,2")
                       :body
                       read-string)]
      (is (true? (:include-models? response)))
      (is (false? (:questions-only? response)))
      (is (= [{:id 1} {:id 2}] (:library-collection-refs response))))))

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
    (with-redefs [typed-schemas.scope/database-ids-for-ref (constantly #{42})
                  typed-schemas.schema.model/model-schemas (fn [database-ids]
                                                             (swap! model-database-ids conj database-ids)
                                                             [])
                  typed-schemas.schema.question/question-schemas (fn
                                                                   ([_database-ids] [])
                                                                   ([_database-ids _collection-ids] []))
                  typed-schemas.schema.metric/metric-schemas (fn
                                                               ([_database-ids] [])
                                                               ([_database-ids _collection-ids] []))
                  typed-schemas.schema.table/select-tables (fn
                                                             ([_database-ids] [])
                                                             ([_database-ids _table-ids] []))
                  typed-schemas.schema.table/table-schemas (constantly [])]
      (typed-schemas/build-semantic-schema {:database {:name "Boba"}})
      (typed-schemas/build-semantic-schema {:database {:name "Boba"} :questions-only? true})
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

(deftest semantic-schema-options-are-validated-before-resolution-test
  (doseq [options [{:library {:id 1}
                    :database {:id 1}}
                   {:question-collection-refs [{:id 1}]
                    :questions-only? true}
                   {:questions-only? true}]]
    (let [exception (try
                      (typed-schemas/build-semantic-schema options)
                      nil
                      (catch clojure.lang.ExceptionInfo exception
                        exception))]
      (is (= 400 (:status-code (ex-data exception)))))))

(deftest library-schema-includes-metric-mapped-tables-test
  (let [selected-table-ids (atom nil)]
    (with-redefs [typed-schemas.scope/library-collection-scope
                  (constantly {:metric-collection-ids #{20}
                               :data-collection-ids   #{10}})
                  typed-schemas.schema.model/model-schemas
                  (fn
                    ([_database-ids]
                     (is false "library-only schemas should not load models"))
                    ([_database-ids _collection-ids]
                     (is false "library-only schemas should not load models")))
                  typed-schemas.schema.metric/metric-schemas
                  (fn [_database-ids collection-ids]
                    (is (= #{20} collection-ids))
                    [{:type           "metric"
                      :key            "revenue"
                      :id             1
                      :name           "Revenue"
                      :columns        [{:name "Revenue", :displayName "Revenue", :jsType "number"}]
                      :mappedTableIds [42]}])
                  typed-schemas.schema.table/select-library-tables
                  (constantly [{:id 10}])
                  typed-schemas.schema.table/select-tables
                  (fn [_database-ids table-ids]
                    (reset! selected-table-ids table-ids)
                    [{:id 10} {:id 42}])
                  typed-schemas.schema.table/table-schemas
                  (constantly [{:type "table", :key "publishedTable", :id 10}
                               {:type "table", :key "mappedTable", :id 42}])]
      (let [schema (typed-schemas/build-semantic-schema {:library {:id 123}})]
        (is (= #{10 42} @selected-table-ids))
        (is (= {} (:questions schema)))
        (is (= {} (:models schema)))
        (is (= #{10 42} (->> (:tables schema) vals (map :id) set)))
        (is (= #{1} (->> (:metrics schema) vals (map :id) set)))))))

(deftest collections-schema-includes-selected-data-and-metric-collections-test
  (let [selected-table-ids (atom nil)]
    (with-redefs [typed-schemas.scope/library-collections-scope
                  (fn [collection-values]
                    (is (= [{:id 10} {:id 20}] collection-values))
                    {:metric-collection-ids #{20}
                     :data-collection-ids   #{10}})
                  typed-schemas.schema.model/model-schemas
                  (fn
                    ([_database-ids]
                     (is false "library-only schemas should not load models"))
                    ([_database-ids _collection-ids]
                     (is false "library-only schemas should not load models")))
                  typed-schemas.schema.metric/metric-schemas
                  (fn [_database-ids collection-ids]
                    (is (= #{20} collection-ids))
                    [{:type           "metric"
                      :key            "revenue"
                      :id             1
                      :name           "Revenue"
                      :columns        [{:name "Revenue", :displayName "Revenue", :jsType "number"}]
                      :mappedTableIds [42]}])
                  typed-schemas.schema.table/select-library-tables
                  (fn [library-scope]
                    (is (= #{10} (:data-collection-ids library-scope)))
                    [{:id 10}])
                  typed-schemas.schema.table/select-tables
                  (fn [_database-ids table-ids]
                    (reset! selected-table-ids table-ids)
                    [{:id 10} {:id 42}])
                  typed-schemas.schema.table/table-schemas
                  (constantly [{:type "table", :key "publishedTable", :id 10}
                               {:type "table", :key "mappedTable", :id 42}])]
      (let [schema (typed-schemas/build-semantic-schema {:library-collection-refs [{:id 10} {:id 20}]})]
        (is (= #{10 42} @selected-table-ids))
        (is (= {} (:questions schema)))
        (is (= {} (:models schema)))
        (is (= #{10 42} (->> (:tables schema) vals (map :id) set)))
        (is (= #{1} (->> (:metrics schema) vals (map :id) set)))))))

(deftest include-models-schema-includes-actionable-models-test
  (with-redefs [typed-schemas.schema.model/model-schemas
                (fn [database-ids]
                  (is (nil? database-ids))
                  [{:key     "actionableModel"
                    :actions {"create" {:kind "action", :key "create", :id 1}}}])
                typed-schemas.schema.question/question-schemas
                (fn
                  ([_database-ids]
                   (is false "include-models-only schemas should not load questions"))
                  ([_database-ids _collection-ids]
                   (is false "include-models-only schemas should not load questions")))
                typed-schemas.schema.metric/metric-schemas
                (fn
                  ([_database-ids]
                   (is false "include-models-only schemas should not load metrics"))
                  ([_database-ids _collection-ids]
                   (is false "include-models-only schemas should not load metrics")))
                typed-schemas.schema.table/select-tables
                (fn
                  ([_database-ids]
                   (is false "include-models-only schemas should not load tables"))
                  ([_database-ids _table-ids]
                   (is false "include-models-only schemas should not load tables")))]
    (let [schema (typed-schemas/build-semantic-schema {:include-models? true})]
      (is (= {} (:questions schema)))
      (is (= {"actionableModel" {:actions {"create" {:kind "action", :key "create", :id 1}}}}
             (:models schema)))
      (is (= {} (:tables schema)))
      (is (= {} (:metrics schema))))))

(deftest include-models-with-database-scopes-models-test
  (let [model-database-ids (atom [])]
    (with-redefs [typed-schemas.scope/database-ids-for-ref (constantly #{42})
                  typed-schemas.schema.model/model-schemas (fn [database-ids]
                                                             (swap! model-database-ids conj database-ids)
                                                             [{:key     "databaseModel"
                                                               :actions {"create" {:kind "action", :key "create", :id 1}}}])
                  typed-schemas.schema.question/question-schemas (fn
                                                                   ([_database-ids] [])
                                                                   ([_database-ids _collection-ids] []))
                  typed-schemas.schema.metric/metric-schemas (fn
                                                               ([_database-ids] [])
                                                               ([_database-ids _collection-ids] []))
                  typed-schemas.schema.table/select-tables (fn
                                                             ([_database-ids] [])
                                                             ([_database-ids _table-ids] []))
                  typed-schemas.schema.table/table-schemas (constantly [])]
      (let [schema (typed-schemas/build-semantic-schema {:database {:name "Boba"} :include-models? true})]
        (is (= [#{42}] @model-database-ids))
        (is (= {"databaseModel" {:actions {"create" {:kind "action", :key "create", :id 1}}}}
               (:models schema)))))))

(deftest question-collections-schema-includes-selected-question-collections-test
  (with-redefs [typed-schemas.scope/collection-scope
                (fn [collection-values]
                  (is (= [{:id 30} {:id 40}] collection-values))
                  #{30 40})
                typed-schemas.schema.question/question-schemas
                (fn [database-ids collection-ids]
                  (is (nil? database-ids))
                  (is (= #{30 40} collection-ids))
                  [{:type "card", :key "ordersByMonth", :id 1}])
                typed-schemas.schema.model/model-schemas
                (fn
                  ([_database-ids]
                   (is false "question collection schemas should not load models"))
                  ([_database-ids _collection-ids]
                   (is false "question collection schemas should not load models")))]
    (let [schema (typed-schemas/build-semantic-schema {:question-collection-refs [{:id 30} {:id 40}]})]
      (is (= #{1} (->> (:questions schema) vals (map :id) set)))
      (is (= {} (:models schema)))
      (is (= {} (:tables schema)))
      (is (= {} (:metrics schema))))))

(deftest library-and-question-collections-can-be-combined-test
  (with-redefs [typed-schemas.scope/library-collections-scope
                (fn [collection-values]
                  (is (= [{:id 10}] collection-values))
                  {:metric-collection-ids #{10}
                   :data-collection-ids   #{10}})
                typed-schemas.scope/collection-scope
                (fn [collection-values]
                  (is (= [{:id 30}] collection-values))
                  #{30})
                typed-schemas.schema.question/question-schemas
                (fn [database-ids collection-ids]
                  (is (nil? database-ids))
                  (is (= #{30} collection-ids))
                  [{:type "card", :key "ordersByMonth", :id 1}])
                typed-schemas.schema.model/model-schemas
                (fn
                  ([_database-ids]
                   (is false "question collection schemas should not load models"))
                  ([_database-ids _collection-ids]
                   (is false "question collection schemas should not load models")))
                typed-schemas.schema.metric/metric-schemas
                (constantly [{:type "metric", :key "revenue", :id 2}])
                typed-schemas.schema.table/select-library-tables
                (constantly [{:id 3}])
                typed-schemas.schema.table/select-tables
                (constantly [{:id 3}])
                typed-schemas.schema.table/table-schemas
                (constantly [{:type "table", :key "orders", :id 3}])]
    (let [schema (typed-schemas/build-semantic-schema {:library-collection-refs [{:id 10}]
                                                       :question-collection-refs [{:id 30}]})]
      (is (= #{1} (->> (:questions schema) vals (map :id) set)))
      (is (= {} (:models schema)))
      (is (= #{3} (->> (:tables schema) vals (map :id) set)))
      (is (= #{2} (->> (:metrics schema) vals (map :id) set))))))

(deftest library-and-question-collections-can-be-combined-with-include-models-test
  (with-redefs [typed-schemas.scope/library-collections-scope
                (fn [collection-values]
                  (is (= [{:id 10}] collection-values))
                  {:metric-collection-ids #{10}
                   :data-collection-ids   #{10}})
                typed-schemas.scope/collection-scope
                (fn [collection-values]
                  (is (= [{:id 30}] collection-values))
                  #{30})
                typed-schemas.schema.question/question-schemas
                (fn [database-ids collection-ids]
                  (is (nil? database-ids))
                  (is (= #{30} collection-ids))
                  [{:type "card", :key "ordersByMonth", :id 1}])
                typed-schemas.schema.model/model-schemas
                (fn [database-ids]
                  (is (nil? database-ids))
                  [{:key     "selectedQuestionCollectionModel"
                    :actions {"create" {:kind "action", :key "create", :id 1}}}])
                typed-schemas.schema.metric/metric-schemas
                (constantly [{:type "metric", :key "revenue", :id 2}])
                typed-schemas.schema.table/select-library-tables
                (constantly [{:id 3}])
                typed-schemas.schema.table/select-tables
                (constantly [{:id 3}])
                typed-schemas.schema.table/table-schemas
                (constantly [{:type "table", :key "orders", :id 3}])]
    (let [schema (typed-schemas/build-semantic-schema {:library-collection-refs [{:id 10}]
                                                       :question-collection-refs [{:id 30}]
                                                       :include-models? true})]
      (is (= #{1} (->> (:questions schema) vals (map :id) set)))
      (is (= {"selectedQuestionCollectionModel" {:actions {"create" {:kind "action", :key "create", :id 1}}}}
             (:models schema)))
      (is (= #{3} (->> (:tables schema) vals (map :id) set)))
      (is (= #{2} (->> (:metrics schema) vals (map :id) set))))))
