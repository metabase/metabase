(ns metabase-enterprise.memoize-monitor.init-test
  (:require
   [clj-memory-meter.core :as mm]
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [metabase-enterprise.memoize-monitor.init :as memoize-monitor]
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.test :as mt]
   [metabase.util.log :as log]))

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
          ;; bytes is nil only if the agent couldn't attach; otherwise a non-negative estimate (0 for an empty cache)
          (is (or (nil? bytes) (and (integer? bytes) (not (neg? bytes)))) (str cache " bytes")))))))

(defn- big-complex-cache
  "A clojure.core.memoize cache populated with `n` entries whose keys and values resemble real cached data:
  map/vector keys (field/query refs) and nested map+string+vector values."
  [n]
  (let [f (memoize/memo
           (fn [field-ref opts]
             {:field-ref      field-ref
              :options        opts
              :display-name   (str "Column " (second field-ref))
              :effective-type :type/Text
              :fingerprint    {:global {:distinct-count (* 7 (second field-ref))}
                               :type   {:type/Text {:percent-json 0.0
                                                    :average-length 12.3}}}
              :history        (vec (repeat 10 {:ts (str "2026-06-" (mod (second field-ref) 30))
                                               :by  (str "user-" (second field-ref))}))}))]
    (doseq [i (range n)]
      (f [:field i {:base-type :type/Text, :join-alias (str "j_" i)}]
         {:source-table i, :aggregation [[:count] [:sum [:field i nil]]], :breakout [[:field i nil]]}))
    f))

(deftest large-cache-measurement-cost-test
  (testing "estimating bytes of a 1000-entry cache with complex keys/values via sampling"
    (let [cache (#'memoize-monitor/cache-object (big-complex-cache 1000))]
      (is (= 1000 (count cache)))
      (if @#'memoize-monitor/memory-measurement-available?
        (let [start-ns   (System/nanoTime)
              estimate   (#'memoize-monitor/estimate-cache-bytes cache (count cache))
              measure-ms (/ (- (System/nanoTime) start-ns) 1e6)
              actual     (mm/measure cache :bytes true)
              ratio      (/ (double estimate) actual)]
          (is (pos? estimate))
          (is (and (number? measure-ms) (not (neg? measure-ms))))
          ;; the sampled estimate should land within a small factor of a full-cache measurement
          (is (< 0.25 ratio 4.0) (format "estimate %d vs actual %d (ratio %.2f)" estimate actual ratio))
          ;; surface the cost: sampling is what the monitor actually pays on each scrape
          (log/infof "[memoize-monitor] 1000-entry complex cache: est %,d bytes (actual %,d, ratio %.2f) sampled in %.2f ms"
                     (long estimate) (long actual) (double ratio) (double measure-ms)))
        (log/info "[memoize-monitor] skipping byte-measurement cost test: JVM self-attach unavailable")))))

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
              (let [cache  "metabase.warehouse-schema.models.field/field-id->table-id"
                    labels {:cache cache}]
                ;; gauges exist and were set (entries/measure-ms always; bytes when the agent attached)
                (is (some? (mt/metric-value system :metabase-memoize/cache-size labels)))
                (is (some? (mt/metric-value system :metabase-memoize/cache-measure-duration-ms labels)))
                (is (some? (mt/metric-value system :metabase-memoize/cache-bytes labels))))
              (finally
                (analytics.interface/set-reporter! reporter)))))))))
