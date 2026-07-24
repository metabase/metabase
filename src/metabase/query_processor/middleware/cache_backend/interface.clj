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
  (cached-results-since [this ^bytes query-hash min-updated-at respond]
    "Call `(respond is updated-at)` with the cache entry for `query-hash` whose results were written at or after
  `min-updated-at` -- the results as an `InputStream` to the raw bytes, plus the entry's `updated-at` timestamp -- or
  `(respond nil nil)` when there is no such entry. A nil `min-updated-at` means no minimum: the entry is returned
  regardless of TTL, and the caller compares `updated-at` against the strategy's freshness boundary itself to decide
  whether to serve it, serve it stale while a single process refreshes, or recompute.

  Implementations must apply the minimum where the entry is stored rather than fetching and filtering: a caller
  waiting on another process's computation polls with the oldest timestamp it could still serve, and each miss must
  not cost a transfer of the stored results. This method *must* return the result of `respond`.

    (cached-results-since [_ hash min-updated-at respond]
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

  (delete-entry! [this ^bytes query-hash]
    "Delete the cache entry for `query-hash`, if one exists, releasing any held refresh lease. Called when a query ran
  but its results could not be saved to the cache (e.g. they exceed `query-caching-max-kb`), so the outdated entry
  doesn't keep being served to other callers. Implementations must not throw: this is called during query result
  reduction, and a failed cleanup shouldn't fail a query that already ran successfully.")

  (try-acquire-refresh-lease! [this ^bytes query-hash lease-ms]
    "Atomically claim, across processes, the right to compute the query with `query-hash` -- either to refresh an
  expired entry, or on a cold miss with no entry at all. Returns true iff this caller won the lease (and should
  compute + [[save-results!]]); false means another process is already computing it, so this caller should serve
  stale results or wait. A lease held longer than `lease-ms` is considered abandoned and may be taken over. Backends
  that can't coordinate across processes should return `true` (degrading to the no-stampede-protection behavior).")

  (release-refresh-lease! [this ^bytes query-hash]
    "Release the refresh lease on `query-hash`, if held, without touching any stored results. Called when a compute
  fails, so another caller can take over immediately instead of waiting out the lease. Backends that can't coordinate
  across processes can no-op."))

(defmacro with-cached-results
  "Macro version for consuming `cached-results-since` from a `backend`.

    (with-cached-results backend query-hash min-updated-at [is updated-at]
      ...)

  InputStream `is` (and `updated-at`) will be `nil` if there is no entry written at or after `min-updated-at` (nil
  means no minimum: the entry, whenever it was written). `is` is only valid within `body`."
  {:style/indent 4}
  [backend query-hash min-updated-at [is-binding updated-at-binding] & body]
  `(cached-results-since ~backend ~query-hash ~min-updated-at
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
