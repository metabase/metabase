(ns metabase.test.util.dynamic-redefs
  (:import
   (clojure.lang MultiFn Var)
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
   Generous enough to permit deliberate recursion, low enough to fail fast before SOE."
  128)

(defn- proxy-original
  "The original that the proxy at the root of `a-var` was built with, or nil when the root is not its proxy."
  [^Var a-var]
  (let [[proxied-var original] (.get proxies (.getRawRoot a-var))]
    (when (identical? a-var proxied-var)
      original)))

(defn dynamic-value
  "Get the value of this var that is in scope. It is the unpatched version if there is no override."
  [a-var]
  ;; Callers also pass the proxy itself.
  (if (var? a-var)
    (get *local-redefs* (.getRawRoot ^Var a-var) (proxy-original a-var))
    (get *local-redefs* a-var (second (.get proxies a-var)))))

(defn original-fn
  "Return the original (unpatched) function for `a-var`.
   That is the root it had when [[with-dynamic-fn-redefs]] proxied it, or its current root if it is not proxied."
  [a-var]
  (or (proxy-original a-var) @a-var))

(defn- deeper
  "The depths to bind for one more entry into `proxy` on this thread.
   Throws an `AssertionError` once the thread has re-entered the proxy more than [[max-proxy-depth]] times."
  [proxy]
  (let [depth (get *proxy-depths* proxy 0)
        a-var (first (.get proxies proxy))]
    (when (> depth max-proxy-depth)
      ;; Throw an Error, not an Exception: a `(catch Exception ...)` in the code under test would swallow an Exception
      ;; and turn this diagnostic into silent, confusing behavior.
      (throw (AssertionError.
              (str "with-dynamic-fn-redefs: runaway recursion through proxy for " a-var " (depth " depth "). "
                   "This usually means the replacement fn calls the redefined var directly "
                   "(closing over the var resolves to the proxy, not the original). "
                   "Use (metabase.test.util.dynamic-redefs/original-fn " (pr-str a-var) ") "
                   "to capture the unpatched function."))))
    (assoc *proxy-depths* proxy (inc depth))))

(defmacro ^:private in-scope
  "Bind `f` to what `proxy` calls on this thread, its replacement or else `original`, and evaluate `call`."
  [[f [proxy original]] call]
  `(let [~f (get *local-redefs* ~proxy ~original)]
     (if (identical? ~f ~original)
       ~call
       (binding [*proxy-depths* (deeper ~proxy)]
         ~call))))

(defn- var->proxy
  "Build a proxy for `a-var` that calls the replacement in scope on the current thread, or `original` with none.
   Throws when `original` is not an `IFn`, or is a multimethod."
  [a-var original]
  ;; These are throws, not asserts, so they fire even when `*assert*` is false.
  (when-not (ifn? original)
    (throw (ex-info (str "Cannot proxy non-IFn values: " a-var) {:var a-var, :value original})))
  (when (instance? MultiFn original)
    (throw (ex-info (str "Cannot proxy multimethods: " a-var ". "
                         "with-dynamic-fn-redefs replaces the var's root with a proxy, which breaks "
                         "dispatch and pollutes the JVM for other tests. Use defmethod (or add-method) "
                         "with a dedicated test dispatch value instead.")
                    {:var a-var})))
  ;; The proxy outlives the redef that installed it, so most calls find no replacement in scope and must stay cheap.
  ;; The fixed arities avoid an argument seq for those calls, and only a replacement gets a `binding`.
  ;; The recursion check is skipped with it: without a replacement, any recursion is the original's own.
  ;;
  ;; Each proxy keeps its own original. Something else can put a different root over the proxy and a later patch
  ;; then treats that root as the original, so an original stored on the var would be wrong for this proxy.
  ;;
  ;; Replacements are looked up by proxy, not by var, for the same reason: a replacement bound while an earlier proxy
  ;; was the root must not reach through a proxy built later, over whatever replaced that root.
  (let [proxy (fn proxy
                ([]                (in-scope [f [proxy original]] (f)))
                ([a]               (in-scope [f [proxy original]] (f a)))
                ([a b]             (in-scope [f [proxy original]] (f a b)))
                ([a b c]           (in-scope [f [proxy original]] (f a b c)))
                ([a b c d]         (in-scope [f [proxy original]] (f a b c d)))
                ([a b c d & more]  (in-scope [f [proxy original]] (apply f a b c d more))))]
    (.put proxies proxy [a-var original])
    proxy))

(defn patch-vars!
  "Rebind the given vars with proxies that wrap the original functions."
  [vars]
  ;; Check the root rather than a flag on the var: something else can replace the root after it is patched. The watch
  ;; potemkin puts on a re-export's source copies the source's root over the re-export whenever that root changes.
  (doseq [^Var a-var (remove proxy-original vars)]
    (locking a-var
      (when-not (proxy-original a-var)
        (.bindRoot a-var (var->proxy a-var (.getRawRoot a-var)))))))

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
  "A thread-safe version of with-redefs. It only supports functions.
   It works by replacing each original definition with a proxy the first time it is redefined.
   This proxy uses a dynamic mapping to check whether the function is currently redefined.
   The proxy stays on the var afterwards, and costs little unless a replacement is in scope.

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
       (binding [*local-redefs* (local-redefs ~var->definition)]
         ~@body))))
