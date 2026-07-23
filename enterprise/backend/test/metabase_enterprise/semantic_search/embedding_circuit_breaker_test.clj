(ns metabase-enterprise.semantic-search.embedding-circuit-breaker-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [diehard.circuit-breaker :as dh.cb]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.embedding-health :as embedding-health]
   [metabase-enterprise.semantic-search.models.token-tracking :as token-tracking]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.analytics-interface.core :as analytics]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.llm.settings :as llm.settings]
   [metabase.test :as mt])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private test-endpoint "https://circuit-test.example/v1/embeddings")
(def ^:private test-provider ::circuit-test)
(def ^:private test-embedding-model {:provider test-provider})

(defmethod semantic.embedding/embedder-circuit-endpoint test-provider [_] test-endpoint)

(def ^:private call-through* #'semantic.embedding/call-through-embedder-breaker)
(def ^:private openai-compatible-get-embeddings-batch* #'semantic.embedding/openai-compatible-get-embeddings-batch)
(def ^:private validate-embeddings!* #'semantic.embedding/validate-embeddings!)

(defn- call-through [thunk & {:as opts}]
  (apply call-through* thunk (mapcat identity (merge {:endpoint test-endpoint} opts))))

(defn- circuit-state
  ([] (circuit-state test-endpoint))
  ([endpoint] (semantic.embedding/embedder-circuit-state endpoint)))

(defn- boom [] (throw (ex-info "embedder down" {:kind :boom})))

(deftest embedder-circuit-endpoint-is-a-provider-capability-test
  (testing "providers without a remote circuit endpoint remain trusted"
    (mt/with-temporary-setting-values [semantic-search-embedder-circuit-breaker-enabled true]
      (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model
                                  (constantly {:provider ::in-process})]
        (is (nil? (semantic.embedding/embedder-circuit-state)))
        (is (false? (semantic.embedding/embedder-circuit-untrusted?))))))
  (testing "remote providers resolve the same endpoint their HTTP implementation uses"
    (is (= "http://localhost:11434/api/embeddings"
           (semantic.embedding/embedder-circuit-endpoint {:provider "ollama"})))
    (mt/with-dynamic-fn-redefs
      [semantic.settings/ee-embedding-service-base-url (constantly "https://embed.example/")
       semantic.settings/ee-embedding-service-api-key  (constantly "test-key")
       llm.settings/ai-service-base-url                 (constantly nil)]
      (is (= "https://embed.example/v1/embeddings"
             (semantic.embedding/embedder-circuit-endpoint {:provider "ai-service"}))))
    (mt/with-dynamic-fn-redefs
      [semantic.settings/openai-api-base-url (constantly "https://openai.example")
       semantic.settings/openai-api-key      (constantly "test-key")]
      (is (= "https://openai.example/v1/embeddings"
             (semantic.embedding/embedder-circuit-endpoint {:provider "openai"}))))))

(deftest ^:sequential request-failure-does-not-change-service-failure-history-test
  (testing "request- and model-specific failures neither trip the circuit nor reset service-failure history"
    (let [breaker (dh.cb/circuit-breaker {:failure-threshold 2 :success-threshold 1 :delay-ms 60000})]
      (with-redefs [semantic.embedding/embedder-circuit-breakers (atom {test-endpoint breaker})]
        (is (thrown? Exception (call-through boom)))
        (doseq [request-error [(ex-info "bad request" {:status 400})
                               (ex-info "model not found" {:status 404})
                               (ex-info "wrong dimensions" {:cause :embedder/unexpected-dimensions})]]
          (is (thrown? Exception (call-through #(throw request-error)))))
        (is (= :closed (circuit-state)))
        (is (thrown? Exception (call-through boom)))
        (is (= :open (circuit-state)))))))

(deftest ^:sequential unexpected-dimensions-do-not-trip-breaker-test
  (testing "dimensions are model-specific, so an otherwise valid response does not count as a service failure"
    (with-redefs [semantic.embedding/embedder-circuit-breakers
                  (atom {test-endpoint (dh.cb/circuit-breaker
                                        {:failure-threshold 1 :success-threshold 1 :delay-ms 60000})})]
      (is (=? {:cause               :embedder/unexpected-dimensions
               :expected-dimensions 1
               :actual-dimensions   2}
              (try
                (call-through #(validate-embeddings!* [[0.0 1.0]] 1 1))
                nil
                (catch clojure.lang.ExceptionInfo e
                  (ex-data e)))))
      (is (= :closed (circuit-state))))))

(deftest ^:sequential invalid-vector-values-trip-breaker-test
  (testing "nonnumeric and non-finite values are invalid service responses"
    (doseq [[label value] [["nonnumeric" ::not-a-number]
                           ["NaN" Double/NaN]
                           ["positive infinity" Double/POSITIVE_INFINITY]
                           ["negative infinity" Double/NEGATIVE_INFINITY]]]
      (testing label
        (with-redefs [semantic.embedding/embedder-circuit-breakers
                      (atom {test-endpoint (dh.cb/circuit-breaker
                                            {:failure-threshold 1 :success-threshold 1 :delay-ms 60000})})]
          (is (instance? Exception
                         (try
                           (call-through #(validate-embeddings!* [[value]] 1 1))
                           nil
                           (catch Exception e
                             e))))
          (is (= :open (circuit-state))))))))

(deftest ^:sequential opens-after-threshold-and-fast-fails-test
  (testing "consecutive failures trip the breaker; while open, calls fast-fail with the mapped 502 ex-info"
    ;; A fresh breaker (short threshold, stays open) so the test is isolated from the process-wide default.
    (with-redefs [semantic.embedding/embedder-circuit-breakers
                  (atom {test-endpoint (dh.cb/circuit-breaker
                                        {:failure-threshold 2 :success-threshold 1 :delay-ms 60000})})]
      (dotimes [_ 2]
        (is (thrown? Exception (call-through boom))))
      (is (= :open (circuit-state)))
      (is (=? {:cause :embedder/circuit-open :status 502}
              (try (call-through (constantly :never)) nil
                   (catch clojure.lang.ExceptionInfo e (ex-data e))))))))

(deftest ^:sequential circuit-open-fast-failure-does-not-log-request-error-test
  (testing "the breaker transition reports the outage without an error log for every guarded request"
    (with-redefs [semantic.embedding/embedder-circuit-breakers
                  (atom {test-endpoint (dh.cb/circuit-breaker
                                        {:failure-threshold 1 :success-threshold 1 :delay-ms 60000})})]
      (is (thrown? Exception (call-through boom)))
      (mt/with-log-messages-for-level [messages [metabase-enterprise.semantic-search.embedding :error]]
        (is (=? {:cause :embedder/circuit-open :status 502}
                (try
                  (openai-compatible-get-embeddings-batch*
                   {:provider          "test"
                    :endpoint          test-endpoint
                    :model-name        "test-model"
                    :vector-dimensions 1
                    :texts             ["text"]
                    :record-tokens?    false})
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    (ex-data e)))))
        (is (empty? (messages)))))))

(deftest ^:sequential throwable-releases-half-open-permit-test
  (testing "a JVM-level failure cannot strand the breaker's only half-open trial permit"
    (let [breaker (dh.cb/circuit-breaker
                   {:failure-threshold 1 :success-threshold 1 :delay-ms 0})]
      (with-redefs [semantic.embedding/embedder-circuit-breakers (atom {test-endpoint breaker})]
        (is (thrown? Exception (call-through boom)))
        (is (thrown? AssertionError (call-through #(throw (AssertionError. "fatal")))))
        (is (= :ok (call-through (constantly :ok))))
        (is (= :closed (circuit-state)))))))

(deftest ^:sequential interruption-releases-half-open-permit-test
  (testing "an interruption propagates unchanged and cannot strand the breaker's half-open trial permit"
    (let [breaker     (dh.cb/circuit-breaker
                       {:failure-threshold 1 :success-threshold 1 :delay-ms 0})
          interrupted (InterruptedException. "cancelled")]
      (with-redefs [semantic.embedding/embedder-circuit-breakers (atom {test-endpoint breaker})]
        (is (thrown? Exception (call-through boom)))
        (is (identical? interrupted
                        (try
                          (call-through #(throw interrupted))
                          nil
                          (catch InterruptedException e
                            e))))
        (is (= :ok (call-through (constantly :ok))))
        (is (= :closed (circuit-state)))))))

(deftest ^:sequential local-bookkeeping-failure-does-not-trip-breaker-test
  (testing "a token-tracking failure propagates without being attributed to the embedding service"
    (with-redefs [semantic.embedding/embedder-circuit-breakers
                  (atom {"https://example.test/v1/embeddings"
                         (dh.cb/circuit-breaker
                          {:failure-threshold 1, :success-threshold 1, :delay-ms 60000})})]
      (mt/with-dynamic-fn-redefs
        [http/post                    (constantly {:body (str "{\"usage\":{\"total_tokens\":0},"
                                                              "\"data\":[{\"embedding\":\"AAAAAA==\"}]}")})
         analytics/inc!               (constantly nil)
         token-tracking/record-tokens (fn [& _] (throw (ex-info "appdb unavailable" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"appdb unavailable"
             (#'semantic.embedding/openai-compatible-get-embeddings-batch
              {:provider       "openai"
               :endpoint       "https://example.test/v1/embeddings"
               :api-key        "test-key"
               :model-name     "test-model"
               :vector-dimensions 1
               :texts          ["bird"]
               :record-tokens? true
               :snowplow?      false})))
        (is (= :closed (circuit-state "https://example.test/v1/embeddings")))))))

(deftest ^:sequential malformed-response-trips-breaker-test
  (testing "a successful HTTP response is not a circuit success until its vectors are validated"
    (let [endpoint "https://example.test/v1/embeddings"]
      (with-redefs [semantic.embedding/embedder-circuit-breakers
                    (atom {endpoint (dh.cb/circuit-breaker
                                     {:failure-threshold 1 :success-threshold 1 :delay-ms 60000})})]
        (mt/with-dynamic-fn-redefs
          [http/post (constantly {:body "{\"usage\":{},\"data\":[]}"})]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"unexpected number"
               (#'semantic.embedding/openai-compatible-get-embeddings-batch
                {:provider          "openai"
                 :endpoint          endpoint
                 :api-key           "test-key"
                 :model-name        "test-model"
                 :vector-dimensions 1
                 :texts             ["bird"]
                 :record-tokens?    false})))
          (is (= :open (circuit-state endpoint))))))))

(deftest ^:sequential endpoint-circuits-are-isolated-test
  (let [endpoint-a "https://a.example/v1/embeddings"
        endpoint-b "https://b.example/v1/embeddings"
        breaker    #(dh.cb/circuit-breaker
                     {:failure-threshold 1 :success-threshold 1 :delay-ms 60000})]
    (with-redefs [semantic.embedding/embedder-circuit-breakers
                  (atom {endpoint-a (breaker), endpoint-b (breaker)})]
      (is (thrown? Exception (call-through boom :endpoint endpoint-a)))
      (is (= :open (circuit-state endpoint-a)))
      (is (= :ok (call-through (constantly :ok) :endpoint endpoint-b)))
      (is (= :closed (circuit-state endpoint-b))))))

(deftest ^:sequential kill-switch-bypasses-breaker-test
  (testing "with the breaker disabled the thunk runs directly: raw exception propagates, breaker untouched"
    (with-redefs [semantic.embedding/embedder-circuit-breakers
                  (atom {test-endpoint (dh.cb/circuit-breaker
                                        {:failure-threshold 1 :success-threshold 1 :delay-ms 60000})})]
      (mt/with-temporary-setting-values [semantic-search-embedder-circuit-breaker-enabled false]
        (is (=? {:kind :boom}
                (try (call-through boom) nil (catch clojure.lang.ExceptionInfo e (ex-data e)))))
        (is (= :closed (circuit-state)) "a bypassed breaker records no failures")))))

(deftest ^:sequential probe-bypass-flag-bypasses-breaker-test
  (testing "*bypass-circuit-breaker* runs the thunk directly, without consulting or tripping the breaker"
    (with-redefs [semantic.embedding/embedder-circuit-breakers
                  (atom {test-endpoint (dh.cb/circuit-breaker
                                        {:failure-threshold 1 :success-threshold 1 :delay-ms 60000})})]
      (binding [semantic.embedding/*bypass-circuit-breaker* true]
        (is (thrown? clojure.lang.ExceptionInfo (call-through boom)))
        (is (= :closed (circuit-state)))))))

(deftest ^:sequential circuit-untrusted?-covers-half-open-test
  (testing "embedder-circuit-untrusted? is true whenever the enabled breaker isn't closed -- both :open and
           :half-open -- so the health verdict can't flap as the breaker cycles between them"
    (mt/with-temporary-setting-values [semantic-search-embedder-circuit-breaker-enabled true]
      (doseq [state [:open :half-open]]
        (mt/with-dynamic-fn-redefs [semantic.embedding/embedder-circuit-state (constantly state)]
          (is (true? (semantic.embedding/embedder-circuit-untrusted?)) (str state " reads untrusted"))))
      (mt/with-dynamic-fn-redefs [semantic.embedding/embedder-circuit-state (constantly :closed)]
        (is (false? (semantic.embedding/embedder-circuit-untrusted?)) ":closed reads trusted"))))
  (testing "disabled -> trusted regardless of raw state (calls bypass the breaker)"
    (mt/with-temporary-setting-values [semantic-search-embedder-circuit-breaker-enabled false]
      (mt/with-dynamic-fn-redefs [semantic.embedding/embedder-circuit-state (constantly :half-open)]
        (is (false? (semantic.embedding/embedder-circuit-untrusted?)))))))

(deftest embedding-problem-schedules-idle-recovery-test
  (let [recoveries (atom 0)]
    (mt/with-dynamic-fn-redefs
      [embedding-health/embedding-service-reachable? (constantly {:reachable? true, :error nil})
       semantic.embedding/embedder-circuit-untrusted? (constantly true)
       embedding-health/request-circuit-recovery! #(swap! recoveries inc)]
      (is (string? (embedding-health/embedding-problem)))
      (is (= 1 @recoveries)))))

(deftest ^:sequential open-circuit-recovery-waits-for-the-trial-window-test
  (let [breaker   (dh.cb/circuit-breaker {:failure-threshold 1 :success-threshold 1 :delay-ms 60000})
        scheduled (atom nil)]
    (with-redefs [semantic.embedding/embedder-circuit-breakers (atom {test-endpoint breaker})
                  embedding-health/recovery-state             (atom {:running? false, :last-start-ns nil})]
      (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model (constantly test-embedding-model)]
        (is (thrown? Exception (call-through boom)))
        (is (= :open (circuit-state)))
        (mt/with-dynamic-fn-redefs [embedding-health/schedule-recovery! #(reset! scheduled %)]
          (embedding-health/request-circuit-recovery!)
          (is (fn? @scheduled) "recovery is deferred until after the breaker permits a trial"))))))

(deftest ^:sequential recovery-scheduling-failure-releases-claim-test
  (let [state (atom {:running? false, :last-start-ns nil})]
    (with-redefs [embedding-health/recovery-state state]
      (mt/with-dynamic-fn-redefs
        [semantic.embedding/embedder-circuit-untrusted? (constantly true)
         embedding-health/schedule-recovery!            (fn [_] (throw (ex-info "scheduler stopped" {})))]
        (is (nil? (embedding-health/request-circuit-recovery!)))
        (is (false? (:running? @state)))))))

(deftest ^:sequential failed-idle-recovery-schedules-another-trial-test
  (let [state   (atom {:running? true, :last-start-ns 0})
        retries (atom 0)]
    (with-redefs [embedding-health/recovery-state state]
      (mt/with-dynamic-fn-redefs
        [semantic.embedding/embedder-circuit-untrusted? (constantly true)
         embedding-health/run-recovery-probe!           #(throw (ex-info "still down" {}))
         embedding-health/request-circuit-recovery!     #(swap! retries inc)]
        (#'embedding-health/recover-circuit!)
        (is (false? (:running? @state)))
        (is (= 1 @retries))))))

(deftest circuit-open-requests-idle-recovery-test
  (let [requests (atom 0)]
    (mt/with-dynamic-fn-redefs [embedding-health/request-circuit-recovery! #(swap! requests inc)]
      (#'embedding-health/request-recovery-on-open! :half-open)
      (#'embedding-health/request-recovery-on-open! :open)
      (is (= 1 @requests)))))

(deftest ^:sequential state-changes-run-serially-in-arrival-order-test
  (testing "transitions queue through one agent: a later transition's hooks can't overtake an earlier
           transition whose hook is still blocked (e.g. on a probe against a down service), so a slow
           pre-recovery check can't persist its stale result after the recovery one"
    (let [events    (atom [])
          entered   (CountDownLatch. 1)
          release   (CountDownLatch. 1)
          completed (CountDownLatch. 2)
          hook   (fn [state]
                   (when (= :half-open state)
                     (.countDown entered)
                     (.await release 5 TimeUnit/SECONDS))
                   (swap! events conj state)
                   (.countDown completed))]
      (mt/with-dynamic-fn-redefs
        [health-inspector/run-and-save-check! (constantly nil)]
        (try
          (swap! semantic.embedding/embedder-circuit-state-change-hooks conj hook)
          (#'semantic.embedding/on-embedder-circuit-state-change! :half-open)
          (is (.await entered 5 TimeUnit/SECONDS) "half-open hook did not start")
          (#'semantic.embedding/on-embedder-circuit-state-change! :closed)
          (is (= [] @events) ":closed stays queued behind the blocked :half-open run")
          (.countDown release)
          (is (.await completed 5 TimeUnit/SECONDS) "queued hooks did not finish")
          (is (= [:half-open :closed] @events))
          (finally
            (.countDown release)
            (swap! semantic.embedding/embedder-circuit-state-change-hooks disj hook)))))))
