(ns metabase.driver.sql.query-processor-test
  (:require [expectations :refer [expect]]
            [metabase.driver.sql.query-processor :as sql.qp]))

;; make sure our logic for deciding which order to process keys in the query works as expected
(expect
  [:source-table :breakout :aggregation :fields :abc :def]
  (#'sql.qp/query->keys-in-application-order {:def          6
                                              :abc          5
                                              :source-table 1
                                              :aggregation  3
                                              :fields       4
                                              :breakout     2}))
