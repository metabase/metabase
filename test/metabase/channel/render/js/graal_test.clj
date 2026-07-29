(ns metabase.channel.render.js.graal-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.graal :as graal])
  (:import
   (org.graalvm.polyglot Context Engine PolyglotException Value)))

(set! *warn-on-reflection* true)

(defn- do-with-untrusted-context
  "Run `f` with an UNTRUSTED isolate context on its own throwaway engine, closing both afterwards."
  [f]
  (let [^Engine engine (#'graal/new-untrusted-engine)]
    (try
      (let [^Context context (graal/untrusted-context engine)]
        (try
          (f context)
          (finally
            (.close context true))))
      (finally
        (.close engine)))))

(deftest untrusted-context-evaluates-js-test
  (testing "can evaluate javascript in the UNTRUSTED isolate"
    (do-with-untrusted-context
     (fn [^Context context]
       (graal/load-js-string context "function plus (x, y) { return x + y }" "plus test")
       (is (= 3 (.asLong (graal/execute-fn-name context "plus" 1 2)))))))
  (testing "can invoke closures returned from that javascript"
    (do-with-untrusted-context
     (fn [^Context context]
       (graal/load-js-string context "function curry_plus (x) { return function (y) { return x + y}}"
                             "curried function test")
       (let [curried (graal/execute-fn-name context "curry_plus" 1)]
         (is (= 3 (.asLong (graal/execute-fn curried 2)))))))))

(deftest untrusted-context-denies-host-access-test
  (testing "the SandboxPolicy/UNTRUSTED isolate runs untrusted plugin JS with no host interop"
    (do-with-untrusted-context
     (fn [^Context context]
       (testing "ordinary JS still evaluates, so the sandbox isn't just broken"
         (is (= "3" (.asString ^Value (graal/load-js-string context "'' + (1 + 2)" "ok.js")))))
       (testing "the `Java` host-interop global is absent"
         (is (= "undefined" (.asString ^Value (graal/load-js-string context "typeof Java" "typeof.js")))))
       (testing "untrusted guest code cannot reach host classes (no sandbox escape)"
         (is (thrown? PolyglotException
                      (graal/load-js-string context "Java.type('java.lang.System')" "escape.js"))))))))

(deftest untrusted-context-load-resource-test
  (testing "load-resource evals into the UNTRUSTED isolate (regression: a URL-backed Source fails to marshal
            across the native-isolate boundary from a jar: URL — SourceCopyMarshaller ShouldNotReachHere — so
            load-resource must build a literal Source from the resource content)"
    (do-with-untrusted-context
     (fn [^Context context]
       ;; a tiny JS resource on the test classpath; the point is that load-resource (not load-js-string)
       ;; succeeds against the isolate, which is what breaks when the Source is URL-backed.
       (graal/load-resource context "metabase/channel/render/js/engine_test_resource.js")
       (is (= 3 (.asLong (graal/execute-fn-name context "engine_test_plus" 1 2))))))))

(deftest untrusted-context-enforces-heap-limit-test
  (testing "sandbox.MaxHeapMemory terminates a plugin that exhausts the isolate heap"
    (do-with-untrusted-context
     (fn [^Context context]
       ;; Retain a steadily growing list of materialized arrays until the per-context heap cap
       ;; (`sandbox.MaxHeapMemory`) is hit. A single huge allocation can slip past the sampling-based limit, but
       ;; sustained retention cannot. This stays within the isolate's own heap, so the host JVM
       ;; isn't the one running out of memory.
       (let [ex (try
                  (graal/load-js-string
                   context
                   "var a = []; for (var i = 0; i < 1e7; i++) { a.push(new Array(50000).fill(i)); } a.length"
                   "oom.js")
                  nil
                  (catch PolyglotException e e))]
         (is (some? ex) "expected the runaway allocation to be terminated, not to complete")
         (is (and ex (.isResourceExhausted ^PolyglotException ex))
             "termination should be resource exhaustion (heap limit), not some other error"))))))

(deftest builtin-context-soft-limit-recycles-test
  (let [context-identity (fn []
                           (graal/do-with-untrusted-builtin-context
                            (fn [^Context context]
                              (System/identityHashCode context))))]
    (testing "under the soft CPU budget the pooled builtin context is reused across renders"
      (is (= (context-identity) (context-identity))))
    (testing "over the soft CPU budget the context is recycled once its render completes"
      (with-redefs [graal/pool-cpu-soft-limit-ms 0]
        (is (not= (context-identity) (context-identity))
            "the render after blowing the soft budget should get a freshly generated context")))))

(deftest rendering-is-globally-serialized-test
  (testing "the global render-lock serializes all rendering: concurrent renders never overlap"
    (let [active   (atom 0)
          max-seen (atom 0)
          render   (fn []
                     (graal/do-with-untrusted-builtin-context
                      (fn [^Context context]
                        (swap! max-seen max (swap! active inc))
                        (.eval context "js" "for (var i=0,x=0;i<1e6;i++) x+=i; x")
                        (swap! active dec))))
          futs     (doall (repeatedly 4 #(future (render))))]
      (doseq [f futs] @f)
      (is (= 1 @max-seen)
          "at most one static-viz render should ever be in flight at once"))))
