(ns metabase.typed-schemas.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.typed-schemas.core :as typed-schemas]
   [metabase.typed-schemas.schema.metric :as typed-schemas.schema.metric]
   [metabase.typed-schemas.schema.model :as typed-schemas.schema.model]
   [metabase.typed-schemas.schema.table :as typed-schemas.schema.table]))

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
