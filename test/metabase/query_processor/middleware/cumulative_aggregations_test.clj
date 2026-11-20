(ns metabase.query-processor.middleware.cumulative-aggregations-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.cumulative-aggregations :as qp.cumulative-aggregations]
   [metabase.util.malli :as mu]))

(deftest ^:parallel add-values-from-last-partition-test
  (are [expected indexes] (= expected
                             (let [f (#'qp.cumulative-aggregations/add-values-from-last-partition-fn 0 indexes nil)]
                               (f [1 2 3])
                               (f [1 2 3])))
    [1 2 3] #{}
    [2 2 3] #{0}
    [2 4 3] #{0 1}
    [1 4 6] #{1 2}))

(deftest ^:parallel add-values-from-last-partition-out-of-bounds-test
  (let [f (#'qp.cumulative-aggregations/add-values-from-last-partition-fn 0 #{4} nil)]
    (is (thrown?
         IndexOutOfBoundsException
         (do
           (f [1 2 3])
           (f [1 2 3])))
        "should throw an Exception if index is out of bounds")))

(deftest ^:parallel add-values-from-last-partition-nils-test
  (testing "Do we handle nils correctly"
    (are [row-1 row-2 expected] (= expected
                                   (let [f (#'qp.cumulative-aggregations/add-values-from-last-partition-fn 0 #{0} nil)]
                                     (f row-1)
                                     (f row-2)))
      [nil] [1]   [1]
      [nil] [nil] [0]
      [1]   [nil] [1])))

(deftest ^:parallel add-values-from-last-partition-roll-ups-test
  (testing "an index is accumulated with its roll-up, and summed if it has none"
    (let [f (#'qp.cumulative-aggregations/add-values-from-last-partition-fn 0 #{0 1 2} {1 :min, 2 :max})]
      (is (= [[3 3 3] [5 2 3] [10 2 7] [11 1 7]]
             (mapv f [[3 3 3] [2 2 2] [5 7 7] [1 1 1]])))))
  (testing "min and max skip nils, like MIN and MAX in SQL"
    (are [roll-up rows expected] (= expected
                                    (let [f (#'qp.cumulative-aggregations/add-values-from-last-partition-fn 0 #{0} {0 roll-up})]
                                      (mapv f rows)))
      :min [[nil] [2] [nil] [1] [3]] [[nil] [2] [2] [1] [1]]
      :max [[nil] [2] [nil] [1] [3]] [[nil] [2] [2] [2] [3]]))
  (testing "min and max work with anything comparable, not just numbers"
    (are [roll-up expected] (= expected
                               (let [f (#'qp.cumulative-aggregations/add-values-from-last-partition-fn 0 #{0} {0 roll-up})]
                                 (mapv f [["b"] ["a"] ["c"]])))
      :min [["b"] ["a"] ["a"]]
      :max [["b"] ["b"] ["c"]])
    (are [roll-up expected] (= expected
                               (let [f (#'qp.cumulative-aggregations/add-values-from-last-partition-fn 0 #{0} {0 roll-up})]
                                 (mapv f [[#t "2024-02-01"] [#t "2024-01-01"] [#t "2024-03-01"]])))
      :min [[#t "2024-02-01"] [#t "2024-01-01"] [#t "2024-01-01"]]
      :max [[#t "2024-02-01"] [#t "2024-02-01"] [#t "2024-03-01"]])))

(defn- sum-rows [replaced-indexes rows]
  (let [rf (#'qp.cumulative-aggregations/cumulative-ags-xform 0 replaced-indexes nil (fn
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

(driver/register! ::no-window-function-driver, :abstract? true)

(defmethod driver/database-supports? [::no-window-function-driver :window-functions/cumulative]
  [_driver _feature _database]
  false)

(deftest ^:parallel replace-cumulative-ags-test
  (testing "does replacing cumulative ags work correctly?"
    (driver/with-driver ::no-window-function-driver
      (is (=? {:stages [{:source-table 1
                         :breakout     [[:field {} 1]]
                         :aggregation  [[:sum {} [:field {} 1]]]}]}
              (#'qp.cumulative-aggregations/rewrite-cumulative-aggregations
               (lib/query
                meta/metadata-provider
                {:database (meta/id)
                 :type     :query
                 :query    {:source-table 1
                            :breakout     [[:field 1 nil]]
                            :aggregation  [[:cum-sum [:field 1 nil]]]}})))))))

(deftest ^:parallel replace-cumulative-ags-test-2
  (testing "...even inside expression aggregations?"
    (driver/with-driver ::no-window-function-driver
      (is (=? {:stages [{:source-table 1, :aggregation [[:* {} [:count {}] 1]]}]}
              (#'qp.cumulative-aggregations/rewrite-cumulative-aggregations
               (lib/query
                meta/metadata-provider
                {:database (meta/id)
                 :type     :query
                 :query    {:source-table 1, :aggregation [[:* [:cum-count] 1]]}})))))))

(defn- handle-cumulative-aggregations [query]
  (driver/with-driver ::no-window-function-driver
    (let [query (lib/query meta/metadata-provider query)
          query (#'qp.cumulative-aggregations/rewrite-cumulative-aggregations query)
          rff   (qp.cumulative-aggregations/sum-cumulative-aggregation-columns query (constantly conj))
          rf    (rff nil)]
      (transduce identity rf [[1 1]
                              [2 2]
                              [3 3]
                              [4 4]
                              [5 5]]))))

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
    (mu/disable-enforcement
      (let [rows [[#t "2016-04-01" "Long Beach"    2]  ; [LB] 0 + 2 => 2
                  [#t "2016-04-01" "San Francisco" 10] ; [SF] 0 + 10 => 10
                  [#t "2016-04-02" "San Francisco" 30] ; [SF] 10 + 30 => 40
                  [#t "2016-04-03" "Long Beach"    4]  ; [LB] 2 + 4 => 6
                  [#t "2016-04-04" "San Francisco" 40] ; [SF] 40 + 40 => 80
                  [#t "2016-04-06" "Long Beach"    8]] ; [LB] 6 + 8 => 14
            rff  (qp.cumulative-aggregations/sum-cumulative-aggregation-columns
                  {:lib/type :mbql/query
                   :stages   [{:breakout                                     [:a :b]
                               ::qp.cumulative-aggregations/replaced-indexes #{2}}]}
                  (fn [_metadata]
                    conj))
            rf   (rff nil)]
        (is (= [[#t "2016-04-01" "Long Beach"    2]   ; [LB] 0 + 2 => 2
                [#t "2016-04-01" "San Francisco" 10]  ; [SF] 0 + 10 => 10
                [#t "2016-04-02" "San Francisco" 40]  ; [SF] 10 + 30 => 40
                [#t "2016-04-03" "Long Beach"    6]   ; [LB] 2 + 4 => 6
                [#t "2016-04-04" "San Francisco" 80]  ; [SF] 40 + 40 => 80
                [#t "2016-04-06" "Long Beach"    14]] ; [LB] 6 + 8 => 14
               (reduce rf [] rows)))))))

(deftest ^:parallel multiple-breakouts-reset-counts-test-2
  (testing "3 breakouts: reset counts after breakouts other than first get new values (#2862, #42003)"
    (mu/disable-enforcement
      (let [rows [[#t "2016-04-01" "Long Beach"    "LB"  2]  ; [LB] 0 + 2 => 2
                  [#t "2016-04-01" "San Francisco" "SF"  10] ; [SF] 0 + 10 => 10
                  [#t "2016-04-02" "San Francisco" "SF"  30] ; [SF] 10 + 30 => 40
                  [#t "2016-04-03" "Long Beach"    "LB"  4]  ; [LB] 2 + 4 => 6
                  [#t "2016-04-03" "Long Beach"    "LBC" 4]  ; [LBC] 0 + 4 => 4
                  [#t "2016-04-04" "San Francisco" "SF"  40] ; [SF] 40 + 40 => 80
                  [#t "2016-04-06" "Long Beach"    "LB"  8]  ; [LB] 6 + 8 => 14
                  [#t "2016-04-06" "Long Beach"    "LBC" 8]] ; [LBC] 4 + 8 => 12
            rff  (qp.cumulative-aggregations/sum-cumulative-aggregation-columns
                  {:lib/type :mbql/query
                   :stages   [{:breakout                                     [:a :b :c]
                               ::qp.cumulative-aggregations/replaced-indexes #{3}}]}
                  (fn [_metadata]
                    conj))
            rf   (rff nil)]
        (is (= [[#t "2016-04-01" "Long Beach"    "LB"  2]   ; [LB] 0 + 2 => 2
                [#t "2016-04-01" "San Francisco" "SF"  10]  ; [SF] 0 + 10 => 10
                [#t "2016-04-02" "San Francisco" "SF"  40]  ; [SF] 10 + 30 => 40
                [#t "2016-04-03" "Long Beach"    "LB"  6]   ; [LB] 2 + 4 => 6
                [#t "2016-04-03" "Long Beach"    "LBC" 4]   ; [LBC] 0 + 4 => 4
                [#t "2016-04-04" "San Francisco" "SF"  80]  ; [SF] 40 + 40 => 80
                [#t "2016-04-06" "Long Beach"    "LB"  14]  ; [LB] 6 + 8 => 14
                [#t "2016-04-06" "Long Beach"    "LBC" 12]] ; [LBC] 4 + 8 => 12
               (reduce rf [] rows)))))))

;;; `[:cumulative opts <aggregation>]`

(defn- orders-by-month-query [& aggregations]
  (reduce lib/aggregate
          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
              (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month)))
          aggregations))

(defn- rewrite [query]
  (driver/with-driver ::no-window-function-driver
    (qp.cumulative-aggregations/rewrite-cumulative-aggregations query)))

(deftest ^:parallel rewrite-cumulative-test
  (testing "[:cumulative opts <aggregation>] is rewritten as <aggregation>"
    (let [total (meta/field-metadata :orders :total)
          query (orders-by-month-query
                 (lib/cumulative (lib/sum total))
                 (lib/sum total)
                 (lib/cumulative (lib/min total))
                 (lib/cumulative (lib/max total))
                 (lib/cumulative (lib/count))
                 (lib/cumulative (lib/count-where (lib/> total 100))))]
      (is (=? {:stages [{:aggregation [[:sum {} [:field {} (meta/id :orders :total)]]
                                       [:sum {} [:field {} (meta/id :orders :total)]]
                                       [:min {} [:field {} (meta/id :orders :total)]]
                                       [:max {} [:field {} (meta/id :orders :total)]]
                                       [:count {}]
                                       [:count-where {} [:> {} [:field {} (meta/id :orders :total)] 100]]]
                         ;; indexes in the results: the breakout is at 0, so the first aggregation is at 1.
                         ::qp.cumulative-aggregations/replaced-indexes #{1 3 4 5 6}
                         ;; the ones that are not summed
                         ::qp.cumulative-aggregations/roll-ups         {3 :min, 4 :max}}]}
              (rewrite query))))))

(deftest ^:parallel rewrite-cumulative-keeps-options-test
  (testing "the rewritten aggregation keeps the UUID and the names of the :cumulative clause, so refs to it still work"
    (let [cumulative (-> (lib/cumulative (lib/max (meta/field-metadata :orders :total)))
                         (lib/update-options assoc :name "running_max", :display-name "Running max"))
          query      (-> (orders-by-month-query cumulative)
                         (as-> $query (lib/order-by $query (lib/aggregation-ref $query 0))))]
      (is (=? {:stages [{:aggregation [[:max
                                        {:lib/uuid (lib.options/uuid cumulative), :name "running_max", :display-name "Running max"}
                                        [:field {} (meta/id :orders :total)]]]
                         :order-by    [[:asc {} [:aggregation {} (lib.options/uuid cumulative)]]]}]}
              (rewrite query))))))

(deftest ^:parallel rewrite-cumulative-equivalent-to-cum-sum-and-cum-count-test
  (testing ":cumulative of :sum and :count is rewritten the same way as :cum-sum and :cum-count"
    (let [total     (meta/field-metadata :orders :total)
          rewritten (fn [aggregation]
                      (-> (rewrite (orders-by-month-query aggregation))
                          (lib/query-stage -1)
                          (select-keys [:aggregation
                                        ::qp.cumulative-aggregations/replaced-indexes
                                        ::qp.cumulative-aggregations/roll-ups])
                          lib/remove-lib-uuids))]
      (are [cumulative equivalent] (= (rewritten equivalent)
                                      (rewritten cumulative))
        (lib/cumulative (lib/sum total))   (lib/cum-sum total)
        (lib/cumulative (lib/count))       (lib/cum-count)
        (lib/cumulative (lib/count total)) (lib/cum-count total)))))

(deftest ^:parallel rewrite-cumulative-unsupported-test
  (let [total (meta/field-metadata :orders :total)]
    (testing "a :cumulative inside an expression is an error: we would accumulate the value of the whole expression"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"does not support cumulative aggregations inside an expression"
           (rewrite (orders-by-month-query (lib// (lib/cumulative (lib/sum total))
                                                  (lib/cumulative (lib/count))))))))
    (testing "a cumulative average or share is a ratio of two running values, so it is an error as well"
      (are [aggregation] (thrown-with-msg?
                          clojure.lang.ExceptionInfo
                          #"does not support cumulative averages or shares"
                          (rewrite (orders-by-month-query (lib/cumulative aggregation))))
        (lib/avg total)
        (lib/share (lib/> total 100))))
    (testing "we can only accumulate the rows of the last stage"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"only supports cumulative aggregations in the last stage"
           (rewrite (-> (orders-by-month-query (lib/cumulative (lib/max total)))
                        lib/append-stage
                        (lib/limit 1))))))
    (testing "something :cumulative cannot wrap is an error rather than a plain aggregation"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Cumulative only works with .*, not distinct"
           (mu/disable-enforcement
             (rewrite (orders-by-month-query [:cumulative {:lib/uuid (str (random-uuid))} (lib/distinct total)]))))))))

(deftest ^:parallel cumulative-e2e-test
  (testing "running min and max of the rows the database returns"
    (driver/with-driver ::no-window-function-driver
      (let [total (meta/field-metadata :orders :total)
            query (rewrite (orders-by-month-query (lib/cumulative (lib/min total))
                                                  (lib/cumulative (lib/max total))
                                                  (lib/cumulative (lib/sum total))))
            rff   (qp.cumulative-aggregations/sum-cumulative-aggregation-columns query (constantly conj))]
        (is (= [[1 5 5  5]
                [2 3 5  8]
                [3 3 7  15]
                [4 3 7  15]
                [5 1 9  16]]
               (transduce identity (rff nil) [[1 5   5   5]
                                              [2 3   3   3]
                                              [3 7   7   7]
                                              [4 nil nil nil]
                                              [5 1   9   1]])))))))
