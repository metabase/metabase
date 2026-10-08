(ns metabase.test.util.dynamic-redefs
  (:import
   (clojure.lang MultiFn Namespace Var)
   (java.util Collections Map WeakHashMap)))

(set! *warn-on-reflection* true)

(def ^:dynamic *local-redefs*
  "A thread-local mapping from each proxy to the replacement it calls on this thread."
  {})

(def ^:private ^:dynamic *proxy-depths*
  "Thread-local map from proxy to current recursion depth through it.
   Used to detect capture bugs that would otherwise manifest as StackOverflowError."
  {})

(def ^:private ^Map proxies
  "Every proxy built, mapped to `[a-var original]`: the var it was built for and the root it replaced."
  (Collections/synchronizedMap (WeakHashMap.)))

(def ^:private max-proxy-depth
  "Re-entries of one var's proxy allowed on a thread, while a replacement is in scope, before assuming a capture bug.
   Generous enough to permit deliberate recursion, low enough to fail fast before the stack overflows."
  128)

(defn- proxy-original
  "The original that the proxy at the root of `a-var` was built with, or nil when the root is not its proxy."
  [^Var a-var]
  (let [[proxied-var original] (.get proxies (.getRawRoot a-var))]
    (when (identical? a-var proxied-var)
      original)))

(defn dynamic-value
  "What a var calls on this thread: its replacement if one is in scope, else its original.
   Given a proxied function in place of a var, returns that function's original, which lets a replacement delegate.
   Returns nil for a var or function that was never proxied."
  [var-or-proxy]
  (if (var? var-or-proxy)
    (get *local-redefs* (.getRawRoot ^Var var-or-proxy) (proxy-original var-or-proxy))
    (second (.get proxies var-or-proxy))))

(defn original-fn
  "Return the original (unpatched) function for `a-var`.
   That is the root it had when [[with-dynamic-fn-redefs]] proxied it, or its current root if it is not proxied."
  [a-var]
  (or (proxy-original a-var) @a-var))

(defn- deeper
  "The depths to bind for one more entry into `proxy` on this thread.
   Throws an `AssertionError` once the thread has re-entered the proxy more than [[max-proxy-depth]] times."
  [proxy]
  (let [depth (get *proxy-depths* proxy 0)]
    (when (> depth max-proxy-depth)
      ;; Throw an Error, not an Exception: a `(catch Exception ...)` in the code under test would swallow an Exception
      ;; and turn this diagnostic into silent, confusing behavior.
      (let [a-var (first (.get proxies proxy))]
        (throw (AssertionError.
                (str "with-dynamic-fn-redefs: runaway recursion through proxy for " a-var " (depth " depth "). "
                     "This usually means the replacement fn calls the redefined var directly "
                     "(closing over the var resolves to the proxy, not the original). "
                     "Use (metabase.test.util.dynamic-redefs/original-fn " (pr-str a-var) ") "
                     "to capture the unpatched function.")))))
    (assoc *proxy-depths* proxy (inc depth))))

(defmacro ^:private in-scope
  "Bind `f` to what `proxy` calls on this thread, its replacement or else `original`, and evaluate `call`."
  [[f [proxy original]] call]
  `(let [~f (get *local-redefs* ~proxy ~original)]
     (if (identical? ~f ~original)
       ~call
       (binding [*proxy-depths* (deeper ~proxy)]
         ~call))))

(defn- register-proxy
  "Register what `proxy` was built for, so that [[proxy-original]] recognises it."
  [proxy a-var original]
  ;; Something else can put a different root over this proxy, and a later proxy is then built over that root.
  ;; So each proxy records its own original, and replacements are bound to a proxy, not to the var.
  (.put proxies proxy [a-var original]))

(defn- check-proxyable
  "Throws when `root`, the root of `a-var`, is not an `IFn`, or is a multimethod."
  [a-var root]
  ;; These are throws, not asserts, so they fire even when `*assert*` is false.
  (when-not (ifn? root)
    (throw (ex-info (str "Cannot proxy non-IFn values: " a-var) {:var a-var, :value root})))
  (when (instance? MultiFn root)
    (throw (ex-info (str "Cannot proxy multimethods: " a-var ". "
                         "with-dynamic-fn-redefs replaces the var's root with a proxy, which breaks "
                         "dispatch and pollutes the JVM for other tests. Use defmethod (or add-method) "
                         "with a dedicated test dispatch value instead.")
                    {:var a-var}))))

(defn- import-source
  "The var that potemkin imported `a-var` from, or nil when `a-var` is not an import that still mirrors its source."
  ^Var [^Var a-var]
  ;; potemkin watches the source with the import as the key, and copies the source's metadata over the import's.
  ;; That includes `:ns`, so the source is normally interned in the namespace the import's metadata names.
  (let [watching    (fn [vars]
                      (some (fn [^Var v] (when (contains? (.getWatches v) a-var) v)) vars))
        meta-ns     (:ns (meta a-var))
        ^Var source (or (when (instance? Namespace meta-ns)
                          (watching (vals (ns-interns meta-ns))))
                        ;; An import of an import names the first source's namespace, so its own source can be anywhere.
                        (when-not (identical? meta-ns (.ns a-var))
                          (watching (mapcat (comp vals ns-interns) (all-ns)))))]
    (when (and source (identical? (.getRawRoot source) (.getRawRoot a-var)))
      source)))

(defn- var->proxy
  "Build a proxy for `a-var` that calls the replacement in scope on the current thread, or `original` with none."
  [a-var original]
  ;; The proxy outlives the redef that installed it, so most calls find no replacement in scope and must stay cheap.
  ;; The fixed arities avoid an argument seq for those calls, and only a replacement gets a `binding`.
  ;; The recursion check is skipped with it: without a replacement, any recursion is the original's own.
  (doto (fn proxy
          ([]                (in-scope [f [proxy original]] (f)))
          ([a]               (in-scope [f [proxy original]] (f a)))
          ([a b]             (in-scope [f [proxy original]] (f a b)))
          ([a b c]           (in-scope [f [proxy original]] (f a b c)))
          ([a b c d]         (in-scope [f [proxy original]] (f a b c d)))
          ([a b c d & more]  (in-scope [f [proxy original]] (apply f a b c d more))))
    (register-proxy a-var original)))

(defn patch-vars!
  "Rebind the given vars with proxies that wrap the original functions."
  [vars]
  ;; Check the root rather than a flag on the var: something else can replace the root after it is patched. The watch
  ;; potemkin puts on a re-export's source copies the source's root over the re-export whenever that root changes.
  (doseq [^Var a-var (remove proxy-original vars)]
    (locking a-var
      (when-not (proxy-original a-var)
        (let [root   (.getRawRoot a-var)
              source (import-source a-var)]
          (check-proxyable a-var root)
          ;; An import's proxy calls through its source var, so it follows the source's root with no help from the
          ;; watch. The watch has to go: it would copy every new source root over this proxy, and both a proxy
          ;; installed on the source and a `with-redefs` of it are new roots.
          (when source
            (remove-watch source a-var))
          (.bindRoot a-var (var->proxy a-var (or source root))))))))

(defn local-redefs
  "The value to bind [[*local-redefs*]] to so that each var in `var->replacement` calls its replacement.
   The vars must already be proxied: see [[patch-vars!]]."
  [var->replacement]
  (reduce-kv (fn [redefs ^Var a-var replacement]
               (assoc redefs (.getRawRoot a-var) replacement))
             *local-redefs*
             var->replacement))

(defn- sym->var [sym] `(var ~sym))

(defn- bindings->var->definition
  "Given a with-redefs style binding, return a mapping from each corresponding var to its given replacement."
  [binding]
  (update-keys (into {} (partition-all 2) binding) sym->var))

(defmacro with-dynamic-fn-redefs
  "A thread-safe version of `with-redefs`. It only supports functions.
   It works by replacing each original definition with a proxy the first time it is redefined.
   The proxy checks a thread-local mapping to see whether the function is currently redefined.
   The proxy stays on the var afterwards, and costs little unless a replacement is in scope.

   Limitations:
   - Only a var that holds an `IFn` can be redefined.
     Keywords and collections count. A multimethod, or a value that is not an `IFn`, throws.
   - A replacement that calls the redefined var recurses, because the var now resolves to the proxy.
     To delegate to the original, capture it with [[original-fn]].
   - Only threads that inherit the calling thread's dynamic bindings see the replacement.
     That covers `future`, `core.async/go` and `core.async/thread`.
     A raw `Thread`, a Quartz worker and an unwrapped `ExecutorService` task do not inherit them.
     Keep `with-redefs` for those: its root swap is visible to every thread.
   - Redefining a potemkin re-export only intercepts calls made through the re-export.
     Callers of the var it was imported from still see the original.
     With no replacement of its own in scope, a re-export calls whatever its source calls."
  [bindings & body]
  (let [var->definition (bindings->var->definition bindings)]
    `(do
       (patch-vars! ~(vec (keys var->definition)))
       (binding [*local-redefs* (local-redefs ~var->definition)]
         ~@body))))
