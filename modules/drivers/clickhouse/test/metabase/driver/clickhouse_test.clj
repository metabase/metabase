(ns metabase.driver.clickhouse-test
  "Tests for specific behavior of the ClickHouse driver."
  (:require [metabase.util :as u]
            [metabase.query-processor-test :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :as datasets]
             [interface :as tx]]
            [metabase.test.util :as tu]))

(datasets/expect-with-driver :clickhouse
  "UTC"
  (tu/db-timezone-id))

(datasets/expect-with-driver :clickhouse
  21.0
  (-> (data/with-temp-db
    [_
     (tx/create-database-definition "ClickHouse with Decimal Field"
       ["test-data"
        [{:field-name "my_money", :base-type {:native "Decimal(12,3)"}}]
        [[1.0] [23.0] [42.0] [42.0]]])]
    (data/run-mbql-query test-data
                         {:expressions {:divided [:/ $my_money 2]}
                          :filter      [:> [:expression :divided] 1.0]
                          :breakout    [[:expression :divided]]
                          :order-by    [[:desc [:expression :divided]]]
                          :limit       1}))
      first-row last float))
