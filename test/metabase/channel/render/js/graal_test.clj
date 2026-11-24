(ns metabase.channel.render.js.graal-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.common :as js.common]
   [metabase.channel.render.js.graal :as graal]
   [metabase.test :as mt])
  (:import
   (org.graalvm.polyglot Context Engine PolyglotException Value)))

(set! *warn-on-reflection* true)

(defn- do-with-untrusted-context!
  "Run `f` with an UNTRUSTED isolate context on its own throwaway engine, closing both afterwards."
  [f]
  (let [^Engine engine (#'graal/new-untrusted-engine)]
    (try
      (let [^Context context (graal/untrusted-context engine "30s")]
        (try
          (#'graal/install-guard! context)
          (f context)
          (finally
            (.close context true))))
      (finally
        (.close engine)))))

(deftest untrusted-context-evaluates-js-test
  (testing "can evaluate javascript in the UNTRUSTED isolate"
    (do-with-untrusted-context!
     (fn [^Context context]
       (graal/load-js-string context "function plus (x, y) { return x + y }" "plus test")
       (is (= 3 (.asLong (graal/execute-fn-name context "plus" 1 2)))))))
  (testing "can invoke closures returned from that javascript"
    (do-with-untrusted-context!
     (fn [^Context context]
       (graal/load-js-string context "function curry_plus (x) { return function (y) { return x + y}}"
                             "curried function test")
       (let [curried (graal/execute-fn-name context "curry_plus" 1)]
         (is (= 3 (.asLong (graal/execute-fn curried 2)))))))))

(deftest untrusted-context-denies-host-access-test
  (testing "the SandboxPolicy/UNTRUSTED isolate runs untrusted plugin JS with no host interop"
    (do-with-untrusted-context!
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
    (do-with-untrusted-context!
     (fn [^Context context]
       ;; a tiny JS resource on the test classpath; the point is that load-resource (not load-js-string)
       ;; succeeds against the isolate, which is what breaks when the Source is URL-backed.
       (graal/load-resource context "metabase/channel/render/js/engine_test_resource.js")
       (is (= 3 (.asLong (graal/execute-fn-name context "engine_test_plus" 1 2))))))))

(defn- thread-allocated-bytes []
  (let [^com.sun.management.ThreadMXBean mx (java.lang.management.ManagementFactory/getThreadMXBean)]
    (.getThreadAllocatedBytes mx (.getId (Thread/currentThread)))))

(defn- guard-failure
  "The `:reason` of the guard failure `thunk` raises, or its return value if it doesn't."
  [thunk]
  (try (thunk)
       (catch clojure.lang.ExceptionInfo e
         (if (= ::graal/guest-call-failed (:type (ex-data e)))
           (:reason (ex-data e))
           (throw e)))))

(defn- bounded
  "Run `thunk` asserting it allocates less than 4 MB on the host heap (so no unchecked string crossed), and return
  what it returned or the guard failure reason."
  [label thunk]
  (let [before (thread-allocated-bytes)
        result (guard-failure thunk)]
    (is (< (- (thread-allocated-bytes) before) (* 4 1024 1024)) label)
    result))

(deftest guard-bounds-transfers-test
  (do-with-untrusted-context!
   (fn [^Context context]
     (graal/load-js-string context
                           (str "globalThis.MetabaseStaticViz = {"
                                "  big(n) { return 'x'.repeat(n) },"
                                "  rope(k) { let s = 'x'; for (let i = 0; i < k; i++) s = s + s; return s },"
                                "  obj() { return {length: 1} },"
                                "  huge: 'x'.repeat(17 * 1024 * 1024),"
                                "  boom() { throw new Error('e'.repeat(17 * 1024 * 1024)) }"
                                "}")
                           "fns.js")
     (testing "a string result within the cap passes through"
       (is (= (* 1024 1024) (count (#'graal/call-string context "big" (* 1024 1024))))))
     (testing "an oversized result is refused in the guest, before it is copied to the host"
       (is (= :result-too-large (bounded "repeat" #(#'graal/call-string context "big" (* 17 1024 1024))))))
     (testing "a lazily concatenated result is refused by its length, never flattened or copied"
       (is (= :result-too-large (bounded "rope" #(#'graal/call-string context "rope" 26)))))
     (testing "a non-string result is refused"
       (is (= :not-a-string (guard-failure #(#'graal/call-string context "obj")))))
     (testing "a property a plugin replaced with a string is refused without the lookup copying it to the host"
       (is (= :not-a-function (bounded "lookup" #(#'graal/call-string context "huge")))))
     (testing "a void call never transfers the result"
       (is (nil? (bounded "void" #(#'graal/call-void context "big" (* 17 1024 1024))))))
     (testing "a plugin failure is reported as a code; its message never crosses"
       (is (= :guest-threw (bounded "throw" #(#'graal/call-string context "boom"))))))))

(deftest eval-untrusted!-bounds-transfers-test
  (do-with-untrusted-context!
   (fn [^Context context]
     (testing "the script runs for its side effects, with top-level declarations global as for a classic script"
       (is (nil? (#'graal/eval-untrusted! context "var fromPlugin = 41; globalThis.plus1 = (x) => x + 1" "plugin.js")))
       (is (= 42 (.asLong (graal/execute-fn-name context "plus1" (.asLong (.eval context "js" "fromPlugin")))))))
     (testing "the completion value never crosses to the host"
       (is (nil? (bounded "completion" #(#'graal/eval-untrusted! context "'x'.repeat(17 * 1024 * 1024)" "big.js")))))
     (testing "a top-level throw is reported as a code; its message never crosses"
       (is (= :guest-threw (bounded "throw" #(#'graal/eval-untrusted! context "throw new Error('e'.repeat(17 * 1024 * 1024))" "boom.js")))))
     (testing "a syntax error is a failure too"
       (is (= :guest-threw (guard-failure #(#'graal/eval-untrusted! context "function (" "bad.js"))))))))

(deftest guard-survives-plugin-tampering-test
  (testing "a plugin that replaces built-ins, throws from a getter, or attacks the guard global still can't get an
            unbounded string past the guard"
    (do-with-untrusted-context!
     (fn [^Context context]
       (graal/load-js-string context
                             (str "const huge = 'x'.repeat(17 * 1024 * 1024);"
                                  "String.prototype.slice = function () { return this + '' };"
                                  "globalThis.String = () => huge;"
                                  "globalThis.Error = function () { return {message: huge} };"
                                  "Error.prototype.name = huge;"
                                  "Object.defineProperty(Error.prototype, 'message', {get() { return huge }});"
                                  "globalThis.eval = () => huge;"
                                  "Array.prototype[Symbol.iterator] = function* () { throw huge };"
                                  "globalThis.MetabaseStaticViz = { get render() { throw huge }, ok() { return 'fine' } };"
                                  "try { delete globalThis." @#'graal/guard-global "; } catch (_) {}"
                                  "try { globalThis." @#'graal/guard-global " = {call: () => huge, evalScript: () => huge}; } catch (_) {}")
                             "tamper.js")
       (is (= :guest-threw (bounded "getter"   #(#'graal/call-string context "render"))))
       (is (= :guest-threw (bounded "void"     #(#'graal/call-void context "render"))))
       (is (= :guest-threw (bounded "script"   #(#'graal/eval-untrusted! context "throw huge" "boom.js"))))
       (is (nil?           (bounded "complete" #(#'graal/eval-untrusted! context "huge" "big.js"))))
       (testing "and a well-behaved call still works through the tampered context"
         (is (= "fine" (guard-failure #(#'graal/call-string context "ok")))))))))

(deftest untrusted-context-enforces-heap-limit-test
  (testing "sandbox.MaxHeapMemory terminates a plugin that exhausts the isolate heap"
    (do-with-untrusted-context!
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

(deftest untrusted-engine-ref-counted-lifecycle-test
  (testing "the shared untrusted isolate engine is ref-counted: created with the first context, closed with the last"
    (let [state          @#'graal/shared-untrusted-engine
          refs           #(get @state :refs 0)
          generate!      (fn [bundle-path]
                           (#'graal/generate-untrusted-context! bundle-path @#'graal/pool-max-cpu-time))
          before         (refs)
          plugin-context (generate! js.common/custom-viz-bundle-resource-path)]
      (is (= (inc before) (refs)) "generating a plugin context should bump the shared-engine ref count")
      (testing "builtin contexts hold refs on the same shared engine"
        (let [engine          (:engine @state)
              builtin-context (generate! js.common/bundle-resource-path)]
          (is (= (+ 2 before) (refs)) "a builtin context should bump the same ref count")
          (is (identical? engine (:engine @state)) "builtin and plugin contexts should share one engine")
          (#'graal/destroy-untrusted-context! builtin-context)
          (is (= (inc before) (refs)) "destroying the builtin context should drop only its ref")))
      (#'graal/destroy-untrusted-context! plugin-context)
      (is (= before (refs)) "destroying the context should drop its ref")
      (when (zero? before)
        (is (nil? @state) "the last destroy should close the engine and clear the shared state")))))

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
                        (swap! active dec))))]
      (mt/repeat-concurrently 4 render)
      (is (= 1 @max-seen)
          "at most one static-viz render should ever be in flight at once"))))
