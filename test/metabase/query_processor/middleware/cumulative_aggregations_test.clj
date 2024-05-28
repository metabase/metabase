(ns metabase.query-processor.middleware.cumulative-aggregations-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.cumulative-aggregations :as qp.cumulative-aggregations]
   [metabase.query-processor.store :as qp.store]))

(deftest ^:parallel add-values-from-last-partition-test
  (are [expected indexes] (= expected
                             (let [f (#'qp.cumulative-aggregations/add-values-from-last-partition-fn 0 indexes)]
                               (f [1 2 3])
                               (f [1 2 3])))
    [1 2 3] #{}
    [2 2 3] #{0}
    [2 4 3] #{0 1}
    [1 4 6] #{1 2}))

(deftest ^:parallel add-values-from-last-partition-out-of-bounds-test
  (let [f (#'qp.cumulative-aggregations/add-values-from-last-partition-fn 0 #{4})]
    (is (thrown?
         IndexOutOfBoundsException
         (do
           (f [1 2 3])
           (f [1 2 3])))
        "should throw an Exception if index is out of bounds")))

(deftest ^:parallel add-values-from-last-partition-nils-test
  (testing "Do we handle nils correctly"
    (are [row-1 row-2 expected] (= expected
                                   (let [f (#'qp.cumulative-aggregations/add-values-from-last-partition-fn 0 #{0})]
                                     (f row-1)
                                     (f row-2)))
      [nil] [1]   [1]
      [nil] [nil] [0]
      [1]   [nil] [1])))

(deftest ^:parallel diff-indicies-test
  (testing "collections are the same"
    (is (= #{}
           (#'qp.cumulative-aggregations/diff-indexes [:a :b :c] [:a :b :c]))))
  (testing "one index is different"
    (is (= #{1}
           (#'qp.cumulative-aggregations/diff-indexes [:a :b :c] [:a 100 :c])))))

(defn- sum-rows [replaced-indexes rows]
  (let [rf (#'qp.cumulative-aggregations/cumulative-ags-xform 0 replaced-indexes (fn
                                                                                   ([] [])
                                                                                   ([acc] acc)
                                                                                   ([acc row] (conj acc row))))]
    (transduce identity rf rows)))

(deftest ^:parallel transduce-results-test
  (testing "Transducing result rows"
    (let [rows [[0] [1] [2] [3] [4] [5] [6] [7] [8] [9]]]
      (testing "0/1 indexes"
        (is (= rows
               (sum-rows #{} rows))))
      (testing "1/1 indexes"
        (is (= [[0] [1] [3] [6] [10] [15] [21] [28] [36] [45]]
               (sum-rows #{0} rows)))))
    (let [rows [[0 0] [1 1] [2 2] [3 3] [4 4] [5 5] [6 6] [7 7] [8 8] [9 9]]]
      (testing "1/2 indexes"
        (is (= [[0 0] [1 1] [3 2] [6 3] [10 4] [15 5] [21 6] [28 7] [36 8] [45 9]]
               (sum-rows #{0} rows))))
      (testing "2/2 indexes"
        (is (= [[0 0] [1 1] [3 3] [6 6] [10 10] [15 15] [21 21] [28 28] [36 36] [45 45]]
               (sum-rows #{0 1} rows)))))
    (testing "sum-rows should still work if rows are lists"
      (is (= [[1 1 1] [2 3 2] [3 6 3]]
             (sum-rows #{1} '((1 1 1) (2 2 2) (3 3 3))))))))

(deftest ^:parallel replace-cumulative-ags-test
  (testing "does replacing cumulative ags work correctly?"
    (is (= {:database 1
            :type     :query
            :query    {:source-table 1
                       :breakout     [[:field 1 nil]]
                       :aggregation  [[:sum [:field 1 nil]]]}}
           (#'qp.cumulative-aggregations/replace-cumulative-ags
            {:database 1
             :type     :query
             :query    {:source-table 1
                        :breakout     [[:field 1 nil]]
                        :aggregation  [[:cum-sum [:field 1 nil]]]}}))))
  (testing "...even inside expression aggregations?"
    (is (= {:database 1
            :type     :query
            :query    {:source-table 1, :aggregation [[:* [:count] 1]]}}
           (#'qp.cumulative-aggregations/replace-cumulative-ags
            {:database 1
             :type     :query
             :query    {:source-table 1, :aggregation [[:* [:cum-count] 1]]}})))))

(driver/register! ::no-window-function-driver)

(defmethod driver/database-supports? [::no-window-function-driver :window-functions/cumulative]
  [_driver _feature _database]
  false)

(defn- handle-cumulative-aggregations [query]
  (driver/with-driver ::no-window-function-driver
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [query (#'qp.cumulative-aggregations/rewrite-cumulative-aggregations query)
            rff   (qp.cumulative-aggregations/sum-cumulative-aggregation-columns query (constantly conj))
            rf    (rff nil)]
        (transduce identity rf [[1 1]
                                [2 2]
                                [3 3]
                                [4 4]
                                [5 5]])))))

(deftest ^:parallel e2e-test
  (testing "make sure we take breakout fields into account"
    (is (= [[1 1] [2 3] [3 6] [4 10] [5 15]]
           (handle-cumulative-aggregations
            {:database 1
             :type     :query
             :query    {:source-table 1
                        :breakout     [[:field 1 nil]]
                        :aggregation  [[:cum-sum [:field 1 nil]]]}})))))

(deftest ^:parallel e2e-test-2
  (testing "make sure we sum up cumulative aggregations inside expressions correctly"
    (testing "we shouldn't be doing anything special with the expressions, let the database figure that out. We will just SUM"
      (is (= [[1 1] [2 3] [3 6] [4 10] [5 15]]
             (handle-cumulative-aggregations
              {:database 1
               :type     :query
               :query    {:source-table 1
                          :breakout     [[:field 1 nil]]
                          :aggregation  [[:+ [:cum-count] 1]]}}))))))

(deftest ^:parallel multiple-breakouts-reset-counts-test
  (testing "Multiple breakouts: reset counts after breakouts other than first get new values (#2862, #42003)"
    (let [rows [[#t "2016-04-01" "Long Beach"    2]   ; [LB] 0 + 2 => 2
                [#t "2016-04-01" "San Francisco" 10]  ; [SF] 0 + 10 => 10
                [#t "2016-04-02" "San Francisco" 30]  ; [SF] 10 + 30 => 40
                [#t "2016-04-03" "Long Beach"    4]   ; [LB] 2 + 4 => 6
                [#t "2016-04-04" "San Francisco" 40]  ; [SF] 40 + 40 => 80
                [#t "2016-04-06" "Long Beach"    8]]  ; [LB] 6 + 8 => 14
          rff (qp.cumulative-aggregations/sum-cumulative-aggregation-columns
               {::qp.cumulative-aggregations/replaced-indexes #{2}
                :query                                        {:breakout [:a :b]}}
               (fn [_metadata]
                 conj))
          rf (rff nil)]
      (is (= [[#t "2016-04-01" "Long Beach"    2]   ; [LB] 0 + 2 => 2
              [#t "2016-04-01" "San Francisco" 10]  ; [SF] 0 + 10 => 10
              [#t "2016-04-02" "San Francisco" 40]  ; [SF] 10 + 30 => 40
              [#t "2016-04-03" "Long Beach"    6]   ; [LB] 2 + 4 => 6
              [#t "2016-04-04" "San Francisco" 80]  ; [SF] 40 + 40 => 80
              [#t "2016-04-06" "Long Beach"    14]] ; [LB] 6 + 8 => 14
             (reduce rf [] rows))))))

(deftest ^:parallel multiple-breakouts-reset-counts-test-2
  (testing "3 breakouts: reset counts after breakouts other than first get new values (#2862, #42003)"
    (let [rows [[#t "2016-04-01" "Long Beach"    "LB"  2]  ; [LB] 0 + 2 => 2
                [#t "2016-04-01" "San Francisco" "SF"  10] ; [SF] 0 + 10 => 10
                [#t "2016-04-02" "San Francisco" "SF"  30] ; [SF] 10 + 30 => 40
                [#t "2016-04-03" "Long Beach"    "LB"  4]  ; [LB] 2 + 4 => 6
                [#t "2016-04-03" "Long Beach"    "LBC" 4]  ; [LBC] 0 + 4 => 4
                [#t "2016-04-04" "San Francisco" "SF"  40] ; [SF] 40 + 40 => 80
                [#t "2016-04-06" "Long Beach"    "LB"  8]  ; [LB] 6 + 8 => 14
                [#t "2016-04-06" "Long Beach"    "LBC" 8]] ; [LBC] 4 + 8 => 12
          rff (qp.cumulative-aggregations/sum-cumulative-aggregation-columns
               {::qp.cumulative-aggregations/replaced-indexes #{3}
                :query                                        {:breakout [:a :b :c]}}
               (fn [_metadata]
                 conj))
          rf (rff nil)]
      (is (= [[#t "2016-04-01" "Long Beach"    "LB"  2]   ; [LB] 0 + 2 => 2
              [#t "2016-04-01" "San Francisco" "SF"  10]  ; [SF] 0 + 10 => 10
              [#t "2016-04-02" "San Francisco" "SF"  40]  ; [SF] 10 + 30 => 40
              [#t "2016-04-03" "Long Beach"    "LB"  6]   ; [LB] 2 + 4 => 6
              [#t "2016-04-03" "Long Beach"    "LBC" 4]   ; [LBC] 0 + 4 => 4
              [#t "2016-04-04" "San Francisco" "SF"  80]  ; [SF] 40 + 40 => 80
              [#t "2016-04-06" "Long Beach"    "LB"  14]  ; [LB] 6 + 8 => 14
              [#t "2016-04-06" "Long Beach"    "LBC" 12]] ; [LBC] 4 + 8 => 12
             (reduce rf [] rows))))))
