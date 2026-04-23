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

(defn dynamic-value
  "Get the value of this var that is in scope. It is the unpatched version if there is no override."
  [a-var]
  (get *local-redefs* a-var
       (get (meta a-var) ::original)))

(defn original-fn
  "Return the original (unpatched) function for `a-var`. If the var has been
   patched by [[with-dynamic-fn-redefs]], returns the stored original; otherwise
   returns the var's current root value."
  [a-var]
  (or (::original (meta a-var)) @a-var))

(defn- var->proxy
  "Build a proxy function to intercept the given var. The proxy checks the current scope for what to call."
  [a-var]
  (assert (ifn? @a-var) "Cannot proxy non-functions")
  (assert (not (keyword? @a-var)) "Cannot proxy keywords")
  (assert (not (coll? @a-var)) "Cannot proxy collections")
  (assert (not (instance? MultiFn @a-var))
          (str "Cannot proxy multimethods: " a-var ". "
               "with-dynamic-fn-redefs replaces the var's root with a proxy, which breaks "
               "dispatch and pollutes the JVM for other tests. Use methodical/add-primary-method "
               "or a dedicated test dispatch value instead."))
  (fn [& args]
    (let [depth (get *proxy-depths* a-var 0)]
      (when (> depth max-proxy-depth)
        (throw (ex-info (str "with-dynamic-fn-redefs: runaway recursion through proxy for " a-var ". "
                             "This usually means the replacement fn calls the redefined var directly "
                             "(closing over the var resolves to the proxy, not the original). "
                             "Use (metabase.test.util.dynamic-redefs/original-fn " (pr-str a-var) ") "
                             "to capture the unpatched function.")
                        {:var a-var, :depth depth})))
      (binding [*proxy-depths* (assoc *proxy-depths* a-var (inc depth))]
        (let [current-f (dynamic-value a-var)]
          (apply current-f args))))))

(defn patch-vars!
  "Rebind the given vars with proxies that wrap the original functions."
  [vars]
  (let [unpatched-vars (remove #(::patched? (meta %)) vars)]
    (doseq [^Var a-var unpatched-vars]
      (locking a-var
        (when-not (::patched? (meta a-var))
          (let [old-val (.getRawRoot a-var)
                patch-meta #(assoc % ::original old-val ::patched? true)]
            (.bindRoot a-var (with-meta (var->proxy a-var)
                                        (patch-meta (meta (get *local-redefs* a-var)))))
            (alter-meta! a-var patch-meta)))))))

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
   - Functions only. Multimethods, plain value defs, keywords and collections will throw.
   - If the replacement calls the redefined var (to delegate to the original), capture it
     via [[original-fn]] rather than `@#'the-var` or a bare symbol reference — the latter
     resolve to the proxy itself once installed, causing runaway recursion.
   - Only threads that inherit the calling thread's dynamic bindings see the replacement.
     `future`, `core.async/go`, and `core.async/thread` convey bindings automatically; raw
     `Thread`, quartz/cron workers, and unwrapped `ExecutorService` tasks do not. For those
     keep `with-redefs` — the root swap is visible to every thread."
  [bindings & body]
  (let [var->definition (bindings->var->definition bindings)]
    `(do
       (patch-vars! ~(vec (keys var->definition)))
       (binding [*local-redefs* (merge *local-redefs* ~var->definition)]
         ~@body))))
