(ns metabase.channel.render.js.engine
  "Graal polyglot context suitable for executing javascript code.

  We run the js in interpreted mode and turn off the warning with the `(option \"engine.WarnInterpreterOnly\"
  \"false\")`. Ideally we would compile the javascript but this is difficult when using the graal ecosystem in a non
  graal jdk. See https://github.com/oracle/graaljs/blob/master/docs/user/RunOnJDK.md for more information.

  Javadocs: https://www.graalvm.org/truffle/javadoc/overview-summary.html"
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.java.io :as io]
   [metabase.util.format :as u.format]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.memory :as memory])
  (:import
   (java.io OutputStream)
   (org.graalvm.polyglot Context Engine HostAccess SandboxPolicy Source Value)))

(set! *warn-on-reflection* true)

;; A singleton (one shared instance, not rebuilt per context) so all contexts sharing the `Engine` have identical
;; host-access config, as GraalVM requires.

(def ^:private no-host-class-lookup
  "Predicate blocking all host class lookup. A singleton so all contexts sharing an engine have identical config."
  (reify java.util.function.Predicate
    (test [_ _] false)))

(defn- new-js-engine
  "Build a JS `Engine` to be shared across contexts. We run JS interpreted (no Graal compiler on a stock JDK), so
  `engine.WarnInterpreterOnly` is silenced here on the engine (it's an engine-level option)."
  ^Engine []
  ;; https://github.com/oracle/graaljs/blob/master/docs/user/RunOnJDK.md
  (.. (Engine/newBuilder)
      (option "engine.WarnInterpreterOnly" "false")
      (build)))

(defonce ^:private
  ^{:doc "GraalVM `Engine` shared by every sandboxed JS context (static-viz, color selector, untrusted custom-viz
          plugins). The engine owns the Truffle runtime + parsed-source cache, so contexts (and pool recycles) reuse
          one engine instead of each standing up its own. The engine is a process-lifetime singleton (intentionally
          never closed)."}
  shared-sandboxed-js-engine
  (delay (new-js-engine)))

(defn threadlocal-fifo-memoizer
  "Returns a memoizer that is unique to each thread."
  [thunk threshold]
  (memoize/fifo
   (with-meta thunk {::memoize/args-fn (fn [_]
                                         [(.getId (Thread/currentThread))])})
   :fifo/threshold threshold))

(defn context
  "Create a sandboxed org.graalvm.polyglot.Context for evaluating untrusted javascript
  (e.g. custom viz plugins). No host access, no class lookup, no filesystem I/O.
  All data must be passed as JSON strings and parsed in JS."
  ^Context []
  (.. (Context/newBuilder (into-array String ["js"]))
      (engine @shared-sandboxed-js-engine)
      (option "js.intl-402" "true")
      (allowHostAccess HostAccess/NONE)
      (allowHostClassLookup no-host-class-lookup)
      (out System/out)
      (err System/err)
      (allowIO false)
      (build)))

;;; ---------------------------------------- Untrusted plugin sandbox ----------------------------------------
;;;
;;; Stronger sandbox for running *untrusted* custom-viz plugin JS (third-party bundles). Unlike [[context]],
;;; which relies on `HostAccess/NONE` + config flags in the host JVM, this runs the guest inside a GraalVM
;;; native-image isolate (separate VM, separate heap) under `SandboxPolicy/UNTRUSTED`, so CPU/heap limits and
;;; speculative-execution mitigations are enforced by the VM. Requires the `js-isolate-community` artifact on
;;; the classpath. Built-in static-viz keeps the faster in-process [[context]] path; only plugins pay for the
;;; isolate.

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
  cgroup ceiling. Deliberately generous — underestimating risks an OOM-kill of the whole pod."
  (* 512 1024 1024))

(def ^:private isolate-memory-safety-margin-ratio
  "Fraction of the pod memory limit kept free as headroom, on top of the explicit reserves."
  0.15)

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
          ;; per-context heap must be < engine-wide isolate memory; half keeps the invariant and matches the
          ;; historical 1GB / 512MB pairing.
          heap-bytes   (quot iso-bytes 2)
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
  cumulative [[pool-max-cpu-time]] instead — see `metabase.channel.render.js.svg`."
  "30s")

(def pool-max-cpu-time
  "`sandbox.MaxCPUTime` for a *pooled*, long-lived untrusted context (the prod path). MaxCPUTime is a
  *cumulative* per-context lifetime budget, not per-render: it must cover the one-time cold parse of the ~16MB
  bundle at pool generation (>10s of guest CPU) plus the many renders the context then serves before the pool
  recycles it. When exceeded the context is cancelled — the pool disposes and regenerates it. Sized generously
  so, under normal load, the 10-minute pool expiry recycles a context before this cumulative cap does; it still
  bounds a runaway plugin (to this many seconds of accumulated CPU) without a per-render cap. Trade-off of
  pooling for speed: there is no tight per-render CPU bound, only this coarse cumulative one plus MaxHeapMemory."
  "180s")

(defn untrusted-plugin-context
  "Create a `SandboxPolicy/UNTRUSTED` GraalVM isolate `Context` for running untrusted custom-viz plugin JS.
  The guest runs in a separate isolate heap with VM-enforced CPU/heap/AST limits; like [[context]] it has no
  host access and no IO, so data must cross the boundary as JSON strings. Requires `js-isolate-community` on
  the classpath. The `sandbox.*` limits below are all mandatory under `UNTRUSTED` — the context fails to build
  if any is unset. `max-cpu-time` is the `sandbox.MaxCPUTime` budget (default [[render-max-cpu-time]] for the
  dev fresh-context path; the pool passes the larger cumulative [[pool-max-cpu-time]]). `sandbox.MaxHeapMemory`
  is derived from the pod memory limit at startup (see [[isolate-memory-config]]) so a runaway render fails
  closed below the cgroup ceiling."
  (^Context [] (untrusted-plugin-context render-max-cpu-time))
  (^Context [^String max-cpu-time]
   (.. (Context/newBuilder (into-array String ["js"]))
       (engine @shared-untrusted-plugin-engine)
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

(defn load-js-string
  "Load a string literal source into the js context."
  [^Context context ^String string-src ^String src-name]
  (.eval context (.buildLiteral (Source/newBuilder "js" string-src src-name))))

(defn load-resource
  "Load a resource into the js context"
  [^Context context source]
  (let [resource (io/resource source)]
    (when (nil? resource)
      (throw (ex-info (trs "Javascript resource not found: {0}" source)
                      {:source source})))
    ;; Build a *literal* Source from the resource content rather than a URL-backed Source. A URL-backed
    ;; Source fails to marshal across the `SandboxPolicy/UNTRUSTED` native-isolate boundary
    ;; ([[untrusted-plugin-context]]) — GraalVM's SourceCopyMarshaller throws `ShouldNotReachHere` — when the
    ;; resource is a `jar:` URL (i.e. running from the packaged uberjar). It happens to work from a `file:` URL
    ;; (running from source), so the failure only shows up when deployed. A literal Source carries only content
    ;; + name, so it marshals identically whether the resource lives on disk or inside the jar. `source` is kept
    ;; as the source name so stack traces still point at the right file.
    (.eval context (.buildLiteral (Source/newBuilder "js" ^String (slurp resource :encoding "UTF-8") ^String source)))))

(defn execute-fn-name
  "Executes `js-fn-name` in js context with args"
  ^Value [^Context context js-fn-name & args]
  ;; TODO: locking context is not ideal, but contexts are currently being shared with all threads and GraalVM doesn't
  ;; support concurrent execution for js.
  ;; There is a couple of idea we can try:
  ;; - put a thread pool around context initialization
  ;; - init a new context for each thread
  (locking context
    (let [fn-ref (.eval context "js" js-fn-name)
          args   (into-array Object args)]
      (assert (.canExecute fn-ref) (str "cannot execute " js-fn-name))
      (.execute fn-ref args))))

(defn execute-fn
  "fn-ref should be an executable org.graalvm.polyglot.Value return from a js engine. Invoke this function with args."
  ^Value [^Value fn-ref & args]
  (assert (.canExecute fn-ref) "cannot execute function reference")
  (.execute fn-ref (object-array args)))
