(ns metabase.analytics.metaplow-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [diehard.circuit-breaker :as dh.cb]
   [metabase.analytics.metaplow :as metaplow]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [metabase.util.retry :as retry]
   [metabase.version.core :as version])
  (:import
   (dev.failsafe CircuitBreaker)
   (java.net ConnectException)
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- send-stub
  "Returns `[attempts stub]`, where `stub` stands in for [[metabase.analytics.metaplow/send-event!]] and `attempts`
  counts the calls to it. `stub` hands back `responses` in order, repeating the last once exhausted, after sleeping
  `sleep-ms` to stand in for a slow collector. After `limit` calls it switches to a non-retryable status, so a retry
  policy that has gone unbounded fails an assertion loudly instead of hanging the run."
  [responses & {:keys [limit sleep-ms] :or {limit 20 sleep-ms 0}}]
  (let [attempts  (atom 0)
        responses (vec responses)]
    [attempts (fn [_payload]
                (let [n (swap! attempts inc)]
                  (when (pos? sleep-ms)
                    (Thread/sleep (long sleep-ms)))
                  (if (> n limit)
                    {:status 400}
                    (nth responses (min (dec n) (dec (count responses)))))))]))

(defmacro ^:private with-fast-retries
  "Run `body` under the real retry policy with its backoff collapsed, so tests that exhaust retries don't sleep for
  seconds. The attempt count and the duration ceiling still come from the policy itself.

  Only for sends driven directly from the test thread. `pipeline-blocking` captures its workers' dynamic bindings
  once, when the first event of the JVM is enqueued, so wrapping a [[metabase.analytics.metaplow/track-event!]] call
  in this would pin the collapsed backoff for the rest of the run."
  [& body]
  `(binding [retry/*test-time-config-hook* #(assoc % :backoff-ms [1 2])]
     ~@body))

(deftest build-payload-test
  (testing "Schemas with an `:event` key produce `<schema>.<event>` and the event key is removed from data"
    (let [payload (#'metaplow/build-payload :snowplow/dashboard
                                            {:event :dashboard-created :dashboard-id 42 :num-tabs 1})]
      (is (=? {:type    "event"
               :payload {:name "dashboard.dashboard_created"
                         :data {"dashboard_id" 42
                                "num_tabs"     1}}}
              payload))
      (is (not (contains? (get-in payload [:payload :data]) "event")))))
  (testing "Schemas without an `:event` key produce `<schema>` and keep the full payload"
    (is (=? {:payload {:name "instance_stats"
                       :data {"metric_one" 1
                              "metric_two" 2}}}
            (#'metaplow/build-payload :snowplow/instance_stats {:metric_one 1 :metric_two 2}))))
  (testing "Top-level payload has the expected keys: website / id / hostname / tag / name / data"
    (let [{:keys [payload]} (#'metaplow/build-payload :snowplow/dashboard {:event :dashboard-created})]
      (is (= #{:website :id :hostname :tag :name :data} (set (keys payload))))
      (is (=? {:website  string?
               :id       (analytics.settings/analytics-uuid)
               :hostname "anonymous.metabase.com"
               :tag      "metabase-instance"}
              payload))))
  (testing "`data` is enriched with version_tag and plan on every event"
    (is (=? {:payload {:data {"version_tag" (:tag (version/version))
                              "plan"        string?}}}
            (#'metaplow/build-payload :snowplow/dashboard {:event :dashboard-created}))))
  (testing "Keyword keys and values become snake_case strings"
    (is (=? {:payload {:name "database.database_connection_successful"
                       :data {"database"    "postgres"
                              "database_id" 1
                              "source"      "admin"}}}
            (#'metaplow/build-payload :snowplow/database
                                      {:event       :database-connection-successful
                                       :database    :postgres
                                       :database-id 1
                                       :source      :admin}))))
  (testing "hostname matches the FE's anonymized constant regardless of site-url"
    (mt/with-temporary-setting-values [site-url "https://stats.metabase.com/"]
      (is (=? {:payload {:hostname "anonymous.metabase.com"}}
              (#'metaplow/build-payload :snowplow/dashboard {:event :dashboard-created}))))))

(defn- track-with-collecting-enqueue!
  "Calls `track-event!` with [[metabase.analytics.metaplow/enqueue!]] stubbed out, and returns
  `[returned-value enqueued-payloads]`."
  []
  (let [collector (atom [])]
    (mt/with-dynamic-fn-redefs [metaplow/enqueue! (fn [payload]
                                                    (swap! collector conj payload)
                                                    true)]
      [(metaplow/track-event! :snowplow/dashboard {:event :dashboard-created}) @collector])))

(deftest tracking-disabled-test
  (testing "When metaplow-tracking-enabled is false the event is not enqueued and the call returns false"
    (testing "- no collector URL resolves"
      (mt/with-temporary-setting-values [anon-tracking-enabled true
                                         metaplow-url          nil]
        (is (= [false []] (track-with-collecting-enqueue!)))))
    (testing "- anonymous tracking is off, even though a collector URL resolves"
      (mt/with-temporary-setting-values [anon-tracking-enabled false
                                         metaplow-url          "http://fake-metaplow/api/send"]
        (is (= [false []] (track-with-collecting-enqueue!))))))
  (testing "With anonymous tracking on and a collector URL resolved, the event is enqueued"
    (mt/with-temporary-setting-values [anon-tracking-enabled true
                                       metaplow-url          "http://fake-metaplow/api/send"]
      (let [[returned payloads] (track-with-collecting-enqueue!)]
        (is (true? returned))
        (is (=? [{:payload {:name "dashboard.dashboard_created"}}] payloads))))))

(deftest send-event!-test
  (mt/with-temporary-setting-values [metaplow-url "http://fake-metaplow/api/send"]
    (testing "The collector's response is returned as-is"
      (mt/with-dynamic-fn-redefs [http/post (fn [_url _opts] {:status 200 :body "ok"})]
        (is (=? {:status 200} (#'metaplow/send-event! {:type "event"})))))
    (testing "A connection failure is caught and reported as status -1"
      (mt/with-dynamic-fn-redefs [http/post (fn [_url _opts] (throw (ConnectException. "nope")))]
        (is (= {:status -1} (#'metaplow/send-event! {:type "event"})))))
    (testing "The payload is POSTed to `metaplow-url` as JSON"
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [http/post (fn [url opts] (swap! calls conj [url opts]) {:status 200})]
          (#'metaplow/send-event! {:type "event" :payload {:name "dashboard.created"}})
          (let [[[url opts]] @calls]
            (is (= "http://fake-metaplow/api/send" url))
            (is (= :json (:content-type opts)))
            (is (= {"type" "event" "payload" {"name" "dashboard.created"}}
                   (json/decode (:body opts))))))))))

(deftest retry-policy-test
  (testing "The policy is explicit in code rather than inherited from the retry library's defaults"
    (is (=? {:max-retries     2
             :backoff-ms      [500 2000]
             :max-duration-ms 5000}
            @#'metaplow/retry-policy)))
  ;; a breaker of its own, so breaker state neither leaks in from another test nor out of this one. Plain
  ;; `with-redefs`: the var holds a CircuitBreaker, which `mt/with-dynamic-fn-redefs` rejects as a non-fn
  (with-redefs [metaplow/breaker (#'metaplow/new-breaker nil)]
    (with-fast-retries
      (testing "A permanently failing collector is attempted a bounded number of times, then given up on"
        (let [[attempts stub] (send-stub [{:status -1}])]
          (mt/with-dynamic-fn-redefs [metaplow/send-event! stub]
            (is (= :error (#'metaplow/send-event-with-retries! {:type "event"})))
            (is (= 3 @attempts) "one initial attempt plus two retries, and no more"))))
      (testing "A collector that accepts the event is called exactly once"
        (let [[attempts stub] (send-stub [{:status 200}])]
          (mt/with-dynamic-fn-redefs [metaplow/send-event! stub]
            (is (= :sent (#'metaplow/send-event-with-retries! {:type "event"})))
            (is (= 1 @attempts)))))
      (testing "A transient failure is retried and the retry's success is reported as `:sent`"
        (let [[attempts stub] (send-stub [{:status 503} {:status 200}])]
          (mt/with-dynamic-fn-redefs [metaplow/send-event! stub]
            (is (= :sent (#'metaplow/send-event-with-retries! {:type "event"})))
            (is (= 2 @attempts)))))
      (testing "A status the collector will never accept is not retried"
        (doseq [status [400 401 403 410 422]]
          (let [[attempts stub] (send-stub [{:status status}])]
            (mt/with-dynamic-fn-redefs [metaplow/send-event! stub]
              (is (= :error (#'metaplow/send-event-with-retries! {:type "event"})))
              (is (= 1 @attempts) (str "status " status " should not be retried")))))))
    (testing "An attempt that outlasts the duration ceiling is not retried, even though retries remain"
      ;; the real ceiling is 5s and `send-event!`'s own timeouts are 5s apiece, so against a collector that drops
      ;; packets rather than refusing the connection a failing event gets one attempt, not three
      ;; `update ... min` rather than `assoc`, so this fails loudly if the policy ever loses its duration ceiling
      (binding [retry/*test-time-config-hook* #(-> (update % :max-duration-ms min 10)
                                                   (assoc :backoff-ms [1 2]))]
        (let [[attempts stub] (send-stub [{:status -1}] :sleep-ms 50)]
          (mt/with-dynamic-fn-redefs [metaplow/send-event! stub]
            (is (= :error (#'metaplow/send-event-with-retries! {:type "event"})))
            (is (= 1 @attempts) "the duration ceiling stopped the retries")))))))

(deftest circuit-breaker-test
  (testing "The breaker policy is explicit in code: a failure threshold, a cooldown, and a success threshold"
    (is (=? {:failure-threshold 10
             :delay-ms          60000
             :success-threshold 1}
            @#'metaplow/breaker-config)))
  (with-fast-retries
    (testing "Ten consecutive failed events open the breaker, and further events are rejected without a send"
      (let [breaker         (#'metaplow/new-breaker nil)
            [attempts stub] (send-stub [{:status -1}] :limit 200)]
        (with-redefs [metaplow/breaker breaker]
          (mt/with-dynamic-fn-redefs [metaplow/send-event! stub]
            (is (= (repeat 10 :error)
                   (vec (repeatedly 10 #(#'metaplow/send-event-with-retries! {:type "event"}))))
                "the first ten events are attempted and fail")
            (is (= 30 @attempts) "ten events at three attempts each")
            (is (= :open (dh.cb/state breaker)))
            (reset! attempts 0)
            (is (= :rejected (#'metaplow/send-event-with-retries! {:type "event"})))
            (is (zero? @attempts) "no send is attempted while the breaker is open")))))
    (testing "A success closes the breaker again once it half-opens"
      (let [breaker (#'metaplow/new-breaker nil)]
        (with-redefs [metaplow/breaker breaker]
          (let [[_ fail] (send-stub [{:status -1}] :limit 200)]
            (mt/with-dynamic-fn-redefs [metaplow/send-event! fail]
              (dotimes [_ 10] (#'metaplow/send-event-with-retries! {:type "event"}))
              (is (= :open (dh.cb/state breaker)))))
          ;; stand in for the 60-second cooldown elapsing, rather than racing a timer
          (.halfOpen ^CircuitBreaker breaker)
          (let [[attempts ok] (send-stub [{:status 200}])]
            (mt/with-dynamic-fn-redefs [metaplow/send-event! ok]
              (is (= :sent (#'metaplow/send-event-with-retries! {:type "event"}))
                  "the half-open probe is let through")
              (is (= 1 @attempts))
              (is (= :closed (dh.cb/state breaker)))))
          (testing "and a later failure is attempted rather than rejected"
            (let [[attempts fail] (send-stub [{:status -1}])]
              (mt/with-dynamic-fn-redefs [metaplow/send-event! fail]
                (is (= :error (#'metaplow/send-event-with-retries! {:type "event"})))
                (is (= 3 @attempts))))))))))

(deftest error-metrics-test
  (mt/with-prometheus-system! [_ system]
    (let [errors (fn [stage]
                   (or (mt/metric-value system :metabase-metaplow/errors {:stage stage}) 0.0))]
      (testing "A failed outbound attempt is counted against the send stage"
        (mt/with-temporary-setting-values [metaplow-url "http://fake-metaplow/api/send"]
          (mt/with-dynamic-fn-redefs [http/post (fn [_url _opts] (throw (ConnectException. "nope")))]
            (#'metaplow/send-event! {:type "event"})))
        (is (= 1.0 (errors :send-event!))))
      (with-fast-retries
        (let [[_ fail] (send-stub [{:status -1}] :limit 200)]
          (with-redefs [metaplow/breaker (#'metaplow/new-breaker nil)]
            (mt/with-dynamic-fn-redefs [metaplow/send-event! fail]
              (testing "Giving up on an event is counted against the delivery stage"
                (#'metaplow/send-event-with-retries! {:type "event"})
                (is (= 1.0 (errors :send-event-with-retries!)))
                (is (= 0.0 (errors :circuit-breaker-open))))
              (testing "A breaker rejection is counted under its own stage, distinct from a delivery failure"
                (dotimes [_ 9] (#'metaplow/send-event-with-retries! {:type "event"}))
                (is (= 10.0 (errors :send-event-with-retries!)))
                (#'metaplow/send-event-with-retries! {:type "event"})
                (is (= 1.0 (errors :circuit-breaker-open)))
                (is (= 10.0 (errors :send-event-with-retries!))
                    "a rejected event is not also counted as a delivery failure")))))))))

(deftest pipeline-integration-test
  (mt/with-temporary-setting-values [metaplow-url "http://fake-metaplow/api/send"
                                     anon-tracking-enabled true]
    ;; a breaker of its own, so an unrelated test that left the process-wide one open can't make this one flake
    #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
    (with-redefs [metaplow/breaker (#'metaplow/new-breaker nil)]
      (testing "track-event! enqueues onto the real channel and a pipeline worker POSTs the payload"
        (let [received (promise)]
          ;; the pipeline's worker threads are spawned once from a defonce delay, so they never inherit a
          ;; test's *local-redefs*; only a root swap reaches them
          #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
          (with-redefs [metaplow/send-event! (fn [payload]
                                               (deliver received payload)
                                               {:status 200})]
            (is (true? (metaplow/track-event! :snowplow/dashboard {:event :dashboard-created :dashboard-id 7})))
            (let [payload (deref received 1000 ::timeout)]
              (is (not= ::timeout payload)
                  "Worker did not consume the event within 1s")
              (when (not= ::timeout payload)
                (is (=? {:type    "event"
                         :payload {:name "dashboard.dashboard_created"
                                   :data {"dashboard_id" 7}}}
                        payload)))))))
      (testing "Sending 200 events: all of them traverse the pipeline"
        (let [received (atom [])
              latch    (CountDownLatch. 200)]
          ;; the pipeline's worker threads are spawned once from a defonce delay, so they never inherit a
          ;; test's *local-redefs*; only a root swap reaches them
          #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
          (with-redefs [metaplow/send-event! (fn [payload]
                                               (swap! received conj payload)
                                               (.countDown latch)
                                               {:status 200})]
            (doseq [i (range 1 201)]
              (metaplow/track-event! :snowplow/dashboard {:event :dashboard-created :dashboard-id i}))
            (is (true? (.await latch 1 TimeUnit/SECONDS))
                "Pipeline did not process all 200 events within 1s")
            (is (= 200 (count @received)))
            (is (= (set (range 1 201))
                   (set (map #(get-in % [:payload :data "dashboard_id"]) @received))))))))))
