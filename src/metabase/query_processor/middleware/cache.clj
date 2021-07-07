(ns metabase.query-processor.middleware.cache
  "Middleware that returns cached results for queries when applicable.

  If caching is enabled (`enable-query-caching` is `true`) cached results will be returned for Cards if possible.
  There's a global default TTL defined by the setting `query-caching-default-ttl`, but individual Cards can override
  this value with custom TTLs with a value for `:cache_ttl`.

  For all other queries, caching is skipped.

  The default backend is `db`, which uses the application database; this value can be changed by setting the env var
  `MB_QP_CACHE_BACKEND`. Refer to `metabase.query-processor.middleware.cache-backend.interface` for more details about
  how the cache backends themselves."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor.context :as context]
            [metabase.query-processor.middleware.cache-backend.db :as backend.db]
            [metabase.query-processor.middleware.cache-backend.interface :as i]
            [metabase.query-processor.middleware.cache.impl :as impl]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]])
  (:import org.eclipse.jetty.io.EofException))

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
    (log/tracef "Purging cache entires older than %s" (u/format-seconds (public-settings/query-caching-max-ttl)))
    (i/purge-old-entries! backend (public-settings/query-caching-max-ttl))
    (catch Throwable e
      (log/error e (trs "Error purging old cache entires")))))

(defn- min-duration-ms
  "Minimum duration it must take a query to complete in order for it to be eligible for caching."
  []
  (* (public-settings/query-caching-min-ttl) 1000))

(defn- cache-results-async!
  "Save the results of a query asynchronously once they are delivered (as a byte array) to the promise channel
  `out-chan`."
  [query-hash out-chan]
  (log/info (trs "Caching results for next time for query with hash {0}." (pr-str (i/short-hex-hash query-hash))) (u/emoji "💾"))
  (a/go
    (let [x (a/<! out-chan)]
      (condp instance? x
        Throwable
        (if (= (:type (ex-data x)) ::impl/max-bytes)
          (log/debug x (trs "Not caching results: results are larger than {0} KB" (public-settings/query-caching-max-kb)))
          (log/error x (trs "Error saving query results to cache.")))

        (Class/forName "[B")
        (let [y (a/<! (a/thread
                        (try
                          (i/save-results! *backend* query-hash x)
                          (catch Throwable e
                            e))))]
          (if (instance? Throwable y)
            (log/error y (trs "Error saving query results to cache."))
            (do
              (log/debug (trs "Successfully cached results for query."))
              (purge! *backend*))))

        (log/error (trs "Cannot cache results: expected byte array, got {0}" (class x)))))))

(defn- save-results-xform [start-time metadata query-hash rf]
  (let [{:keys [in-chan out-chan]} (impl/serialize-async)
        has-rows?                  (volatile! false)]
    (a/put! in-chan (assoc metadata
                           :cache-version cache-version
                           :last-ran      (t/zoned-date-time)))
    (fn
      ([] (rf))

      ([result]
       (a/put! in-chan (if (map? result)
                         (m/dissoc-in result [:data :rows])
                         {}))
       (a/close! in-chan)
       (let [duration-ms (- (System/currentTimeMillis) start-time)]
         (log/info (trs "Query took {0} to run; minimum for cache eligibility is {1}"
                        (u/format-milliseconds duration-ms) (u/format-milliseconds (min-duration-ms))))
         (when (and @has-rows?
                    (> duration-ms (min-duration-ms)))
           (cache-results-async! query-hash out-chan)))
       (rf result))

      ([acc row]
       ;; Blocking so we don't exceed async's MAX-QUEUE-SIZE when transducing a large result set
       (a/>!! in-chan row)
       (vreset! has-rows? true)
       (rf acc row)))))

;;; ----------------------------------------------------- Fetch ------------------------------------------------------

(defn- cached-results-rff
  "Reducing function for cached results. Merges the final object in the cached results, the `final-metdata` map, with
  the reduced value assuming it is a normal metadata map."
  [rff]
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
                                  (assoc :cached true, :updated_at last-ran))]
           (rf (cond-> result*
                 (reduced? result) reduced))))

        ([acc row]
         (if (map? row)
           (vreset! final-metadata row)
           (rf acc row)))))))

(defn- maybe-reduce-cached-results
  "Reduces cached results if there is a hit. Otherwise, returns `::miss` directly."
  [ignore-cache? query-hash max-age-seconds rff context]
  (try
    (or (when-not ignore-cache?
          (log/tracef "Looking for cached results for query with hash %s younger than %s\n"
                      (pr-str (i/short-hex-hash query-hash)) (u/format-seconds max-age-seconds))
          (i/with-cached-results *backend* query-hash max-age-seconds [is]
            (when is
              (impl/with-reducible-deserialized-results [[metadata reducible-rows] is]
                (log/tracef "Found cached results. Version: %s" (pr-str (:cache-version metadata)))
                (when (and (= (:cache-version metadata) cache-version)
                           reducible-rows)
                  (log/tracef "Reducing cached rows...")
                  (context/reducef (cached-results-rff rff) context metadata reducible-rows)
                  (log/tracef "All cached rows reduced")
                  ::ok)))))
        ::miss)
    (catch EofException _
      (log/debug (trs "Request is closed; no one to return cached results to"))
      ::canceled)
    (catch Throwable e
      (log/error e (trs "Error attempting to fetch cached results for query with hash {0}"
                        (i/short-hex-hash query-hash)))
      ::miss)))


;;; --------------------------------------------------- Middleware ---------------------------------------------------

(defn- run-query-with-cache
  [qp {:keys [cache-ttl middleware], :as query} rff context]
  ;; TODO - Query will already have `info.hash` if it's a userland query. I'm not 100% sure it will be the same hash,
  ;; because this is calculated after normalization, instead of before
  (let [query-hash (qputil/query-hash query)
        result     (maybe-reduce-cached-results (:ignore-cached-results? middleware) query-hash cache-ttl rff context)]
    (when (= result ::miss)
      (let [start-time-ms (System/currentTimeMillis)]
        (log/trace "Running query and saving cached results (if eligible)...")
        (qp query
            (fn [metadata]
              (save-results-xform start-time-ms metadata query-hash (rff metadata)))
            context)))))

(defn- is-cacheable? {:arglists '([query])} [{:keys [cache-ttl]}]
  (and (public-settings/enable-query-caching)
       cache-ttl))

(defn maybe-return-cached-results
  "Middleware for caching results of a query if applicable.
  In order for a query to be eligible for caching:

     *  Caching (the `enable-query-caching` Setting) must be enabled
     *  The query must pass a `:cache-ttl` value. For Cards, this can be the value of `:cache_ttl`,
        otherwise falling back to the value of the `query-caching-default-ttl` Setting.
     *  The query must already be permissions-checked. Since the cache bypasses the normal
        query processor pipeline, the ad-hoc permissions-checking middleware isn't applied for cached results.
        (The various `/api/card/` endpoints that make use of caching do `can-read?` checks for the Card *before*
        running the query, satisfying this requirement.)
     *  The result *rows* of the query must be less than `query-caching-max-kb` when serialized (before compression)."
  [qp]
  (fn [query rff context]
    (let [cacheable? (is-cacheable? query)]
      (log/tracef "Query is cacheable? %s" (boolean cacheable?))
      (if cacheable?
        (run-query-with-cache qp query rff context)
        (qp query rff context)))))
