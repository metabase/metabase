(ns metabase.channel.render.js.pool
  "The shared pool of sandboxed GraalVM JS contexts used for static-viz rendering — charts
  (`metabase.channel.render.js.svg`) and table-cell color selection (`metabase.channel.render.js.color`). Every
  pooled context has the static-viz bundle, the static-viz interface, and the color-selector sources loaded.

  All contexts share the process-lifetime engine and evaluate the same `Source` instances (one `defonce` per
  resource), so the engine's code cache — which is keyed on the `Source` instance — holds ONE parsed copy of the
  static-viz bundle (~130 MB). Building a fresh `Source` per context (the previous behavior) made the engine retain a
  separate parsed copy for every pool generation, and made each generation reparse the 27 MB bundle: a
  multi-hundred-MB allocation spike every context recycle.

  Consumers borrow a context within [[with-context]] and return plain data — never the context or a
  context-bound `Value`. Never acquire a context while already holding one: with a small pool, nested acquires can
  deadlock."
  (:require
   [metabase.channel.render.js.engine :as js.engine]
   [metabase.config.core :as config])
  (:import
   (io.aleph.dirigiste IPool$Generator Pool Pools)
   (java.util.concurrent TimeUnit)
   (org.graalvm.polyglot Context)))

(set! *warn-on-reflection* true)

;; Each source is built exactly once per process (defonce + delay) and shared by every context: the engine's code
;; cache is keyed on the `Source` instance, so this is what makes it hold ONE parsed copy of each resource. Building
;; a `Source` anywhere else reintroduces the leak/reparse this exists to fix — after editing a resource in dev,
;; re-evaluate its defonce (or restart the REPL) to pick the change up.

;; goes through webpack; changes require a `bun run build-static-viz`
(defonce ^:private bundle-source
  (delay (js.engine/build-source "frontend_client/app/dist/lib-static-viz.bundle.js")))

;; does not go through a build step, edit freely
(defonce ^:private interface-source
  (delay (js.engine/build-source "frontend_shared/static_viz_interface.js")))

;; built by `bun run build-shared`
(defonce ^:private color-selector-source
  (delay (js.engine/build-source "frontend_shared/color_selector.js")))

(defn- sources []
  [@bundle-source @interface-source @color-selector-source])

(defn- assert-tests-not-initializing! []
  ;; make sure people don't try to load the static viz bundle as a side-effect of loading namespaces, because it might
  ;; not have been built! If it's not built, we want to be able to give people a meaningful error (see the fixture
  ;; in [[metabase.channel.render.js.svg-test]]) rather than have the test runner fail to start with a meaningless
  ;; compilation error.
  (when config/tests-available?
    ((requiring-resolve 'mb.hawk.init/assert-tests-are-not-initializing) "(mt/id ...) or (data/id ...)")))

(defn- create-context-with-sources
  "A fresh sandboxed context with the static-viz sources loaded."
  ^Context []
  (assert-tests-not-initializing!)
  (let [ctx (js.engine/create-context)]
    (doseq [source (sources)]
      (js.engine/eval-source ctx source))
    ctx))

(def ^:private ^Pool context-pool
  "Pool of Truffle JS contexts. They are not thread-safe, so access is exclusive from acquire to release. Generating a
  context is cheap — realm setup plus top-level eval against the engine's code cache, no reparse — and per-context
  memory is a realm, not a full parsed copy of the bundle. The pool targets 100% utilization with a maximum of 3
  contexts (to bound memory; renders hold a context exclusively, so that is also the render concurrency) and drains
  to zero when idle. Each pooled tuple carries an expiry timestamp so a context is recycled after 10 minutes
  regardless, bounding per-context leak accumulation."
  (Pool. (reify IPool$Generator
           (generate [_ _]
             ;; Generate a tuple of the context and the expiry timestamp.
             [(create-context-with-sources) (+ (System/nanoTime) (.toNanos TimeUnit/MINUTES 10))])
           (destroy [_ _ [^Context ctx _expiry]]
             ;; Close the context when it's disposed from the pool (expiry/idle shrink/shutdown). Without this, each
             ;; disposed static-viz context leaks its memory: GraalVM only releases it on `close`, not on GC.
             (try
               (.close ctx true) ;; force close - can't wait for running code
               (catch Exception _))))
         (Pools/utilizationController 1.0 3 3)
         65000 ;; Queue size - doesn't matter much.
         25 ;; Sampling interval - doesn't matter much.
         10000 ;; Recheck every 10 seconds
         TimeUnit/MILLISECONDS))

(defn do-with-context
  "Impl for [[with-context]]."
  [f]
  (if config/is-dev?
    (with-open [ctx (create-context-with-sources)]
      (f ctx))
    (loop []
      ;; :engines is arbitrary key, it just has to be consistent everywhere when working with the pool.
      (let [[context expiry-ts :as tuple] (.acquire context-pool :engines)]
        (if (>= (System/nanoTime) expiry-ts)
          (do (.dispose context-pool :engines tuple)
              (recur))
          (try (f context)
               (finally (.release context-pool :engines tuple))))))))

(defmacro with-context
  "Execute `body` with `binding-name` bound to a pooled static-viz JS context (in dev mode, a fresh context closed
  afterwards). The context is borrowed for the dynamic extent of `body`: do not let it — or any context-bound
  `Value` — escape, and do not acquire another context inside `body` (nested acquires can deadlock the pool)."
  [binding-name & body]
  `(do-with-context (fn [~binding-name] ~@body)))
