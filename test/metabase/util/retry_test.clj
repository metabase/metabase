(ns ^:mb/once metabase.util.retry-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test.util :as tu]
   [metabase.util.retry :as retry])
  (:import
   (clojure.lang ExceptionInfo)
   [io.github.resilience4j.retry Retry]))

(set! *warn-on-reflection* true)

(defn test-retry-decorate-fn
  "A function that can be used in place of `send-email!`.
   Put all messages into `inbox` instead of actually sending them."
  [retry]
  (fn [f]
    (fn [& args]
      (let [callable (reify Callable (call [_] (apply f args)))]
        (.call (Retry/decorateCallable retry callable))))))

(deftest retrying-on-exception-test
  (testing "recovery possible"
    (let [f +
          retries-needed 3
          flaky-f (tu/works-after (* 2 retries-needed) f)
          retry-opts (assoc (#'retry/retry-configuration)
                            :max-attempts retries-needed
                            :max-interval-millis 1)
          retry (retry/random-exponential-backoff-retry "test-retry" retry-opts)
          retrying-f (retry/decorate flaky-f retry)
          params (range 6)]
      (is (thrown? ExceptionInfo (apply flaky-f params)))
      (is (thrown? ExceptionInfo (apply retrying-f params)))
      (is (= (apply f params) (apply retrying-f params)))))
  (testing "recovery impossible"
    (let [f +
          retries-needed 1
          flaky-f (tu/works-after retries-needed f)
          retry-opts (assoc (#'retry/retry-configuration)
                            :max-attempts retries-needed
                            :max-interval-millis 1
                            :retry-on-exception-pred #(-> % ex-data :remaining nil?))
          retry (retry/random-exponential-backoff-retry "test-retry" retry-opts)
          retrying-f (retry/decorate flaky-f retry)
          params (range 6)]
      (is (thrown? ExceptionInfo (apply retrying-f params))))))

(deftest retrying-on-result-test
  (testing "recovery possible"
    (let [a (atom 0)
          f #(swap! a inc)
          retry-opts (assoc (#'retry/retry-configuration)
                            :retry-on-result-pred odd?
                            :max-interval-millis 1)
          retry (retry/random-exponential-backoff-retry "test-retry" retry-opts)
          retrying-f (retry/decorate f retry)]
      (is (= 2 (retrying-f)))))

  (testing "recovery impossible"
    (let [f (constantly 1)
          retry-opts (assoc (#'retry/retry-configuration)
                            :retry-on-result-pred odd?
                            :max-interval-millis 1)
          retry (retry/random-exponential-backoff-retry "test-retry" retry-opts)
          retrying-f (retry/decorate f retry)]
      (is (= 1 (retrying-f))))))
