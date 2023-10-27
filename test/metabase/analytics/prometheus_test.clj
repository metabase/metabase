(ns metabase.analytics.prometheus-test
  (:require
   [clj-http.client :as http]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [iapetos.operations :as ops]
   [iapetos.registry :as registry]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.test.fixtures :as fixtures])
  (:import
   (io.prometheus.client Collector GaugeMetricFamily)
   (org.eclipse.jetty.server Server)))

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
  Returns #{\"jvm_threads_state\" \"jvm_threads_peak\"}. "
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

(defmacro with-prometheus-system
  "Run tests with a prometheus web server and registry. Provide binding symbols in a tuple of [port system]. Port will
  be bound to the random port used for the metrics endpoint and system will be a [[PrometheusSystem]] which has a
  registry and web-server."
  [[port system] & body]
  `(let [~system ^metabase.analytics.prometheus.PrometheusSystem
         (#'prometheus/make-prometheus-system 0 (name (gensym "test-registry")))
         server#  ^Server (.web-server ~system)
         ~port   (.. server# getURI getPort)]
     (with-redefs [prometheus/system ~system]
       (try ~@body
            (finally (prometheus/stop-web-server ~system))))))

(deftest web-server-test
  (testing "Can get metrics from the web-server"
    (with-prometheus-system [port _]
      (let [metrics-in-registry (metric-tags port)]
        (is (seq (set/intersection common-metrics metrics-in-registry))
            "Did not get metrics from the port"))))
  (testing "Throws helpful message if cannot start server"
    ;; start another system on the same port
    (with-prometheus-system [port _]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Failed to initialize Prometheus on port"
                            (#'prometheus/make-prometheus-system port "test-failure"))))))

(deftest c3p0-collector-test
  (testing "Registry has c3p0 registered"
    (with-prometheus-system [_ system]
      (let [registry       (.registry system)
            c3p0-collector (registry/get registry {:name      "c3p0-stats"
                                                   :namespace "metabase_database"}
                                         nil)]
        (is c3p0-collector "c3p0 stats not found"))))
  (testing "Registry has an entry for each database in [[prometheus/connection-pool-info]]"
    (with-prometheus-system [_ system]
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
    (with-prometheus-system [port _]
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
    (with-prometheus-system [port _]
      (is (= #{"metabase_email_messages_total" "metabase_email_messages_created" "metabase_email_message_errors_total" "metabase_email_message_errors_created"}
             (->> (metric-lines port)
                  (map #(str/split % #"\s+"))
                  (map first)
                  (filter #(str/starts-with? % "metabase_email_"))
                  set))))))

(deftest inc-test
  (testing "inc has no effect if system is not setup"
    (prometheus/inc :metabase-email/messages)) ; << Does not throw.
  (testing "inc has no effect when called with unknown metric"
    (with-prometheus-system [_ _system]
      (prometheus/inc :metabase-email/unknown-metric))) ; << Does not throw.
  (testing "inc is recorded for known metrics"
    (with-prometheus-system [_ system]
      (prometheus/inc :metabase-email/messages)
      (is (< 0 (-> system :registry :metabase-email/messages ops/read-value))))))
