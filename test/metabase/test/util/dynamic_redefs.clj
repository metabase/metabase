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
  "Re-entries of one var's proxy allowed on a thread, while a replacement is in scope, before assuming a capture bug.
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

(defn- call-replacement
  "Call the replacement `f` that is in scope for `a-var`.
   Throws an `AssertionError` once this thread has re-entered the proxy more than [[max-proxy-depth]] times."
  [a-var f args]
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
      (apply f args))))

(defmacro ^:private call-through
  "Call the replacement in scope for `a-var` with `args`, or evaluate `direct-call` when there is none."
  [a-var direct-call args]
  `(let [f# (get *local-redefs* ~a-var ::none)]
     (if (identical? f# ::none)
       ~direct-call
       (call-replacement ~a-var f# ~args))))

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
  ;; The fixed arities avoid an argument seq for those calls, and only `call-replacement` makes a `binding`.
  ;; The recursion check lives there too: without a replacement, any recursion is the original's own.
  ;;
  ;; Each proxy keeps its own original. Something else can put a different root over the proxy and a later patch
  ;; then treats that root as the original, so an original stored on the var would be wrong for this proxy.
  ^{::proxy-for a-var, ::original original}
  (fn
    ([]                (call-through a-var (original) nil))
    ([a]               (call-through a-var (original a) (list a)))
    ([a b]             (call-through a-var (original a b) (list a b)))
    ([a b c]           (call-through a-var (original a b c) (list a b c)))
    ([a b c d]         (call-through a-var (original a b c d) (list a b c d)))
    ([a b c d & more]  (call-through a-var (apply original a b c d more) (list* a b c d more)))))

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
     Callers of the var it was imported from still see the original.
   - A `with-redefs` of a var inside a dynamic redef of the same var holds only until a dynamic redef
     nested further in exits. From then on the outer dynamic replacement is in effect, not the stub."
  [bindings & body]
  (let [var->definition (bindings->var->definition bindings)]
    `(do
       (patch-vars! ~(vec (keys var->definition)))
       (binding [*local-redefs* (merge *local-redefs* ~var->definition)]
         ~@body))))
