(ns metabase.query-processor-test.helper-fns-test
  "Tests for various functions that provide information about the query."
  (:require [expectations :refer :all]
            [metabase.query-processor :refer :all]
            [metabase.query-processor.expand :as ql]
            [metabase.query-processor-test :refer :all]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

;; mbql-query?
(expect false (mbql-query? {}))
(expect false (mbql-query? {:type "native"}))
(expect true  (mbql-query? {:type "query"}))

(tu/resolve-private-vars metabase.query-processor query-without-aggregations-or-limits?)

;; query-without-aggregations-or-limits?
(expect false (query-without-aggregations-or-limits? {:query {:aggregation [{:aggregation-type :count}]}}))
(expect true  (query-without-aggregations-or-limits? {:query {:aggregation [{:aggregation-type :rows}]}}))
(expect false (query-without-aggregations-or-limits? {:query {:aggregation [{:aggregation-type :count}]
                                                              :limit       10}}))
(expect false (query-without-aggregations-or-limits? {:query {:aggregation [{:aggregation-type :count}]
                                                              :page        1}}))
