(ns metabase.test.util.dynamic-redefs
  (:require
   [clojure.string :as str])
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
  "Every proxy built, mapped to `[a-var original source]`.
   That is the var it was built for, what it calls with no replacement in scope, and the var a re-export came from."
  (Collections/synchronizedMap (WeakHashMap.)))

(def ^:private ^Map sources
  "Each re-export taken over from potemkin, mapped to the var it was imported from."
  (Collections/synchronizedMap (WeakHashMap.)))

(def ^:private max-proxy-depth
  "Re-entries of one var's proxy allowed on a thread, while a replacement is in scope, before assuming a capture bug.
   Generous enough to permit deliberate recursion, low enough to fail fast before the stack overflows."
  128)

(defn- proxy-entry
  "The [[proxies]] entry for the proxy at the root of `a-var`, or nil when the root is not its proxy."
  [^Var a-var]
  (let [[proxied-var :as entry] (.get proxies (.getRawRoot a-var))]
    (when (identical? a-var proxied-var)
      entry)))

(defn- potemkin-link?
  "Whether `watch` is the function potemkin puts on a source var to copy its root over a re-export."
  [watch]
  (str/starts-with? (.getName (class watch)) "potemkin.namespaces$link_vars"))

(defn- reexports
  "The vars that potemkin copies the root of `a-var` over whenever that root changes."
  [^Var a-var]
  (for [[reexport watch] (.getWatches a-var)
        :when            (and (var? reexport) (potemkin-link? watch))]
    reexport))

(defn- watched-source
  "The var that `a-var` is a re-export of, or nil when it is not one."
  ^Var [^Var a-var]
  ;; potemkin watches the source with the re-export as the key, and copies the source's metadata over the re-export's.
  ;; That includes `:ns`, so the source is normally interned in the namespace the re-export's metadata names.
  (let [watching (fn [vars]
                   (some (fn [^Var v]
                           (when-let [watch (get (.getWatches v) a-var)]
                             (when (potemkin-link? watch)
                               v)))
                         vars))
        meta-ns  (:ns (meta a-var))]
    (or (.get sources a-var)
        (when (instance? Namespace meta-ns)
          (watching (vals (ns-interns meta-ns))))
        ;; A re-export of a re-export names the first source's namespace, so its own source can be anywhere.
        (when-not (identical? meta-ns (.ns a-var))
          (watching (mapcat (comp vals ns-interns) (all-ns))))
        ;; Another thread can take the re-export over while this one is looking for potemkin's watch. It records
        ;; the link before it removes the watch, so a search that came up empty finds the link here.
        (.get sources a-var))))

(defn- mirrors?
  "Whether `a-var` still has the root that potemkin copied from `source`."
  [^Var a-var ^Var source]
  (identical? (.getRawRoot source) (.getRawRoot a-var)))

(defn- mirrored-source
  "The var that potemkin copies over `a-var`, when `a-var` still has the root it copied. Otherwise nil."
  ^Var [^Var a-var]
  (when-let [source (watched-source a-var)]
    (when (mirrors? a-var source)
      source)))

(defn original-fn
  "Return the original (unpatched) function for `a-var`.
   That is the root it had when [[with-dynamic-fn-redefs]] proxied it, or its current root if it is not proxied.
   For a potemkin re-export it is the original of the var it was imported from."
  [^Var a-var]
  (let [[_ original source :as entry] (proxy-entry a-var)]
    (if-let [source (or source (when-not entry (mirrored-source a-var)))]
      (recur source)
      (or original @a-var))))

(defn dynamic-value
  "What `a-var` calls on this thread: its replacement if one is in scope, else its original.
   Returns nil for a var that was never proxied."
  [^Var a-var]
  (when-not (var? a-var)
    (throw (ex-info "dynamic-value takes a var. For the original of a function, use original-fn on its var."
                    {:value a-var})))
  (get *local-redefs*
       (.getRawRoot a-var)
       (when (proxy-entry a-var)
         (original-fn a-var))))

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
  "Register what `proxy` was built for, so that [[proxy-entry]] recognises it."
  [proxy a-var original source]
  ;; Something else can put a different root over this proxy, and a later proxy is then built over that root.
  ;; So each proxy records its own original, and replacements are bound to a proxy, not to the var.
  (.put proxies proxy [a-var original source]))

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

(defn- var->proxy
  "Build a proxy for `a-var` that calls the replacement in scope on the current thread, or `original` with none.
   For a re-export, `source` is the var it was imported from."
  [a-var original source]
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
    (register-proxy a-var original source)))

(declare adopt-reexports!)

(defn- follow-source!
  "Put a proxy at the root of `reexport` that calls through `source`."
  [^Var reexport ^Var source]
  (adopt-reexports! reexport)
  (.bindRoot reexport (var->proxy reexport source source)))

(defn- proxied-original
  "The function under every proxy on `a-var`, or its root when it has none."
  [^Var a-var]
  ;; Unlike [[original-fn]] this reads [[proxies]] alone and takes no var's monitor, so a watch can call it.
  (let [[_ original source] (proxy-entry a-var)]
    (cond
      source   (recur source)
      original original
      :else    (.getRawRoot a-var))))

(defn- copy-of-source?
  "Whether `root` is one that potemkin copied from `source`: the source's current root, or its original."
  [root ^Var source]
  (or (identical? root (.getRawRoot source))
      (identical? root (proxied-original source))))

(defn- take-over!
  "Stop potemkin copying the root of `source` over `reexport`, and have `reexport` call through `source` instead."
  [^Var reexport ^Var source]
  ;; Record the link before removing potemkin's watch, which is how a thread about to proxy the re-export finds the
  ;; source it has to lock first.
  (.put sources reexport source)
  (remove-watch source reexport)
  (locking reexport
    ;; A `with-redefs` of the re-export puts back, when it exits, the root it found when it started. If that root is
    ;; a copy of the source's, the re-export has to start calling through the source: potemkin no longer updates it.
    ;; The watch runs holding the re-export's monitor, so it must not take the source's: see `install-proxy!`.
    (add-watch reexport ::follow-source
               (fn [_ _ _ root]
                 (when (copy-of-source? root source)
                   (follow-source! reexport source))))
    ;; A re-export under a stub keeps the stub, and the watch picks it up when the stub goes.
    (when (copy-of-source? (.getRawRoot reexport) source)
      (follow-source! reexport source))))

(defn- adopt-reexports!
  "Take over the re-exports of `a-var` from potemkin. Call this before giving `a-var` a new root."
  [^Var a-var]
  ;; potemkin would copy the new root over each re-export, and over a `with-redefs` stub or a proxy if one is there.
  ;; A re-export that calls through `a-var` follows the new root without the copy.
  (doseq [reexport (reexports a-var)]
    (take-over! reexport a-var)))

(defn- install-proxy!
  "Put a proxy at the root of `a-var`, unless its own proxy is already there."
  [^Var a-var]
  (let [source     (watched-source a-var)
        lock-first (or source a-var)]
    ;; Lock the source before the re-export. A root change on the source holds the source's monitor while potemkin's
    ;; watch takes the re-export's, so the other order can deadlock against a thread that is proxying the source.
    (locking lock-first
      (locking a-var
        (when-not (proxy-entry a-var)
          (check-proxyable a-var (.getRawRoot a-var))
          (when source
            (take-over! a-var source))
          ;; Anything else gets a proxy over the root it has: a var that is not a re-export, or a re-export under a
          ;; stub, where the stub is what the proxy has to fall back to.
          (when-not (proxy-entry a-var)
            (adopt-reexports! a-var)
            (.bindRoot a-var (var->proxy a-var (.getRawRoot a-var) nil))))))))

(defn patch-vars!
  "Rebind the given vars with proxies that wrap the original functions."
  [vars]
  ;; Check the root rather than a flag on the var: a `with-redefs` can put a stub over a proxy, and potemkin copies a
  ;; source's root over a re-export that has not been proxied yet.
  (run! install-proxy! (remove proxy-entry vars)))

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
     With no replacement of its own in scope, a re-export calls whatever its source calls.
   - Until a re-export or its source has been redefined with this macro, potemkin copies each new root of the
     source over the re-export. A `with-redefs` of the source then overwrites a `with-redefs` of the re-export."
  [bindings & body]
  (let [var->definition (bindings->var->definition bindings)]
    `(do
       (patch-vars! ~(vec (keys var->definition)))
       (binding [*local-redefs* (local-redefs ~var->definition)]
         ~@body))))
