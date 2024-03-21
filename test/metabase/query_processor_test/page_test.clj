(ns metabase.query-processor-test.page-test
  "Tests for the `:page` clause."
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- page-is [expected page-num]
  (let [query (mt/mbql-query categories
                {:page     {:page page-num, :items 5}
                 :order-by [[:asc $id]]})]
    (mt/with-native-query-testing-context query
      (is (= expected
             (mt/formatted-rows [int str]
               (qp/process-query query)))))))

(deftest ^:parallel page-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Test that we can get \"pages\" of results."
      (testing "get the first page"
        (page-is [[1 "African"]
                  [2 "American"]
                  [3 "Artisan"]
                  [4 "Asian"]
                  [5 "BBQ"]]
                 1)))))

(deftest ^:parallel page-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing "Test that we can get \"pages\" of results."
      (testing "get the second page"
        (page-is [[ 6 "Bakery"]
                  [ 7 "Bar"]
                  [ 8 "Beer Garden"]
                  [ 9 "Breakfast / Brunch"]
                  [10 "Brewery"]]
                 2)))))
