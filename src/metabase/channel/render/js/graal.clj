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
  neither context nor engine on GC). The first render after an idle gap rebuilds them. The untrusted
  custom-viz isolate engine follows the same ref-counted lifecycle (see [[ref-counted-engine]])."
  (:require
   [clojure.java.io :as io]
   [metabase.channel.render.js.common :as common]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.config.core :as config]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.pool :as u.pool])
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
  (if-let [resource (io/resource source-path)]
    (.build (Source/newBuilder "js" ^java.net.URL resource))
    (throw (ex-info (trs "Javascript resource not found: {0}" source-path)
                    {:source source-path}))))

(defn- eval-source
  "Evaluate an already-built `Source` in the js context."
  [^Context context ^Source source]
  (.eval context source))

(defn load-resource
  "Load a JS classpath resource into `context` as a *literal* `Source` (content, not URL-backed).
  It's needed for the `SandboxPolicy/UNTRUSTED` context"
  [^Context context ^String source-path]
  (if-let [resource (io/resource source-path)]
    (.eval context (.buildLiteral (Source/newBuilder "js" ^String (slurp resource :encoding "UTF-8") source-path)))
    (throw (ex-info (trs "Javascript resource not found: {0}" source-path)
                    {:source source-path}))))

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

;;; ------------------------------------- ref-counted engine holder ---------------------------------------
;;;
;;; Generic lifecycle tool: a lazily-created `Engine` shared by pooled contexts, closed again when the last
;;; context is destroyed. Used by both the trusted and the untrusted-isolate pool below.

(def ^:private CreateEngineState
  "Schema for a [[ref-counted-engine]] `create` fn: builds the shared state"
  [:=> [:cat] [:map [:engine (ms/InstanceOfClass Engine)]]])

(def ^:private EngineState
  "What lives inside a [[RefCountedEngine]]'s `:state` atom while the engine is live: the map its `create`
  returned plus `:refs`, the count of live contexts holding the engine open. nil when no engine is live."
  [:map
   [:engine (ms/InstanceOfClass Engine)]
   [:refs   pos-int?]])

(def ^:private RefCountedEngine
  "Schema for the holder built by [[ref-counted-engine]]. `:state` holds [[EngineState]] or nil."
  [:map
   [:lock   some?]
   [:state  (ms/InstanceOfClass clojure.lang.Atom)]
   [:create CreateEngineState]])

(mu/defn- ref-counted-engine :- RefCountedEngine
  "A ref-counted holder for an `Engine` shared by pooled contexts, plus any extra state `create` returns
  alongside it (e.g. a parsed `Source`). `create` runs under the first [[acquire-engine!]]; the engine is
  closed by the [[release-engine!]] that drops the last ref. Needed because GraalVM reclaims neither
  engines nor contexts on GC — an idle-shrunk pool must close its engine explicitly to get the memory back."
  [create :- CreateEngineState]
  {:lock (Object.), :state (atom nil), :create create})

(mu/defn- acquire-engine! :- EngineState
  "Return `engine-ref`'s shared state (`{:engine <Engine>}` plus whatever its `create` returned), creating
  it with the first acquire. Bumps the ref count."
  [{:keys [lock state create]} :- RefCountedEngine]
  (locking lock
    (let [current (update (or @state (assoc (create) :refs 0)) :refs inc)]
      (reset! state current)
      current)))

(mu/defn- release-engine!
  "Drop a ref on `engine-ref`'s shared engine, closing it once the last ref is gone."
  [{:keys [lock state]} :- RefCountedEngine]
  (locking lock
    (let [{:keys [^Engine engine refs]} @state]
      (if (<= refs 1)
        (do (try (.close engine) (catch Exception _))
            (reset! state nil))
        (swap! state update :refs dec)))))

;;; ------------------------------------ trusted engine + contexts ----------------------------------------

(def ^:private shared-engine
  "Ref-counted `Engine` + parsed bundle `Source` shared by every pooled trusted context: created with the
  first context ([[generate-context!]]) and closed with the last ([[destroy-context!]])."
  (ref-counted-engine
   (fn []
     {:source (build-source common/bundle-resource-path)
      :engine (create-engine)})))

(defn- generate-context!
  "Build a context on the shared engine and evaluate the bundle into it (creating the engine + parsing the
  bundle if this is the first context)."
  ^Context []
  (common/assert-tests-not-initializing!)
  (let [{:keys [^Engine engine ^Source source]} (acquire-engine! shared-engine)]
    (try
      (doto (create-context engine)
        (eval-source source))
      (catch Throwable t
        (release-engine! shared-engine)
        (throw t)))))

(defn- destroy-context!
  "Close a context and drop its ref on the shared engine (closing the engine if it was the last context)."
  [^Context context]
  (try (.close context true) (catch Exception _))
  (release-engine! shared-engine))

;;; ------------------------------------------------ context pool -----------------------------------------

(def ^:private pool-key
  "Dirigiste pools are keyed; the key itself is arbitrary, it just has to be the same for every operation."
  :static-viz)

(def ^:private ^Pool static-viz-context-pool
  "A pool of up to three static-viz contexts, each held exclusively from acquire to release, so at most
  three renders run at once — one per context, on the shared engine. When idle for up to 10 minutes the
  pool shrinks to 0 and the generator's `destroy` closes the context (and, on the last one, the shared
  engine); the first render after an idle gap rebuilds them. See
  [[metabase.util.pool/create-pool]]."
  (u.pool/create-pool generate-context! destroy-context! {:max-size 3, :idle-minutes 10}))

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

;;; ---------------------------------------- Untrusted plugin sandbox -------------------------------------
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
;;; against the same pod/container.
(def ^:private max-isolate-memory
  "`engine.MaxIsolateMemory`: hard cap on the untrusted isolate's whole heap. Should cover the slim
  custom-viz bundle plus a real render."
  "512MB")

(def ^:private max-heap-memory
  "`sandbox.MaxHeapMemory`: per-context guest-heap cap. GraalVM requires it strictly below the engine-wide
  [[max-isolate-memory]]"
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

(def ^:private shared-untrusted-plugin-engine
  "Ref-counted GraalVM isolate `Engine` shared by every untrusted custom-viz plugin context: created with
  the first context ([[generate-untrusted-context!]]) and closed with the last
  ([[destroy-untrusted-context!]]), so an idle-shrunk pool frees the isolate's native heap (up to
  [[max-isolate-memory]]) instead of pinning it for the process lifetime. Contexts on a shared engine
  still get isolated global scopes (one plugin can't see another's globals), while sharing the isolate's
  parsed-source cache."
  (ref-counted-engine (fn [] {:engine (new-untrusted-plugin-engine)})))

(def render-max-cpu-time
  "`sandbox.MaxCPUTime` for a *non-pooled* untrusted context (the dev fresh-context path). Covers a cold parse
  of the static-viz bundle plus a single render on dev hardware. Prod uses a pooled context with the larger,
  cumulative [[pool-max-cpu-time]] instead — see [[untrusted-static-viz-context-pool]]."
  "30s")

(def pool-max-cpu-time
  "`sandbox.MaxCPUTime` for a *pooled*, long-lived untrusted context (the prod path). MaxCPUTime is a
  *cumulative* per-context lifetime budget, not per-render: it must cover the one-time cold parse of the
  slim bundle at pool generation plus the many renders the context then serves."
  "180s")

(defn untrusted-plugin-context
  "Create a `SandboxPolicy/UNTRUSTED` GraalVM isolate `Context` on `engine` (which must itself declare
  `SandboxPolicy/UNTRUSTED` — see [[new-untrusted-plugin-engine]]) for running untrusted custom-viz plugin
  JS. The guest runs in a separate isolate heap with VM-enforced CPU/heap/AST limits; like
  [[create-context]] it has no host access and no IO, so data must cross the boundary as JSON strings."
  (^Context [^Engine engine] (untrusted-plugin-context engine render-max-cpu-time))
  (^Context [^Engine engine ^String max-cpu-time]
   (.. (Context/newBuilder (into-array String ["js"]))
       (engine engine)
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
       ;; MaxCPUTimeCheckInterval left at its ~10ms default
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

(defn- destroy-untrusted-context!
  "Close an untrusted isolate context reaped or disposed by the pool and drop its ref on the shared
  untrusted engine (closing the engine — and freeing its isolate heap — with the last context)."
  [^Context context]
  (log/debug "custom-viz: disposing untrusted static-viz isolate context")
  (try (.close context true) (catch Exception _))
  (release-engine! shared-untrusted-plugin-engine))

(defn- generate-untrusted-context!
  "Cold-parse the slim custom-viz bundle into a fresh isolate context on the shared untrusted engine
  (creating the engine with the first context); logged with timing because this is the dominant
  per-context cost and explains slow first/regenerated renders."
  (^Context [] (generate-untrusted-context! pool-max-cpu-time))
  (^Context [^String max-cpu-time]
   (common/assert-tests-not-initializing!)
   (let [start (System/nanoTime)
         {:keys [^Engine engine]} (acquire-engine! shared-untrusted-plugin-engine)]
     (try
       (let [context (untrusted-plugin-context engine max-cpu-time)]
         (try
           (load-resource context common/custom-viz-bundle-resource-path)
           (log/infof "custom-viz: generated untrusted static-viz isolate context (cold-parsed slim bundle) in %.0fms"
                      (/ (- (System/nanoTime) start) 1e6))
           context
           (catch Throwable t
             ;; a bundle-load failure would otherwise leak the freshly-built isolate; close it and rethrow
             ;; (the engine ref is dropped by the outer catch)
             (try (.close context true) (catch Exception _))
             (throw t))))
       (catch Throwable t
         (release-engine! shared-untrusted-plugin-engine)
         (throw t))))))

(def ^:private ^Pool untrusted-static-viz-context-pool
  "Pool of `SandboxPolicy/UNTRUSTED` isolate contexts for rendering untrusted custom-viz plugin JS. Mirrors
  [[static-viz-context-pool]] but for the isolate path."
  (common/create-pool generate-untrusted-context! destroy-untrusted-context! {:max-size 1, :idle-minutes 10}))

(defn do-with-untrusted-static-viz-context
  "Acquire a pooled `SandboxPolicy/UNTRUSTED` isolate context"
  [f]
  (if config/is-dev?
    ;; a throwaway context per call, like [[do-with-static-viz-context]]'s dev path — with the tighter
    ;; single-render [[render-max-cpu-time]] budget
    (let [^Context context (generate-untrusted-context! render-max-cpu-time)]
      (try
        (f context)
        (finally
          (destroy-untrusted-context! context))))
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

(defn- chart-with-custom-viz*
  "Render `input` on a pooled `SandboxPolicy/UNTRUSTED` isolate context (slim custom-viz bundle already
  loaded by the pool) after evaluating and registering the custom-viz plugin `bundles` (untrusted
  third-party JS) into it. Plugin bundles are untrusted third-party JS, so this never touches the trusted
  in-process pool."
  [input bundles]
  (let [ids   (mapv :identifier bundles)
        start (System/nanoTime)]
    (log/infof "custom-viz: static-rendering plugin(s) %s" ids)
    (let [result (do-with-untrusted-static-viz-context
                  (^:once fn* [^Context context]
                    (let [register-start (System/nanoTime)]
                      (execute-fn-name context "MetabaseStaticViz.initializeContextJSON" (json/encode (:options input)))
                      (doseq [{:keys [identifier plugin-id source]} bundles]
                        (load-js-string context source (str "custom-viz-" identifier ".js"))
                        (execute-fn-name context "MetabaseStaticViz.registerCustomVizPlugin" identifier plugin-id))
                      (log/debugf "custom-viz: registered plugin(s) %s in %.0fms"
                                  ids (/ (- (System/nanoTime) register-start) 1e6)))
                    (.asString ^Value (execute-fn-name context "MetabaseStaticViz.renderChartJSON" (json/encode input)))))]
      (log/infof "custom-viz: static-rendered %s in %.0fms (incl. context acquire/generation)"
                 ids (/ (- (System/nanoTime) start) 1e6))
      result)))

(defn renderer
  "The GraalVM [[metabase.channel.render.js.protocol/StaticVizRenderer]] — runs the static-viz JS
  in-process on the pooled GraalVM context, except `chart-with-custom-viz` (untrusted plugin JS), which
  renders on the pooled `SandboxPolicy/UNTRUSTED` isolate instead. Each method JSON-encodes its `input` map
  for the bundle and decodes the bundle's JSON result back into Clojure data."
  []
  (reify js.protocol/StaticVizRenderer
    (chart [_ input]
      (json/decode+kw (call-js "renderChartJSON" [(json/encode input)])))
    (chart-with-custom-viz [_ input custom-viz-bundles]
      (json/decode+kw (chart-with-custom-viz* input custom-viz-bundles)))
    (cell-background-colors [_ input]
      (json/decode (call-js "getCellBackgroundColorsJSON" [(json/encode input)])))))
