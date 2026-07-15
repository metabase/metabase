(ns metabase.channel.render.js.engine-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.engine :as js]
   [metabase.test :as mt])
  (:import
   (org.graalvm.polyglot Context PolyglotException Value)))

(set! *warn-on-reflection* true)

(deftest make-context-test
  (testing "can make a context that evaluates javascript"
    (let [context (js/context)]
      (js/load-js-string context "function plus (x, y) { return x + y }" "plus test")
      (is (= 3 (.asLong (js/execute-fn-name context "plus" 1 2))))))
  (testing "can invoke closures return from that javascript"
    (let [context (js/context)]
      (js/load-js-string context "function curry_plus (x) { return function (y) { return x + y}}"
                         "curried function test")
      (let [curried (js/execute-fn-name context "curry_plus" 1)]
        (is (= 3 (.asLong (js/execute-fn curried 2))))))))

(deftest thread-safe-execute-fn-name-test
  (testing "execute-fn-name is thread safe"
    (let [context (js/context)]
      (js/load-js-string context "function plus (x, y) { return x + y }" "plus test")
      (is (= (repeat 10 2)
             (mt/repeat-concurrently 10
                                     #(.asLong (js/execute-fn-name context "plus" 1 1))))))))

(deftest untrusted-plugin-context-denies-host-access-test
  (testing "the SandboxPolicy/UNTRUSTED isolate runs untrusted plugin JS with no host interop"
    (let [^Context context (js/untrusted-plugin-context)]
      (try
        (testing "ordinary JS still evaluates, so the sandbox isn't just broken"
          (is (= "3" (.asString ^Value (js/load-js-string context "'' + (1 + 2)" "ok.js")))))
        (testing "the `Java` host-interop global is absent"
          (is (= "undefined" (.asString ^Value (js/load-js-string context "typeof Java" "typeof.js")))))
        (testing "untrusted guest code cannot reach host classes (no sandbox escape)"
          (is (thrown? PolyglotException
                       (js/load-js-string context "Java.type('java.lang.System')" "escape.js"))))
        (finally
          (.close context true))))))

(deftest untrusted-plugin-context-load-resource-test
  (testing "load-resource evals into the UNTRUSTED isolate (regression: a URL-backed Source fails to marshal
            across the native-isolate boundary from a jar: URL — SourceCopyMarshaller ShouldNotReachHere — so
            load-resource must build a literal Source from the resource content)"
    (let [^Context context (js/untrusted-plugin-context)]
      (try
        ;; a tiny JS resource on the test classpath; the point is that load-resource (not load-js-string)
        ;; succeeds against the isolate, which is what breaks when the Source is URL-backed.
        (js/load-resource context "metabase/channel/render/js/engine_test_resource.js")
        (is (= 3 (.asLong (js/execute-fn-name context "engine_test_plus" 1 2))))
        (finally
          (.close context true))))))

(deftest untrusted-plugin-context-enforces-heap-limit-test
  (testing "sandbox.MaxHeapMemory terminates a plugin that exhausts the isolate heap"
    (let [^Context context (js/untrusted-plugin-context)
          ;; Retain a steadily growing list of materialized arrays until the per-context heap cap
          ;; (`sandbox.MaxHeapMemory`, derived at startup from the pod limit — see isolate-memory-config)
          ;; is hit. A single huge allocation can slip past the sampling-based limit, but
          ;; sustained retention cannot. This stays within the isolate's own heap, so the host JVM
          ;; isn't the one running out of memory.
          ex      (try
                    (js/load-js-string
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

(deftest isolate-heap-bytes-test
  (testing "isolate heap cap is derived to fail closed below the pod/cgroup ceiling"
    (let [mb       (* 1024 1024)
          gb       (* 1024 mb)
          floor    (* 384 mb)
          target   (* 1024 mb)
          overhead (* 384 mb)]
      (testing "a large pod is capped at the target — no benefit to handing a runaway more room"
        (is (= target (#'js/isolate-heap-bytes (* 32 gb) (* 8 gb)))))
      (testing "a mid-size pod shrinks the cap so JVM heap + cap + overhead + 12% margin fits under the pod"
        (let [pod  (* 2 gb)
              heap (* 512 mb)
              cap  (#'js/isolate-heap-bytes pod heap)]
          (is (< floor cap target) "cap lands strictly between floor and target")
          (is (<= (+ heap cap overhead (long (* 0.12 pod))) pod)
              "the reserved sum stays within the pod memory limit")))
      (testing "the real PR-env case (2.8GB pod, 1.5GB -Xmx) now yields a renderable isolate (regression:
                the old 512MB overhead + 15% margin left only ~431MB, right at the bundle cold-parse peak,
                so custom-viz OOMed intermittently)"
        (let [cap (#'js/isolate-heap-bytes (* 2917 mb) (* 1536 mb))]
          (is (<= (* 600 mb) cap target)
              "isolate cap clears ~600MB — comfortably above the measured ~431MB render peak")))
      (testing "a pod too small for a safe budget clamps to the floor (caller warns)"
        (is (= floor (#'js/isolate-heap-bytes (* 1 gb) (* 256 mb))))))))

(deftest isolate-memory-config-test
  (testing "the startup-computed caps are valid GraalVM size strings"
    (let [cfg      @@#'js/isolate-memory-config
          ->mb     (fn [s] (Long/parseLong (subs s 0 (- (count s) 2))))]
      (is (re-matches #"\d+MB" (:max-isolate-memory cfg)))
      (is (re-matches #"\d+MB" (:max-heap-memory cfg)))
      (testing "per-context heap is strictly below engine-wide isolate memory (GraalVM requires it)"
        (is (< (->mb (:max-heap-memory cfg)) (->mb (:max-isolate-memory cfg)))))
      (testing "the single pooled context gets nearly the whole isolate (heap = isolate - 96MB reserve),
                not the old iso/2 split that halved the guest heap"
        (is (= (->mb (:max-heap-memory cfg)) (- (->mb (:max-isolate-memory cfg)) 96)))))))
