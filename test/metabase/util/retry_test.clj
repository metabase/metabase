(ns ^:mb/once metabase.util.retry-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test.util :as tu]
   [metabase.util.retry :as retry])
  (:import
   (clojure.lang ExceptionInfo)))

(deftest retrying-on-exception-test
  (testing "recovery possible"
    (let [f +
          retries-needed 3
          flaky-f (tu/works-after (* 2 retries-needed) f)
          retry-opts {:max-attempts retries-needed, :max-interval-millis 1}
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
          retry-opts {:max-attempts retries-needed, :max-interval-millis 1
                      :retry-on-exception-pred #(-> % ex-data :remaining nil?)}
          retry (retry/random-exponential-backoff-retry "test-retry" retry-opts)
          retrying-f (retry/decorate flaky-f retry)
          params (range 6)]
      (is (thrown? ExceptionInfo (apply retrying-f params))))))

(deftest retrying-on-result-test
  (testing "recovery possible"
    (let [a (atom 0)
          f #(swap! a inc)
          retry-opts {:retry-on-result-pred odd?, :max-interval-millis 1}
          retry (retry/random-exponential-backoff-retry "test-retry" retry-opts)
          retrying-f (retry/decorate f retry)]
      (is (= 2 (retrying-f)))))

  (testing "recovery impossible"
    (let [f (constantly 1)
          retry-opts {:retry-on-result-pred odd?, :max-interval-millis 1}
          retry (retry/random-exponential-backoff-retry "test-retry" retry-opts)
          retrying-f (retry/decorate f retry)]
      (is (= 1 (retrying-f))))))
