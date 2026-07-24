(ns metabase.typed-schemas.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.typed-schemas.core :as typed-schemas]
   [metabase.typed-schemas.schema.metric :as typed-schemas.schema.metric]
   [metabase.typed-schemas.schema.model :as typed-schemas.schema.model]
   [metabase.typed-schemas.schema.question :as typed-schemas.schema.question]
   [metabase.typed-schemas.schema.table :as typed-schemas.schema.table]
   [metabase.typed-schemas.scope :as typed-schemas.scope]))

(deftest semantic-schema-options-reject-unknown-options-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Invalid semantic schema options\."
                        (typed-schemas/build-semantic-schema {:unknown-option true}))))

(deftest database-scope-limits-models-test
  (let [model-database-ids (atom [])]
    (with-redefs [typed-schemas.schema.model/model-schemas (fn [database-ids]
                                                             (swap! model-database-ids conj database-ids)
                                                             [])]
      (#'typed-schemas/models-for-scope #{42} false)
      (is (= [#{42}] @model-database-ids)))))

(deftest database-scope-takes-precedence-over-include-models-test
  (with-redefs [typed-schemas.schema.model/model-schemas
                (fn [database-ids]
                  (is (= #{42} database-ids))
                  [{:key "databaseModel"}])]
    (is (= [{:key "databaseModel"}]
           (#'typed-schemas/models-for-scope #{42} true)))))

(deftest library-schema-includes-tables-mapped-by-metrics-test
  (let [selected-table-ids (atom nil)]
    (with-redefs [typed-schemas.schema.metric/metric-schemas
                  (fn [database-ids collection-ids]
                    (is (nil? database-ids))
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
                  (fn [database-ids table-ids]
                    (is (nil? database-ids))
                    (reset! selected-table-ids table-ids)
                    [{:id 10} {:id 42}])
                  typed-schemas.schema.table/table-schemas
                  (constantly [{:type "table", :key "publishedTable", :id 10}
                               {:type "table", :key "mappedTable", :id 42}])]
      (let [schema (#'typed-schemas/semantic-schema-for-library-scope
                    {:metric-collection-ids #{20}
                     :data-collection-ids   #{10}}
                    [])]
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
                    :actions {"create" {:kind "action", :key "create", :id 1}}}])]
    (let [schema (typed-schemas/build-semantic-schema {:include-models? true})]
      (is (= {} (:questions schema)))
      (is (= {"actionableModel" {:actions {"create" {:kind "action", :key "create", :id 1}}}}
             (:models schema)))
      (is (= {} (:tables schema)))
      (is (= {} (:metrics schema))))))

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
