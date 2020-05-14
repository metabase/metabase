(ns metabase.driver.mongo.query-processor-test
  (:require [clojure.test :refer :all]
            [metabase.driver.mongo.query-processor :as mongo.qp]))

(deftest query->collection-name-test
  (testing "query->collection-name"
    (testing "should be able to extract :collection from :source-query")
    (is (= "checkins"
           (#'mongo.qp/query->collection-name {:query {:source-query
                                                       {:collection "checkins"
                                                        :native     []}}})))
    (testing "should work for nested-nested queries"
      (is (= "checkins"
             (#'mongo.qp/query->collection-name {:query {:source-query {:source-query
                                                                        {:collection "checkins"
                                                                         :native     []}}}}))))

    (testing "should ignore :joins"
      (is (= nil
             (#'mongo.qp/query->collection-name {:query {:source-query
                                                         {:native []}
                                                         :joins [{:source-query "wow"}]}}))))

    (testing "should ignore other :collection keys"
      (is (= nil
             (#'mongo.qp/query->collection-name {:query {:source-query
                                                         {:native [{:collection "wow"}]}}}))))))
