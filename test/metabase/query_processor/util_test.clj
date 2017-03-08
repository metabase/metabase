(ns metabase.query-processor.util-test
  "Tests for various functions that provide information about the query."
  (:require [expectations :refer :all]
            [metabase.query-processor.util :as qputil]))

;; mbql-query?
(expect false (qputil/mbql-query? {}))
(expect false (qputil/mbql-query? {:type "native"}))
(expect true  (qputil/mbql-query? {:type "query"}))

;; query-without-aggregations-or-limits?
(expect false (qputil/query-without-aggregations-or-limits? {:query {:aggregation [{:aggregation-type :count}]}}))
(expect true  (qputil/query-without-aggregations-or-limits? {:query {:aggregation [{:aggregation-type :rows}]}}))
(expect false (qputil/query-without-aggregations-or-limits? {:query {:aggregation [{:aggregation-type :count}]
                                                                     :limit       10}}))
(expect false (qputil/query-without-aggregations-or-limits? {:query {:aggregation [{:aggregation-type :count}]
                                                                     :page        1}}))

;;; ------------------------------------------------------------ Tests for qputil/secure-query-hash ------------------------------------------------------------

(defn- array= {:style/indent 0} [a b]
  (java.util.Arrays/equals a b))

;; qputil/secure-query-hash should always hash something the same way, every time
(expect
  (array=
    (byte-array [41, 6, -19, -29, -19, 124, -91, -26, -107, -120, -120, -32, -117, 102, -65, -122, -37, -38, 111, 19, -12, 100, -54, -119, 59, 86, -57, -96, 63, -57, -81, -96])
    (qputil/secure-query-hash {:query :abc})))

(expect
  (array= (qputil/secure-query-hash {:query :def})
          (qputil/secure-query-hash {:query :def})))

;; different queries should produce different hashes
(expect
  false
  (array=
    (qputil/secure-query-hash {:query :abc})
    (qputil/secure-query-hash {:query :def})))

(expect
  false
  (array=
    (qputil/secure-query-hash {:query :abc, :database 1})
    (qputil/secure-query-hash {:query :abc, :database 2})))

(expect
  false
  (array=
    (qputil/secure-query-hash {:query :abc, :type "query"})
    (qputil/secure-query-hash {:query :abc, :type "native"})))

(expect
  false
  (array=
    (qputil/secure-query-hash {:query :abc, :parameters [1]})
    (qputil/secure-query-hash {:query :abc, :parameters [2]})))

(expect
  false
  (array=
    (qputil/secure-query-hash {:query :abc, :constraints {:max-rows 1000}})
    (qputil/secure-query-hash {:query :abc, :constraints nil})))

;; ... but keys that are irrelevant to the query should be ignored by qputil/secure-query-hash
(expect
  (array=
    (qputil/secure-query-hash {:query :abc, :random :def})
    (qputil/secure-query-hash {:query :abc, :random :xyz})))
