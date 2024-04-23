(ns metabase.query-processor.middleware.cumulative-aggregations-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.cumulative-aggregations :as qp.cumulative-aggregations]
   [metabase.query-processor.store :as qp.store]))

(deftest ^:parallel add-values-from-last-row-test
  (are [expected indecies] (= expected
                              (#'qp.cumulative-aggregations/add-values-from-last-row 0 indecies [1 2 3] [1 2 3]))
    [1 2 3] #{}
    [2 2 3] #{0}
    [2 4 3] #{0 1}
    [1 4 6] #{1 2})

  (is (thrown?
       IndexOutOfBoundsException
       (#'qp.cumulative-aggregations/add-values-from-last-row 0 #{4} [1 2 3] [1 2 3]))
      "should throw an Exception if index is out of bounds")

  (testing "Do we handle nils correctly"
    (is (= [1] (#'qp.cumulative-aggregations/add-values-from-last-row 0 #{0} [nil] [1])))
    (is (= [0] (#'qp.cumulative-aggregations/add-values-from-last-row 0 #{0} [nil] [nil])))
    (is (= [1] (#'qp.cumulative-aggregations/add-values-from-last-row 0 #{0} [1] [nil])))))

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
      (testing "0/1 indecies"
        (is (= rows
               (sum-rows #{} rows))))
      (testing "1/1 indecies"
        (is (= [[0] [1] [3] [6] [10] [15] [21] [28] [36] [45]]
               (sum-rows #{0} rows)))))
    (let [rows [[0 0] [1 1] [2 2] [3 3] [4 4] [5 5] [6 6] [7 7] [8 8] [9 9]]]
      (testing "1/2 indecies"
        (is (= [[0 0] [1 1] [3 2] [6 3] [10 4] [15 5] [21 6] [28 7] [36 8] [45 9]]
               (sum-rows #{0} rows))))
      (testing "2/2 indecies"
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
  (testing "Multiple breakouts: reset counts after breakouts other than last get new values (#2862)"
    (let [rows [["Long Beach"    #t "2016-04-01" 2]
                ["Long Beach"    #t "2016-04-03" 4]   ; 2 + 4 = 6
                ["Long Beach"    #t "2016-04-03" 6]   ; 6 + 6 = 12
                ["Long Beach"    #t "2016-04-06" 8]   ; 12 + 8 = 20
                ["San Francisco" #t "2016-04-01" 10]  ; RESET VALUES HERE!
                ["San Francisco" #t "2016-04-01" 20]  ; 10 + 20 = 30
                ["San Francisco" #t "2016-04-02" 30]  ; 30 + 30 = 60
                ["San Francisco" #t "2016-04-04" 40]] ; 60 + 40 = 100
          rff (qp.cumulative-aggregations/sum-cumulative-aggregation-columns
               {::qp.cumulative-aggregations/replaced-indexes #{2}
                :query                                        {:breakout [:a :b]}}
               (fn [_metadata]
                 conj))
          rf (rff nil)]
      (is (= [["Long Beach"    #t "2016-04-01" 2]
              ["Long Beach"    #t "2016-04-03" 6]
              ["Long Beach"    #t "2016-04-03" 12]
              ["Long Beach"    #t "2016-04-06" 20]
              ["San Francisco" #t "2016-04-01" 10]
              ["San Francisco" #t "2016-04-01" 30]
              ["San Francisco" #t "2016-04-02" 60]
              ["San Francisco" #t "2016-04-04" 100]]
             (reduce rf [] rows))))))
