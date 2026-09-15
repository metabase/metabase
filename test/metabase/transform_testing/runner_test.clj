(ns ^:mb/driver-tests metabase.transform-testing.runner-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.transform-testing.runner :as transform-testing.runner]))

(deftest run-transform-test-empty-expectation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (let [mp                            (mt/metadata-provider)
          {schema :schema, table :name} (lib.metadata/table mp (mt/id :people))]
      (mt/with-temp [:model/Transform {transform-id :id}
                     {:source {:type  "query"
                               :query (lib/native-query mp (str "SELECT id, name FROM " schema "." table))}
                      :target {:type     "table"
                               :schema   schema
                               :name     "people_summary"
                               :database (mt/id)}}]
        (doseq [[desc where expected] [["passes when the query returns no rows"
                                        "name IS NULL"
                                        :passed]
                                       ["reads the input test data instead of the input table"
                                        "id <> 1"
                                        :passed]
                                       ["fails when the query returns rows"
                                        "name = 'abc'"
                                        :failed]]]
          (testing desc
            (mt/with-temp [:model/TransformTest transform-test
                           {:transform_id transform-id
                            :inputs       [{:table  {:schema schema :name table}
                                            :format :sql
                                            :sql    "SELECT 1 AS id, 'abc' AS name"}]
                            :expectations [{:type :empty
                                            :sql  (str "SELECT * FROM " schema ".people_summary WHERE " where)}]}]
              (is (= {:status expected}
                     (transform-testing.runner/run-transform-test! transform-test))))))))))
