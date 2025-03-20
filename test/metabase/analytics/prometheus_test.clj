(ns metabase.analytics.prometheus-test
  (:require
   [clj-http.client :as http]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [iapetos.registry :as registry]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u])
  (:import
   (io.prometheus.client Collector GaugeMetricFamily)))

(set! *warn-on-reflection* true)

;; ensure a handler to instrument with jetty_stats and a db so the c3p0 stats have at least one connection
(use-fixtures :once (fixtures/initialize :db :web-server))

(def ^:private common-metrics
  "Common metric types from the registry"
  #{"c3p0_max_pool_size"
    "c3p0_min_pool_size"
    "c3p0_num_busy_connections"
    "c3p0_num_connections"
    "c3p0_num_idle_connections"
    "jetty_async_dispatches_total"
    "jetty_async_requests_total"
    "jetty_async_requests_waiting"
    "jetty_async_requests_waiting_max"
    "jetty_dispatched_active"
    "jetty_dispatched_active_max"
    "jetty_dispatched_time_max"
    "jetty_dispatched_time_seconds_total"
    "jetty_dispatched_total"
    "jetty_expires_total"
    "jetty_request_time_max_seconds"
    "jetty_requests_active"
    "jetty_requests_active_max"
    "jetty_requests_total"
    "jetty_responses_bytes_total"
    "jetty_responses_total"
    "jetty_stats_seconds"
    "jvm_gc_collection_seconds_count"
    "jvm_gc_collection_seconds_sum"
    "jvm_memory_bytes_committed"
    "jvm_memory_bytes_init"
    "jvm_memory_bytes_max"
    "jvm_memory_bytes_used"
    "jvm_memory_objects_pending_finalization"
    "jvm_memory_pool_bytes_committed"
    "jvm_memory_pool_bytes_init"
    "jvm_memory_pool_bytes_max"
    "jvm_memory_pool_bytes_used"
    "jvm_memory_pool_collection_committed_bytes"
    "jvm_memory_pool_collection_init_bytes"
    "jvm_memory_pool_collection_max_bytes"
    "jvm_memory_pool_collection_used_bytes"
    "jvm_threads_current"
    "jvm_threads_daemon"
    "jvm_threads_deadlocked"
    "jvm_threads_deadlocked_monitor"
    "jvm_threads_peak"
    "jvm_threads_started_total"
    "jvm_threads_state"
    "process_cpu_seconds_total"
    "process_max_fds"
    "process_open_fds"
    "process_start_time_seconds"
    "jetty_request_time_seconds_total"})

(defn- metric-tags
  "Returns a set of tags of prometheus metrics. Ie logs are
  ```
  jvm_threads_state{state=\"TERMINATED\",} 0.0
  jvm_threads_peak 141.0
  ```
  Returns #{\"jvm_threads_state\" \"jvm_threads_peak\"}."
  [port]
  (->> (http/get (format "http://localhost:%s/metrics"
                         port))
       :body
       str/split-lines
       (into #{}
             (comp (filter (complement #(str/starts-with? % "#")))
                   ;; lines look like "jvm_memory_pool_collection_init_bytes{pool=\"G1 Survivor Space\",} 0.0"
                   (map (fn [line] (re-find #"^[_a-z0-9]*" line)))))))

(defn- metric-lines
  "Returns a sequence of log lines with comments removed."
  [port]
  (->> (http/get (format "http://localhost:%s/metrics"
                         port))
       :body
       str/split-lines
       (remove #(str/starts-with? % "#"))))

(deftest web-server-test
  (testing "Can get metrics from the web-server"
    (mt/with-prometheus-system! [port _]
      (let [metrics-in-registry (metric-tags port)]
        (is (seq (set/intersection common-metrics metrics-in-registry))
            "Did not get metrics from the port"))))
  (testing "Throws helpful message if cannot start server"
    ;; start another system on the same port
    (mt/with-prometheus-system! [port _]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Failed to initialize Prometheus on port"
                            (#'prometheus/make-prometheus-system port "test-failure"))))))

(deftest c3p0-collector-test
  (testing "Registry has c3p0 registered"
    (mt/with-prometheus-system! [_ system]
      (let [registry       (.registry system)
            c3p0-collector (registry/get registry {:name      "c3p0-stats"
                                                   :namespace "metabase_database"}
                                         nil)]
        (is c3p0-collector "c3p0 stats not found"))))
  (testing "Registry has an entry for each database in [[prometheus/connection-pool-info]]"
    (mt/with-prometheus-system! [_ system]
      (let [registry       (.registry system)
            c3p0-collector (registry/get registry {:name      "c3p0_stats"
                                                   :namespace "metabase_database"}
                                         nil)
            _              (assert c3p0-collector "Did not find c3p0 collector")
            measurements   (.collect ^Collector c3p0-collector)
            _              (is (pos? (count measurements))
                               "No measurements taken")]
        (is (= (count (prometheus/connection-pool-info))
               (count (.samples ^GaugeMetricFamily (first measurements))))
            "Expected one entry per database for each measurement"))))
  (testing "Registry includes c3p0 stats"
    (mt/with-prometheus-system! [port _]
      (let [[db-name values] (first (prometheus/connection-pool-info))
            tag-name         (comp :label #'prometheus/label-translation)
            expected-lines   (set (for [[tag value] values]
                                    (format "%s{database=\"%s\",} %s"
                                            (tag-name tag) db-name (double value))))
            actual-lines     (into #{} (filter #(str/starts-with? % "c3p0"))
                                   (metric-lines port))]
        (is (seq (set/intersection expected-lines actual-lines))
            "Registry does not have c3p0 metrics in it")))))

(deftest email-collector-test
  (testing "Registry has email metrics registered"
    (mt/with-prometheus-system! [port _]
      (is (= #{"metabase_email_messages_total" "metabase_email_messages_created" "metabase_email_message_errors_total" "metabase_email_message_errors_created"}
             (->> (metric-lines port)
                  (map #(str/split % #"\s+"))
                  (map first)
                  (filter #(str/starts-with? % "metabase_email_"))
                  set))))))

(defn approx=
  "Check that `actual` is within `epsilon` of `expected`.

  Useful for checking near-equality of floating-point values."
  ([expected actual]
   (approx= expected actual 0.001))
  ([expected actual epsilon]
   (< (abs (- actual expected)) epsilon)))

(deftest inc!-test
  (testing "inc starts a system if it wasn't started"
    (with-redefs [prometheus/system nil]
      (mt/with-temporary-setting-values [prometheus-server-port 0]
        (prometheus/inc! :metabase-email/messages) ; << Does not throw.
        (is (approx= 1 (mt/metric-value @#'prometheus/system :metabase-email/messages))))))

  (testing "inc throws when called with an unknown metric"
    (mt/with-prometheus-system! [_ _system]
      (is (thrown-with-msg? RuntimeException
                            #"error when updating metric"
                            (analytics/inc! :metabase-email/unknown-metric)))))
  (testing "inc is recorded for known metrics"
    (mt/with-prometheus-system! [_ system]
      (prometheus/inc! :metabase-email/messages)
      (is (approx= 1 (mt/metric-value system :metabase-email/messages)))))

  (testing "inc with labels is correctly recorded"
    (mt/with-prometheus-system! [_ system]
      (prometheus/inc! :metabase-notification/send-ok {:payload-type :notification/card} 1)
      (is (approx= 1 (mt/metric-value system :metabase-notification/send-ok {:payload-type :notification/card}))))))

(deftest dec!-test
  (testing "dec starts a system if it wasn't started"
    (mt/with-temporary-setting-values [prometheus-server-port 0]
      (with-redefs [prometheus/system nil]
        (prometheus/dec! :metabase-search/queue-size) ; << Does not throw.
        (is (approx= -1 (mt/metric-value @#'prometheus/system :metabase-search/queue-size))))))

  (testing "dec throws when called with an unknown metric"
    (mt/with-prometheus-system! [_ _system]
      (is (thrown-with-msg? RuntimeException
                            #"error when updating metric"
                            (prometheus/dec! :metabase-email/unknown-metric)))))

  (testing "dec is recorded for known metrics"
    (mt/with-prometheus-system! [_ system]
      (prometheus/dec! :metabase-search/queue-size)
      (is (approx= -1 (mt/metric-value system :metabase-search/queue-size)))))

  (testing "dec with labels is correctly recorded"
    (mt/with-prometheus-system! [_ system]
      (prometheus/dec! :metabase-search/engine-active {:engine :default} 1)
      (is (approx= -1 (mt/metric-value system :metabase-search/engine-active {:engine :default}))))))

(deftest observe!-test
  (testing "observe! starts a system if it wasn't started"
    (with-redefs [prometheus/system nil]
      (mt/with-temporary-setting-values [prometheus-server-port 0]
        (prometheus/observe! :metabase-notification/send-duration-ms 2) ; << Does not throw.
        (is (approx= 2 (:sum (mt/metric-value @#'prometheus/system :metabase-notification/send-duration-ms)))))))

  (testing "observe! with labels is correctly recorded"
    (mt/with-prometheus-system! [_ system]
      (prometheus/observe! :metabase-notification/send-duration-ms {:payload-type :notification/card} 2)
      (is (approx= 2 (:sum (mt/metric-value system :metabase-notification/send-duration-ms {:payload-type :notification/card}))))))

  (testing "observe! throws when called with an unknown metric"
    (mt/with-prometheus-system! [_ _system]
      (is (thrown-with-msg? RuntimeException
                            #"error when updating metric"
                            (prometheus/observe! :metabase-email/unknown-metric 1))))))

(deftest search-engine-metrics-test
  (let [metrics       (#'prometheus/initial-labelled-metric-values)
        engine->value (fn [metric] (u/index-by (comp :engine :labels) :value (filter (comp #{metric} :metric) metrics)))
        engines       (fn [metric] (keys (engine->value metric)))
        value         (fn [metric engine] (get (engine->value metric) (name engine)))
        sum           (fn [metric] (reduce + 0 (vals (engine->value metric))))]
    (testing "A consistent set of engines is enumerated"
      (is (= (engines :metabase-search/engine-active)
             (engines :metabase-search/engine-active))))
    (testing "The values are boolean"
      (is (set/superset? #{0 1} (set (vals (engine->value :metabase-search/engine-active)))))
      (is (set/superset? #{0 1} (set (vals (engine->value :metabase-search/engine-default))))))
    (testing "Legacy search is always active"
      (is (= 1 (value :metabase-search/engine-active :in-place))))
    (testing "There is at least one other active engine iff we support an index."
      (if (search/supports-index?)
        (is (< 1 (sum :metabase-search/engine-active)))
        (is (= 1 (sum :metabase-search/engine-active)))))
    (testing "There is only one default"
      (is (= 1 (sum :metabase-search/engine-default))))))
