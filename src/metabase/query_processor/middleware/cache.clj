(ns metabase.query-processor.middleware.cache
  "Middleware that returns cached results for queries when applicable.

  If query caching is enabled, cache strategy has been passed and it's not a `{:type :nocache}`, THEN cached results
  will be returned for Cards if available or stored if applicable. For all other queries, caching is skipped.

  The default backend is `db`, which uses the application database; this value can be changed by setting the env var
  `MB_QP_CACHE_BACKEND`. Refer to [[metabase.query-processor.middleware.cache-backend.interface]] for more details
  about how the cache backends themselves."
  (:refer-clojure :exclude [get-in])
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.batch-processing.core :as grouper]
   [metabase.cache.core :as cache]
   [metabase.config.core :as config]
   [metabase.lib.core :as lib]
   [metabase.op-cache-impl.cache :as op-cache.impl]
   [metabase.op-cache.core :as op-cache]
   [metabase.query-processor.middleware.cache-backend.db :as backend.db]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.query-processor.middleware.cache-backend.storage-adapter :as storage-adapter]
   [metabase.query-processor.middleware.cache.impl :as impl]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.util :as qp.util]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [get-in]])
  (:import
   (java.io ByteArrayInputStream)
   (org.eclipse.jetty.io EofException)))

(set! *warn-on-reflection* true)

(comment backend.db/keep-me)

(def ^:private cache-version
  "Current serialization format version. Basically

    [initial-metadata row-1 row-2 ... row-n final-metadata]"
  3)

(def ^:dynamic *backend*
  "Current cache backend. Dynamically rebindable primary for test purposes."
  (i/cache-backend (config/config-kw :mb-qp-cache-backend)))

;;; ------------------------------------------------------ Save ------------------------------------------------------

(def ^:private purge-interval-seconds
  "How often, at most, to purge cache entries older than [[cache/query-caching-max-ttl]]. Purging on every save is
  wasteful: the max TTL is measured in days, and on instances with a high cache-miss rate the repeated DELETEs are
  expensive and contend with concurrent cache writes."
  (* 5 60))

(def ^:private purge-queue-capacity 1000)

(defn- purge!* [backends]
  (doseq [backend (distinct backends)]
    (try
      (log/tracef "Purging cache entries older than %s" (u/format-seconds (cache/query-caching-max-ttl)))
      (i/purge-old-entries! backend (cache/query-caching-max-ttl))
      (log/trace "Successfully purged old cache entries.")
      (catch Throwable e
        (log/errorf e "Error purging old cache entries: %s" (ex-message e))))))

(defonce ^:private purge-queue
  (delay (grouper/start!
          #'purge!*
          :capacity purge-queue-capacity
          :interval (* purge-interval-seconds 1000))))

(defn- schedule-purge! [backend]
  (grouper/submit! @purge-queue backend))

(def ^:private ^:dynamic *in-fn*
  "The `in-fn` provided by [[impl/do-with-serialization]]."
  nil)

(defn- add-object-to-cache!
  "Add `object` (e.g. a result row or metadata) to the current cache entry."
  [object]
  (when *in-fn*
    (*in-fn* (cond-> object
               (map? object) (-> (m/update-existing :json_query lib/prepare-for-serialization)
                                 (m/update-existing :preprocessed_query lib/prepare-for-serialization))))))

(def ^:private ^:dynamic *result-fn*
  "The `result-fn` provided by [[impl/do-with-serialization]]."
  nil)

(defn- serialized-bytes []
  (when *result-fn*
    (*result-fn*)))

(defn- serialize-tee-xform
  "Tee `metadata` and every row flowing through `rf` into the active serialization context, so that once the reduction
  completes the serialized results are available via [[serialized-bytes]]. Also stamps the result's `:cache/details`
  with the query hash *within* the reduction, where middlewares up the rf chain (e.g. userland query execution
  recording) can see it."
  [metadata query-hash rf]
  (add-object-to-cache! (assoc metadata
                               :cache-version cache-version
                               :last-ran      (t/zoned-date-time)))
  (fn
    ([] (rf))

    ([result]
     (add-object-to-cache! (if (map? result)
                             (m/dissoc-in result [:data :rows])
                             {}))
     (rf (cond-> result
           (map? result) (update :cache/details assoc :hash query-hash))))

    ([acc row]
     (add-object-to-cache! row)
     (rf acc row))))

(defn- try-serialized-bytes
  "The serialized bytes of the just-reduced results, or nil if serialization failed or was aborted (e.g. the results
  are larger than [[cache/query-caching-max-kb]])."
  []
  (try
    (let [bytez (serialized-bytes)]
      (if (instance? (Class/forName "[B") bytez)
        bytez
        (do
          (log/errorf "Cannot cache results: expected byte array, got %s" (class bytez))
          nil)))
    (catch Throwable e
      (if (= (:type (ex-data e)) ::impl/max-bytes)
        (log/debugf e "Not caching results: results are larger than %s KB" (cache/query-caching-max-kb))
        (log/errorf e "Error serializing query results for the cache: %s" (ex-message e)))
      nil)))

;;; ----------------------------------------------------- Fetch ------------------------------------------------------

(mu/defn- cached-results-rff :- ::qp.schema/rff
  "Reducing function for cached results. Merges the final object in the cached results, the `final-metdata` map, with
  the reduced value assuming it is a normal metadata map."
  [rff        :- ::qp.schema/rff
   query-hash :- bytes?]
  (fn [{:keys [last-ran], :as metadata}]
    (let [metadata       (dissoc metadata :last-ran :cache-version)
          rf             (rff metadata)
          final-metadata (volatile! nil)]
      (fn
        ([]
         (rf))

        ([result]
         (let [normal-format? (and (map? (unreduced result))
                                   (seq (get-in (unreduced result) [:data :cols])))
               result*        (-> (if normal-format?
                                    (m/deep-merge @final-metadata (unreduced result))
                                    (unreduced result))
                                  (assoc :cache/details {:hash query-hash :cached true :updated_at last-ran}))]
           (rf (cond-> result*
                 (reduced? result) reduced))))

        ([acc row]
         (if (map? row)
           ;; The map-row is the cached final-metadata; stash it and preserve the fresh
           ;; acc (returning `row` would clobber anything middlewares wrote at init,
           ;; e.g. :viz-settings). `unreduced` strips any reduced marker so it doesn't
           ;; leak out through the stashed handoff.
           (do (vreset! final-metadata row) (unreduced acc))
           ;; `reducible-rows` keeps reading past a reduced acc (see cache/impl.clj);
           ;; propagate it here instead of calling `rf` past the short-circuit.
           (if (reduced? acc)
             acc
             (rf acc row))))))))

(defn- reduce-cached-stream
  "Deserialize and reduce a cached-results `InputStream` `is` with `rff`. Returns the reduced result, or nil if the
  stream is absent or was written by an incompatible cache version."
  [is rff query-hash]
  (when is
    (impl/with-reducible-deserialized-results [[metadata reducible-rows] is]
      (log/debugf "Found cached results for hash '%s'. Version: %s"
                  (i/short-hex-hash query-hash) (pr-str (:cache-version metadata)))
      (when (and (= (:cache-version metadata) cache-version)
                 reducible-rows)
        (log/trace "Reducing cached rows...")
        (u/prog1 (qp.pipeline/*reduce* (cached-results-rff rff query-hash) metadata reducible-rows)
          (log/trace "All cached rows reduced"))))))

;;; --------------------------------------------------- Middleware ---------------------------------------------------

(defn- run-and-serialize!
  "Run `query` through `qp`, streaming results through `rff` while teeing them into the serializer. Stashes the reduced
  result in `result-volatile` and returns the serialized bytes, or nil if serialization failed or was aborted."
  [qp query query-hash rff result-volatile]
  (let [orig-reduce qp.pipeline/*reduce*
        bytes-vol   (volatile! nil)]
    (log/trace "Running query and serializing results...")
    (binding [qp.pipeline/*reduce* (fn reduce'
                                     [rff metadata rows]
                                     {:post [(some? %)]}
                                     (impl/do-with-serialization
                                      (fn [in-fn result-fn]
                                        (binding [*in-fn*     in-fn
                                                  *result-fn* result-fn]
                                          (u/prog1 (orig-reduce rff metadata rows)
                                            (vreset! bytes-vol (try-serialized-bytes)))))))]
      (vreset! result-volatile (qp query (fn [metadata]
                                           (serialize-tee-xform metadata query-hash (rff metadata)))))
      @bytes-vol)))

(defn- serialized-size
  "Size of serialized results for the op cache's max-size check, or nil when serialization failed or was aborted and
  there is nothing storable."
  [^bytes v]
  (when v
    (alength v)))

(defn- query-op-cache
  "An op cache running [[*backend*]], configured for `cache-strategy`."
  [cache-strategy]
  (op-cache.impl/cache (storage-adapter/storage *backend*)
                       {:min-duration-ms (:min-duration-ms cache-strategy 0)
                        :max-size        (* (cache/query-caching-max-kb) 1024)
                        :size-fn         serialized-size
                        :stale-grace-ms  (* 1000 (cache/query-caching-stale-grace-seconds))
                        :claim-ttl-ms    (* 1000 (cache/query-caching-refresh-lease-seconds))}))

(defn- reduce-cached-bytes
  "Reduce cached serialized results `value` with `rff`. Returns the reduced result, or nil if the bytes are unusable
  (incompatible cache version, corrupt entry, ...). [[EofException]] (the requester hung up) propagates."
  [^bytes value rff query-hash]
  (try
    (reduce-cached-stream (ByteArrayInputStream. value) rff query-hash)
    (catch EofException e
      (throw e))
    (catch Throwable e
      (log/errorf e "Error reducing cached results for query with hash %s: %s"
                  (i/short-hex-hash query-hash) (ex-message e))
      nil)))

(mu/defn- run-query-with-cache :- :some
  [qp {:keys [cache-strategy middleware], :as query} :- ::qp.schema/any-query
   rff                                               :- ::qp.schema/rff]
  ;; Query will already have `info.hash` if it's a userland query. It's not the same hash, because this is calculated
  ;; after normalization, instead of before. This is necessary to make caching work properly with sandboxed users, see
  ;; #14388.
  (let [query-hash     (qp.util/query-hash query)
        ;; nil `invalidated-at` means the op cache never serves a stored value, which is exactly what
        ;; `ignore-cached-results?` wants (results are still stored for later callers)
        invalidated-at (when-not (:ignore-cached-results? middleware)
                         (backend.db/strategy->invalidated-at cache-strategy))
        result-vol     (volatile! nil)
        op-cache       (query-op-cache cache-strategy)]
    (try
      (loop [retried? false]
        (let [{:keys [value source written-at stored]}
              (op-cache/fetch-or-compute! op-cache query-hash
                                          (fn [] (run-and-serialize! qp query query-hash rff result-vol))
                                          {:invalidated-at invalidated-at})]
          (if (= source :computed)
            (do
              (when stored
                (log/infof "Cached results for next time for query with hash %s. %s"
                           (pr-str (i/short-hex-hash query-hash)) (u/emoji "💾"))
                (schedule-purge! *backend*))
              ;; only augment a `:cache/details` the rf chain preserved -- middlewares up the chain (userland query
              ;; execution) strip it from their response, and it should stay stripped
              (let [result @result-vol]
                (cond-> result
                  (and (map? result) (:cache/details result))
                  (update :cache/details assoc :hash query-hash :stored (boolean stored)))))
            (do
              (when (= source :cached-stale)
                (log/debugf "Serving stale cached results (written at %s) for hash '%s' while another process refreshes"
                            written-at (i/short-hex-hash query-hash)))
              (or (reduce-cached-bytes value rff query-hash)
                  ;; the entry is unusable; evict it and retry (a retry either recomputes or is served a concurrent
                  ;; caller's fresh results). If a second entry is *still* unusable, just run the query uncached.
                  (if retried?
                    (qp query rff)
                    (do
                      (op-cache/evict! op-cache query-hash)
                      (recur true))))))))
      (catch EofException _
        (log/debug "Request is closed; no one to return cached results to")
        ::canceled))))

(defn- has-cache-strategy? [cache-strategy]
  (some? cache-strategy))

(defn- strategy-not-nocache? [cache-strategy]
  (not= (:type cache-strategy) :nocache))

(defn- is-cacheable?
  "Returns true if the query has a valid cache strategy."
  [{:keys [cache-strategy], :as _query}]
  (let [has-strat?  (has-cache-strategy? cache-strategy)
        not-nocache? (strategy-not-nocache? cache-strategy)]
    (and has-strat? not-nocache?)))

(defn- get-cache-eligibility-description
  "Returns a descriptive string explaining why a query is or isn't cacheable."
  [{:keys [cache-strategy], :as _query}]
  (let [has-strat?  (has-cache-strategy? cache-strategy)
        not-nocache? (strategy-not-nocache? cache-strategy)]
    (if (and has-strat? not-nocache?)
      (str "cache strategy provided: " (pr-str cache-strategy) "; "
           "cache strategy type is not :nocache")
      (str/join ", "
                (cond-> []
                  (not has-strat?)   (conj "no cache strategy provided")
                  (not not-nocache?) (conj "cache strategy is :nocache"))))))

(mu/defn maybe-return-cached-results :- ::qp.schema/qp
  "Middleware for caching results of a query if applicable.
  In order for a query to be eligible for caching:

     *  Caching (the `enable-query-caching` Setting) must be enabled
     *  The query must pass a `:cache-strategy` value
     *  This strategy should not be of type `:nocache`
     *  The query must already be permissions-checked. Since the cache bypasses the normal
        query processor pipeline, the ad-hoc permissions-checking middleware isn't applied for cached results.
        (The various `/api/card/` endpoints that make use of caching do `can-read?` checks for the Card *before*
        running the query, satisfying this requirement.)
     *  The result *rows* of the query must be less than `query-caching-max-kb` when serialized (before compression)."
  [qp :- ::qp.schema/qp]
  (fn maybe-return-cached-results* [query rff]
    (let [cacheable? (is-cacheable? query)]
      (log/tracef "Query is %scacheable: %s" (if-not cacheable? "not " "") (get-cache-eligibility-description query))
      (if cacheable?
        (tracing/with-span :qp "qp.cache" {:cache/eligible true}
          (run-query-with-cache qp query rff))
        (qp query rff)))))
