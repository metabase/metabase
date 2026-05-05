(ns metabase.lib.metadata.cache
  "Cache arbitrary immutable values on `metadata-providerable` (eg. a query), by using the `CachedMetadataProvider`'s
  general caching facilities. Has helpers for constructing a cache key that includes the query and stage, making it
  easy to cache things like `visible-columns`."
  (:refer-clojure :exclude [not-empty])
  (:require
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.metadata.util :as lib.metadata.util]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [not-empty]])
  #?(:cljs (:require-macros [metabase.lib.metadata.cache])))

(mr/def ::cache-key
  [:cat
   qualified-keyword?
   [:+ :any]])

(defn- cache-key-for-table-or-card
  "Metadata for a Table, Card, or Metric always comes from the metadata provider and is always unaffected by the
  contents of the query, or stage number; thus as an optimization we can generate a key based on just the hash of the
  metadata provider (see below), `:lib/type`, ID, and options."
  [unique-key query x options]
  [unique-key (hash (:lib/metadata query)) (:lib/type x) (:id x) (not-empty options)])

(defn- cache-key-optimized-query
  "Optimization: replace all stages beyond what we're calculating metadata for with just a single additional blank
  stage. The only way later stages can possibly affect metadata for previous stages is the mega hack for stage
  returned-columns that deduplicates `:name` only if the stage in question is the last stage of a
  query (see [[metabase.lib.stage-test/returned-columns-deduplicate-names-test]]). I'd rather just figure out how to
  get rid of the need for this hack in the first place (seems crazy that later stages can affect the metadata of
  previous stages) but sometimes you just have to live with haxx.

  This will allow us to hit the cache much more often."
  [query stage-number]
  (let [stage-number        (lib.util/canonical-stage-index query stage-number)
        num-stages          (count (:stages query))
        num-relevant-stages (inc stage-number)]
    (if (> num-stages num-relevant-stages)
      (update query :stages (fn [stages]
                              (-> (into []
                                        (take num-relevant-stages)
                                        stages)
                                  ;; replace all 'irrelevant stages' with a single additional
                                  ;; blank stage.
                                  (conj {:lib/type :mbql.stage/mbql}))))
      query)))

(defn- cache-key-for-other [unique-key query stage-number x options]
  (letfn [(prepare-map [m]
            (cond-> m
              (map? m) (->
                        ;; use the hash of the metadata provider so only two queries with identical metadata providers
                        ;; get the exact same cache key (see tests). This is mostly to satisfy tests that do crazy
                        ;; stuff and swap out a query's metadata provider so we don't end up returning the wrong
                        ;; cached results for the same query with a different MP
                        (m/update-existing :lib/metadata hash)
                        ;; don't want `nil` versus `{}` to result in cache misses.
                        not-empty)))]
    [unique-key
     (-> query
         (cache-key-optimized-query stage-number)
         prepare-map)
     (lib.util/canonical-stage-index query stage-number)
     (prepare-map x)
     (prepare-map options)]))

(mu/defn cache-key :- ::cache-key
  "Calculate a cache key to use with [[with-cached-value]]. Prefer the 5 arity, which ensures unserializable keys
  like `:lib/metadata` are removed."
  ([unique-key x]
   [unique-key x])

  ([unique-key   :- qualified-keyword?
    query        :- [:map
                     [:lib/type [:= :mbql/query]]]
    stage-number :- :int
    x            :- :any
    options      :- :any]
   (if (#{:metadata/table :metadata/card :metadata/metric} (lib.dispatch/dispatch-value x))
     (cache-key-for-table-or-card unique-key query x options)
     (cache-key-for-other unique-key query stage-number x options))))

(mu/defn- ->cached-metadata-provider :- [:maybe ::lib.metadata.protocols/cached-metadata-provider]
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable]
  (let [metadata-provider (lib.metadata.util/->metadata-provider metadata-providerable)]
    (when (lib.metadata.protocols/cached-metadata-provider? metadata-provider)
      metadata-provider)))

(mu/defn- cached-value
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable
   k                     :- ::cache-key
   not-found]
  (if-let [metadata-provider (->cached-metadata-provider metadata-providerable)]
    (lib.metadata.protocols/cached-value metadata-provider k not-found)
    (do (log/warn "Not a cached-metadata-provider")
        not-found)))

(mu/defn- cache-value! :- :nil
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable
   k                     :- ::cache-key
   v]
  (if-let [metadata-provider (->cached-metadata-provider metadata-providerable)]
    (lib.metadata.protocols/cache-value! metadata-provider k v)
    (log/warn "Not a cached-metadata-provider"))
  nil)

(defn ^:dynamic *cache-hit-hook*
  "Function called whenever we have a cache hit. Normally just does boring logging but dynamic so we can test this
  stuff."
  [k]
  (log/debug (str (u/colorize :green "HIT: ") (name (first k)) " " (hash (rest k)))))

(defn ^:dynamic *cache-miss-hook*
  "Function called whenever we have a cache miss. Normally just does boring logging but dynamic so we can test this
  stuff."
  [k]
  (log/debug (str (u/colorize :red "MISS: ") (name (first k)) " " (hash (rest k)))))

(mu/defn do-with-cached-value
  "Impl for [[with-cached-value]]."
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable
   k                     :- ::cache-key
   thunk                 :- [:=> [:cat] :any]]
  (log/debug (str (u/colorize :cyan "GET: ") (name (first k)) " " (hash (rest k))))
  (let [cached-v (cached-value metadata-providerable k ::not-found)]
    (if-not (= cached-v ::not-found)
      (do
        (*cache-hit-hook* k)
        cached-v)
      (let [v (thunk)]
        (*cache-miss-hook* k)
        (cache-value! metadata-providerable k v)
        v))))

(defmacro with-cached-value
  "Return the cached value for [[cache-key]] `k` if one already exists in the CachedMetadataProvider's general cache;
  otherwise calculate the value by executing `body`, save it the cache, then return it."
  {:style/indent 2}
  [metadata-providerable k & body]
  `(do-with-cached-value ~metadata-providerable ~k (fn [] ~@body)))
