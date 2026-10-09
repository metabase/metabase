(ns metabase.test.util.dynamic-redefs
  (:import
   (clojure.lang MultiFn Var)))

(set! *warn-on-reflection* true)

(def ^:dynamic *local-redefs*
  "A thread-local mapping from vars to their most recently bound definition."
  {})

(def ^:private ^:dynamic *proxy-depths*
  "Thread-local map from redefined var to current recursion depth through its proxy.
   Used to detect capture bugs that would otherwise manifest as StackOverflowError."
  {})

(def ^:private max-proxy-depth
  "If a single var's proxy is re-entered this many times on one thread, assume a capture bug.
   Generous enough to permit deliberate recursion, low enough to fail fast before SOE."
  128)

(defn- proxy-original
  "The original that the proxy at the root of `a-var` was built with, or nil when the root is not its proxy."
  [^Var a-var]
  (let [root (.getRawRoot a-var)]
    (when (identical? a-var (::proxy-for (meta root)))
      (::original (meta root)))))

(defn dynamic-value
  "Get the value of this var that is in scope. It is the unpatched version if there is no override."
  [a-var]
  ;; Callers also pass the proxy itself, which carries its original.
  (get *local-redefs* a-var
       (if (var? a-var)
         (proxy-original a-var)
         (::original (meta a-var)))))

(defn original-fn
  "Return the original (unpatched) function for `a-var`.
   That is the root it had when [[with-dynamic-fn-redefs]] proxied it, or its current root if it is not proxied."
  [a-var]
  (or (proxy-original a-var) @a-var))

(defn- var->proxy
  "Build a proxy function to intercept the given var. The proxy checks the current scope for what to call.
   Uses unconditional throws (not `assert`) so the safety checks fire even when `*assert*` is false.

   Accepts any `IFn` root value — keywords and collections work via their `IFn` impl
   (`(:a {:a 1})` → `1`, `({:a 1} :a)` → `1`), so the proxy's `apply` delegates correctly."
  [a-var original]
  (when-not (ifn? original)
    (throw (ex-info (str "Cannot proxy non-IFn values: " a-var) {:var a-var, :value original})))
  (when (instance? MultiFn original)
    (throw (ex-info (str "Cannot proxy multimethods: " a-var ". "
                         "with-dynamic-fn-redefs replaces the var's root with a proxy, which breaks "
                         "dispatch and pollutes the JVM for other tests. Use defmethod (or add-method) "
                         "with a dedicated test dispatch value instead.")
                    {:var a-var})))
  ;; Each proxy keeps its own original. Something else can put a different root over the proxy and a later patch
  ;; then treats that root as the original, so an original stored on the var would be wrong for this proxy.
  ^{::proxy-for a-var, ::original original}
  (fn [& args]
    (let [depth (get *proxy-depths* a-var 0)]
      (when (> depth max-proxy-depth)
        ;; Throw an Error, not an Exception: a `(catch Exception ...)` in the code under test would swallow an Exception
        ;; and turn this diagnostic into silent, confusing behavior.
        (throw (AssertionError.
                (str "with-dynamic-fn-redefs: runaway recursion through proxy for " a-var " (depth " depth "). "
                     "This usually means the replacement fn calls the redefined var directly "
                     "(closing over the var resolves to the proxy, not the original). "
                     "Use (metabase.test.util.dynamic-redefs/original-fn " (pr-str a-var) ") "
                     "to capture the unpatched function."))))
      (binding [*proxy-depths* (assoc *proxy-depths* a-var (inc depth))]
        (let [current-f (get *local-redefs* a-var original)]
          (apply current-f args))))))

(defn patch-vars!
  "Rebind the given vars with proxies that wrap the original functions."
  [vars]
  ;; Check the root rather than a flag on the var: something else can replace the root after it is patched. The watch
  ;; potemkin puts on a re-export's source copies the source's root over the re-export whenever that root changes.
  (doseq [^Var a-var (remove proxy-original vars)]
    (locking a-var
      (when-not (proxy-original a-var)
        (.bindRoot a-var (var->proxy a-var (.getRawRoot a-var)))))))

(defn- sym->var [sym] `(var ~sym))

(defn- bindings->var->definition
  "Given a with-redefs style binding, return a mapping from each corresponding var to its given replacement."
  [binding]
  (update-keys (into {} (partition-all 2) binding) sym->var))

(defmacro with-dynamic-fn-redefs
  "A thread-safe version of with-redefs. It only supports functions, and adds a fair amount of overhead.
   It works by replacing each original definition with a proxy the first time it is redefined.
   This proxy uses a dynamic mapping to check whether the function is currently redefined.

   Limitations:
   - `IFn`-valued vars only. Keywords and collections are fine (they're `IFn`); multimethods
     and plain non-`IFn` value defs will throw.
   - If the replacement calls the redefined var (to delegate to the original), capture it
     via [[original-fn]] rather than `@#'the-var` or a bare symbol reference — the latter
     resolve to the proxy itself once installed, causing runaway recursion.
   - Only threads that inherit the calling thread's dynamic bindings see the replacement.
     `future`, `core.async/go`, and `core.async/thread` convey bindings automatically; raw
     `Thread`, quartz/cron workers, and unwrapped `ExecutorService` tasks do not. For those
     keep `with-redefs` — the root swap is visible to every thread.
   - Redefining a potemkin re-export only intercepts calls made through the re-export.
     Callers of the var it was imported from still see the original."
  [bindings & body]
  (let [var->definition (bindings->var->definition bindings)]
    `(do
       (patch-vars! ~(vec (keys var->definition)))
       (binding [*local-redefs* (merge *local-redefs* ~var->definition)]
         ~@body))))
