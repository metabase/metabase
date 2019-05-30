(ns metabase.query-processor.middleware.cache
  "Middleware that returns cached results for queries when applicable.

  If caching is enabled (`enable-query-caching` is `true`) cached results will be returned for Cards if possible.
  There's a global default TTL defined by the setting `query-caching-default-ttl`, but individual Cards can override
  this value with custom TTLs with a value for `:cache_ttl`.

  For all other queries, caching is skipped.

  Various caching backends are defined in `metabase.query-processor.middleware.cache-backend` namespaces. The default
  backend is `db`, which uses the application database; this value can be changed by setting the env var
  `MB_QP_CACHE_BACKEND`.

   Refer to `metabase.query-processor.middleware.cache-backend.interface` for more details about how the cache
  backends themselves."
  (:require [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.plugins.classloader :as classloader]
            [metabase.query-processor.middleware.cache-backend.interface :as i]
            [metabase.query-processor.util :as qputil]
            [metabase.util
             [date :as du]
             [i18n :refer [trs]]]))

;; TODO - Why not make this an option in the query itself? :confused:
(def ^:dynamic ^Boolean *ignore-cached-results*
  "Should we force the query to run, ignoring cached results even if they're available?
  Setting this to `true` will run the query again and will still save the updated results."
  false)


;;; ---------------------------------------------------- Backend -----------------------------------------------------

(defn- valid-backend? [instance] (extends? i/IQueryProcessorCacheBackend (class instance)))

(defn- get-backend-instance-in-namespace
  "Return a valid query cache backend instance in `backend-ns-symb`, or throw an Exception if none exists."
  ;; if for some reason the resolved var doesn't satisfy `IQueryProcessorCacheBackend` we'll reload the namespace
  ;; it belongs to and try one more time.
  ;; This fixes the issue in dev sessions where the interface namespace gets reloaded causing the cache implementation
  ;; to no longer satisfy the protocol
  ([backend-ns-symb]
   (get-backend-instance-in-namespace backend-ns-symb :allow-reload))
  ([backend-ns-symb allow-reload?]
   (let [varr (ns-resolve backend-ns-symb 'instance)]
     (cond
       (not varr)             (throw (Exception. (str "No var named 'instance' found in namespace " backend-ns-symb)))
       (valid-backend? @varr) @varr
       allow-reload?          (do (require backend-ns-symb :reload)
                                  (get-backend-instance-in-namespace backend-ns-symb false))
       :else                  (throw (Exception. (format "%s/instance doesn't satisfy IQueryProcessorCacheBackend"
                                                         backend-ns-symb)))))))

(defn- resolve-backend
  "Get the cache backend to the cache defined by the keyword `backend`.

   (This should be something like `:db`, `:redis`, or `:memcached`. See the
   documentation in `metabase.query-processor.middleware.cache-backend.interface` for details on how this works.)"
  ([]
   (resolve-backend (config/config-kw :mb-qp-cache-backend)))

  ([backend]
   (classloader/the-classloader)
   (let [backend-ns-symb (symbol (str "metabase.query-processor.middleware.cache-backend." (munge (name backend))))]
     (require backend-ns-symb)
     (log/info (trs "Using query processor cache backend: {0}" (u/format-color 'blue backend)) (u/emoji "💾"))
     (get-backend-instance-in-namespace backend-ns-symb))))

(defonce ^:private backend-instance
  (delay (resolve-backend)))


;;; ------------------------------------------------ Cache Operations ------------------------------------------------

(defn- cached-results [query-hash max-age-seconds]
  (when-not *ignore-cached-results*
    (when-let [results (i/cached-results @backend-instance query-hash max-age-seconds)]
      (assert (du/is-temporal? (:updated_at results))
        "cached-results should include an `:updated_at` field containing the date when the query was last ran.")
      (log/info "Returning cached results for query" (u/emoji "💾"))
      (assoc results :cached true))))

(defn- save-results!  [query-hash results]
  (log/info "Caching results for next time for query" (u/emoji "💾"))
  (i/save-results! @backend-instance query-hash results))


;;; --------------------------------------------------- Middleware ---------------------------------------------------

(defn- is-cacheable? ^Boolean [{:keys [cache-ttl]}]
  (boolean (and (public-settings/enable-query-caching)
                cache-ttl)))

(defn- save-results-if-successful! [query-hash start-time-ms {:keys [status], :as results}]
  (let [total-time-ms (- (System/currentTimeMillis) start-time-ms)
        min-ttl-ms    (* (public-settings/query-caching-min-ttl) 1000)]
    (log/info (format "Query took %d ms to run; miminum for cache eligibility is %d ms" total-time-ms min-ttl-ms))
    (when (and (= status :completed)
               (>= total-time-ms min-ttl-ms))
      (save-results! query-hash results))))

(defn- run-query-with-cache [qp {:keys [cache-ttl], :as query} respond raise canceled-chan]
  ;; TODO - Query will already have `info.hash` if it's a userland query. I'm not 100% sure it will be the same hash,
  ;; because this is calculated after normalization, instead of before
  (let [query-hash (qputil/query-hash query)]
    (if-let [cached-results (cached-results query-hash cache-ttl)]
      (respond cached-results)
      (let [start-time (System/currentTimeMillis)
            respond    (fn [results]
                         (when results
                           (save-results-if-successful! query-hash start-time results)
                           (respond results)))]
        (qp query respond raise canceled-chan)))))

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
  (fn [query respond raise canceled-chan]
    (if-not (is-cacheable? query)
      (qp query respond raise canceled-chan)
      ;; wait until we're actually going to use the cache before initializing the backend. We don't want to initialize
      ;; it when the files get compiled, because that would give it the wrong version of the
      ;; `IQueryProcessorCacheBackend` protocol
      (run-query-with-cache qp query respond raise canceled-chan))))
