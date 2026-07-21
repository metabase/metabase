(ns metabase.channel.render.js.graal-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.graal :as graal]
   [metabase.test :as mt])
  (:import
   (org.graalvm.polyglot Context PolyglotException Value)))

(set! *warn-on-reflection* true)

(deftest make-context-test
  (testing "can make a context that evaluates javascript"
    (let [context (graal/create-context)]
      (graal/load-js-string context "function plus (x, y) { return x + y }" "plus test")
      (is (= 3 (.asLong (graal/execute-fn-name context "plus" 1 2))))))
  (testing "can invoke closures return from that javascript"
    (let [context (graal/create-context)]
      (graal/load-js-string context "function curry_plus (x) { return function (y) { return x + y}}"
                            "curried function test")
      (let [curried (graal/execute-fn-name context "curry_plus" 1)]
        (is (= 3 (.asLong (graal/execute-fn curried 2))))))))

(deftest concurrent-execution-with-locking-test
  (testing "concurrent execution on a shared context is safe when callers hold its monitor"
    (let [context (graal/create-context)]
      (graal/load-js-string context "function plus (x, y) { return x + y }" "plus test")
      (is (= (repeat 10 2)
             (mt/repeat-concurrently 10
                                     #(locking context
                                        (.asLong (graal/execute-fn-name context "plus" 1 1)))))))))

(deftest untrusted-plugin-context-denies-host-access-test
  (testing "the SandboxPolicy/UNTRUSTED isolate runs untrusted plugin JS with no host interop"
    (let [^Context context (graal/untrusted-plugin-context)]
      (try
        (testing "ordinary JS still evaluates, so the sandbox isn't just broken"
          (is (= "3" (.asString ^Value (graal/load-js-string context "'' + (1 + 2)" "ok.js")))))
        (testing "the `Java` host-interop global is absent"
          (is (= "undefined" (.asString ^Value (graal/load-js-string context "typeof Java" "typeof.js")))))
        (testing "untrusted guest code cannot reach host classes (no sandbox escape)"
          (is (thrown? PolyglotException
                       (graal/load-js-string context "Java.type('java.lang.System')" "escape.js"))))
        (finally
          (.close context true))))))

(deftest untrusted-plugin-context-load-resource-test
  (testing "load-resource evals into the UNTRUSTED isolate (regression: a URL-backed Source fails to marshal
            across the native-isolate boundary from a jar: URL — SourceCopyMarshaller ShouldNotReachHere — so
            load-resource must build a literal Source from the resource content)"
    (let [^Context context (graal/untrusted-plugin-context)]
      (try
        ;; a tiny JS resource on the test classpath; the point is that load-resource (not load-js-string)
        ;; succeeds against the isolate, which is what breaks when the Source is URL-backed.
        (graal/load-resource context "metabase/channel/render/js/engine_test_resource.js")
        (is (= 3 (.asLong (graal/execute-fn-name context "engine_test_plus" 1 2))))
        (finally
          (.close context true))))))

(deftest untrusted-plugin-context-enforces-heap-limit-test
  (testing "sandbox.MaxHeapMemory terminates a plugin that exhausts the isolate heap"
    (let [^Context context (graal/untrusted-plugin-context)
          ;; Retain a steadily growing list of materialized arrays until the per-context heap cap
          ;; (`sandbox.MaxHeapMemory`) is hit. A single huge allocation can slip past the sampling-based limit, but
          ;; sustained retention cannot. This stays within the isolate's own heap, so the host JVM
          ;; isn't the one running out of memory.
          ex      (try
                    (graal/load-js-string
                     context
                     "var a = []; for (var i = 0; i < 1e7; i++) { a.push(new Array(50000).fill(i)); } a.length"
                     "oom.js")
                    nil
                    (catch PolyglotException e e))]
      (try
        (is (some? ex) "expected the runaway allocation to be terminated, not to complete")
        (is (and ex (.isResourceExhausted ^PolyglotException ex))
            "termination should be resource exhaustion (heap limit), not some other error")
        (finally
          (.close context true))))))
