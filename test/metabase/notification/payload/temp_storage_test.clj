(ns metabase.notification.payload.temp-storage-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.notification.payload.temp-storage-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.notification.payload.temp-storage :as temp-storage]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- run-rff
  "Helper to run notification-rff with a per-query cell spill threshold (or a full options map) and row data. A bare int
  `n` becomes a `:budget` whose `:per-card` limit spills once this query holds `n` or more cells in memory."
  [threshold-or-options row-data]
  (let [options  (if (map? threshold-or-options)
                   threshold-or-options
                   {:budget (temp-storage/make-resident-budget
                             {:per-card threshold-or-options :resident-cap Long/MAX_VALUE :floor Long/MAX_VALUE})})
        metadata {:cols [{:name "id"} {:name "value"}]}
        rff (temp-storage/notification-rff options {})
        rf (rff metadata)]
    (transduce identity rf row-data)))

(defn- rows
  "Generate n rows of test data."
  [n]
  (for [i (range n)] (repeat 10 (* 10 i))))

(deftest streaming-threshold-test
  (testing "Under threshold - rows stay in memory"
    (let [result (run-rff 50 (rows 4))]
      (is (= 4 (:row_count result)))
      (is (= :completed (:status result)))
      (is (vector? (get-in result [:data :rows])))
      (is (= (rows 4) (get-in result [:data :rows])))))
  (testing "At threshold - rows stream to disk"
    (let [result  (run-rff 50 (rows 5))
          storage (get-in result [:data :rows])]
      (is (= 5 (:row_count result)))
      (is (temp-storage/streaming-temp-file? storage))
      (is (= (rows 5) @storage))
      (temp-storage/cleanup! storage)))
  (testing "Over threshold - rows stream to disk"
    (let [result  (run-rff 50 (rows 6))
          storage (get-in result [:data :rows])]
      (is (= 6 (:row_count result)))
      (is (temp-storage/streaming-temp-file? storage))
      (is (= (rows 6) @storage))
      (temp-storage/cleanup! storage)))
  (testing "Over max-file-size threshold, aborts query"
    (mt/with-temporary-setting-values [notification-temp-file-size-max-bytes (* 4 1024)]
      (let [many-rows 50000
            result    (run-rff 5 (rows many-rows))
            storage   (get-in result [:data :rows])]
        ;; row count here is how many query results were returned
        (is (< (:row_count result) many-rows))
        (is (temp-storage/streaming-temp-file? storage))
        (is (:notification/truncated? result))
        (mt/with-temporary-setting-values [notification-temp-file-size-max-bytes 0]
          ;; remove enforcing notification size limit before dereferencing and then see that we _stored_ fewer
          ;; results than otherwise might have been returned. Without resetting this, dereferencing the rows would
          ;; error as it was larger than the file size limit

          (is (< (count @storage) many-rows))))))
  ;; in testing on my machine, this test takes this whole test from 262ms to 1550 ms. Seems worthwhile to me
  (testing "When bytes size is set to 0 allows for arbitrary sizes"
    (mt/with-temporary-setting-values [notification-temp-file-size-max-bytes 0]
      (let [many-rows 250000
            result    (run-rff 50 (rows many-rows))
            storage   (get-in result [:data :rows])]
        ;; row count here is how many query results were returned
        (is (= (:row_count result) many-rows))
        (is (temp-storage/streaming-temp-file? storage))
        ;; on my machine this was 28.5mb. Don't need to push this into GB but demonstrate we are above the 10mb limit
        (is (and (:data.rows-file-size result)
                 (> (:data.rows-file-size result) (* 10 1024 1024)))
            (format "data.rows-file-size was only : %d" (:data.rows-file-size result)))
        (is (not (:notification/truncated? result)))
        (is (= (count @storage) many-rows))))))

(deftest streaming-edge-cases-test
  (testing "Empty rows"
    (let [result (run-rff 5 [])]
      (is (= 0 (:row_count result)))
      (is (vector? (get-in result [:data :rows])))
      (is (empty? (get-in result [:data :rows])))))
  (testing "Single row"
    (let [result (run-rff 5 [[42]])]
      (is (= 1 (:row_count result)))
      (is (= [[42]] (get-in result [:data :rows])))))
  (testing "Large row count"
    (let [result (run-rff 100 (for [i (range 150)] [i]))
          storage (get-in result [:data :rows])]
      (is (= 150 (:row_count result)))
      (is (temp-storage/streaming-temp-file? storage))
      (is (= 150 (count @storage)))
      (is (= [0] (first @storage)))
      (is (= [149] (last @storage)))
      (temp-storage/cleanup! storage))))

(deftest streaming-data-integrity-test
  (testing "Repeated values preserve correctly"
    (let [metadata {:cols (for [c ["a" "b" "c" "d" "e"]] {:name c})}
          rff (temp-storage/notification-rff
               {:budget (temp-storage/make-resident-budget {:per-card 4 :resident-cap Long/MAX_VALUE :floor Long/MAX_VALUE})}
               {})
          rf (rff metadata)
          data (for [i (range 6)] (vec (repeat 5 i)))
          result (transduce identity rf data)
          storage (get-in result [:data :rows])]
      (is (temp-storage/streaming-temp-file? storage))
      (is (= [[0 0 0 0 0]
              [1 1 1 1 1]
              [2 2 2 2 2]
              [3 3 3 3 3]
              [4 4 4 4 4]
              [5 5 5 5 5]]
             @storage))
      (temp-storage/cleanup! storage))))

(deftest streaming-file-size-test
  (testing "File size is included in result"
    (let [result (run-rff 5 (rows 10))
          storage (get-in result [:data :rows])]
      (is (number? (:data.rows-file-size result)))
      (is (pos? (:data.rows-file-size result)))
      (is (> (:data.rows-file-size result) 50))
      (temp-storage/cleanup! storage))))

(deftest streaming-cleanup-test
  (testing "StreamingTempFileStorage can be cleaned up"
    (let [result (run-rff 5 (rows 10))
          storage (get-in result [:data :rows])]
      (is (= 10 (count @storage)))
      (temp-storage/cleanup! storage)
      (is (thrown? Exception @storage)))))

(deftest streaming-pending-test
  (testing "IPending returns false to prevent auto-deref"
    (let [result (run-rff 5 (rows 10))
          storage (get-in result [:data :rows])]
      (is (not (realized? storage)))
      (temp-storage/cleanup! storage))))

;; ------------------------------------------------------------------------------------------------;;
;;                                   Cross-card resident budget                                     ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- run-card!
  "Run one card's worth of `n` single-cell rows through `notification-rff` sharing `budget`. Returns the result map.
  Single-cell rows mean cell-count == row-count, so the budget math is easy to reason about."
  [budget n]
  (let [rff (temp-storage/notification-rff {:budget budget} {})
        rf  (rff {:cols [{:name "a"}]})]
    (transduce identity rf (vec (repeat n [1])))))

(defn- resident [budget]
  @(:resident budget))

(defn- storage-of [result]
  (:notification/storage result))

(deftest cross-card-budget-test
  (testing "a card whose cells alone exceed :per-card spills even on a cold dashboard"
    (let [budget (temp-storage/make-resident-budget {:per-card 20 :resident-cap 1000 :floor 5})
          result (run-card! budget 25)]
      (is (= :disk (storage-of result)))
      (is (zero? (resident budget)) "spilled cards add nothing to resident")
      (temp-storage/cleanup! (get-in result [:data :rows]))))
  (testing "in-memory cards fold their cells into the shared resident total; spilled cards add 0"
    (let [budget (temp-storage/make-resident-budget {:per-card 20 :resident-cap 1000 :floor 5})
          a      (run-card! budget 8)]
      (is (= :memory (storage-of a)))
      (is (= 8 (resident budget)) "first in-memory card folds its 8 cells in")
      (let [b (run-card! budget 7)]
        (is (= :memory (storage-of b)))
        (is (= 15 (resident budget)) "second in-memory card adds to the running total"))))
  (testing "once resident is over the cap, later non-tiny cards spill (resident stays put)"
    (let [budget (temp-storage/make-resident-budget {:per-card 100 :resident-cap 20 :floor 5})]
      (reset! (:resident budget) 25)                       ; sibling cards already hold 25 cells, over the cap of 20
      (let [c (run-card! budget 8)]                         ; 8 > floor (5), resident over cap -> spill
        (is (= :disk (storage-of c)))
        (is (= 25 (resident budget)) "spilled card leaves resident unchanged")
        (temp-storage/cleanup! (get-in c [:data :rows])))))
  (testing "tiny cards (below :floor) stay in memory even when resident is over the cap"
    (let [budget (temp-storage/make-resident-budget {:per-card 100 :resident-cap 20 :floor 5})]
      (reset! (:resident budget) 25)                       ; already over the cap
      (let [d (run-card! budget 4)]                         ; 4 < floor (5) -> stays in memory despite over-cap resident
        (is (= :memory (storage-of d)))
        (is (= 29 (resident budget)) "tiny in-memory card still folds its cells in"))))
  (testing "the in-flight card's own cells count toward the cap (combined check) - regression"
    ;; resident sits just under the cap; a card that is individually under :per-card but whose cells push
    ;; (resident + this-query) over the cap must spill. Before the combined check this case was missed.
    (let [budget (temp-storage/make-resident-budget {:per-card 100 :resident-cap 20 :floor 5})]
      (run-card! budget 19)                                ; resident -> 19 (just under cap 20)
      (is (= 19 (resident budget)))
      (let [b (run-card! budget 15)]                       ; 15 < per-card, but 19+15=34 > 20 and 15 > floor -> spill
        (is (= :disk (storage-of b)))
        (is (= 19 (resident budget)) "the over-cap card spills rather than riding up in memory")
        (temp-storage/cleanup! (get-in b [:data :rows]))))))

(deftest fidelity
  (testing "Untruncated results should be equal"
    (let [query (mt/mbql-query orders)]
      ;; its the default value but just ensuring it is high enough
      (mt/with-temporary-setting-values [notification-temp-file-size-max-bytes (* 10 1024 1024)]
        (let [qp-results (mt/process-query query)
              temp-file-results (mt/process-query query
                                                  (temp-storage/notification-rff
                                                   {:budget (temp-storage/make-resident-budget
                                                             {:per-card 20000 :resident-cap Long/MAX_VALUE :floor Long/MAX_VALUE})}))]
          (is (not (:notification/truncated? temp-file-results)))
          (is (temp-storage/streaming-temp-file? (-> temp-file-results :data :rows)))
          (is (= (-> qp-results :data :rows)
                 (-> temp-file-results :data :rows deref)))
          (-> temp-file-results :data :rows temp-storage/cleanup!))))))
