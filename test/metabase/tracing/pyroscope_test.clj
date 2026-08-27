(ns metabase.tracing.pyroscope-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.tracing.core :as tracing]))

(set! *warn-on-reflection* true)

(deftest pyroscope-available?-without-agent-test
  (testing "pyroscope-available? returns false when pyroscope.jar is not on the classpath"
    (is (false? (tracing/pyroscope-available?)))))

(deftest set-pyroscope-context!-noop-without-agent-test
  (testing "set-pyroscope-context! is a safe no-op when Pyroscope is not available"
    ;; nil span is safe because the when-let guard prevents any execution
    (is (nil? (tracing/set-pyroscope-context! nil "abcdef0123456789" "api.request")))))

(deftest clear-pyroscope-context!-noop-without-agent-test
  (testing "clear-pyroscope-context! is a safe no-op when Pyroscope is not available"
    (is (nil? (tracing/clear-pyroscope-context!)))))

(deftest set-pyroscope-context!-invalid-span-id-test
  (testing "set-pyroscope-context! handles invalid span IDs gracefully"
    ;; Even if Pyroscope were available, these should not throw
    (is (nil? (tracing/set-pyroscope-context! nil "" "api.request")))
    (is (nil? (tracing/set-pyroscope-context! nil "not-hex" "api.request")))
    (is (nil? (tracing/set-pyroscope-context! nil nil "api.request")))))

(deftest repeated-calls-are-safe-test
  (testing "rapid set/clear cycles don't throw or leak state"
    (dotimes [_ 100]
      (tracing/set-pyroscope-context! nil "abcdef0123456789" "test.span")
      (tracing/clear-pyroscope-context!))))
