(ns metabase.driver.druid.execute-test
  (:require [clojure.test :refer :all]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.timeseries-query-processor-test.util :as tqpt]))

(deftest results-order-test
  (mt/test-driver :druid
    (testing (str "Make sure Druid cols + columns come back in the same order and that that order is the expected MBQL "
                  "columns order (#9294)")
      (tqpt/with-flattened-dbdef
        (let [results (mt/run-mbql-query checkins
                        {:limit 1})]
          (assert (= (:status results) :completed)
            (u/pprint-to-str 'red results))
          (testing "cols"
            (is (= ["id"
                    "timestamp"
                    "count"
                    "unique_users"
                    "user_last_login"
                    "user_name"
                    "venue_category_name"
                    "venue_latitude"
                    "venue_longitude"
                    "venue_name"
                    "venue_price"]
                   (->> results :data :cols (map :name)))))
          (testing "rows"
            (is (= [[931
                     "2013-01-03T08:00:00Z"
                     1
                     "AQAAAQAAAAEBsA=="
                     "2014-01-01T08:30:00.000Z"
                     "Simcha Yan"
                     "Thai"
                     "34.094"
                     "-118.344"
                     "Kinaree Thai Bistro"
                     "1"]]
                   (-> results :data :rows)))))))))
