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
   [metabase.query-processor.middleware.cache-backend.db :as backend.db]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
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

(defn- cache-results!
  "Save the final results of a query."
  [query-hash]
  (log/infof "Caching results for next time for query with hash %s. %s"
             (pr-str (i/short-hex-hash query-hash)) (u/emoji "💾"))
  (try
    (let [bytez (serialized-bytes)]
      (if-not (instance? (Class/forName "[B") bytez)
        (log/errorf "Cannot cache results: expected byte array, got %s" (class bytez))
        (do
          (log/trace "Got serialized bytes; saving to cache backend")
          (i/save-results! *backend* query-hash bytez)
          (log/debug "Successfully cached results for query.")
          (schedule-purge! *backend*))))
    :done
    (catch Throwable e
      (if (= (:type (ex-data e)) ::impl/max-bytes)
        (log/debugf e "Not caching results: results are larger than %s KB" (cache/query-caching-max-kb))
        (log/errorf e "Error saving query results to cache: %s" (ex-message e))))))

(defn- save-results-xform [start-time-ns metadata query-hash strategy rf]
  (add-object-to-cache! (assoc metadata
                               :cache-version cache-version
                               :last-ran      (t/zoned-date-time)))
  (fn
    ([] (rf))

    ([result]
     (add-object-to-cache! (if (map? result)
                             (m/dissoc-in result [:data :rows])
                             {}))
     (let [duration-ms     (/ (- (System/nanoTime) start-time-ns) 1e6)
           min-duration-ms (:min-duration-ms strategy 0)
           ;; cache any query that ran long enough -- including ones that returned no rows, so a slow empty result
           ;; doesn't get re-run at full cost on every request
           eligible?       (> duration-ms min-duration-ms)]
       (log/infof "Query %s took %s to run; minimum for cache eligibility is %s; %s"
                  (i/short-hex-hash query-hash)
                  (u/format-milliseconds duration-ms)
                  (u/format-milliseconds min-duration-ms)
                  (if eligible? "eligible" "not eligible"))
       (when eligible?
         (cache-results! query-hash))
       (rf (cond-> result
             (map? result) (update :cache/details assoc :hash query-hash :stored (boolean eligible?))))))

    ([acc row]
     (add-object-to-cache! row)
     (rf acc row))))

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

(def ^:dynamic *refresh-lease-duration-ms*
  "How long a claimed stale-while-revalidate refresh lease is honored before another process may take it over (e.g. if
  the claiming process crashed mid-refresh). Should comfortably exceed a normal query's run time."
  (u/minutes->ms 5))

(defn- cache-fresh?
  "Whether a cache entry last written at `updated-at` is still within its TTL given `invalidated-at` (the strategy's
  freshness boundary, which must be non-nil)."
  [updated-at invalidated-at]
  (boolean (and updated-at
                (not (t/before? (t/instant updated-at) (t/instant invalidated-at))))))

(mu/defn- maybe-serve-cached-results :- [:tuple
                                         #_status [:enum ::fresh ::stale ::miss ::canceled]
                                         #_result :any]
  "Look up the cache entry for `query-hash` and decide what to do (stale-while-revalidate):
    - `[::fresh result]` -- entry is within its TTL; serve it.
    - `[::stale result]` -- entry is expired but another process holds the refresh lease; serve it stale while that
                            process refreshes, so we don't stampede the data warehouse.
    - `[::miss nil]`     -- no entry, or it's expired and *this* process won the lease; the caller must recompute.
    - `[::canceled nil]` -- the request was canceled."
  [ignore-cache?
   query-hash :- bytes?
   strategy   :- :map
   rff        :- ::qp.schema/rff]
  (if ignore-cache?
    [::miss nil]
    (try
      (or (i/with-cached-results *backend* query-hash [is updated-at]
                                 (when is
                                   (let [invalidated-at (backend.db/strategy->invalidated-at strategy)]
                                     (cond
                                       ;; can't determine freshness for this strategy -> don't serve from cache
                                       (nil? invalidated-at)
                                       nil

                                       ;; within its TTL -> serve the fresh entry
                                       (cache-fresh? updated-at invalidated-at)
                                       (when-let [result (reduce-cached-stream is rff query-hash)]
                                         [::fresh result])

                                       ;; expired, and we won the refresh lease -> recompute (don't serve stale)
                                       (i/try-acquire-refresh-lease! *backend* query-hash *refresh-lease-duration-ms*)
                                       nil

                                       ;; expired, another process is refreshing -> serve stale
                                       :else
                                       (when-let [result (reduce-cached-stream is rff query-hash)]
                                         (log/debugf "Serving stale cached results for hash '%s' while another process refreshes"
                                                     (i/short-hex-hash query-hash))
                                         [::stale result])))))
          [::miss nil])
      (catch EofException _
        (log/debug "Request is closed; no one to return cached results to")
        [::canceled nil])
      (catch Throwable e
        (log/errorf e "Error attempting to fetch cached results for query with hash %s: %s"
                    (i/short-hex-hash query-hash)
                    (ex-message e))
        [::miss nil]))))

;;; --------------------------------------------------- Middleware ---------------------------------------------------

(defn- run-and-cache!
  "Run `query` through `qp` and save the results to the cache (if eligible). Used on a cache miss, or when this process
  holds the stale-while-revalidate refresh lease."
  [qp query query-hash cache-strategy rff]
  (let [start-time-ns (System/nanoTime)
        orig-reduce   qp.pipeline/*reduce*]
    (log/trace "Running query and saving cached results (if eligible)...")
    (binding [qp.pipeline/*reduce* (fn reduce'
                                     [rff metadata rows]
                                     {:post [(some? %)]}
                                     (impl/do-with-serialization
                                      (fn [in-fn result-fn]
                                        (binding [*in-fn*     in-fn
                                                  *result-fn* result-fn]
                                          (orig-reduce rff metadata rows)))))]
      (qp query
          (fn [metadata]
            (save-results-xform start-time-ns metadata query-hash cache-strategy (rff metadata)))))))

(mu/defn- run-query-with-cache :- :some
  [qp {:keys [cache-strategy middleware], :as query} :- ::qp.schema/any-query
   rff                                               :- ::qp.schema/rff]
  ;; Query will already have `info.hash` if it's a userland query. It's not the same hash, because this is calculated
  ;; after normalization, instead of before. This is necessary to make caching work properly with sandboxed users, see
  ;; #14388.
  (let [query-hash      (qp.util/query-hash query)
        [status result] (maybe-serve-cached-results (:ignore-cached-results? middleware) query-hash cache-strategy rff)]
    (case status
      (::fresh ::stale) result
      ::canceled        ::canceled
      ::miss            (run-and-cache! qp query query-hash cache-strategy rff))))

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
