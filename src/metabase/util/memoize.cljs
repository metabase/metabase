(ns metabase.util.memoize
  "Copied from clojure.core.memoize."
  (:require [cljs.cache :as cache]))

;; Similar to clojure.lang.Delay, but will not memoize an exception and will
;; instead retry.
;;   fun - the function, never nil
;;   available? - indicates a memoized value is available, volatile for visibility
;;   value - the value (if available) - volatile for visibility
(deftype RetryingDelay [fun ^:volatile-mutable available? ^:volatile-mutable value]
  IDeref
  (-deref [_]
    ;; first check (safe with volatile flag)
    (if available?
      value
      ;; fun may throw - will retry on next deref
      (let [v (fun)]
        (set! value v)
        (set! available? true)
        v)))
  IPending
  (-realized? [_]
    available?))

(defn- d-lay [fun]
  (->RetryingDelay fun false nil))

(defn- make-derefable
  "If a value is not already derefable, wrap it up.

  This is used to help rebuild seed/base maps passed in to the various
  caches so that they conform to core.memoize's world view."
  [v]
  (if (instance? IDeref v)
    v
    (reify IDeref
      (-deref [_] v))))

(defn- derefable-seed
  "Given a seed/base map, ensure all the values in it are derefable."
  [seed]
  (update-vals seed make-derefable))

(deftype PluggableMemoization [f cache]
  cache/CacheProtocol
  (has? [_ item]
    (cache/has? cache item))
  (hit  [_ item]
    (PluggableMemoization. f (cache/hit cache item)))
  (miss [_ item result]
    (PluggableMemoization. f (cache/miss cache item result)))
  (evict [_ key]
    (PluggableMemoization. f (cache/evict cache key)))
  (lookup [_ item]
    (cache/lookup cache item nil))
  (lookup [_ item not-found]
    (cache/lookup cache item (delay not-found)))
  (seed [_ base]
    (PluggableMemoization.
     f (cache/seed cache (derefable-seed base))))
  Object
  (toString [_] (str cache)))

(def ^{:private true
       :doc "Returns a function's argument transformer."}
  args-fn #(or (::args-fn (meta %)) identity))

(defn- through*
  "The basic hit/miss logic for the cache system based on `cache/through`.
  Clojure delays are used to hold the cache value."
  [cache f args item]
  (cache/through
   (fn [f _] (d-lay #(f args)))
   #(apply f %)
   cache
   item))

(defn- cached-function
  "Given a function, an atom containing a (pluggable memoization cache), and
  and cache key function, return a new function that behaves like the original
  function except it is cached, based on its arguments."
  [f cache-atom ckey-fn]
  (fn [& args]
    (let [ckey (or (ckey-fn args) [])
          cs   (swap! cache-atom through* f args ckey)
          val  (cache/lookup cs ckey ::not-found)]
       ;; If `lookup` returns `(delay ::not-found)`, it's likely that
       ;; we ran into a timing issue where eviction and access
       ;; are happening at about the same time. Therefore, we retry
       ;; the `swap!` (potentially several times).
       ;;
       ;; metabase.util.memoize currently wraps all of its values in a `delay`.
      (when val
        (loop [n 0 v @val]
          (if (= ::not-found v)
            (when-let [v' (cache/lookup
                           (swap! cache-atom through* f args ckey)
                           ckey ::not-found)]
              (when (< n 10)
                (recur (inc n) @v')))
            v))))))

(defn memoizer
  "Build a pluggable memoized version of a function. Given a function and a
  (pluggable memoized) cache, and an optional seed (hash map of arguments to
  return values), return a cached version of that function.

  If you want to build your own cached function, perhaps with combined caches
  or customized caches, this is the preferred way to do so now."
  ([f cache]
   (let [cache   (atom (PluggableMemoization. f cache))
         ckey-fn (args-fn f)]
     (cached-function f cache ckey-fn)))
  ([f cache seed]
   (let [cache   (atom (cache/seed (PluggableMemoization. f cache)
                                   (derefable-seed seed)))
         ckey-fn (args-fn f)]
     (cached-function f cache ckey-fn))))

(defn lru
  "Works the same as the basic memoization function (i.e.
   `core.memoize` except when a given threshold is breached.
   When the threshold is passed, the cache will expel the
   **L**east **R**ecently **U**sed element in favor of the new."
  ([f] (lru f {} :lru/threshold 32))
  ([f base] (lru f base :lru/threshold 32))
  ([f tkey threshold] (lru f {} tkey threshold))
  ([f base key threshold]
   (assert (= key :lru/threshold) (str "wrong parameter key " key))
   (memoizer f (cache/lru-cache-factory {} :threshold threshold) base)))
