(ns metabase.channel.render.js.graal
  "The GraalVM [[metabase.channel.render.js.protocol/StaticVizRenderer]]: runs the static-viz JS
  in-process on a pool of sandboxed GraalVM contexts (up to three by default).

  We run the JS interpreted (no Graal compiler on a stock JDK) and silence the interpreter warning with
  the engine-level `engine.WarnInterpreterOnly` option. See
  https://github.com/oracle/graaljs/blob/master/docs/user/RunOnJDK.md.

  The pooled contexts share one `Engine` and one parsed bundle `Source`: the engine (and its
  `Source`-keyed code cache) is created with the first context and closed with the last, and each context
  evaluates the shared source into its own realm. So one parsed copy of the bundle is held regardless of
  how many contexts there are, which makes raising the pool's max from 1 to 2 or 3 a one-line change. A
  context is held exclusively per render (so renders serialize per context); the utilization controller
  has min 0, so when idle the pool shrinks to 0 and the last `destroy` closes the engine (GraalVM reclaims
  neither context nor engine on GC). The first render after an idle gap rebuilds them."
  (:require
   [clojure.java.io :as io]
   [metabase.channel.render.js.common :as common]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.config.core :as config]
   [metabase.util.format :as u.format]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.memory :as memory])
  (:import
   (io.aleph.dirigiste IPool$Controller IPool$Generator Pool Pools Stats)
   (java.io OutputStream)
   (java.util.concurrent TimeUnit)
   (org.graalvm.polyglot Context Engine HostAccess PolyglotException SandboxPolicy Source Value)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------- engine / context ----------------------------------------

(def ^:private no-host-class-lookup
  "Predicate blocking all host class lookup."
  (reify java.util.function.Predicate
    (test [_ _] false)))

(defn- create-engine
  "Build a JS `Engine`. We run JS interpreted (no Graal compiler on a stock JDK), so
  `engine.WarnInterpreterOnly` is silenced here (it's an engine-level option)."
  ^Engine []
  (.. (Engine/newBuilder)
      (option "engine.WarnInterpreterOnly" "false")
      (build)))

(defn create-context
  "Create a sandboxed org.graalvm.polyglot.Context for evaluating javascript — on a fresh engine (no args)
  or on the given `engine`, so several contexts can share one engine and its parsed-source code cache. No
  host access, no class lookup, no filesystem I/O; all data must be passed as JSON strings and parsed in JS."
  (^Context [] (create-context (create-engine)))
  (^Context [^Engine engine]
   (.. (Context/newBuilder (into-array String ["js"]))
       (engine engine)
       (option "js.intl-402" "true")
       (allowHostAccess HostAccess/NONE)
       (allowHostClassLookup no-host-class-lookup)
       (out System/out)
       (err System/err)
       (allowIO false)
       (build))))

(defn load-js-string
  "Load a string literal source into the js context."
  [^Context context ^String string-src ^String src-name]
  (.eval context (.buildLiteral (Source/newBuilder "js" string-src src-name))))

(defn- build-source
  "Build a `Source` from a classpath resource path."
  ^Source [source-path]
  (let [resource (io/resource source-path)]
    (when (nil? resource)
      (throw (ex-info (trs "Javascript resource not found: {0}" source-path)
                      {:source source-path})))
    (.build (Source/newBuilder "js" ^java.net.URL resource))))

(defn- eval-source
  "Evaluate an already-built `Source` in the js context."
  [^Context context ^Source source]
  (.eval context source))

(defn load-resource
  "Load a JS classpath resource into the js context as a *literal* `Source` (content, not URL-backed). A
  URL-backed Source fails to marshal across the `SandboxPolicy/UNTRUSTED` native-isolate boundary
  ([[untrusted-plugin-context]]) — GraalVM's SourceCopyMarshaller throws `ShouldNotReachHere` — when the
  resource is a `jar:` URL (i.e. running from the packaged uberjar). It happens to work from a `file:` URL
  (running from source), so the failure only shows up when deployed. A literal Source carries only content
  + name, so it marshals identically whether the resource lives on disk or inside the jar. `source-path` is
  kept as the source name so stack traces still point at the right file."
  [^Context context ^String source-path]
  (let [resource (io/resource source-path)]
    (when (nil? resource)
      (throw (ex-info (trs "Javascript resource not found: {0}" source-path)
                      {:source source-path})))
    (.eval context (.buildLiteral (Source/newBuilder "js" ^String (slurp resource :encoding "UTF-8") source-path)))))

(defn execute-fn-name
  "Execute the global js function named `js-fn-name` in `context` with `args`. Not thread-safe on its own
  — a context is held exclusively per render by the pool (see [[call-js]])."
  ^Value [^Context context js-fn-name & args]
  (let [fn-ref (.eval context "js" js-fn-name)]
    (assert (.canExecute fn-ref) (str "cannot execute " js-fn-name))
    (.execute fn-ref (into-array Object args))))

(defn execute-fn
  "fn-ref should be an executable org.graalvm.polyglot.Value returned from a js engine. Invoke it with args."
  ^Value [^Value fn-ref & args]
  (assert (.canExecute fn-ref) "cannot execute function reference")
  (.execute fn-ref (object-array args)))

;;; ---------------------------------------- shared engine + contexts -------------------------------------

(def ^:private engine-lock (Object.))

(def ^:private shared-engine
  "Atom holding `{:engine <Engine>, :source <Source>, :refs <live context count>}`, or nil when no context
  is live. Guarded by [[engine-lock]]. The engine and parsed bundle are shared by every pooled context;
  they're created with the first context ([[acquire-engine!]]) and closed with the last
  ([[release-engine!]])."
  (atom nil))

(defn- acquire-engine!
  "Return the shared `{:engine, :source}`, creating them (parsing the bundle) with the first context.
  Bumps the ref count."
  []
  (locking engine-lock
    (let [state (or @shared-engine
                    {:source (build-source common/bundle-resource-path)
                     :engine (create-engine)
                     :refs   0})]
      (reset! shared-engine (update state :refs inc))
      state)))

(defn- release-engine!
  "Drop a ref on the shared engine, closing it once the last context is gone."
  []
  (locking engine-lock
    (let [{:keys [^Engine engine refs]} @shared-engine]
      (if (<= refs 1)
        (do (try (.close engine) (catch Exception _))
            (reset! shared-engine nil))
        (swap! shared-engine update :refs dec)))))

(defn- generate-context!
  "Build a context on the shared engine and evaluate the bundle into it (creating the engine + parsing the
  bundle if this is the first context)."
  ^Context []
  (common/assert-tests-not-initializing!)
  (let [{:keys [^Engine engine ^Source source]} (acquire-engine!)]
    (try
      (doto (create-context engine)
        (eval-source source))
      (catch Throwable t
        (release-engine!)
        (throw t)))))

(defn- destroy-context!
  "Close a context and drop its ref on the shared engine (closing the engine if it was the last context)."
  [^Context context]
  (try (.close context true) (catch Exception _))
  (release-engine!))

;;; ------------------------------------------------ context pool -----------------------------------------

(def ^:private pool-key
  "Dirigiste pools are keyed; the key itself is arbitrary, it just has to be the same for every operation."
  :static-viz)

(def ^:private ^Pool static-viz-context-pool
  "A pool of up to three static-viz contexts, each held exclusively from acquire to release, so at most
  three renders run at once — one per context, on the shared engine. When idle for up to 10 minutes the
  pool shrinks to 0 and the generator's `destroy` closes the context (and, on the last one, the shared
  engine); the first render after an idle gap rebuilds them. See
  [[metabase.channel.render.js.common/create-pool]]."
  (common/create-pool generate-context! destroy-context! {:max-size 3, :idle-minutes 10}))

(defn- do-with-static-viz-context
  "Borrow a pooled static-viz context and call `f` with it, held exclusively for the call (never let it —
  or a context-bound `Value` — escape). In dev, builds and closes a throwaway context per call so a fresh
  `bun run build-static-viz` is picked up without a REPL restart."
  [f]
  (if config/is-dev?
    (let [context (generate-context!)]
      (try (f context)
           (finally (destroy-context! context))))
    (let [context (.acquire static-viz-context-pool pool-key)]
      (try (f context)
           (finally (.release static-viz-context-pool pool-key context))))))

;;; ---------------------------------------- Untrusted plugin sandbox ----------------------------------------
;;;
;;; Stronger sandbox for running *untrusted* custom-viz plugin JS (third-party bundles). Unlike
;;; [[create-context]], which relies on `HostAccess/NONE` + config flags in the host JVM, this runs the guest
;;; inside a GraalVM native-image isolate (separate VM, separate heap) under `SandboxPolicy/UNTRUSTED`, so
;;; CPU/heap limits and speculative-execution mitigations are enforced by the VM. Requires the
;;; `js-isolate-community` artifact on the classpath. Built-in static-viz keeps the faster in-process
;;; [[create-context]] path; only plugins pay for the isolate.

(def ^:private ^OutputStream discarding-output-stream
  "Sink for untrusted-guest stdout/stderr — plugin console output is neither trusted nor useful in server
  logs, and `SandboxPolicy/UNTRUSTED` bounds it via `sandbox.Max*StreamSize` regardless."
  (proxy [OutputStream] []
    (write
      ([_])
      ([_ _ _]))))

;;; ---- Isolate memory sizing (fail closed below the pod ceiling) ----
;;;
;;; The isolate is a separate heap but runs in the *same OS process* as the JVM, so its native memory counts
;;; against the same pod/container cgroup. If it grows unbounded it pushes process RSS over the cgroup limit and
;;; the kernel OOM-killer SIGKILLs the whole pod (uncatchable). To avoid that we size the isolate's own hard cap
;;; (`engine.MaxIsolateMemory`) *below* the pod limit, so a runaway render hits the isolate's limit first and
;;; throws a catchable `PolyglotException` (which the render path degrades to a placeholder) instead of getting
;;; the pod killed. The cap is derived at startup from the detected pod limit rather than hard-coded, so it
;;; self-adapts to the pod size.

(def ^:private isolate-memory-overhead-bytes
  "Conservative reserve (bytes) for process memory that is neither the JVM max heap nor the isolate heap:
  metaspace, code cache, thread stacks, direct byte buffers (e.g. Batik image buffers), and the GraalVM
  host-side runtime. Subtracted from the pod memory limit when sizing the isolate so their sum stays under the
  cgroup ceiling. Kept generous (underestimating risks an OOM-kill of the whole pod) but not so large that a
  big `-Xmx` starves the isolate below a renderable size — see [[isolate-heap-bytes]]. The remaining slack is
  covered by [[isolate-memory-safety-margin-ratio]] on top of this."
  (* 384 1024 1024))

(def ^:private isolate-memory-safety-margin-ratio
  "Fraction of the pod memory limit kept free as headroom, on top of the explicit reserves."
  0.12)

(def ^:private isolate-nonheap-reserve-bytes
  "Headroom (bytes) kept between the per-context `sandbox.MaxHeapMemory` and the engine-wide
  `engine.MaxIsolateMemory` for the isolate's own non-guest-heap memory (code cache, metadata, GC
  bookkeeping). GraalVM requires `MaxHeapMemory` strictly below `MaxIsolateMemory`; the untrusted pool holds
  exactly one context (see [[untrusted-static-viz-context-pool]]), so the single context's guest heap gets the
  whole isolate minus this reserve — no need to halve the isolate for a second context that never exists."
  (* 96 1024 1024))

(def ^:private target-max-isolate-memory-bytes
  "Isolate heap cap used when the pod can afford it. The ~16MB static-viz bundle plus a real render peak at
  <=512MB (measured), so 1GB is comfortably enough; a larger cap would only let a runaway plugin grow bigger
  before failing closed."
  (* 1024 1024 1024))

(def ^:private min-max-isolate-memory-bytes
  "Floor for the derived isolate cap. Below this the bundle + echarts/React runtime can't reliably parse and
  render. If the computed budget is below this, the pod is too small to render custom-viz safely — we clamp
  here and warn; the residual OOM-kill risk is then a deployment problem (raise the pod limit / lower -Xmx)."
  (* 384 1024 1024))

(defn- isolate-heap-bytes
  "Pure: isolate heap cap (bytes) such that `jvm-max-heap + cap + overhead + margin <= pod-limit`, clamped to
  [[[min-max-isolate-memory-bytes]], [[target-max-isolate-memory-bytes]]]. A cap at the floor means the pod is
  too small for a safe budget (caller warns)."
  ^long [^long pod-limit ^long jvm-max-heap]
  (let [margin (long (* isolate-memory-safety-margin-ratio pod-limit))
        budget (- pod-limit jvm-max-heap isolate-memory-overhead-bytes margin)]
    (-> budget
        (min target-max-isolate-memory-bytes)
        (max min-max-isolate-memory-bytes))))

(defn- bytes->mb-option
  "Format a byte count as an integer-megabyte GraalVM size-option string, e.g. 750780416 -> \"716MB\"."
  ^String [^long bytes]
  (str (quot bytes (* 1024 1024)) "MB"))

(defonce ^:private
  ^{:doc "Isolate memory caps, computed once from the detected pod/container memory limit so the isolate fails
          closed (catchable) below the cgroup ceiling instead of getting the pod OOM-killed:
          `{:max-isolate-memory <opt-str> :max-heap-memory <opt-str>}`. `:max-heap-memory` (per-context) is
          kept strictly below `:max-isolate-memory` (engine-wide), as GraalVM requires."}
  isolate-memory-config
  (delay
    (let [pod-limit    (memory/container-memory-limit)
          jvm-max-heap (.maxMemory (Runtime/getRuntime))
          iso-bytes    (if pod-limit
                         (isolate-heap-bytes pod-limit jvm-max-heap)
                         target-max-isolate-memory-bytes)
          ;; per-context heap must be < engine-wide isolate memory. The pool holds exactly one context, so give
          ;; that single context the whole isolate minus a small non-heap reserve rather than halving it (the
          ;; old iso/2 needlessly capped guest heap at 50% for a second context that never exists).
          heap-bytes   (- iso-bytes isolate-nonheap-reserve-bytes)
          config       {:max-isolate-memory (bytes->mb-option iso-bytes)
                        :max-heap-memory    (bytes->mb-option heap-bytes)}]
      (when (and pod-limit (<= iso-bytes min-max-isolate-memory-bytes))
        (log/warnf (str "static-viz isolate memory budget is at its floor (%s) for pod limit %s + JVM max heap "
                        "%s; custom-viz rendering may still pressure the pod. Raise the pod memory limit or "
                        "lower -Xmx.")
                   (:max-isolate-memory config)
                   (u.format/format-bytes pod-limit)
                   (u.format/format-bytes jvm-max-heap)))
      (log/infof "static-viz isolate memory: MaxIsolateMemory=%s MaxHeapMemory=%s (pod limit %s, JVM max heap %s)"
                 (:max-isolate-memory config) (:max-heap-memory config)
                 (if pod-limit (u.format/format-bytes pod-limit) "unknown")
                 (u.format/format-bytes jvm-max-heap))
      config)))

(defn- new-untrusted-plugin-engine
  "Build the isolate `Engine` shared by every untrusted-plugin context. `engine.MaxIsolateMemory` caps the
  whole isolate heap and must exceed the per-context `sandbox.MaxHeapMemory` set in [[untrusted-plugin-context]];
  both are derived from the pod memory limit at startup (see [[isolate-memory-config]]) so the isolate fails
  closed below the cgroup ceiling instead of OOM-killing the pod."
  ^Engine []
  (.. (Engine/newBuilder (into-array String ["js"]))
      ;; A shared engine and its contexts must declare the same sandbox policy, so the engine sets UNTRUSTED
      ;; too — otherwise creating an UNTRUSTED context on it would fail the engine/context policy-match check.
      (sandbox SandboxPolicy/UNTRUSTED)
      (option "engine.MaxIsolateMemory" (:max-isolate-memory @isolate-memory-config))
      (out discarding-output-stream)
      (err discarding-output-stream)
      (build)))

(defonce ^:private
  ^{:doc "GraalVM isolate `Engine` shared by every untrusted custom-viz plugin context. Contexts on a shared
          engine still get isolated global scopes (one plugin can't see another's globals), while sharing the
          isolate's Truffle runtime + parsed-source cache. Process-lifetime singleton (intentionally never
          closed)."}
  shared-untrusted-plugin-engine
  (delay (new-untrusted-plugin-engine)))

(def render-max-cpu-time
  "`sandbox.MaxCPUTime` for a *non-pooled* untrusted context (the dev fresh-context path). Covers a cold parse
  of the static-viz bundle plus a single render on dev hardware. Prod uses a pooled context with the larger,
  cumulative [[pool-max-cpu-time]] instead — see [[untrusted-static-viz-context-pool]]."
  "30s")

(def pool-max-cpu-time
  "`sandbox.MaxCPUTime` for a *pooled*, long-lived untrusted context (the prod path). MaxCPUTime is a
  *cumulative* per-context lifetime budget, not per-render: it must cover the one-time cold parse of the
  slim bundle at pool generation (>10s of guest CPU) plus the many renders the context then serves before the
  pool recycles it. When exceeded the context is cancelled — the pool disposes and regenerates it. Sized
  generously so, under normal load, the 10-minute pool expiry recycles a context before this cumulative cap
  does; it still bounds a runaway plugin (to this many seconds of accumulated CPU) without a per-render cap.
  Trade-off of pooling for speed: there is no tight per-render CPU bound, only this coarse cumulative one plus
  MaxHeapMemory."
  "180s")

(defn untrusted-plugin-context
  "Create a `SandboxPolicy/UNTRUSTED` GraalVM isolate `Context` for running untrusted custom-viz plugin JS.
  The guest runs in a separate isolate heap with VM-enforced CPU/heap/AST limits; like [[create-context]] it
  has no host access and no IO, so data must cross the boundary as JSON strings. Requires
  `js-isolate-community` on the classpath. The `sandbox.*` limits below are all mandatory under `UNTRUSTED` —
  the context fails to build if any is unset. `max-cpu-time` is the `sandbox.MaxCPUTime` budget (default
  [[render-max-cpu-time]] for the dev fresh-context path; the pool passes the larger cumulative
  [[pool-max-cpu-time]]). `sandbox.MaxHeapMemory` is derived from the pod memory limit at startup (see
  [[isolate-memory-config]]) so a runaway render fails closed below the cgroup ceiling."
  (^Context [] (untrusted-plugin-context render-max-cpu-time))
  (^Context [^String max-cpu-time]
   (.. (Context/newBuilder (into-array String ["js"]))
       (engine ^Engine @shared-untrusted-plugin-engine)
       (sandbox SandboxPolicy/UNTRUSTED)
       ;; HostAccess/UNTRUSTED, not /NONE: the UNTRUSTED policy rejects /NONE (it still permits mutable
       ;; target-type mappings). /UNTRUSTED is the policy's purpose-built strictest host-access mode.
       (allowHostAccess HostAccess/UNTRUSTED)
       ;; allowAllAccess (the master switch that would enable all of the below at once) is false by default; UNTRUSTED forbids true.
       ;; allowHostClassLookup is false by default under SandboxPolicy/UNTRUSTED.
       ;; allowIO is disabled by default under SandboxPolicy/UNTRUSTED.
       ;; allowNativeAccess is false by default under SandboxPolicy/UNTRUSTED.
       ;; allowEnvironmentAccess is NONE (no host env vars) by default under SandboxPolicy/UNTRUSTED.
       ;; allowExperimentalOptions left at default false
       ;; MaxCPUTimeCheckInterval left at its ~10ms default — negligible overshoot vs a multi-second budget.
       (option "sandbox.MaxCPUTime" max-cpu-time)
       (option "sandbox.MaxHeapMemory" (:max-heap-memory @isolate-memory-config))
       (option "sandbox.MaxASTDepth" "5000")
       (option "sandbox.MaxThreads" "1")         ; single-threaded isolate; allowCreateThread also defaults to false
       (option "sandbox.MaxOutputStreamSize" "16MB")
       (option "sandbox.MaxErrorStreamSize" "4MB")
       ;; sandbox.MaxStatements skipped (and thus its MaxStatementsIncludeInternal modifier): fragile to tune and the compute axis is already covered by MaxCPUTime et al.
       ;; sandbox.MaxStackFrames skipped too: runtime-recursion blowup surfaces as a contained guest error in the isolate.
       (out discarding-output-stream)
       (err discarding-output-stream)
       (build))))

;;; ------------------------------------------- untrusted context pool ------------------------------------

(defn- generate-untrusted-context!
  "Cold-parse the slim custom-viz bundle into a fresh isolate context; logged with timing because this is the
  dominant per-context cost and explains slow first/regenerated renders."
  ^Context []
  (common/assert-tests-not-initializing!)
  (let [start (System/nanoTime)
        ctx   (doto (untrusted-plugin-context pool-max-cpu-time)
                (load-resource common/custom-viz-bundle-resource-path))]
    (log/infof "custom-viz: generated untrusted static-viz isolate context (cold-parsed slim bundle) in %.0fms"
               (/ (- (System/nanoTime) start) 1e6))
    ctx))

(def ^:private ^Pool untrusted-static-viz-context-pool
  "Pool of `SandboxPolicy/UNTRUSTED` isolate contexts for rendering untrusted custom-viz plugin JS. Mirrors
  [[static-viz-context-pool]] but for the isolate path, and loads the slim custom-viz-only bundle
  ([[metabase.channel.render.js.common/custom-viz-bundle-resource-path]]) instead of the full one — this pool
  only ever renders `custom:` cards, so the built-in chart stack would be pure parse-time/heap dead weight.
  Pooling is still the point: the bundle is parsed *once* per pooled context (a multi-second cold parse, far
  worse on CPU-throttled hardware) and reused across renders, instead of the old unpooled path that re-parsed
  on every render (the 55s pulse-test regression).

  Capped at 1 context: each holds the bundle plus up to the derived isolate heap (see
  [[isolate-memory-config]]), and native isolate memory is what previously OOM-killed the server, so we keep
  exactly one and let per-context serialization handle concurrency. Unlike the trusted pool this one never
  shrinks to 0 (the custom controller vetoes the last decrement) so the parsed bundle stays warm; instead,
  contexts expire after 10 minutes (Truffle can leak) and are recycled on acquire. A context whose cumulative
  `sandbox.MaxCPUTime` ([[pool-max-cpu-time]]) is exhausted is cancelled and disposed by
  [[do-with-untrusted-static-viz-context]] so the pool regenerates a fresh one.

  Trade-off vs. a fresh-context-per-render design: reused contexts share JS global state across renders
  (acceptable — the isolate still fully contains plugins from the host), and there is no tight per-render
  CPU bound (only the coarse cumulative one)."
  (let [base-controller (Pools/utilizationController 1.0 1 1)]
    (Pool. (reify IPool$Generator
             (generate [_ _]
               ;; Generate a tuple of the context and the expiry timestamp.
               [(generate-untrusted-context!)
                (+ (System/nanoTime) (.toNanos TimeUnit/MINUTES 10))])
             (destroy [_ _ [^Context ctx _expiry]]
               (log/debug "custom-viz: disposing untrusted static-viz isolate context")
               (try
                 (.close ctx true) ;; force close - can't wait for running code
                 (catch Exception _))))
           (reify IPool$Controller
             (shouldIncrement [_ k a b] (.shouldIncrement base-controller k a b))
             (adjustment [_ stats]
               (let [adj         (.adjustment base-controller stats)
                     n           (some-> ^Stats (:engines stats) .getNumWorkers)
                     engines-adj (:engines adj)]
                 (if (and n engines-adj (<= (+ n engines-adj) 0))
                   {}
                   adj))))
           65000
           25
           10000
           TimeUnit/MILLISECONDS)))

(defn do-with-untrusted-static-viz-context
  "Acquire a pooled `SandboxPolicy/UNTRUSTED` isolate context ([[untrusted-static-viz-context-pool]]) with the
  slim custom-viz bundle already loaded, run `f` with it, then release it back to the pool. In dev, uses a
  fresh context each time (mirrors [[do-with-static-viz-context]]) so a fresh `bun run build-static-viz` is
  picked up without a REPL restart. A context cancelled by exhausting its cumulative `sandbox.MaxCPUTime` is
  disposed (not released) so the pool regenerates."
  [f]
  (if config/is-dev?
    (let [^Context context (doto (untrusted-plugin-context)
                             (load-resource common/custom-viz-bundle-resource-path))]
      (try
        (f context)
        (finally
          (try (.close context true) (catch Throwable _)))))
    (loop []
      (let [[^Context context expiry-ts :as tuple] (.acquire untrusted-static-viz-context-pool :engines)]
        (if (>= (System/nanoTime) expiry-ts)
          (do (.dispose untrusted-static-viz-context-pool :engines tuple)
              (recur))
          (let [disposed? (volatile! false)]
            (try
              (f context)
              (catch PolyglotException e
                ;; A cancelled / resource-exhausted context is permanently unusable; dispose it so the pool
                ;; regenerates a fresh one rather than handing a dead context to the next render.
                (when (or (.isCancelled e) (.isResourceExhausted e))
                  (vreset! disposed? true)
                  (log/warnf "custom-viz: untrusted static-viz context hit a sandbox limit (cancelled=%s resource-exhausted=%s); disposing and regenerating. %s"
                             (.isCancelled e) (.isResourceExhausted e) (.getMessage e))
                  (.dispose untrusted-static-viz-context-pool :engines tuple))
                (throw e))
              (finally
                (when-not @disposed?
                  (.release untrusted-static-viz-context-pool :engines tuple))))))))))

;;; ------------------------------------------------ backend ----------------------------------------------

(mu/defn- call-js :- :string
  "Execute static-viz bundle function `fn-name` (a `MetabaseStaticViz.*` global) with the already-JSON-encoded
  string `args` on the pooled context."
  [fn-name :- :string
   args    :- [:sequential :string]]
  (do-with-static-viz-context
   (fn [^Context context]
     (.asString ^Value (apply execute-fn-name context (str "MetabaseStaticViz." fn-name) args)))))

(mu/defn- render-custom-viz :- :string
  "Render a chart whose main card is a `custom:` visualization: acquire the pooled untrusted isolate,
  initialize its context (settings + EE overrides, so the custom-viz registry is active), evaluate and
  register each plugin bundle, then render. Plugin bundles are untrusted third-party JS, so this never
  touches the trusted in-process pool."
  [{:keys [customVizBundles options] :as input} :- :map]
  (let [ids   (mapv :identifier customVizBundles)
        start (System/nanoTime)]
    (log/infof "custom-viz: static-rendering plugin(s) %s" ids)
    (let [result (do-with-untrusted-static-viz-context
                  (fn [^Context context]
                    (let [register-start (System/nanoTime)]
                      (execute-fn-name context "MetabaseStaticViz.initializeContextJSON" (json/encode options))
                      (doseq [{:keys [identifier source]} customVizBundles]
                        (load-js-string context source (str "custom-viz-" identifier ".js"))
                        (execute-fn-name context "MetabaseStaticViz.registerCustomVizPlugin" identifier))
                      (log/debugf "custom-viz: registered plugin(s) %s in %.0fms"
                                  ids (/ (- (System/nanoTime) register-start) 1e6)))
                    (.asString ^Value (execute-fn-name context "MetabaseStaticViz.renderChartJSON"
                                                       (json/encode (dissoc input :customVizBundles))))))]
      (log/infof "custom-viz: static-rendered %s in %.0fms (incl. context acquire/generation)"
                 ids (/ (- (System/nanoTime) start) 1e6))
      result)))

(defn renderer
  "The GraalVM [[metabase.channel.render.js.protocol/StaticVizRenderer]] — runs the static-viz JS
  in-process on the pooled GraalVM context, except charts carrying `:customVizBundles` (untrusted plugin
  JS), which render on the pooled `SandboxPolicy/UNTRUSTED` isolate instead. Each method JSON-encodes its
  `input` map for the bundle and decodes the bundle's JSON result back into Clojure data."
  []
  (reify js.protocol/StaticVizRenderer
    (chart [_ input]
      (json/decode+kw
       (if (seq (:customVizBundles input))
         (render-custom-viz input)
         (call-js "renderChartJSON" [(json/encode input)]))))
    (cell-background-colors [_ input]
      (json/decode (call-js "getCellBackgroundColorsJSON" [(json/encode input)])))))
