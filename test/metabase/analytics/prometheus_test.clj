(ns metabase.analytics.prometheus-test
  (:require
   [clj-http.client :as http]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [iapetos.registry :as registry]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.app-db.connection-pool-setup :as mdb.connection-pool-setup]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.global-system.system :as global-system]
   [metabase.global-system.test-util :as global-system.tu]
   [metabase.search.engine :as search.engine]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u])
  (:import
   (com.mchange.v2.c3p0 DataSources)
   (io.prometheus.client Collector GaugeMetricFamily)
   (java.lang.management ManagementFactory)
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
    "jetty_request_time_seconds_total"
    "quartz_tasks_executed"
    "quartz_tasks_states"})

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

(defn- start-daemon-thread! ^Thread [^String thread-name f]
  (doto (Thread. ^Runnable f thread-name)
    (.setDaemon true)
    (.start)))

(deftest connection-pool-info-does-not-deadlock-pool-construction-test
  (testing "reading pool stats while another thread builds a pool must not deadlock (swaldman/c3p0#95)"
    ;; The application, Quartz and semantic-search pools are built outside the warehouse pool guard. A scrape that
    ;; overlapped one of those constructions used to deadlock inside c3p0 (JMX read locks the pool MBean then the
    ;; pool; construction locks them the other way round) and then hold the guard forever, so no warehouse pool could
    ;; be built afterwards. One thread scrapes continuously, one builds and destroys a fixed number of pools through
    ;; the app-db path, and a third builds a warehouse pool through the guarded path. All three must finish.
    (let [num-builds      25
          timeout-ms      10000
          stop?           (atom false)
          errors          (atom [])
          scrapes         (atom 0)
          first-scrape    (promise)
          builds-done     (promise)
          warehouse-built (promise)]
      (mt/with-temp [:model/Database db {:engine :h2, :details {:db (str "mem:" (mt/random-name))}}]
        (try
          (start-daemon-thread!
           "prometheus-test-scraper"
           (fn []
             (while (not @stop?)
               (try
                 (prometheus/connection-pool-info)
                 (swap! scrapes inc)
                 (deliver first-scrape true)
                 (catch Exception e
                   (swap! errors conj e))))))
          (start-daemon-thread!
           "prometheus-test-app-pool-builder"
           (fn []
             (dotimes [_ num-builds]
               (try
                 (let [pool (mdb.connection-pool-setup/connection-pool-data-source
                             :h2
                             (mdb.data-source/raw-connection-string->DataSource
                              (format "jdbc:h2:mem:%s" (mt/random-name))))]
                   (DataSources/destroy pool))
                 (catch Exception e
                   (swap! errors conj e))))
             (deliver builds-done true)))
          (start-daemon-thread!
           "prometheus-test-warehouse-pool-builder"
           (fn []
             ;; start once scraping is under way, so a wedged guard is what this thread would run into
             (when (true? (deref first-scrape timeout-ms false))
               (try
                 (sql-jdbc.conn/db->pooled-connection-spec (driver.u/ensure-lib-database db))
                 (deliver warehouse-built true)
                 (catch Exception e
                   (swap! errors conj e))))))
          (is (true? (deref builds-done timeout-ms false))
              "the pool-building thread did not finish its builds: a build deadlocked with a scrape")
          (is (nil? (.findDeadlockedThreads (ManagementFactory/getThreadMXBean)))
              "a scrape deadlocked with a pool construction")
          (is (pos? @scrapes) "the scrape thread never completed a read")
          (is (true? (deref warehouse-built timeout-ms false))
              "the warehouse pool build did not complete: the pool guard is wedged")
          (is (empty? @errors))
          (finally
            (reset! stop? true)
            (sql-jdbc.conn/invalidate-pool-for-db! (:id db))))))))

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
  (testing "inc throws when called with an unknown metric"
    (mt/with-prometheus-system! [_ _system]
      (is (thrown-with-msg? RuntimeException
                            #"error when updating metric"
                            (prometheus/inc! :metabase-email/unknown-metric)))))
  (testing "inc is recorded for known metrics"
    (mt/with-prometheus-system! [_ system]
      (prometheus/inc! :metabase-email/messages)
      (is (approx= 1 (mt/metric-value system :metabase-email/messages)))))
  (testing "inc with labels is correctly recorded"
    (mt/with-prometheus-system! [_ system]
      (prometheus/inc! :metabase-notification/send-ok {:payload-type :notification/card} 1)
      (is (approx= 1 (mt/metric-value system :metabase-notification/send-ok {:payload-type :notification/card}))))))

(deftest dec!-test
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

(deftest metrics-after-shutdown-test
  (testing "metric calls after shutdown do nothing, so work still draining during shutdown does not throw"
    ;; shutdown leaves no system; calling the real `shutdown!` would also stop the process-wide JVM meters
    (with-redefs [prometheus/system nil]
      (is (= {:inc     nil
              :dec     nil
              :observe nil
              :set     nil
              :clear   nil
              :system  nil}
             {:inc     (prometheus/inc! :metabase-email/messages)
              :dec     (prometheus/dec! :metabase-search/queue-size)
              :observe (prometheus/observe! :metabase-notification/wait-duration-ms
                                            {:payload-type :notification/card}
                                            5)
              :set     (prometheus/set! :metabase-search/queue-size 1)
              :clear   (prometheus/clear! :metabase-search/queue-size)
              :system  @#'prometheus/system})))))

(deftest pull-collector-test
  (testing "a pull collector implementation runs at scrape time and can update one or more declared metrics"
    (mt/with-prometheus-system! [_ system]
      (let [refresher (registry/get (:registry system)
                                    {:name "metabase_application_pull" :namespace "metabase"} nil)]
        (try
          ;; the function makes whatever metric updates it wants -- here it sets the (declared)
          ;; :metabase-search/appdb-index-size gauge
          (defmethod prometheus/pull-collector ::test [_]
            {:min-interval-s 0
             :f (fn []
                  (prometheus/set! :metabase-search/appdb-index-size 7))})
          (.collect ^Collector refresher)   ; runs the registered functions
          (is (approx= 7 (mt/metric-value system :metabase-search/appdb-index-size)))
          (finally
            (remove-method prometheus/pull-collector ::test)
            (swap! @#'prometheus/pull-collector-last-runs dissoc ::test)))))))

(deftest search-engine-metrics-test
  (let [metrics       (#'prometheus/initial-labelled-metric-values)
        engine->value (fn [metric] (u/index-by (comp :engine :labels) :value (filter (comp #{metric} :metric) metrics)))
        engines       (fn [metric] (keys (engine->value metric)))
        value         (fn [metric engine] (get (engine->value metric) (name engine)))
        sum           (fn [metric] (reduce + 0 (vals (engine->value metric))))]
    (testing "A consistent set of engines is enumerated"
      (is (= (engines :metabase-search/engine-active)
             (engines :metabase-search/engine-default))))
    (testing "The values are boolean"
      (is (set/superset? #{0 1} (set (vals (engine->value :metabase-search/engine-active)))))
      (is (set/superset? #{0 1} (set (vals (engine->value :metabase-search/engine-default))))))
    (testing "The default engine is active"
      (is (= 1 (value :metabase-search/engine-active (search.engine/default-engine)))))
    (testing "In-place can always serve, so it is always active"
      (is (= 1 (value :metabase-search/engine-active :in-place))))
    (testing "Beyond in-place, engines are active iff their index is maintained"
      (is (= (inc (count (remove #{:search.engine/in-place} (search.engine/active-engines))))
             (sum :metabase-search/engine-active))))
    (testing "There is only one default"
      (is (= 1 (sum :metabase-search/engine-default))))))

(deftest embedding-response-metrics-test
  (testing "Embedding metrics are correctly tracked"
    (mt/with-prometheus-system! [_ system]
      ;; Initialize metrics to 0
      (prometheus/inc! :metabase-sdk/response {:status "200"} 0)
      (prometheus/inc! :metabase-sdk/response {:status "404"} 0)
      (prometheus/inc! :metabase-embedding-iframe/response {:status "200"} 0)
      (prometheus/inc! :metabase-embedding-iframe/response {:status "404"} 0)
      (prometheus/inc! :metabase-embedding-iframe-full-app/response {:status "200"} 0)
      (prometheus/inc! :metabase-embedding-iframe-static/response {:status "200"} 0)
      (prometheus/inc! :metabase-embedding-public/response {:status "200"} 0)
      (prometheus/inc! :metabase-embedding-simple/response {:status "200"} 0)
      ;; Track SDK responses
      (prometheus/inc! :metabase-sdk/response {:status "200"})
      (prometheus/inc! :metabase-sdk/response {:status "404"})
      ;; Track iframe responses
      (prometheus/inc! :metabase-embedding-iframe/response {:status "200"})
      (prometheus/inc! :metabase-embedding-iframe/response {:status "404"})
      ;; Track new embedding responses
      (prometheus/inc! :metabase-embedding-iframe-full-app/response {:status "200"})
      (prometheus/inc! :metabase-embedding-iframe-static/response {:status "200"})
      (prometheus/inc! :metabase-embedding-public/response {:status "200"})
      (prometheus/inc! :metabase-embedding-simple/response {:status "200"})
      (testing "SDK response metrics are recorded correctly"
        (is (approx= 1 (mt/metric-value system :metabase-sdk/response {:status "200"})))
        (is (approx= 1 (mt/metric-value system :metabase-sdk/response {:status "404"}))))
      (testing "iframe response metrics are recorded correctly"
        (is (approx= 1 (mt/metric-value system :metabase-embedding-iframe/response {:status "200"})))
        (is (approx= 1 (mt/metric-value system :metabase-embedding-iframe/response {:status "404"}))))
      (testing "new embedding response metrics are recorded correctly"
        (is (approx= 1 (mt/metric-value system :metabase-embedding-iframe-full-app/response {:status "200"})))
        (is (approx= 1 (mt/metric-value system :metabase-embedding-iframe-static/response {:status "200"})))
        (is (approx= 1 (mt/metric-value system :metabase-embedding-public/response {:status "200"})))
        (is (approx= 1 (mt/metric-value system :metabase-embedding-simple/response {:status "200"})))))))

(deftest start-system-stops-a-system-whose-reporter-fails-test
  (testing "a start that fails after creating the system stops it again and rethrows"
    (let [stopped (atom [])]
      (with-redefs [prometheus/system nil]
        (mt/with-dynamic-fn-redefs [prometheus/make-prometheus-system (constantly ::system)
                                    prometheus/install-real-reporter! #(throw (ex-info "reporter failed" {}))
                                    prometheus/stop-system!           #(swap! stopped conj %)]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"reporter failed" (#'prometheus/start-system! 0)))
          (is (= [::system] @stopped)))))))

(deftest stop-system-carries-on-past-a-meter-that-fails-to-stop-test
  (testing "a JVM meter that fails to stop leaves the other meter, the server and the system var to be stopped as usual"
    (let [hiccup        @#'prometheus/jvm-hiccup-thread
          alloc         @#'prometheus/jvm-alloc-rate-thread
          meters-before [@hiccup @alloc]
          alloc-stopped (atom false)
          sys           (#'prometheus/make-prometheus-system 0 "stop-test-registry")]
      (try
        (reset! hiccup #(throw (ex-info "hiccup meter failed" {})))
        (reset! alloc #(reset! alloc-stopped true))
        (with-redefs [prometheus/system sys]
          (#'prometheus/stop-system! sys)
          (is (= {:alloc-stopped? true, :server-stopped? true, :system nil}
                 {:alloc-stopped?  @alloc-stopped
                  :server-stopped? (.isStopped ^Server (:web-server sys))
                  :system          @#'prometheus/system})))
        (finally
          (let [[hiccup-before alloc-before] meters-before]
            (reset! hiccup hiccup-before)
            (reset! alloc alloc-before)))))))

(deftest start-system-sets-the-var-only-after-the-reporter-installs-test
  (testing "the system var is set only once the reporter is installed, so a concurrent setup! cannot return early"
    (let [seen-while-installing (atom ::not-installed)]
      (with-redefs [prometheus/system nil]
        (mt/with-dynamic-fn-redefs [prometheus/make-prometheus-system (constantly ::system)
                                    prometheus/install-real-reporter! #(reset! seen-while-installing
                                                                               @#'prometheus/system)]
          (is (= {:returned ::system, :seen-while-installing nil, :after ::system}
                 {:returned              (#'prometheus/start-system! 0)
                  :seen-while-installing @seen-while-installing
                  :after                 @#'prometheus/system})))))))

;; a handle of its own, since the test runner has already started the real component, and stopping that in a test
;; would leave it running but unregistered
(def ^:private test-system-component
  (global-system/mutable-component-handle ::test-system (constantly nil)))

(deftest setup-starts-through-the-global-system-test
  (testing "setup! starts Prometheus through the global system, so a halt stops it, and shutdown! stops it"
    (let [stops  (atom 0)
          halts? #(global-system.tu/halts? test-system-component)]
      (with-redefs [prometheus/system           nil
                    prometheus/system-component test-system-component]
        (mt/with-dynamic-fn-redefs [prometheus/start-system! (constantly ::system)
                                    prometheus/stop-system!  (fn [_] (swap! stops inc))]
          (try
            (prometheus/setup! 0)
            (let [after-start {:halts? (halts?), :stops @stops}]
              (prometheus/shutdown!)
              (is (= {:after-start {:halts? true, :stops 0}
                      :after-stop  {:halts? false, :stops 1}}
                     {:after-start after-start
                      :after-stop  {:halts? (halts?), :stops @stops}})))
            (finally
              (global-system/stop! test-system-component))))))))
