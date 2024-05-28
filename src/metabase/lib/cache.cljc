(ns metabase.lib.cache
  #?@(:cljs ((:require [goog.object :as gobject]))))

(defn- atomic-map-cache-fn
  "Caching wrapper for use in [[side-channel-cache]].

  Uses an `(atom {})` as the cache and any CLJS value as the `subkey`."
  ([]                      (atom {}))
  ([cache subkey _x]       (get @cache subkey))
  ([cache subkey _x value] (swap! cache assoc subkey value)))

#?(:cljs
   (defn- js-weak-map-cache-fn
     "Caching wrapper for use in [[side-channel-cache*]].

     Uses a two-layer cache: the outer layer is a vanilla JS object with string `subkey`s as its keys. The values are
     `WeakMap`s, using the input value `x` as the key and holding the cached result.

     For example, this works for caching by `:database-id` and then by legacy query object."
     ([]                         #js {})
     ([^js cache subkey x]       (when-let [inner-cache (gobject/get cache subkey)]
                                   (.get inner-cache x)))
     ([^js cache subkey x value] (let [inner-cache (gobject/setWithReturnValueIfNotSet cache subkey #(js/WeakMap.))]
                                   (.set inner-cache x value)))))

(defn- side-channel-cache*
  "(CLJS only; this is a pass-through in CLJ.)

  Attaches a JS property `__mbcache` to `host` (a JS object or CLJS map) if it doesn't already have one.

  This cache forms a \"personal\" cache attached to `host`. `subkey` is used as the key into that cache, and on a cache
  miss the value is computed with `(f x)`.

  If the `host` is a CLJS value like a map, the cache is ignored by CLJS since it's a raw JS property. Any change to
  the CLJS map will return a new object, effectively invalidating the cache.

  If the `host` is a JS object, it cannot have had `Object.freeze()` called on it before the first call to
  [[side-channel-cache*]]. The `host` JS object must also be treated as immutable, since if it is modified the cache will
  contain outdated values. You have been warned.

  The caches are passed both `subkey` and the input value `x` to use as keys. Which of these are actually used as keys
  is up to the `cache-fn`.

  If there is no existing value in the cache for `subkey` and `x`, `(f x)` is called the result is cached for `subkey`
  and `x`.

  Options:
  - The optional `:cache-fn` option defines how the cache is implemented.
    It should be a function with 0-arity, 3-arity, and 4-arity forms, and works like this:
    - `(cache-fn)` returns a new, empty cache.
    - `(cache-fn cache subkey x)` looks up `subkey` and `x` (the input value) in the cache.
      Returns the value, or `nil`.
    - `(cache-fn cache subkey x value)` caches `value` as the value for `subkey` and `x`.
      Returns nothing - the cache is mutable.

    By default, the cache is an `(atom {})` with `get` and `(swap! ... assoc ...)`; see [[atomic-map-cache-fn]].
  - `:force? true` causes the caching to be used even if the `host` does not meet the usual safety check of
    being a vanilla JS object or a CLJS map. (Eg. if the `host` is an instance of a JS class.)"
  [subkey host x f {:keys [cache-fn force?]
                    :or {cache-fn atomic-map-cache-fn}}]
  (comment subkey, force?, cache-fn, host) ; Avoids lint warning for half-unused inputs.
  #?(:clj  (f x)
     :cljs (if (or force? (object? host) (map? host))
             (do
               (when-not (.-__mbcache ^js host)
                 (set! (.-__mbcache ^js host) (cache-fn)))
               (if-let [cache (.-__mbcache ^js host)]
                 (if-let [cached (cache-fn cache subkey x)]
                   cached
                   ;; Cache miss - generate the value and cache it.
                   (let [value (f x)]
                     (cache-fn cache subkey x value)
                     value))
                 (f x)))
             (f x))))

(defn side-channel-cache
  "(CLJS only; this is a pass-through in CLJ.)

  Attaches a JS property `__mbcache` to `host` (a JS object or CLJS map) if it doesn't already have one.

  This cache forms a \"personal\" cache attached to `host`. `subkey` is used as the key into that cache, and on a cache
  miss the value is computed with `(f x)`.

  The 3-arity uses `x` and both the cache host and the value passed to `f`. The 5-arity has separate `host` and `x`.

  If the `host` is a CLJS value like a map, the cache is ignored by CLJS since it's a raw JS property. Any change to
  the CLJS map will return a new object, effectively invalidating the cache.

  If the `host` is a JS object, it cannot have had `Object.freeze()` called on it before the first call to
  [[side-channel-cache*]]. The `host` JS object must also be treated as immutable, since if it is modified the cache will
  contain outdated values. You have been warned.

  If there is no existing value at `subkey` in the cache, this will call `(f x)` and cache the result at `subkey`.

  The cache is an `(atom {})` and any CLJS value can be used as the `subkey`; typically strings are used.

  Options:
  - `:force? true` causes the caching to be used even if the `host` does not meet the usual safety check of
    being a vanilla JS object or a CLJS map. (Eg. if the `host` is an instance of a JS class.)"
  ([subkey x f]
   (side-channel-cache subkey x f false))
  ([subkey x f force?]
   (side-channel-cache* subkey x x f
                        {:cache-fn atomic-map-cache-fn
                         :force?   force?}))
  ([subkey host x f opts]
   (side-channel-cache* subkey host x f
                        (merge {:cache-fn atomic-map-cache-fn} opts))))

#?(:cljs
   (defn side-channel-cache-weak-refs
     "See [[side-channel-cache]] for the overview.

     This version uses a JS `WeakMap` as the cache and JS objects as the `subkey`s."
     [subkey host x f opts]
     (side-channel-cache* subkey host x f (merge {:cache-fn js-weak-map-cache-fn} opts))))
