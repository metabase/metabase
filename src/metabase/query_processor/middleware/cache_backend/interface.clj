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
  (cached-results [this ^bytes query-hash strategy respond]
    "Call `respond` with cached results for the query (as an `InputStream` to the raw bytes) if present and not
  expired; otherwise, call `respond` with `nil.

    (cached-results [_ hash _ respond]
      (with-open [is (...)]
        (respond is)))

  `strategy` should be a map with cache configuration. This method *must* return the result of `respond`.")

  (save-results! [this ^bytes query-hash ^bytes results]
    "Add a cache entry with the `results` of running query with byte array `query-hash`. This should replace any prior
  entries for `query-hash` and update the cache timestamp to the current system time.")

  (purge-old-entries! [this max-age-seconds]
    "Purge all cache entries older than `max-age-seconds`. Will be called periodically when this backend is in use.
  `max-age-seconds` may be floating-point.")

  (delete-entry! [this ^bytes query-hash]
    "Delete the cache entry for `query-hash`, if one exists, releasing any held refresh lease. Called when a query ran
  but its results could not be saved to the cache (e.g. they exceed `query-caching-max-kb`), so the outdated entry
  doesn't keep being served to other callers. Implementations must not throw: this is called during query result
  reduction, and a failed cleanup shouldn't fail a query that already ran successfully."))

(defmacro with-cached-results
  "Macro version for consuming `cached-results` from a `backend`.

    (with-cached-results backend query-hash strategy [is]
      ...)

  InputStream `is` will be `nil` if no cached results were available."
  {:style/indent 4}
  [backend query-hash strategy [is-binding] & body]
  `(cached-results ~backend ~query-hash ~strategy (fn [~(vary-meta is-binding assoc :tag 'java.io.InputStream)]
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
