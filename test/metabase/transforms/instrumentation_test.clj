(ns metabase.transforms.instrumentation-test
  "Unit tests for transform instrumentation helpers — primarily the metric emission shape
   of `record-incremental-rows!`. End-to-end emission through the full `run-cancelable-transform!`
   pipeline is covered by `metabase-enterprise.transforms.incremental-metrics-test`."
  (:require
   [clojure.test :refer :all]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.test :as mt]
   [metabase.transforms.instrumentation :as transforms.instrumentation]))

(set! *warn-on-reflection* true)

;; All assertions share one `with-prometheus-system!` (boot is expensive). Blocks that
;; re-touch a metric clear it first so each assertion is absolute (1) rather than
;; cumulative — keeps the test order non-load-bearing.
(deftest record-incremental-rows!-test
  (mt/with-prometheus-system! [_ system]
    (testing "Both numbers present: emits {type=available} and {type=processed} under same full-incremental-run label"
      (analytics/clear! :metabase-transforms/incremental-rows)
      (transforms.instrumentation/record-incremental-rows! 1000 250 false)
      (is (prometheus-test/approx= 1
                                   (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                                            {:type "available" :full-incremental-run "false"}))))
      (is (prometheus-test/approx= 1
                                   (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                                            {:type "processed" :full-incremental-run "false"}))))
      (is (prometheus-test/approx= 1000
                                   (:sum (mt/metric-value system :metabase-transforms/incremental-rows
                                                          {:type "available" :full-incremental-run "false"}))))
      (is (prometheus-test/approx= 250
                                   (:sum (mt/metric-value system :metabase-transforms/incremental-rows
                                                          {:type "processed" :full-incremental-run "false"})))))
    (testing "Full incremental run: emits under {full-incremental-run=true}, NOT under =false"
      (analytics/clear! :metabase-transforms/incremental-rows)
      (transforms.instrumentation/record-incremental-rows! 5000 5000 true)
      (is (prometheus-test/approx= 1
                                   (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                                            {:type "available" :full-incremental-run "true"}))))
      (is (prometheus-test/approx= 1
                                   (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                                            {:type "processed" :full-incremental-run "true"}))))
      (is (prometheus-test/approx= 0
                                   (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                                            {:type "available" :full-incremental-run "false"})))))
    (testing "Asymmetric inputs are dropped — keeping sum(available) over the same population as sum(processed)"
      ;; This is the load-bearing invariant: if rows-processed is missing, rows-available
      ;; must NOT be emitted either, otherwise dashboards comparing the two sides see
      ;; orphaned observations on the available side and infer phantom attrition.
      (analytics/clear! :metabase-transforms/incremental-rows)
      (transforms.instrumentation/record-incremental-rows! 100 nil false)
      (transforms.instrumentation/record-incremental-rows! nil 100 false)
      (is (prometheus-test/approx= 0
                                   (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                                            {:type "available" :full-incremental-run "false"}))))
      (is (prometheus-test/approx= 0
                                   (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                                            {:type "processed" :full-incremental-run "false"})))))
    (testing "Zero-row window is a valid observation — the empty incremental window must show up in the metric"
      (analytics/clear! :metabase-transforms/incremental-rows)
      (transforms.instrumentation/record-incremental-rows! 0 0 false)
      (is (prometheus-test/approx= 1
                                   (:count (mt/metric-value system :metabase-transforms/incremental-rows
                                                            {:type "available" :full-incremental-run "false"}))))
      (is (prometheus-test/approx= 0
                                   (:sum (mt/metric-value system :metabase-transforms/incremental-rows
                                                          {:type "available" :full-incremental-run "false"})))))))
