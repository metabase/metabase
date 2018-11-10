(ns metabase.query-processor.util-test
  "Tests for various functions that provide information about the query."
  (:require [expectations :refer :all]
            [metabase.query-processor.util :as qputil]))

;; mbql-query?
(expect false (qputil/mbql-query? {}))
(expect false (qputil/mbql-query? {:type "native"}))
(expect true  (qputil/mbql-query? {:type "query"}))

;; query-without-aggregations-or-limits?
(expect false (qputil/query-without-aggregations-or-limits? {:query {:aggregation [[:count]]}}))
(expect true  (qputil/query-without-aggregations-or-limits? {:query {}}))
(expect false (qputil/query-without-aggregations-or-limits? {:query {:aggregation [[:count]]
                                                                     :limit       10}}))
(expect false (qputil/query-without-aggregations-or-limits? {:query {:aggregation [[:count]]
                                                                     :page        1}}))


;;; ------------------------------------------ Tests for qputil/query-hash -------------------------------------------

(defn- array= {:style/indent 0}
  ([a b]
   (java.util.Arrays/equals a b))
  ([a b & more]
   (and (array= a b)
        (apply array= b more))))

;; qputil/query-hash should always hash something the same way, every time
(expect
  (array=
    (byte-array [124 17 52 -28 71 -73 107 4 -108 39 42 -6 15 36 58 46 93 -59 103 -123 101 78 15 63 -10 -110 55 100 91 122 71 -23])
    (qputil/query-hash {:query :abc})))

(expect
  (array=
    (qputil/query-hash {:query :def})
    (qputil/query-hash {:query :def})))

;; different queries should produce different hashes
(expect
  false
  (array=
    (qputil/query-hash {:query :abc})
    (qputil/query-hash {:query :def})))

(expect
  false
  (array=
    (qputil/query-hash {:query :abc, :database 1})
    (qputil/query-hash {:query :abc, :database 2})))

(expect
  false
  (array=
    (qputil/query-hash {:query :abc, :type "query"})
    (qputil/query-hash {:query :abc, :type "native"})))

(expect
  false
  (array=
    (qputil/query-hash {:query :abc, :parameters [1]})
    (qputil/query-hash {:query :abc, :parameters [2]})))

(expect
  false
  (array=
    (qputil/query-hash {:query :abc, :constraints {:max-rows 1000}})
    (qputil/query-hash {:query :abc, :constraints nil})))

;; ... but keys that are irrelevant to the query should be ignored by qputil/query-hash
(expect
  (array=
    (qputil/query-hash {:query :abc, :random :def})
    (qputil/query-hash {:query :abc, :random :xyz})))

;; empty `:parameters` lists should not affect the hash
(expect
  (array=
    (qputil/query-hash {:query :abc})
    (qputil/query-hash {:query :abc, :parameters []})
    (qputil/query-hash {:query :abc, :parameters nil})))

;; ...but non-empty ones should
(expect
  false
  (array=
    (qputil/query-hash {:query :abc})
    (qputil/query-hash {:query :abc, :parameters ["ABC"]})))

;; similarly, the presence of a `nil` value for `:constraints` should produce the same hash as not including the key
;; at all
(expect
  (array=
    (qputil/query-hash {:query :abc})
    (qputil/query-hash {:query :abc, :constraints nil})
    (qputil/query-hash {:query :abc, :constraints {}})))

;; make sure two different natiev queries have different hashes!
(expect
  false
  (array=
    (qputil/query-hash {:database    2
                        :type        "native"
                        :native      {:query "SELECT pg_sleep(15), 1 AS one"}})
    (qputil/query-hash {:database    2
                        :type        "native"
                        :native      {:query "SELECT pg_sleep(15), 2 AS two"}})))


(def ^:private test-inner-map
  {:test {:value 10}})

;; get-in-query should work for a nested query
(expect
  10
  (qputil/get-in-query {:query {:source-query test-inner-map}} [:test :value]))

;; Not currently supported, but get-in-query should work for a double nested query
(expect
  10
  (qputil/get-in-query {:query {:source-query {:source-query test-inner-map}}} [:test :value]))

;; get-in-query should also work with non-nested queries
(expect
  10
  (qputil/get-in-query {:query test-inner-map} [:test :value]))

;; Not providing a `not-found` value should just return nil
(expect
  nil
  (qputil/get-in-query {} [:test]))

;; Providing a `not-found` value should return that
(let [not-found (gensym)]
  (expect
    not-found
    (qputil/get-in-query {} [:test] not-found)))
