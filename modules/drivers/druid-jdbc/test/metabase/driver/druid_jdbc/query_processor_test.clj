(ns metabase.driver.druid-jdbc.query-processor-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Card]]
   [metabase.test :as mt]
   [metabase.timeseries-query-processor-test.util :as tqpt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest metrics-inside-aggregation-clauses-test
  (mt/test-driver :druid-jdbc
    (testing "check that we can handle METRICS inside expression aggregation clauses"
      (tqpt/with-flattened-dbdef
        (t2.with-temp/with-temp [Card {metric-id :id} {:dataset_query
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
