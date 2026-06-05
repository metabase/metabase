(ns metabase.transforms.instrumentation-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics-interface.core :as analytics]
   [metabase.test :as mt]
   [metabase.transforms.instrumentation :as transforms.instrumentation]))

(set! *warn-on-reflection* true)

(deftest record-incremental-rows!-test
  (mt/with-prometheus-system! [_ system]
    (testing "Both numbers present: emits {type=available} and {type=processed} under same full-incremental-run label"
      (analytics/clear! :metabase-transforms/incremental-rows)
      (transforms.instrumentation/record-incremental-rows! 1000 250 false)
      (is (== 1 (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                         {:type "available" :full-incremental-run "false"}))))
      (is (== 1 (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                         {:type "processed" :full-incremental-run "false"}))))
      (is (== 1000 (:sum (mt/metric-value system :metabase-transforms/incremental-rows
                                          {:type "available" :full-incremental-run "false"}))))
      (is (== 250 (:sum (mt/metric-value system :metabase-transforms/incremental-rows
                                         {:type "processed" :full-incremental-run "false"})))))
    (testing "Full incremental run: emits under {full-incremental-run=true}, NOT under =false"
      (analytics/clear! :metabase-transforms/incremental-rows)
      (transforms.instrumentation/record-incremental-rows! 5000 5000 true)
      (is (== 1 (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                         {:type "available" :full-incremental-run "true"}))))
      (is (== 1 (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                         {:type "processed" :full-incremental-run "true"}))))
      (is (== 0 (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                         {:type "available" :full-incremental-run "false"})))))
    (testing "Zero-row window is a valid observation — the empty incremental window must show up in the metric"
      (analytics/clear! :metabase-transforms/incremental-rows)
      (transforms.instrumentation/record-incremental-rows! 0 0 false)
      (is (== 1 (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                         {:type "available" :full-incremental-run "false"}))))
      (is (== 0 (:sum (mt/metric-value system :metabase-transforms/incremental-rows
                                       {:type "available" :full-incremental-run "false"})))))))
