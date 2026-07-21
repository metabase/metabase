(ns metabase.typed-schemas-rest.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.core :as typed-schemas]
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
                        "typed-schemas/v1/typescript?include-models=true&library-collections=1,2")
                       :body
                       read-string)]
      (is (true? (:include-models? response)))
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
      (is (str/includes? (:body response) "const metrics = { }")))))

(deftest collection-and-database-query-params-are-mutually-exclusive-test
  (mt/user-http-request-full-response
   :crowberto
   :get
   400
   "typed-schemas/v1/typescript?library-collections=1,2&database=1"))

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

(deftest database-scope-takes-precedence-over-include-models-test
  (with-redefs [typed-schemas.schema.model/model-schemas
                (fn [database-ids]
                  (is (= #{42} database-ids))
                  [{:key "databaseModel"}])]
    (is (= [{:key "databaseModel"}]
           (#'typed-schemas/models-for-scope #{42} true)))))

(deftest question-collections-schema-includes-selected-question-collections-test
  (with-redefs [typed-schemas.scope/collection-scope
                (fn [collection-values]
                  (is (= [{:id 30} {:id 40}] collection-values))
                  #{30 40})
                typed-schemas.schema.question/question-schemas
                (fn [database-ids collection-ids]
                  (is (nil? database-ids))
                  (is (= #{30 40} collection-ids))
                  [{:type "card", :key "ordersByMonth", :id 1}])]
    (let [schema (typed-schemas/build-semantic-schema {:question-collection-refs [{:id 30} {:id 40}]})]
      (is (= #{1} (->> (:questions schema) vals (map :id) set)))
      (is (= {} (:models schema)))
      (is (= {} (:tables schema)))
      (is (= {} (:metrics schema))))))

(deftest library-and-question-collections-can-be-combined-with-include-models-test
  (with-redefs-fn
    {#'typed-schemas.scope/library-scope
     (fn [{:keys [library-collection-refs]}]
       (is (= [{:id 10}] library-collection-refs))
       {})
     #'typed-schemas.scope/collection-scope
     (fn [collection-values]
       (is (= [{:id 30}] collection-values))
       #{30})
     #'typed-schemas.schema.question/question-schemas
     (fn [database-ids collection-ids]
       (is (nil? database-ids))
       (is (= #{30} collection-ids))
       [{:type "card", :key "ordersByMonth", :id 1}])
     #'typed-schemas.schema.model/model-schemas
     (fn [database-ids]
       (is (nil? database-ids))
       [{:key     "selectedQuestionCollectionModel"
         :actions {"create" {:kind "action", :key "create", :id 1}}}])
     #'typed-schemas/semantic-schema-for-library-scope
     (fn [library-scope models]
       (is (= {} library-scope))
       (is (= 1 (count models)))
       {:tables  {"orders" {:type "table", :key "orders", :id 3}}
        :metrics {"revenue" {:type "metric", :key "revenue", :id 2}}})}
    (fn []
      (let [schema (typed-schemas/build-semantic-schema {:library-collection-refs [{:id 10}]
                                                         :question-collection-refs [{:id 30}]
                                                         :include-models? true})]
        (is (= #{1} (->> (:questions schema) vals (map :id) set)))
        (is (= {"selectedQuestionCollectionModel" {:actions {"create" {:kind "action", :key "create", :id 1}}}}
               (:models schema)))
        (is (= #{3} (->> (:tables schema) vals (map :id) set)))
        (is (= #{2} (->> (:metrics schema) vals (map :id) set)))))))
