(ns metabase.channel.render.js.graal
  "The GraalVM [[metabase.channel.render.js.protocol/StaticVizRenderer]]: runs the static-viz JS
  in-process on a pool of sandboxed GraalVM contexts (up to two by default).

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
   [metabase.util.malli :as mu])
  (:import
   (io.aleph.dirigiste Pool)
   (org.graalvm.polyglot Context Engine HostAccess Source Value)))

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
  "A pool of up to two static-viz contexts, each held exclusively from acquire to release, so at most two
  renders run at once — one per context, on the shared engine. When idle the pool shrinks to 0 and the
  generator's `destroy` closes the context (and, on the last one, the shared engine); the first render
  after an idle gap rebuilds them. See [[metabase.channel.render.js.common/create-pool]]."
  (common/create-pool generate-context! destroy-context! {:max-size 2}))

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

;;; ------------------------------------------------ backend ----------------------------------------------

(mu/defn- call-js :- :string
  "Execute static-viz bundle function `fn-name` (a `MetabaseStaticViz.*` global) with the already-JSON-encoded
  string `args` on the pooled context."
  [fn-name :- :string
   args    :- [:sequential :string]]
  (do-with-static-viz-context
   (fn [^Context context]
     (.asString ^Value (apply execute-fn-name context (str "MetabaseStaticViz." fn-name) args)))))

(defn renderer
  "The GraalVM [[metabase.channel.render.js.protocol/StaticVizRenderer]] — runs the static-viz JS
  in-process on the pooled GraalVM context. Each method JSON-encodes its `input` map for the bundle and
  decodes the bundle's JSON result back into Clojure data."
  []
  (reify js.protocol/StaticVizRenderer
    (chart [_ input]
      (json/decode+kw (call-js "renderChartJSON" [(json/encode input)])))
    (cell-background-colors [_ input]
      (json/decode (call-js "getCellBackgroundColorsJSON" [(json/encode input)])))))
