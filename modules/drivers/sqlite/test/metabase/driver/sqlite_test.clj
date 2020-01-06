(ns metabase.driver.sqlite-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor-test :as qp.test]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]))

(deftest timezone-id-test
  (datasets/test-driver :sqlite
    (is (= "UTC"
           (tu/db-timezone-id)))))

(deftest filter-by-date-test
  "Make sure filtering against a LocalDate works correctly in SQLite"
  (datasets/test-driver :sqlite
    (is (= [[225 "2014-03-04T00:00:00Z"]
            [409 "2014-03-05T00:00:00Z"]
            [917 "2014-03-05T00:00:00Z"]
            [995 "2014-03-05T00:00:00Z"]
            [159 "2014-03-06T00:00:00Z"]
            [951 "2014-03-06T00:00:00Z"]]
           (qp.test/rows
             (data/run-mbql-query checkins
               {:fields   [$id $date]
                :filter   [:and
                           [:>= $date "2014-03-04"]
                           [:<= $date "2014-03-06"]]
                :order-by [[:asc $date]]}))
           (qp.test/rows
             (data/run-mbql-query checkins
               {:fields   [$id $date]
                :filter   [:between $date "2014-03-04" "2014-03-07"]
                :order-by [[:asc $date]]}))))))
