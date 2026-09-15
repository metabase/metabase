(ns metabase.transform-testing.runner-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [metabase.transform-testing.runner :as transform-testing.runner]
   [toucan2.core :as t2]))

(deftest run-test-suite-empty-expectation-test
  (mt/test-driver :h2
    (mt/with-temp [:model/Transform {transform-id :id} {:source {:type  "query"
                                                                 :query (lib/native-query (mt/metadata-provider)
                                                                                          "SELECT ID, NAME FROM PEOPLE")}
                                                        :target {:type     "table"
                                                                 :schema   "PUBLIC"
                                                                 :name     "PEOPLE_SUMMARY"
                                                                 :database (mt/id)}}]
      (doseq [[desc sql expected] [["passes when the query returns no rows"
                                    "SELECT * FROM PUBLIC.PEOPLE_SUMMARY WHERE NAME IS NULL"
                                    :passed]
                                   ["reads the input test data instead of the input table"
                                    "SELECT * FROM PEOPLE_SUMMARY WHERE ID <> 1"
                                    :passed]
                                   ["fails when the query returns rows"
                                    "SELECT * FROM PEOPLE_SUMMARY WHERE NAME = 'abc'"
                                    :failed]]]
        (testing desc
          (mt/with-temp [:model/TransformTestSuite {suite-id :id} {:transform_id transform-id
                                                                   :inputs       [{:table  {:schema "PUBLIC" :name "PEOPLE"}
                                                                                   :format :sql
                                                                                   :sql    "SELECT 1 AS ID, 'abc' AS NAME"}]
                                                                   :expectations [{:type :empty :sql sql}]}]
            (is (= {:status expected}
                   (transform-testing.runner/run-test-suite!
                    (t2/select-one :model/TransformTestSuite suite-id))))))))))
