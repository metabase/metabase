(ns metabase.prometheus-test
  (:require [clj-http.client :as http]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.prometheus :as prometheus]))

(def ^:private common-metrics
  "Common metric types from the registry"
  #{"jvm_memory_pool_bytes_committed"
  "jvm_memory_bytes_init"
  "process_max_fds"
  "jvm_memory_pool_collection_max_bytes"
  "jvm_memory_pool_bytes_used"
  "jvm_memory_bytes_max"
  "jvm_threads_daemon"
  "jvm_threads_state"
  "jvm_threads_deadlocked"
  "jvm_memory_bytes_used"
  "process_open_fds"
  "jvm_memory_pool_bytes_init"
  "jvm_memory_pool_collection_init_bytes"
  "jvm_gc_collection_seconds_count"
  "jvm_memory_objects_pending_finalization"
  "jvm_gc_collection_seconds_sum"
  "process_cpu_seconds_total"
  "jvm_memory_pool_collection_committed_bytes"
  "jvm_threads_started_total"
  "jvm_memory_pool_bytes_max"
  "jvm_memory_bytes_committed"
  "jvm_threads_current"
  "jvm_threads_peak"
  "jvm_threads_deadlocked_monitor"
  "jvm_memory_pool_collection_used_bytes"
  "process_start_time_seconds"})

(defn tags
  [lines]
  (into #{}
        (comp (filter (complement #(str/starts-with? % "#")))
              ;; lines look like "jvm_memory_pool_collection_init_bytes{pool=\"G1 Survivor Space\",} 0.0"
              (map (fn [line] (re-find #"^[_a-z]*" line))))
        lines))

(deftest web-server-test
  (let [system (#'prometheus/make-prometheus-system 0 (name (gensym "test-registry")))
        port   (.. system -web-server getURI getPort)]
    (try
      (let [metrics-in-registry (->> (http/get (format "http://localhost:%s/metrics"
                                                       port))
                                     :body
                                     str/split-lines
                                     tags)]
        (is (seq (set/intersection common-metrics metrics-in-registry))
            "Did not get metrics from the port"))
      (finally
        (prometheus/stop-web-server system)))))
