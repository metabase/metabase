(ns metabase.query-processor.middleware.large-int-id-test
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor :as qp]
             [test :as mt]]))

(deftest convert-ids
  (let [query (mt/mbql-query users
                {:order-by [[:asc $id]]
                 :limit    5})]
    (testing "PKs become strings when middleware enabled"
      (is (= [["1" "Plato Yeshua" "2014-04-01T08:30:00Z"]
              ["2" "Felipinho Asklepios" "2014-12-05T15:15:00Z"]
              ["3" "Kaneonuskatew Eiran" "2014-11-06T16:15:00Z"]
              ["4" "Simcha Yan" "2014-01-01T08:30:00Z"]
              ["5" "Quentin Sören" "2014-10-03T17:30:00Z"]]
             (mt/rows
               (qp/process-query (assoc query :middleware {:js-int-to-string? true}))))))

    (testing "PKs are left alone when middleware disabled (default)"
      (is (= [[1 "Plato Yeshua" "2014-04-01T08:30:00Z"]
              [2 "Felipinho Asklepios" "2014-12-05T15:15:00Z"]
              [3 "Kaneonuskatew Eiran" "2014-11-06T16:15:00Z"]
              [4 "Simcha Yan" "2014-01-01T08:30:00Z"]
              [5 "Quentin Sören" "2014-10-03T17:30:00Z"]]
             (mt/rows
               (qp/process-query (assoc query :middleware {})))))))

  (let [query (mt/mbql-query venues
                {:order-by [[:asc $id]]
                 :limit    5})]
    (testing "FKs become strings when middleware enabled"
      (is (= [["1" "Red Medicine" "4" 10.0646 -165.374 3]
              ["2" "Stout Burgers & Beers" "11" 34.0996 -118.329 2]
              ["3" "The Apple Pan" "11" 34.0406 -118.428 2]
              ["4" "Wurstküche" "29" 33.9997 -118.465 2]
              ["5" "Brite Spot Family Restaurant" "20" 34.0778 -118.261 2]]
             (mt/rows
               (qp/process-query (assoc query :middleware {:js-int-to-string? true}))))))

    (testing "FKs are left alone when middleware disabled (default)"
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]
              [3 "The Apple Pan" 11 34.0406 -118.428 2]
              [4 "Wurstküche" 29 33.9997 -118.465 2]
              [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
             (mt/rows
               (qp/process-query (assoc query :middleware {})))))))

  (let [query (mt/mbql-query venues
                {:source-query {:source-table $$venues
                                :aggregation  [[:aggregation-options
                                                [:avg $id]
                                                {:name "some_generated_name", :display-name "My Cool Ag"}]]
                                :breakout     [$price]}})]
    ;; see comment in `metabase.query-processor.middleware.large-int-id/convert-id-to-string`
    ;; for why this value does not change
    (testing "aggregations are not converted to strings with middleware enabled"
      (is (= [[1 55]
              [2 48]
              [3 47]
              [4 62]]
             (mt/rows
               (qp/process-query (assoc query :middleware {:js-int-to-string? true}))))) )
    (testing "aggregation does not convert to strings with middleware disabled (default)"
      (is (= [[1 55]
              [2 48]
              [3 47]
              [4 62]]
             (mt/rows
               (qp/process-query (assoc query :middleware {}))))))))
