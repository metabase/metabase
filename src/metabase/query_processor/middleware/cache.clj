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
            [metabase
             [config :as config]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.query-processor
             [context :as context]
             [util :as qputil]]
            [metabase.query-processor.middleware.cache-backend
             [db :as backend.db]
             [interface :as i]]
            [metabase.query-processor.middleware.cache.impl :as impl]
            [metabase.util.i18n :refer [trs]])
  (:import java.io.InputStream))

(comment backend.db/keep-me)

(def ^:private cache-version
  "Current serialization format version. Basically

    [initial-metadata & rows]"
  2)

;; TODO - Why not make this an option in the query itself? :confused:
(def ^:dynamic ^Boolean *ignore-cached-results*
  "Should we force the query to run, ignoring cached results even if they're available?
  Setting this to `true` will run the query again and will still save the updated results."
  false)

(def ^:dynamic *backend*
  "Current cache backend. Dynamically rebindable primary for test purposes."
  (i/cache-backend (config/config-kw :mb-qp-cache-backend)))


;;; ------------------------------------------------------ Save ------------------------------------------------------

;; purge runs on a loop that gets triggered whenever a new cache entry is saved. On each save, `purge-chan` is sent a
;; `::purge` message; the channel itself uses a sliding buffer of size 1, so additional messages are dropped. Thus
;; purge actions won't queue up if multiple queries are ran before we get a chance to finish the last one.

(defn- purge! [backend]
  (try
    (log/tracef "Purging old cache entires older than %s" (u/format-seconds (public-settings/query-caching-max-ttl)))
    (i/purge-old-entries! backend (public-settings/query-caching-max-ttl))
    (catch Throwable e
      (log/error e (trs "Error purging old cache entires")))))

(defonce ^:private purge-chan
  (delay
    (let [purge-chan (a/chan (a/sliding-buffer 1))]
      (a/go-loop []
        (when-let [backend (a/<! purge-chan)]
          (a/<! (a/thread (purge! backend)))
          (recur)))
      purge-chan)))

(defn- purge-async! []
  (log/tracef "Sending async purge message to purge-chan")
  (a/put! @purge-chan *backend*))

(defn- min-duration-ms
  "Minimum duration it must take a query to complete in order for it to be eligable for caching."
  []
  (* (public-settings/query-caching-min-ttl) 1000))

(defn- cache-results-async! [query-hash out-chan]
  (log/info (trs "Caching results for next time for query with hash {0}." (pr-str (i/short-hex-hash query-hash))) (u/emoji "💾"))
  (a/go
    (let [x (a/<! out-chan)]
      (if (instance? Throwable x)
        (when-not (= (:type (ex-data x)) ::impl/max-bytes)
          (log/error x (trs "Error saving query results to cache.")))
        (let [y (a/<! (a/thread
                        (try
                          (i/save-results! *backend* query-hash x)
                          :ok
                          (catch Throwable e
                            e))))]
          (if (instance? Throwable y)
            (log/error y (trs "Error saving query results to cache."))
            (do
              (log/debug (trs "Successfully cached results for query."))
              (purge-async!))))))))

(defn- save-results-xform [start-time metadata query-hash rf]
  (let [{:keys [in-chan out-chan]} (impl/serialize-async)]
    (a/put! in-chan (assoc metadata
                           :cache-version cache-version
                           :last-ran      (t/zoned-date-time)))
    (fn
      ([] (rf))

      ([result]
       ;; TODO - what about the final result? Are we ignoring it completely?
       (a/close! in-chan)
       (let [duration-ms (- (System/currentTimeMillis) start-time)]
         (log/info (trs "Query took {0} to run; miminum for cache eligibility is {1}"
                        (u/format-milliseconds duration-ms) (u/format-milliseconds (min-duration-ms))))
         (when (> duration-ms (min-duration-ms))
           (cache-results-async! query-hash out-chan)))
       (rf result))

      ([acc row]
       (a/put! in-chan row)
       (rf acc row)))))

;;; ----------------------------------------------------- Fetch ------------------------------------------------------

(defn- add-cached-metadata-xform [rf]
  (fn
    ([] (rf))

    ([acc]
     (rf (if-not (map? acc)
           acc
           (-> acc
               (assoc :cached true
                      :updated_at (get-in acc [:data :last-ran]))
               (update :data dissoc :last-ran :cache-version)))))

    ([acc row]
     (rf acc row))))

(defn- do-with-cached-results
  "Reduces cached results if there is a hit. Otherwise, returns `::miss` directly."
  [query-hash max-age-seconds rff context]
  (if *ignore-cached-results*
    ::miss
    (do
      (log/tracef "Looking for cached-results for query with hash %s younger than %s\n"
                  (pr-str (i/short-hex-hash query-hash)) (u/format-seconds max-age-seconds))
      (i/cached-results *backend* query-hash max-age-seconds
        (fn [^InputStream is]
          (if (nil? is)
            ::miss
            (impl/reducible-deserialized-results is
              (fn
                ([_]
                 ::miss)

                ([metadata reducible-rows]
                 (context/reducef (fn [metadata]
                                    (add-cached-metadata-xform (rff metadata)))
                                  context metadata reducible-rows))))))))))


;;; --------------------------------------------------- Middleware ---------------------------------------------------

(defn- run-query-with-cache
  [qp {:keys [cache-ttl], :as query} rff context]
  ;; TODO - Query will already have `info.hash` if it's a userland query. I'm not 100% sure it will be the same hash,
  ;; because this is calculated after normalization, instead of before
  (let [query-hash (qputil/query-hash query)
        result     (do-with-cached-results query-hash cache-ttl rff context)]
    (if-not (= ::miss result)
      result
      (let [start-time-ms (System/currentTimeMillis)]
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
    (if (is-cacheable? query)
      (run-query-with-cache qp query rff context)
      (qp query rff context))))
