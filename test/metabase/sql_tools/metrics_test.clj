(ns metabase.sql-tools.metrics-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.sql-tools.metrics :as metrics]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest with-operation-timing-success-test
  (testing "with-operation-timing increments counters on success"
    (mt/with-prometheus-system! [_ system]
      (metrics/with-operation-timing [:macaw "returned-columns"]
        :ok)
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-sql-tools/operations-total
                                                       {:parser "macaw" :operation "returned-columns"})))
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-sql-tools/operations-completed
                                                       {:parser "macaw" :operation "returned-columns"})))
      (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-sql-tools/operations-failed
                                                       {:parser "macaw" :operation "returned-columns"}))))))

(deftest with-operation-timing-failure-test
  (testing "with-operation-timing increments failure counter on exception"
    (mt/with-prometheus-system! [_ system]
      (is (thrown? Exception
                   (metrics/with-operation-timing [:sqlglot "validate-query"]
                     (throw (Exception. "boom")))))
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-sql-tools/operations-total
                                                       {:parser "sqlglot" :operation "validate-query"})))
      (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-sql-tools/operations-completed
                                                       {:parser "sqlglot" :operation "validate-query"})))
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-sql-tools/operations-failed
                                                       {:parser "sqlglot" :operation "validate-query"}))))))

(deftest with-operation-timing-returns-value-test
  (testing "with-operation-timing returns the body's value"
    (mt/with-prometheus-system! [_ _system]
      (is (= :result
             (metrics/with-operation-timing [:macaw "simple-query?"]
               :result))))))

(deftest with-operation-timing-duration-test
  (testing "with-operation-timing records duration in histogram"
    (mt/with-prometheus-system! [_ system]
      (metrics/with-operation-timing [:macaw "replace-names"]
        (Thread/sleep 10))
      (let [histogram-val (mt/metric-value system :metabase-sql-tools/operation-duration-ms
                                           {:parser "macaw" :operation "replace-names"})]
        (is (pos? (:sum histogram-val)))))))

(deftest record-functions-test
  (testing "record-operation-start! increments operations-total"
    (mt/with-prometheus-system! [_ system]
      (metrics/record-operation-start! :macaw "field-references")
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-sql-tools/operations-total
                                                       {:parser "macaw" :operation "field-references"})))))
  (testing "record-operation-completion! increments completed and observes duration"
    (mt/with-prometheus-system! [_ system]
      (metrics/record-operation-completion! :sqlglot "referenced-tables" 42)
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-sql-tools/operations-completed
                                                       {:parser "sqlglot" :operation "referenced-tables"})))
      (is (prometheus-test/approx= 42 (:sum (mt/metric-value system :metabase-sql-tools/operation-duration-ms
                                                              {:parser "sqlglot" :operation "referenced-tables"}))))))
  (testing "record-operation-failure! increments failed and observes duration"
    (mt/with-prometheus-system! [_ system]
      (metrics/record-operation-failure! :macaw "add-into-clause" 100)
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-sql-tools/operations-failed
                                                       {:parser "macaw" :operation "add-into-clause"})))
      (is (prometheus-test/approx= 100 (:sum (mt/metric-value system :metabase-sql-tools/operation-duration-ms
                                                               {:parser "macaw" :operation "add-into-clause"})))))))

(deftest pool-metrics-registered-test
  (testing "Pool metrics are registered in prometheus"
    (mt/with-prometheus-system! [_ system]
      (prometheus/inc! :metabase-sql-parsing/context-timeouts)
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-sql-parsing/context-timeouts)))
      (prometheus/inc! :metabase-sql-parsing/context-acquisitions)
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-sql-parsing/context-acquisitions)))
      (prometheus/inc! :metabase-sql-parsing/context-creations)
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-sql-parsing/context-creations)))
      (prometheus/inc! :metabase-sql-parsing/context-disposals-expired)
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-sql-parsing/context-disposals-expired))))))
