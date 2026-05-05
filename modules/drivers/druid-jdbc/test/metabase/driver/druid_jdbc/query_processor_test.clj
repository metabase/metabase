(ns ^:mb/driver-tests metabase.driver.druid-jdbc.query-processor-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.timeseries-test.util :as tqpt]
   [metabase.test :as mt]))

(deftest metrics-inside-aggregation-clauses-test
  (mt/test-driver :druid-jdbc
    (testing "check that we can handle METRICS inside expression aggregation clauses"
      (tqpt/with-flattened-dbdef
        (mt/with-temp [:model/Card {metric-id :id} {:dataset_query
                                                    (mt/mbql-query checkins
                                                      {:aggregation [:sum $venue_price]
                                                       :filter      [:> $venue_price 1]
                                                       :source-table (mt/id :checkins)})
                                                    :type :metric}]
          (is (= [[2 1231]
                  [3  346]
                  [4  197]]
                 (mt/rows
                  (mt/run-mbql-query checkins
                    {:aggregation [:+ [:metric metric-id] 1]
                     :breakout    [$venue_price]
                     :source-table (str "card__" metric-id)})))))))))
