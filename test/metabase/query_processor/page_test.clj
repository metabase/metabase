(ns ^:mb/driver-tests metabase.query-processor.page-test
  "Tests for the `:page` clause."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]))

(defn- page-is [expected page-num]
  (let [query (mt/mbql-query categories
                {:page     {:page page-num, :items 5}
                 :order-by [[:asc $id]]})]
    (mt/with-native-query-testing-context query
      (is (= expected
             (mt/formatted-rows
              [int str]
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
        (page-is [[6 "Bakery"]
                  [7 "Bar"]
                  [8 "Beer Garden"]
                  [9 "Breakfast / Brunch"]
                  [10 "Brewery"]]
                 2)))))

(deftest ^:parallel page-combined-with-limit-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "If both `:limit` and `:page` are specified in an MBQL stage the query should still compile correctly (prefer `:page` to `:limit`) (#73483)"
      (let [mp    (mt/metadata-provider)
            query (mu/disable-enforcement ; disable schema constraint that we cannot have `:page` and `:limit` together
                    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                        (lib/order-by (lib.metadata/field mp (mt/id :venues :id)))
                        (lib/with-fields [(lib.metadata/field mp (mt/id :venues :id))
                                          (lib.metadata/field mp (mt/id :venues :name))])
                        (lib/with-page {:page 1, :items 5})
                        (lib/limit 10)))]
        (is (= [[1 "Red Medicine"]
                [2 "Stout Burgers & Beers"]
                [3 "The Apple Pan"]
                [4 "Wurstküche"]
                [5 "Brite Spot Family Restaurant"]]
               (mt/formatted-rows [int str] (qp/process-query query))))))))
