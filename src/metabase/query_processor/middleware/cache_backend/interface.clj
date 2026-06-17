(ns metabase.query-processor.middleware.cache-backend.interface
  "Interface used to define different Query Processor cache backends. To add a new backend, implement `cache-backend`
  and have it return an object that implements the `CacheBackend` protocol.

  See `metabase.query-processor.middleware.cache-backend.db` for a complete example of how this is done."
  (:require
   [buddy.core.codecs :as codecs]
   [potemkin.types :as p.types]))

(p.types/defprotocol+ CacheBackend
  "Protocol that different Metabase cache backends must implement.

   `query-hash` as passed below is a byte-array representing a 256-byte SHA3 hash; encode this as needed for use as a
   cache entry key. `results` are passed as a compressed byte array.

  The implementation is responsible for purging old cache entries when appropriate."
  (cached-results [this ^bytes query-hash respond]
    "Call `(respond is updated-at)` with the most recent cache entry for `query-hash` *regardless of TTL* -- the results
  as an `InputStream` to the raw bytes, plus the entry's `updated-at` timestamp -- or `(respond nil nil)` if there's no
  entry at all. The caller compares `updated-at` against the strategy's freshness boundary to decide whether to serve
  the entry, serve it stale while a single process refreshes, or recompute. This method *must* return the result of
  `respond`.

    (cached-results [_ hash respond]
      (if-let [entry (...)]
        (with-open [is (...)]
          (respond is (:updated-at entry)))
        (respond nil nil)))")

  (save-results! [this ^bytes query-hash ^bytes results]
    "Add a cache entry with the `results` of running query with byte array `query-hash`. This should replace any prior
  entries for `query-hash` and update the cache timestamp to the current system time.")

  (purge-old-entries! [this max-age-seconds]
    "Purge all cache entries older than `max-age-seconds`. Will be called periodically when this backend is in use.
  `max-age-seconds` may be floating-point.")

  (try-acquire-refresh-lease! [this ^bytes query-hash lease-ms]
    "Atomically claim, across processes, the right to recompute the expired entry for `query-hash`. Returns true iff
  this caller won the lease (and should recompute + [[save-results!]]); false means another process is already
  refreshing it, so this caller should serve stale results instead. A lease held longer than `lease-ms` is considered
  abandoned and may be taken over. Backends that can't coordinate across processes should return `true` (degrading to
  the no-stampede-protection behavior)."))

(defmacro with-cached-results
  "Macro version for consuming `cached-results` from a `backend`.

    (with-cached-results backend query-hash [is updated-at]
      ...)

  InputStream `is` (and `updated-at`) will be `nil` if there is no cache entry at all. `is` is only valid within
  `body`."
  {:style/indent 3}
  [backend query-hash [is-binding updated-at-binding] & body]
  `(cached-results ~backend ~query-hash
                   (fn [~(vary-meta is-binding assoc :tag 'java.io.InputStream) ~updated-at-binding]
                     ~@body)))

(defmulti cache-backend
  "Return an instance of a cache backend, which is any object that implements `QueryProcessorCacheBackend`.

  See `db.clj` for an example Cache Backend."
  {:arglists '([backend-name])}
  keyword)

(defn short-hex-hash
  "Util fn. Converts a query hash to a short hex string for logging purposes."
  [^bytes b]
  (codecs/bytes->hex (byte-array 4 b)))
