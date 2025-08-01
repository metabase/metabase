(ns metabase.lib.metadata.cache
  "Cache arbitrary immutable values on `metadata-providerable` (eg. a query), by using the `CachedMetadataProvider`'s
  general caching facilities. Has helpers for constructing a cache key that includes the query and stage, making it
  easy to cache things like `visible-columns`."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  #?(:cljs (:require-macros [metabase.lib.metadata.cache])))

(def ^:private ^:dynamic *cache-depth*
  "For debug logging purposes. Keep track of recursive call depth so we can print stuff in a tree."
  -1)

(mr/def ::cache-key
  [:cat
   qualified-keyword?
   [:+ :any]])

(mu/defn cache-key :- ::cache-key
  "Calculate a cache key to use with [[with-cached-value]]. Prefer the 5 arity, which ensures unserializable keys
  like `:lib/metadata` are removed."
  ([unique-key
    x]
   [unique-key x])

  ([unique-key   :- qualified-keyword?
    query        :- [:map
                     [:lib/type [:= :mbql/query]]]
    stage-number :- :int
    x            :- :any
    options      :- :any]
   (letfn [(update-map [m]
             (let [;; use the hash of the metadata provider so only two queries with identical metadata providers get
                   ;; the exact same cache key (see tests). This is mostly to satisfy tests that do crazy stuff and swap
                   ;; out a query's metadata provider so we don't end up returning the wrong cached results for the same
                   ;; query with a different MP
                   m (m/update-existing m :lib/metadata hash)]
               (case (:lib/type m)
                 ;; For cards and metrics being used as keys, these came from the metadata itself, so replace them
                 ;; with stubs referencing them by :id.
                 (:metadata/card :metadata/metric) [(:lib/type m) (:id m)]
                 ;; Otherwise, return the original map.
                 (not-empty m))))]
     [unique-key
      (update-map query)
      (lib.util/canonical-stage-index query stage-number)
      ;; don't want `nil` versus `{}` to result in cache misses.
      (cond-> x (map? x) update-map)
      (cond-> options (map? options) update-map)])))

(mu/defn- ->cached-metadata-provider :- [:maybe ::lib.metadata.protocols/cached-metadata-provider]
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable]
  (let [metadata-provider (lib.metadata/->metadata-provider metadata-providerable)]
    (when (lib.metadata.protocols/cached-metadata-provider? metadata-provider)
      metadata-provider)))

(mu/defn- cached-value
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable
   k                     :- ::cache-key
   not-found]
  (if-let [metadata-provider (->cached-metadata-provider metadata-providerable)]
    (lib.metadata.protocols/cached-value metadata-provider k not-found)
    not-found))

(mu/defn- cache-value! :- :nil
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable
   k                     :- ::cache-key
   v]
  (when-let [metadata-provider (->cached-metadata-provider metadata-providerable)]
    (lib.metadata.protocols/cache-value! metadata-provider k v))
  nil)

(defn ^:dynamic *cache-hit-hook*
  "Function called whenever we have a cache hit. Normally just does boring logging but dynamic so we can test this
  stuff."
  [k]
  (log/debug (str (str/join (repeat *cache-depth* "|   ")) (u/colorize :green "HIT: ") (name (first k)) " " (hash (rest k)))))

(defn ^:dynamic *cache-miss-hook*
  "Function called whenever we have a cache miss. Normally just does boring logging but dynamic so we can test this
  stuff."
  [k]
  (log/debug (str (str/join (repeat *cache-depth* "|   ")) (u/colorize :red "MISS: ") (name (first k)) " " (hash (rest k)))))

(mu/defn do-with-cached-value
  "Impl for [[with-cached-value]]."
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable
   k                     :- ::cache-key
   thunk                 :- [:=> [:cat] :any]]
  (binding [*cache-depth* (inc *cache-depth*)]
    (log/debug (str (str/join (repeat *cache-depth* "|   ")) (u/colorize :cyan "GET: ") (name (first k)) " " (hash (rest k))))
    (let [cached-v (cached-value metadata-providerable k ::not-found)]
      (if-not (= cached-v ::not-found)
        (do
          (*cache-hit-hook* k)
          cached-v)
        (let [v (thunk)]
          (*cache-miss-hook* k)
          (cache-value! metadata-providerable k v)
          v)))))

(defmacro with-cached-value
  "Return the cached value for [[cache-key]] `k` if one already exists in the CachedMetadataProvider's general cache;
  otherwise calculate the value by executing `body`, save it the cache, then return it."
  {:style/indent 2}
  [metadata-providerable k & body]
  `(do-with-cached-value ~metadata-providerable ~k (fn [] ~@body)))
