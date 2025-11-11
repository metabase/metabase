(ns metabase.notification.payload.temp-storage-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.payload.temp-storage :as temp-storage]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- run-rff
  "Helper to run notification-rff with given max-rows and row data."
  [max-rows row-data]
  (let [metadata {:cols [{:name "id"} {:name "value"}]}
        rff (temp-storage/notification-rff max-rows {})
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
          rff (temp-storage/notification-rff 5 {})
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

(deftest fidelity
  (testing "Untruncated results should be equal"
    (let [query (mt/mbql-query orders)]
      ;; its the default value but just ensuring it is high enough
      (mt/with-temporary-setting-values [notification-temp-file-size-max-bytes (* 10 1024 1024)]
        (let [qp-results (mt/process-query query)
              temp-file-results (mt/process-query query
                                                  (temp-storage/notification-rff 20000))]
          (is (not (:notification/truncated? temp-file-results)))
          (is (temp-storage/streaming-temp-file? (-> temp-file-results :data :rows)))
          (is (= (-> qp-results :data :rows)
                 (-> temp-file-results :data :rows deref)))
          (-> temp-file-results :data :rows temp-storage/cleanup!))))))
