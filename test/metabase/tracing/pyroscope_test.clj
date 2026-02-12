(ns metabase.tracing.pyroscope-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.tracing.pyroscope :as pyroscope]))

(set! *warn-on-reflection* true)

(deftest available?-without-agent-test
  (testing "available? returns false when pyroscope.jar is not on the classpath"
    (is (false? (pyroscope/available?)))))

(deftest set-profiling-context!-noop-without-agent-test
  (testing "set-profiling-context! is a safe no-op when Pyroscope is not available"
    (is (nil? (pyroscope/set-profiling-context! "abcdef0123456789" "api.request")))))

(deftest clear-profiling-context!-noop-without-agent-test
  (testing "clear-profiling-context! is a safe no-op when Pyroscope is not available"
    (is (nil? (pyroscope/clear-profiling-context!)))))

(deftest set-profiling-context!-invalid-span-id-test
  (testing "set-profiling-context! handles invalid span IDs gracefully"
    ;; Even if Pyroscope were available, these should not throw
    (is (nil? (pyroscope/set-profiling-context! "" "api.request")))
    (is (nil? (pyroscope/set-profiling-context! "not-hex" "api.request")))
    (is (nil? (pyroscope/set-profiling-context! nil "api.request")))))

(deftest repeated-calls-are-safe-test
  (testing "rapid set/clear cycles don't throw or leak state"
    (dotimes [_ 100]
      (pyroscope/set-profiling-context! "abcdef0123456789" "test.span")
      (pyroscope/clear-profiling-context!))))
