(ns metabase.channel.render.js.graal
  "The GraalVM metabase.channel.render.js.protocol/StaticVizRenderer runs all static-viz JS inside a
  GraalVM native-image isolate (separate VM, separate heap) under `SandboxPolicy/UNTRUSTED`, so CPU/heap
  limits and speculative-execution mitigations are enforced by the VM. Requires the `js-isolate-community`
  artifact on the classpath.

  One ref-counted isolate `Engine` (see [[shared-untrusted-engine]]) is shared by two context pools that
  never mix taints:

  - the *builtin* pool (up to 3 contexts, full static-viz bundle) renders built-in charts and only ever
    evaluates our own bundle;
  - the *plugin* pool (1 context, slim custom-viz bundle) is the only place untrusted third-party
    custom-viz plugin JS runs.

  Contexts on a shared engine have isolated global scopes (a plugin can't see another context's globals)
  while sharing the engine's parsed-source code cache. A context is held exclusively per render."
  (:require
   [clojure.java.io :as io]
   [metabase.channel.render.js.common :as common]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.pool :as u.pool])
  (:import
   (io.aleph.dirigiste Pool)
   (java.io OutputStream)
   (org.graalvm.polyglot Context Engine HostAccess PolyglotException SandboxPolicy Source Value)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ evaluation helpers -----------------------------------------

(defn load-js-string
  "Load a string literal source into the js context."
  [^Context context ^String string-src ^String src-name]
  (.eval context (.buildLiteral (Source/newBuilder "js" string-src src-name))))

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

;;; ------------------------------------- untrusted isolate engine ----------------------------------------

(def ^:private ^OutputStream discarding-output-stream
  "Sink for untrusted-guest stdout/stderr — guest console output (ours or a plugin's) is not useful in
  server logs, plugin output is additionally untrusted, and `SandboxPolicy/UNTRUSTED` bounds it via
  `sandbox.Max*StreamSize` regardless."
  (proxy [OutputStream] []
    (write
      ([_])
      ([_ _ _]))))

;;; ---- Isolate memory caps (fail closed, catchable) ----
;;;
;;; The isolate is a separate heap but runs in the *same OS process* as the JVM, so its native memory counts
;;; against the same pod/container.
(def ^:private max-isolate-memory
  "`engine.MaxIsolateMemory`: hard cap on the untrusted isolate's *whole* heap across every live context —
  a ceiling, not a reservation, and deliberately an overcommit. The pools budget three contexts total
  ([[builtin-pool-max-size]] + 1 plugin), each capped at 416MB [[max-heap-memory]], so their per-context
  caps sum above this; that's intentional — real renders don't all peak at once, and this ceiling is what
  actually bounds the isolate's native memory against the pod. If several contexts *do* peak together and
  hit this cap, the isolate fails closed (a resource-exhausted render → error card), never OOM-kills the
  pod. Must stay strictly above the per-context [[max-heap-memory]] (GraalVM requires it)."
  "1024MB")

(def ^:private max-heap-memory
  "`sandbox.MaxHeapMemory`: per-context guest-heap cap. GraalVM requires it strictly below the engine-wide
  [[max-isolate-memory]]"
  "416MB")

(defn- new-untrusted-engine
  "Build the isolate `Engine` shared by every untrusted context. `engine.MaxIsolateMemory` caps the
  whole isolate heap and must exceed the per-context `sandbox.MaxHeapMemory` set in
  [[untrusted-context]], so the isolate fails closed below the cgroup ceiling instead of OOM-killing
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

(def ^:private engine-lock (Object.))

(def ^:private shared-untrusted-engine
  "Atom holding `{:engine <Engine>, :refs <live context count>}`, or nil when no context is live. Guarded
  by [[engine-lock]]. The single UNTRUSTED isolate `Engine` is shared by every context from both pools:
  created with the first context ([[acquire-untrusted-engine!]]) and closed with the last
  ([[release-untrusted-engine!]]) — from either pool — so idle-shrunk pools free the isolate's native heap
  (up to [[max-isolate-memory]]) instead of pinning it for the process lifetime. Contexts on the shared
  engine still get isolated global scopes (builtin and plugin contexts can't see each other's globals),
  while sharing the isolate's parsed-source cache. GraalVM reclaims neither engine nor contexts on GC, so
  the last release must close the engine explicitly to get the memory back."
  (atom nil))

(defn- acquire-untrusted-engine!
  "Return the shared UNTRUSTED isolate `Engine`, creating it with the first context. Bumps the ref count."
  ^Engine []
  (locking engine-lock
    (let [state (or @shared-untrusted-engine {:engine (new-untrusted-engine), :refs 0})]
      (reset! shared-untrusted-engine (update state :refs inc))
      (:engine state))))

(defn- release-untrusted-engine!
  "Drop a ref on the shared engine, closing it once the last context is gone."
  []
  (locking engine-lock
    (let [{:keys [^Engine engine refs]} @shared-untrusted-engine]
      (if (<= refs 1)
        (do (try (.close engine) (catch Exception _))
            (reset! shared-untrusted-engine nil))
        (swap! shared-untrusted-engine update :refs dec)))))

(def ^:private render-max-cpu-time
  "`sandbox.MaxCPUTime` for a *non-pooled* untrusted context (the dev fresh-context path). Covers a cold parse
  of the static-viz bundle plus a single render on dev hardware. Prod uses a pooled context with the larger,
  cumulative [[pool-max-cpu-time]] instead."
  "30s")

(def ^:private pool-max-cpu-time
  "`sandbox.MaxCPUTime` for a *pooled*, long-lived untrusted context (the prod path). MaxCPUTime is a
  *cumulative* per-context lifetime budget, not per-render: it must cover the one-time cold parse of the
  bundle at pool generation plus the many renders the context then serves. The builtin pool proactively
  recycles contexts before this budget runs out mid-render — see [[pool-cpu-soft-limit-ms]]."
  "180s")

(defn untrusted-context
  "Create a `SandboxPolicy/UNTRUSTED` GraalVM isolate `Context` on `engine` (which must itself declare
  `SandboxPolicy/UNTRUSTED` — see [[new-untrusted-engine]]). The guest runs in a separate isolate heap
  with VM-enforced CPU/heap/AST limits, no host access, and no IO, so data must cross the boundary as
  JSON strings."
  (^Context [^Engine engine] (untrusted-context engine render-max-cpu-time))
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

;;; ------------------------------------ untrusted context generation -------------------------------------

(defn- destroy-untrusted-context!
  "Close an untrusted isolate context reaped or disposed by a pool and drop its ref on the shared
  untrusted engine (closing the engine — and freeing its isolate heap — with the last context)."
  [^Context context]
  (log/debug "static-viz: disposing untrusted isolate context")
  (try (.close context true) (catch Exception _))
  (release-untrusted-engine!))

(defn- generate-untrusted-context!*
  "Cold-parse the bundle at `bundle-path` into a fresh isolate context on the shared untrusted engine
  (creating the engine with the first context); logged with timing because this is the dominant
  per-context cost and explains slow first/regenerated renders."
  ^Context [^String bundle-path ^String max-cpu-time bundle-label]
  (common/assert-tests-not-initializing!)
  (let [start          (System/nanoTime)
        ^Engine engine (acquire-untrusted-engine!)]
    (try
      (let [context (untrusted-context engine max-cpu-time)]
        (try
          (load-resource context bundle-path)
          (log/infof "static-viz: generated untrusted isolate context (cold-parsed %s bundle) in %.0fms"
                     bundle-label (/ (- (System/nanoTime) start) 1e6))
          context
          (catch Throwable t
            ;; a bundle-load failure would otherwise leak the freshly-built isolate; close it and rethrow
            ;; (the engine ref is dropped by the outer catch)
            (try (.close context true) (catch Exception _))
            (throw t))))
      (catch Throwable t
        (release-untrusted-engine!)
        (throw t)))))

(defn- generate-untrusted-plugin-context!
  "Fresh isolate context with the slim custom-viz bundle — the only kind of context that ever evaluates
  untrusted third-party plugin JS."
  (^Context [] (generate-untrusted-plugin-context! pool-max-cpu-time))
  (^Context [^String max-cpu-time]
   (generate-untrusted-context!* common/custom-viz-bundle-resource-path max-cpu-time "slim custom-viz")))

(defn- generate-untrusted-builtin-context!*
  "Fresh isolate context with the full static-viz bundle, as a raw `Context` (the dev throwaway path)."
  ^Context [^String max-cpu-time]
  (generate-untrusted-context!* common/bundle-resource-path max-cpu-time "full static-viz"))

(defn- generate-untrusted-builtin-context!
  "Pool generator for the builtin pool. Returns a wrapper map, not a raw `Context`: dirigiste hands the
  same object back on release/dispose/destroy, so wrapping lets the cumulative-CPU accumulator `:used-ms`
  (see [[pool-cpu-soft-limit-ms]]) travel with its context without a global table."
  []
  {:context (generate-untrusted-builtin-context!* pool-max-cpu-time)
   :used-ms (atom 0)})

(defn- destroy-untrusted-builtin-context!
  "Unwrap a builtin-pool wrapper (see [[generate-untrusted-builtin-context!]]) and destroy its context."
  [{:keys [^Context context]}]
  (destroy-untrusted-context! context))

;;; ---------------------------------------- untrusted context pools --------------------------------------

(def ^:private pool-key
  "Dirigiste pools are keyed; the key itself is arbitrary, it just has to be the same for every operation."
  :static-viz)

(def ^:private ^Pool untrusted-plugin-context-pool
  "Pool of isolate contexts (slim custom-viz bundle) for rendering untrusted custom-viz plugin JS. A
  context is held exclusively from acquire to release; when idle for 10 minutes the pool shrinks to 0 and
  the generator's `destroy` closes the context (and, on the last context from either pool, the shared
  engine). See [[metabase.util.pool/create-pool]]."
  (u.pool/create-pool generate-untrusted-plugin-context! destroy-untrusted-context! {:max-size 1, :idle-minutes 10}))

(defn- builtin-pool-max-size
  "How many builtin isolate contexts the pool may hold — the whole isolate is budgeted for three contexts
  total. When custom-viz is enabled, one slot is reserved for [[untrusted-plugin-context-pool]] so a
  plugin render isn't starved behind three builtin renders (builtin gets 2, plugin 1). When it's disabled
  the plugin pool is never used, so builtin gets all 3."
  []
  (if (premium-features/enable-custom-viz?) 2 3))

(def ^:private untrusted-builtin-context-pool
  "Pool of isolate contexts (full static-viz bundle) for rendering built-in static viz, so at most
  [[builtin-pool-max-size]] builtin renders run at once — one per context. Pools wrappers (see
  [[generate-untrusted-builtin-context!]]), not raw contexts. Same idle-shrink behavior as
  [[untrusted-plugin-context-pool]]. Held in a `delay` so the max-size decision is made on the first
  render — after premium features have loaded — rather than at namespace load."
  (delay
    (u.pool/create-pool generate-untrusted-builtin-context! destroy-untrusted-builtin-context!
                        {:max-size (builtin-pool-max-size), :idle-minutes 10})))

(def ^:private pool-cpu-soft-limit-ms
  "Recycle a pooled builtin context once its renders' cumulative host wall time passes this threshold —
  well before the context's hard [[pool-max-cpu-time]] budget (which is cumulative, and whose exhaustion
  would kill a render *mid-flight*). Host wall time upper-bounds the single-threaded guest's CPU time, so
  accounting with it errs toward recycling early, which is safe: the pool regenerates off the render path."
  120000)

(defn- do-with-throwaway-plugin-context
  "Dev plugin path: build a throwaway plugin context per call — so a fresh `bun run build-static-viz` is
  picked up without a REPL restart — with the tighter single-render [[render-max-cpu-time]] budget, run
  `f`, and close it."
  [f]
  (let [^Context context (generate-untrusted-plugin-context! render-max-cpu-time)]
    (try
      (f context)
      (finally
        (destroy-untrusted-context! context)))))

(defn- do-with-pooled-plugin-context
  "Prod plugin path: borrow a context from [[untrusted-plugin-context-pool]] and run `f` with it,
  disposing (rather than releasing) any context left permanently unusable by a sandbox-limit hit."
  [f]
  (let [^Context context (.acquire untrusted-plugin-context-pool pool-key)
        disposed?        (volatile! false)]
    (try
      (f context)
      (catch PolyglotException e
        ;; A cancelled / resource-exhausted context is permanently unusable; dispose it so the pool
        ;; regenerates a fresh one rather than handing a dead context to the next render.
        (when (or (.isCancelled e) (.isResourceExhausted e))
          (vreset! disposed? true)
          (log/warnf "static-viz: untrusted plugin context hit a sandbox limit (cancelled=%s resource-exhausted=%s); disposing and regenerating. %s"
                     (.isCancelled e) (.isResourceExhausted e) (.getMessage e))
          (.dispose untrusted-plugin-context-pool pool-key context))
        (throw e))
      (finally
        (when-not @disposed?
          (.release untrusted-plugin-context-pool pool-key context))))))

(defn do-with-untrusted-plugin-context
  "Acquire a plugin isolate context (slim custom-viz bundle) and call `f` with it, held exclusively for
  the call (never let it — or a context-bound `Value` — escape)."
  [f]
  (if config/is-dev?
    (do-with-throwaway-plugin-context f)
    (do-with-pooled-plugin-context f)))

(defn- do-with-throwaway-builtin-context
  "Dev builtin path: build a throwaway builtin context per call — so a fresh `bun run build-static-viz` is
  picked up without a REPL restart — with the tighter single-render [[render-max-cpu-time]] budget, run
  `f`, and close it."
  [f]
  (let [^Context context (generate-untrusted-builtin-context!* render-max-cpu-time)]
    (try
      (f context)
      (finally
        (destroy-untrusted-context! context)))))

(defn- do-with-pooled-builtin-context
  "Prod builtin path: borrow a wrapper from [[untrusted-builtin-context-pool]] and run `f` with its
  context, disposing (rather than releasing) it when a sandbox-limit hit leaves it unusable or when its
  renders' cumulative CPU crosses [[pool-cpu-soft-limit-ms]] — see that var for why recycling is proactive."
  [f]
  (let [^Pool pool (deref untrusted-builtin-context-pool)
        {:keys [^Context context used-ms] :as wrapper} (.acquire pool pool-key)
        disposed?  (volatile! false)
        start      (System/nanoTime)]
    (try
      (f context)
      (catch PolyglotException e
        ;; A cancelled / resource-exhausted context is permanently unusable; dispose it so the pool
        ;; regenerates a fresh one rather than handing a dead context to the next render.
        (when (or (.isCancelled e) (.isResourceExhausted e))
          (vreset! disposed? true)
          (log/warnf "static-viz: untrusted builtin context hit a sandbox limit (cancelled=%s resource-exhausted=%s); disposing and regenerating. %s"
                     (.isCancelled e) (.isResourceExhausted e) (.getMessage e))
          (.dispose pool pool-key wrapper))
        (throw e))
      (finally
        (when-not @disposed?
          (let [total (swap! used-ms + (quot (- (System/nanoTime) start) 1000000))]
            (if (>= total pool-cpu-soft-limit-ms)
              (do
                (log/infof "static-viz: builtin isolate context spent ~%dms of its cumulative %s CPU budget; recycling it"
                           total pool-max-cpu-time)
                (.dispose pool pool-key wrapper))
              (.release pool pool-key wrapper))))))))

(defn do-with-untrusted-builtin-context
  "Acquire a builtin isolate context (full static-viz bundle) and call `f` with it, held exclusively for
  the call (never let it — or a context-bound `Value` — escape)."
  [f]
  (if config/is-dev?
    (do-with-throwaway-builtin-context f)
    (do-with-pooled-builtin-context f)))

;;; ------------------------------------------------ backend ----------------------------------------------

(mu/defn- call-js :- :string
  "Execute static-viz bundle function `fn-name` (a `MetabaseStaticViz.*` global) with the already-JSON-encoded
  string `args` on a pooled builtin isolate context."
  [fn-name :- :string
   args    :- [:sequential :string]]
  (do-with-untrusted-builtin-context
   (fn [^Context context]
     (.asString ^Value (apply execute-fn-name context (str "MetabaseStaticViz." fn-name) args)))))

(defn- chart-with-custom-viz*
  "Render `input` on a pooled plugin isolate context (slim custom-viz bundle already loaded by the pool)
  after evaluating and registering the custom-viz plugin `bundles` (untrusted third-party JS) into it.
  Plugin bundles are untrusted third-party JS, so this never touches the builtin pool."
  [input bundles]
  (let [ids   (mapv :identifier bundles)
        start (System/nanoTime)]
    (log/infof "custom-viz: static-rendering plugin(s) %s" ids)
    (let [result (do-with-untrusted-plugin-context
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
  "The GraalVM [[metabase.channel.render.js.protocol/StaticVizRenderer]] — every method renders on a
  pooled `SandboxPolicy/UNTRUSTED` isolate context: built-in rendering on the builtin (full-bundle) pool,
  `chart-with-custom-viz` (untrusted plugin JS) on the plugin (slim-bundle) pool. Each method JSON-encodes
  its `input` map for the bundle and decodes the bundle's JSON result back into Clojure data."
  []
  (reify js.protocol/StaticVizRenderer
    (chart [_ input]
      (json/decode+kw (call-js "renderChartJSON" [(json/encode input)])))
    (chart-with-custom-viz [_ input custom-viz-bundles]
      (json/decode+kw (chart-with-custom-viz* input custom-viz-bundles)))
    (cell-background-colors [_ input]
      (json/decode (call-js "getCellBackgroundColorsJSON" [(json/encode input)])))))
