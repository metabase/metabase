;; The GraalVM (in-process, pooled) static-viz backend.
(ns metabase.channel.render.js.graal
  "The `:graalvm` [[metabase.channel.render.js.protocol/StaticVizRenderer]]: runs the static-viz JS
  in-process on a pool of sandboxed GraalVM contexts.

  We run the JS interpreted (no Graal compiler on a stock JDK) and silence the interpreter warning with
  the engine-level `engine.WarnInterpreterOnly` option. See
  https://github.com/oracle/graaljs/blob/master/docs/user/RunOnJDK.md.

  All contexts share the process-lifetime `Engine` and evaluate the same bundle `Source` instance (one
  `defonce`), so the engine's code cache — keyed on the `Source` instance — holds ONE parsed copy of
  the static-viz bundle. Contexts are not thread-safe, so each is borrowed exclusively for a render and
  recycled after 10 minutes to bound leaks."
  (:require
   [clojure.java.io :as io]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.config.core :as config]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu])
  (:import
   (io.aleph.dirigiste IPool$Controller IPool$Generator Pool Pools Stats)
   (java.util.concurrent TimeUnit)
   (org.graalvm.polyglot Context Engine HostAccess Source Value)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------- engine / context ----------------------------------------

(def ^:private no-host-class-lookup
  "Predicate blocking all host class lookup. A singleton so all contexts sharing an engine have identical config."
  (reify java.util.function.Predicate
    (test [_ _] false)))

(defn- create-engine
  "Build a JS `Engine` to be shared across contexts. We run JS interpreted (no Graal compiler on a stock JDK), so
  `engine.WarnInterpreterOnly` is silenced here on the engine (it's an engine-level option)."
  ^Engine []
  (.. (Engine/newBuilder)
      (option "engine.WarnInterpreterOnly" "false")
      (build)))

(defonce ^:private
  ^{:doc "The process-lifetime GraalVM `Engine` shared by every sandboxed JS context. The engine owns the Truffle
          runtime and the parsed-source code cache, so contexts (and pool recycles) reuse one parsed copy of any
          `Source` instance they share instead of each standing up their own. Intentionally never closed."}
  shared-sandboxed-js-engine
  (delay (create-engine)))

(defn create-context
  "Create a sandboxed org.graalvm.polyglot.Context (on the process-shared engine) for evaluating javascript. No host
  access, no class lookup, no filesystem I/O. All data must be passed as JSON strings and parsed in JS."
  ^Context []
  (.. (Context/newBuilder (into-array String ["js"]))
      (engine ^Engine @shared-sandboxed-js-engine)
      (option "js.intl-402" "true")
      (allowHostAccess HostAccess/NONE)
      (allowHostClassLookup no-host-class-lookup)
      (out System/out)
      (err System/err)
      (allowIO false)
      (build)))

(defn load-js-string
  "Load a string literal source into the js context."
  [^Context context ^String string-src ^String src-name]
  (.eval context (.buildLiteral (Source/newBuilder "js" string-src src-name))))

(defn- build-source
  "Build a `Source` from a classpath resource path. Evaluating the SAME `Source` instance in several contexts that
  share an engine makes the engine's code cache reuse one parsed copy; a fresh instance per context makes the engine
  parse (and retain) a separate copy each time — so callers that create many contexts should build once and share."
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

(defn execute-fn-name
  "Executes `js-fn-name` in js context with args"
  ^Value [^Context context js-fn-name & args]
  ;; TODO: locking context is not ideal, but contexts are currently being shared with all threads and GraalVM doesn't
  ;; support concurrent execution for js.
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

;;; ------------------------------------------------ context pool -----------------------------------------

;; Built exactly once per process (defonce + delay) and shared by every context: the engine's code cache is keyed on
;; the `Source` instance, so this is what makes it hold ONE parsed copy of the bundle. Building a `Source` anywhere
;; else reintroduces the leak/reparse this exists to fix — after a `bun run build-static-viz`, re-evaluate this
;; defonce (or restart the REPL) to pick the change up.
(defonce ^:private bundle-source
  (delay (build-source "frontend_client/app/dist/lib-static-viz.bundle.js")))

(defn- assert-tests-not-initializing! []
  ;; make sure people don't try to load the static viz bundle as a side-effect of loading namespaces, because it might
  ;; not have been built! If it's not built, we want to be able to give people a meaningful error (see the fixture
  ;; in [[metabase.channel.render.js.svg-test]]) rather than have the test runner fail to start with a meaningless
  ;; compilation error.
  (when config/tests-available?
    ((requiring-resolve 'mb.hawk.init/assert-tests-are-not-initializing) "(mt/id ...) or (data/id ...)")))

(defn- create-static-viz-context
  "A fresh sandboxed context with the static-viz bundle loaded."
  ^Context []
  (assert-tests-not-initializing!)
  (let [ctx (create-context)]
    (eval-source ctx @bundle-source)
    ctx))

(def ^:private pool-key
  "Dirigiste pools are keyed. The key itself is arbitrary — it just has to be the same for every pool operation."
  :engines)

(def ^:private context-creation-lock
  "Monitor serializing pooled context creation. Even with the shared-`Source` code cache, evaluating the bundle in a
  fresh context allocates ~500 MB, so letting the pool grow 1→3 concurrently during a render burst stacks ~1–1.5 GB
  of transient allocation on top of the in-flight renders — enough to blow a 2 GB heap. Holding creations to one at a
  time bounds the worst case to a single creation (~1 s each); waiting acquires just queue on the pool meanwhile.
  Nothing else may lock this monitor. See GHY-4077."
  (Object.))

(defn- expiry-timestamp
  "Expiry timestamp for a pooled context: now + 10 minutes ± up to 3 minutes of jitter. The jitter keeps pool members
  created in the same burst from all expiring — and serially regenerating — in the same window."
  ^long []
  (+ (System/nanoTime)
     (.toNanos TimeUnit/MINUTES 7)
     (long (rand (.toNanos TimeUnit/MINUTES 6)))))

(defn- generate-pool-entry
  "Create a `[context expiry-timestamp]` tuple for the pool. At most one context creation runs at a time (see
  [[context-creation-lock]]); acquisition/use is already exclusive per context, so this only bounds pool *growth*."
  []
  (locking context-creation-lock
    [(create-static-viz-context) (expiry-timestamp)]))

(def ^:private ^Pool static-viz-context-pool
  "Pool of Truffle JS contexts. They are not thread-safe, so access is exclusive from acquire to release. Generating a
  context is cheap — realm setup plus top-level eval against the engine's code cache, no reparse — and per-context
  memory is a realm, not a full parsed copy of the bundle. The pool targets 100% utilization with a maximum of 3
  contexts (to bound memory; renders hold a context exclusively, so that is also the render concurrency), but at
  least 1 context is always kept in the pool to pick up. Each pooled tuple carries a (jittered, ~10-minute) expiry
  timestamp so a context is recycled regardless, bounding per-context leak accumulation. Context creation is
  serialized (see [[context-creation-lock]]) so pool growth never runs multiple ~500 MB creations concurrently."
  (let [base-controller (Pools/utilizationController 1.0 3 3)]
    (Pool. (reify IPool$Generator
             (generate [_ _]
               (generate-pool-entry))
             (destroy [_ _ [^Context ctx _expiry]]
               ;; Close the context when it's disposed from the pool (expiry/idle shrink/shutdown). Without this, each
               ;; disposed static-viz context leaks its memory: GraalVM only releases it on `close`, not on GC.
               (try
                 (.close ctx true) ;; force close - can't wait for running code
                 (catch Exception _))))
           ;; Wrap the utilization controller with a modification that doesn't allow the pool to go below 1 instance.
           (reify IPool$Controller
             (shouldIncrement [_ k a b] (.shouldIncrement base-controller k a b))
             (adjustment [_ stats]
               (let [adj (.adjustment base-controller stats)
                     n (some-> ^Stats (get stats pool-key) .getNumWorkers)
                     engines-adj (get adj pool-key)]
                 (if (and n engines-adj (<= (+ n engines-adj) 0))
                   ;; If the adjustment is going to bring the pool to 0 engines, return empty adjustment instead.
                   {}
                   adj))))
           65000 ;; Queue size - doesn't matter much.
           25 ;; Sampling interval - doesn't matter much.
           10000 ;; Recheck every 10 seconds
           TimeUnit/MILLISECONDS)))

(defn- do-with-static-viz-context
  "Borrow a pooled static-viz context (a fresh one closed afterwards in dev) and call `f` with it. The context is held
  exclusively for the call: never let it — or a context-bound `Value` — escape."
  [f]
  (if config/is-dev?
    (with-open [ctx (create-static-viz-context)]
      (f ctx))
    (loop []
      (let [[context expiry-ts :as tuple] (.acquire static-viz-context-pool pool-key)]
        (if (>= (System/nanoTime) expiry-ts)
          (do (.dispose static-viz-context-pool pool-key tuple)
              (recur))
          (try (f context)
               (finally (.release static-viz-context-pool pool-key tuple))))))))

;;; ------------------------------------------------ backend ----------------------------------------------

(mu/defn- call-js :- :string
  "Call static-viz bundle function `fn-name` with already-JSON-encoded string `json-args` on a pooled
  GraalVM context. The bundle is a UMD library, so under GraalVM it assigns to the `MetabaseStaticViz`
  global."
  [fn-name   :- :string
   json-args :- [:sequential :string]]
  (do-with-static-viz-context
   (fn [context]
     (.asString ^Value (apply execute-fn-name context (str "MetabaseStaticViz." fn-name) json-args)))))

(defn renderer
  "The `:graalvm` [[metabase.channel.render.js.protocol/StaticVizRenderer]] — runs the static-viz JS
  in-process on the pooled GraalVM contexts."
  []
  (reify js.protocol/StaticVizRenderer
    (visualization [_ viz]
      (call-js "visualization" [(json/encode viz)]))
    (cell-background-colors [_ {:keys [rows cols settings cells]}]
      (call-js "getCellBackgroundColors"
               [(json/encode rows) (json/encode cols) (json/encode settings) (json/encode cells)]))))
