(ns metabase.query-processor-test.page-test
  "Tests for the `:page` clause."
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor-test :refer :all]
             [test :as mt]]
            [metabase.test.data :as data]))

(deftest page-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Test that we can get \"pages\" of results."
      (letfn [(get-page [page-num]
                (mt/formatted-rows [int str]
                  (data/run-mbql-query categories
                    {:page     {:page page-num, :items 5}
                     :order-by [[:asc $id]]})))]
        (testing "get the first page"
          (is (= [[1 "African"]
                  [2 "American"]
                  [3 "Artisan"]
                  [4 "Asian"]
                  [5 "BBQ"]]
                 (get-page 1))))

        (testing "get the second page"
          (= [[ 6 "Bakery"]
              [ 7 "Bar"]
              [ 8 "Beer Garden"]
              [ 9 "Breakfast / Brunch"]
              [10 "Brewery"]]
             (get-page 2)))))))
