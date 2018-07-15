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


;;; ------------------------------------------------------------ Tests for qputil/query-hash ------------------------------------------------------------

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

;; similarly, the presence of a `nil` value for `:constraints` should produce the same hash as not including the key at all
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


;;; ------------------------------------------------------------ Tests for get-normalized and get-in-normalized ------------------------------------------------------------

(expect 2 (qputil/get-normalized {"num_toucans" 2} :num-toucans))
(expect 2 (qputil/get-normalized {"NUM_TOUCANS" 2} :num-toucans))
(expect 2 (qputil/get-normalized {"num-toucans" 2} :num-toucans))
(expect 2 (qputil/get-normalized {:num_toucans 2}  :num-toucans))
(expect 2 (qputil/get-normalized {:NUM_TOUCANS 2}  :num-toucans))
(expect 2 (qputil/get-normalized {:num-toucans 2}  :num-toucans))

(expect
  false
  (qputil/get-normalized {:case-sensitive false} :case-sensitive))

(expect
  false
  (qputil/get-normalized {:case-sensitive false} :case-sensitive true))

(expect
  true
  (qputil/get-normalized {:explodes-database false} :case-sensitive true))

(expect
  nil
  (qputil/get-normalized nil :num-toucans))

(expect 2 (qputil/get-in-normalized {"BIRDS" {"NUM_TOUCANS" 2}} [:birds :num-toucans]))
(expect 2 (qputil/get-in-normalized {"birds" {"num_toucans" 2}} [:birds :num-toucans]))
(expect 2 (qputil/get-in-normalized {"birds" {"num-toucans" 2}} [:birds :num-toucans]))
(expect 2 (qputil/get-in-normalized {:BIRDS  {:NUM_TOUCANS 2}}  [:birds :num-toucans]))
(expect 2 (qputil/get-in-normalized {:birds  {:num_toucans 2}}  [:birds :num-toucans]))
(expect 2 (qputil/get-in-normalized {:birds  {:num-toucans 2}}  [:birds :num-toucans]))

(expect
  2
  (qputil/get-in-normalized {:num-toucans 2} [:num-toucans]))

(expect
  nil
  (qputil/get-in-normalized nil [:birds :num-toucans]))

(expect
  10
  (qputil/get-in-normalized
   {"dataset_query" {"query" {"source_table" 10}}}
   [:dataset-query :query :source-table]))

(expect {} (qputil/dissoc-normalized {"NUM_TOUCANS" 3} :num-toucans))
(expect {} (qputil/dissoc-normalized {"num_toucans" 3} :num-toucans))
(expect {} (qputil/dissoc-normalized {"num-toucans" 3} :num-toucans))
(expect {} (qputil/dissoc-normalized {:NUM_TOUCANS 3}  :num-toucans))
(expect {} (qputil/dissoc-normalized {:num_toucans 3}  :num-toucans))
(expect {} (qputil/dissoc-normalized {:num-toucans 3}  :num-toucans))

(expect
  {}
  (qputil/dissoc-normalized {:num-toucans 3, "NUM_TOUCANS" 3, "num_toucans" 3} :num-toucans))

(expect
  nil
  (qputil/dissoc-normalized nil :num-toucans))

(defrecord ^:private TestRecord1 [x])
(defrecord ^:private TestRecord2 [x])

(def ^:private test-tree
  {:a {:aa (TestRecord1. 1)
       :ab (TestRecord2. 1)}
   :b (TestRecord1. 1)
   :c (TestRecord2. 1)
   :d [1 2 3 4]})

;; Test that we can change only the items matching the `instance?` predicate
(expect
  (-> test-tree
      (update-in [:a :aa :x] inc)
      (update-in [:b :x] inc))
  (qputil/postwalk-pred #(instance? TestRecord1 %)
                        #(update % :x inc)
                        test-tree))

;; If nothing matches, the original tree should be returned
(expect
  test-tree
  (qputil/postwalk-pred set?
                        #(set (map inc %))
                        test-tree))

;; We should be able to collect items matching the predicate
(expect
  [(TestRecord1. 1) (TestRecord1. 1)]
  (qputil/postwalk-collect #(instance? TestRecord1 %)
                           identity
                           test-tree))

;; Not finding any of the items should just return an empty seq
(expect
  []
  (qputil/postwalk-collect set?
                           identity
                           test-tree))
