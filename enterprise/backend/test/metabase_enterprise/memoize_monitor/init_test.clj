(ns metabase-enterprise.memoize-monitor.init-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [metabase-enterprise.memoize-monitor.init :as memoize-monitor]
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest cache-object-test
  (testing "returns the backing cache of a clojure.core.memoize function (countable + measurable)"
    (let [f (memoize/memo (fn [x] (* x x)))]
      (f 1) (f 2) (f 2)
      (is (= 2 (count (#'memoize-monitor/cache-object f))))))
  (testing "returns nil for a function whose backing cache isn't reachable"
    (is (nil? (#'memoize-monitor/cache-object (fn [x] x))))
    (is (nil? (#'memoize-monitor/cache-object (clojure.core/memoize (fn [x] x)))))))

(deftest cache-stats-entries-test
  (let [stats     (#'memoize-monitor/all-cache-stats)
        by-cache  (into {} (map (juxt :cache identity)) stats)]
    (testing "one stat per monitored cache, keyed by the var's fully-qualified symbol"
      (is (= (count @#'memoize-monitor/monitored-cache-vars)
             (count stats)))
      (is (contains? by-cache "metabase.warehouse-schema.models.field/field-id->table-id"))
      (is (contains? by-cache "metabase-enterprise.serialization.dump/serialization-sorted-map")))
    (testing "entry counts are always reported"
      (doseq [{:keys [cache entries]} stats]
        (is (string? cache))
        (is (and (integer? entries) (not (neg? entries))) (str cache " entries"))))))

(deftest cache-stats-bytes-gated-on-agent-availability-test
  (testing "byte measurement is skipped when the JVM can't self-attach the measurement agent"
    (with-redefs-fn {#'memoize-monitor/memory-measurement-available? false}
      (fn []
        (doseq [{:keys [cache bytes measure-ms]} (#'memoize-monitor/all-cache-stats)]
          (is (nil? bytes) (str cache " bytes"))
          (is (nil? measure-ms) (str cache " measure-ms"))))))
  (testing "byte measurement runs when self-attach is available"
    (with-redefs-fn {#'memoize-monitor/memory-measurement-available? true}
      (fn []
        (doseq [{:keys [cache bytes measure-ms]} (#'memoize-monitor/all-cache-stats)]
          (is (and (number? measure-ms) (not (neg? measure-ms))) (str cache " measure-ms"))
          ;; bytes is nil only if the agent couldn't attach; when present it's a positive count
          (is (or (nil? bytes) (and (integer? bytes) (pos? bytes))) (str cache " bytes")))))))

(deftest pull-collector-emits-all-metrics-test
  (testing "the pull collector populates the entries, bytes, and measure-duration gauges at scrape time"
    (let [reporter (analytics.interface/get-reporter)]
      (with-redefs-fn {#'memoize-monitor/memory-measurement-available? true}
        (fn []
          (mt/with-prometheus-system! [_ system]
            (try
              (#'prometheus/install-real-reporter!)
              ;; run the pull collector's refresh fn directly (avoids interop with the registry Collector)
              ((:f (prometheus/pull-collector ::memoize-monitor/memoize-cache-sizes)))
              (let [cache "metabase.warehouse-schema.models.field/field-id->table-id"
                    labels {:cache cache}]
                ;; gauges exist and were set (entries/measure-ms always; bytes when the agent attached)
                (is (some? (mt/metric-value system :metabase-memoize/cache-size labels)))
                (is (some? (mt/metric-value system :metabase-memoize/cache-measure-duration-ms labels)))
                (is (some? (mt/metric-value system :metabase-memoize/cache-bytes labels))))
              (finally
                (analytics.interface/set-reporter! reporter)))))))))
