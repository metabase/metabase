(ns metabase.query-processor.middleware.cache
  "Middleware that returns cached results for queries when applicable.

  If query caching is enabled, cache strategy has been passed and it's not a `{:type :nocache}`, THEN cached results
  will be returned for Cards if available or stored if applicable. For all other queries, caching is skipped.

  The default backend is `db`, which uses the application database; this value can be changed by setting the env var
  `MB_QP_CACHE_BACKEND`. Refer to [[metabase.query-processor.middleware.cache-backend.interface]] for more details
  about how the cache backends themselves."
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.middleware.cache-backend.db :as backend.db]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.query-processor.middleware.cache.impl :as impl]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
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

(defn- purge! [backend]
  (try
    (log/tracef "Purging cache entries older than %s" (u/format-seconds (public-settings/query-caching-max-ttl)))
    (i/purge-old-entries! backend (public-settings/query-caching-max-ttl))
    (log/trace "Successfully purged old cache entries.")
    :done
    (catch Throwable e
      (log/errorf e "Error purging old cache entries: %s" (ex-message e)))))

(def ^:private ^:dynamic *in-fn*
  "The `in-fn` provided by [[impl/do-with-serialization]]."
  nil)

(defn- add-object-to-cache!
  "Add `object` (e.g. a result row or metadata) to the current cache entry."
  [object]
  (when *in-fn*
    (*in-fn* object)))

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
          (purge! *backend*))))
    :done
    (catch Throwable e
      (if (= (:type (ex-data e)) ::impl/max-bytes)
        (log/debugf e "Not caching results: results are larger than %s KB" (public-settings/query-caching-max-kb))
        (log/errorf e "Error saving query results to cache: %s" (ex-message e))))))

(defn- save-results-xform [start-time-ns metadata query-hash strategy rf]
  (let [has-rows? (volatile! false)]
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
             eligible?       (and @has-rows?
                                  (> duration-ms min-duration-ms))]
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
       (vreset! has-rows? true)
       (rf acc row)))))


;;; ----------------------------------------------------- Fetch ------------------------------------------------------

(defn- cached-results-rff
  "Reducing function for cached results. Merges the final object in the cached results, the `final-metdata` map, with
  the reduced value assuming it is a normal metadata map."
  [rff query-hash]
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
                                    (merge-with merge @final-metadata (unreduced result))
                                    (unreduced result))
                                  (assoc :cache/details {:hash query-hash :cached true :updated_at last-ran}))]
           (rf (cond-> result*
                 (reduced? result) reduced))))

        ([acc row]
         (if (map? row)
           (vreset! final-metadata row)
           (rf acc row)))))))

(mu/defn ^:private maybe-reduce-cached-results :- [:tuple
                                                   #_status
                                                   [:enum ::ok ::miss ::canceled]
                                                   #_result
                                                   :any]
  "Reduces cached results if there is a hit. Otherwise, returns `::miss` directly."
  [ignore-cache? query-hash strategy rff]
  (try
    (or (when-not ignore-cache?
          (log/debugf "Looking for cached results for query with hash '%s' satisfying %s"
                      (i/short-hex-hash query-hash) (pr-str strategy))
          (i/with-cached-results *backend* query-hash strategy [is]
            (if is
              (impl/with-reducible-deserialized-results [[metadata reducible-rows] is]
                (log/debugf "Found cached results for hash '%s'. Version: %s"
                            (i/short-hex-hash query-hash) (pr-str (:cache-version metadata)))
                (when (and (= (:cache-version metadata) cache-version)
                           reducible-rows)
                  (log/trace "Reducing cached rows...")
                  (let [result (qp.pipeline/*reduce* (cached-results-rff rff query-hash) metadata reducible-rows)]
                    (log/trace "All cached rows reduced")
                    [::ok result])))
              (log/debugf "Not found cached results for hash '%s'" (i/short-hex-hash query-hash)))))
        [::miss nil])
    (catch EofException _
      (log/debug "Request is closed; no one to return cached results to")
      [::canceled nil])
    (catch Throwable e
      (log/errorf e "Error attempting to fetch cached results for query with hash %s: %s"
                  (i/short-hex-hash query-hash)
                  (ex-message e))
      [::miss nil])))


;;; --------------------------------------------------- Middleware ---------------------------------------------------

(mu/defn ^:private run-query-with-cache :- :some
  [qp {:keys [cache-strategy middleware], :as query} :- ::qp.schema/query
   rff                                               :- ::qp.schema/rff]
  ;; Query will already have `info.hash` if it's a userland query. It's not the same hash, because this is calculated
  ;; after normalization, instead of before. This is necessary to make caching work properly with sandboxed users, see
  ;; #14388.
  (let [query-hash      (qp.util/query-hash query)
        [status result] (maybe-reduce-cached-results (:ignore-cached-results? middleware) query-hash cache-strategy rff)]
    (case status
      ::ok
      result

      ::canceled
      ::canceled

      ::miss
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
                (save-results-xform start-time-ns metadata query-hash cache-strategy (rff metadata)))))))))

(defn- is-cacheable? {:arglists '([query])} [{:keys [cache-strategy]}]
  (and (public-settings/enable-query-caching)
       (some? cache-strategy)
       (not= (:type cache-strategy) :nocache)))

(defn maybe-return-cached-results
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
  [qp]
  (fn maybe-return-cached-results* [query rff]
    (let [cacheable? (is-cacheable? query)]
      (log/tracef "Query is cacheable? %s" (boolean cacheable?))
      (if cacheable?
        (run-query-with-cache qp query rff)
        (qp query rff)))))
