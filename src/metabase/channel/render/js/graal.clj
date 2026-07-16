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
   [metabase.util.i18n :refer [trs]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (io.aleph.dirigiste Pool)
   (java.io OutputStream)
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

;;; ---- Isolate memory caps (fail closed, catchable) ----
;;;
;;; The isolate is a separate heap but runs in the *same OS process* as the JVM, so its native memory counts
;;; against the same pod/container cgroup. If it grew unbounded it would push process RSS over the cgroup limit
;;; and the kernel OOM-killer would SIGKILL the whole pod (uncatchable). Capping the isolate makes a runaway
;;; render hit the isolate's own limit first and throw a catchable `PolyglotException`, which the render path
;;; degrades to a placeholder — the app survives, only that render fails. The slim custom-viz bundle is small
;;; enough that a fixed cap works everywhere; no pod-size-derived budget needed.

(def ^:private max-isolate-memory
  "`engine.MaxIsolateMemory`: hard cap on the untrusted isolate's whole heap. Comfortably covers the slim
  custom-viz bundle plus a real render, while staying small enough not to threaten the pod's cgroup limit."
  "512MB")

(def ^:private max-heap-memory
  "`sandbox.MaxHeapMemory`: per-context guest-heap cap. GraalVM requires it strictly below the engine-wide
  [[max-isolate-memory]]; the gap covers the isolate's non-guest-heap memory (code cache, metadata, GC
  bookkeeping)."
  "416MB")

(defn- new-untrusted-plugin-engine
  "Build the isolate `Engine` shared by every untrusted-plugin context. `engine.MaxIsolateMemory` caps the
  whole isolate heap and must exceed the per-context `sandbox.MaxHeapMemory` set in
  [[untrusted-plugin-context]], so the isolate fails closed below the cgroup ceiling instead of OOM-killing
  the pod."
  ^Engine []
  (.. (Engine/newBuilder (into-array String ["js"]))
      ;; A shared engine and its contexts must declare the same sandbox policy, so the engine sets UNTRUSTED
      ;; too — otherwise creating an UNTRUSTED context on it would fail the engine/context policy-match check.
      (sandbox SandboxPolicy/UNTRUSTED)
      (option "engine.MaxIsolateMemory" max-isolate-memory)
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
  slim bundle at pool generation plus the many renders the context then serves. When exceeded the context is
  cancelled — [[do-with-untrusted-static-viz-context]] disposes it and the pool regenerates a fresh one. It
  still bounds a runaway plugin (to this many seconds of accumulated CPU) without a per-render cap. Trade-off
  of pooling for speed: there is no tight per-render CPU bound, only this coarse cumulative one plus
  MaxHeapMemory."
  "180s")

(defn untrusted-plugin-context
  "Create a `SandboxPolicy/UNTRUSTED` GraalVM isolate `Context` for running untrusted custom-viz plugin JS.
  The guest runs in a separate isolate heap with VM-enforced CPU/heap/AST limits; like [[create-context]] it
  has no host access and no IO, so data must cross the boundary as JSON strings. Requires
  `js-isolate-community` on the classpath. The `sandbox.*` limits below are all mandatory under `UNTRUSTED` —
  the context fails to build if any is unset. `max-cpu-time` is the `sandbox.MaxCPUTime` budget (default
  [[render-max-cpu-time]] for the dev fresh-context path; the pool passes the larger cumulative
  [[pool-max-cpu-time]]). `sandbox.MaxHeapMemory` ([[max-heap-memory]]) makes a runaway render fail closed
  (catchable) instead of OOM-killing the pod."
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
       (option "sandbox.MaxHeapMemory" max-heap-memory)
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

(defn- destroy-untrusted-context!
  "Close an untrusted isolate context reaped or disposed by the pool. The shared untrusted engine is a
  process-lifetime singleton, so unlike [[destroy-context!]] there is no engine ref to drop."
  [^Context context]
  (log/debug "custom-viz: disposing untrusted static-viz isolate context")
  (try (.close context true) (catch Exception _)))

(def ^:private ^Pool untrusted-static-viz-context-pool
  "Pool of `SandboxPolicy/UNTRUSTED` isolate contexts for rendering untrusted custom-viz plugin JS. Mirrors
  [[static-viz-context-pool]] but for the isolate path, and loads the slim custom-viz-only bundle
  ([[metabase.channel.render.js.common/custom-viz-bundle-resource-path]]) instead of the full one — this pool
  only ever renders `custom:` cards, so the built-in chart stack would be pure parse-time/heap dead weight.
  Pooling means the bundle is parsed once per pooled context and reused across renders, instead of the old
  unpooled path that re-parsed on every render (the 55s pulse-test regression).

  Capped at 1 context: native isolate memory is what previously OOM-killed the server, so we keep exactly one
  (up to [[max-isolate-memory]]) and let per-context serialization handle concurrency. Like the trusted pool it
  shrinks to 0 when idle; the first render after an idle gap re-parses the slim bundle. A context whose
  cumulative `sandbox.MaxCPUTime` ([[pool-max-cpu-time]]) is exhausted is cancelled and disposed by
  [[do-with-untrusted-static-viz-context]] so the pool regenerates a fresh one.

  Trade-off vs. a fresh-context-per-render design: reused contexts share JS global state across renders
  (acceptable — the isolate still fully contains plugins from the host), and there is no tight per-render
  CPU bound (only the coarse cumulative one)."
  (common/create-pool generate-untrusted-context! destroy-untrusted-context! {:max-size 1, :idle-minutes 10}))

(defn do-with-untrusted-static-viz-context
  "Acquire a pooled `SandboxPolicy/UNTRUSTED` isolate context ([[untrusted-static-viz-context-pool]]) with the
  slim custom-viz bundle already loaded, run `f` with it, then release it back to the pool. In dev, uses a
  fresh context each time (mirrors [[do-with-static-viz-context]]) so a fresh `bun run build-static-viz` is
  picked up without a REPL restart. A context that hits a sandbox limit (cancelled / resource-exhausted) is
  disposed (not released) so the pool regenerates."
  [f]
  (if config/is-dev?
    (let [^Context context (doto (untrusted-plugin-context)
                             (load-resource common/custom-viz-bundle-resource-path))]
      (try
        (f context)
        (finally
          (try (.close context true) (catch Throwable _)))))
    (let [^Context context (.acquire untrusted-static-viz-context-pool pool-key)
          disposed?        (volatile! false)]
      (try
        (f context)
        (catch PolyglotException e
          ;; A cancelled / resource-exhausted context is permanently unusable; dispose it so the pool
          ;; regenerates a fresh one rather than handing a dead context to the next render.
          (when (or (.isCancelled e) (.isResourceExhausted e))
            (vreset! disposed? true)
            (log/warnf "custom-viz: untrusted static-viz context hit a sandbox limit (cancelled=%s resource-exhausted=%s); disposing and regenerating. %s"
                       (.isCancelled e) (.isResourceExhausted e) (.getMessage e))
            (.dispose untrusted-static-viz-context-pool pool-key context))
          (throw e))
        (finally
          (when-not @disposed?
            (.release untrusted-static-viz-context-pool pool-key context)))))))

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
