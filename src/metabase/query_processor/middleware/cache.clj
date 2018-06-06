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
            [metabase.query-processor.middleware.cache-backend.interface :as i]
            [metabase.query-processor.util :as qputil]
            [metabase.util.date :as du]))

(def ^:dynamic ^Boolean *ignore-cached-results*
  "Should we force the query to run, ignoring cached results even if they're available?
  Setting this to `true` will run the query again and will still save the updated results."
  false)


;;; ---------------------------------------------------- Backend -----------------------------------------------------

(def ^:private backend-instance
  (atom nil))

(defn- valid-backend? [instance] (extends? i/IQueryProcessorCacheBackend (class instance)))

(defn- get-backend-instance-in-namespace
  "Return a valid query cache backend `instance` in BACKEND-NS-SYMB, or throw an Exception if none exists."
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

(defn- set-backend!
  "Set the cache backend to the cache defined by the keyword BACKEND.

   (This should be something like `:db`, `:redis`, or `:memcached`. See the
   documentation in `metabase.query-processor.middleware.cache-backend.interface` for details on how this works.)"
  ([]
   (set-backend! (config/config-kw :mb-qp-cache-backend)))
  ([backend]
   (let [backend-ns-symb (symbol (str "metabase.query-processor.middleware.cache-backend." (munge (name backend))))]
     (require backend-ns-symb)
     (log/info "Using query processor cache backend:" (u/format-color 'blue backend) (u/emoji "💾"))
     (reset! backend-instance (get-backend-instance-in-namespace backend-ns-symb)))))



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

(defn- is-cacheable? ^Boolean [{cache-ttl :cache_ttl}]
  (boolean (and (public-settings/enable-query-caching)
                cache-ttl)))

(defn- results-are-below-max-byte-threshold?
  "Measure the size of the `:rows` in QUERY-RESULTS and see whether they're smaller than `query-caching-max-kb`
   *before* compression."
  ^Boolean [{{rows :rows} :data}]
  (let [max-bytes (* (public-settings/query-caching-max-kb) 1024)]
    ;; We don't want to serialize the entire result set since that could explode if the query is one that returns a
    ;; huge number of rows. (We also want to keep `:rows` lazy.)
    ;; So we'll serialize one row at a time, and keep a running total of bytes; if we pass the `query-caching-max-kb`
    ;; threshold, we'll fail right away.
    (loop [total-bytes 0, [row & more] rows]
      (cond
        (> total-bytes max-bytes) false
        (not row)                 true
        :else                     (recur (+ total-bytes (count (str row)))
                                         more)))))

(defn- save-results-if-successful! [query-hash results]
  (when (and (= (:status results) :completed)
             (or (results-are-below-max-byte-threshold? results)
                 (log/info "Results are too large to cache." (u/emoji "😫"))))
    (save-results! query-hash results)))

(defn- run-query-and-save-results-if-successful! [query-hash qp query]
  (let [start-time-ms (System/currentTimeMillis)
        results       (qp query)
        total-time-ms (- (System/currentTimeMillis) start-time-ms)
        min-ttl-ms    (* (public-settings/query-caching-min-ttl) 1000)]
    (log/info (format "Query took %d ms to run; miminum for cache eligibility is %d ms" total-time-ms min-ttl-ms))
    (when (>= total-time-ms min-ttl-ms)
      (save-results-if-successful! query-hash results))
    results))

(defn- run-query-with-cache [qp {cache-ttl :cache_ttl, :as query}]
  (let [query-hash (qputil/query-hash query)]
    (or (cached-results query-hash cache-ttl)
        (run-query-and-save-results-if-successful! query-hash qp query))))


(defn maybe-return-cached-results
  "Middleware for caching results of a query if applicable.
  In order for a query to be eligible for caching:

     *  Caching (the `enable-query-caching` Setting) must be enabled
     *  The query must pass a `:cache_ttl` value. For Cards, this can be the value of `:cache_ttl`,
        otherwise falling back to the value of the `query-caching-default-ttl` Setting.
     *  The query must already be permissions-checked. Since the cache bypasses the normal
        query processor pipeline, the ad-hoc permissions-checking middleware isn't applied for cached results.
        (The various `/api/card/` endpoints that make use of caching do `can-read?` checks for the Card *before*
        running the query, satisfying this requirement.)
     *  The result *rows* of the query must be less than `query-caching-max-kb` when serialized (before compression)."
  [qp]
  ;; choose the caching backend if needed
  (when-not @backend-instance
    (set-backend!))
  ;; ok, now do the normal middleware thing
  (fn [query]
    (if-not (is-cacheable? query)
      (qp query)
      (run-query-with-cache qp query))))
