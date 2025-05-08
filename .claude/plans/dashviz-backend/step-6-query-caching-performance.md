# Query Caching and Performance Analysis

## File Index
```
src/metabase/query_processor/middleware/cache.clj               # Main query caching implementation
src/metabase/query_processor/middleware/cache/impl.clj          # Caching implementation details
src/metabase/query_processor/middleware/cache_backend/          # Backend storage for cache
├── interface.clj                                               # Cache backend interface protocol
└── db.clj                                                      # Database-backed cache implementation
src/metabase/settings/deprecated_grab_bag.clj                   # Cache configuration settings
docs/configuring-metabase/caching.md                            # User documentation for caching
```

## Summary

Metabase implements a sophisticated query caching system to improve dashboard and question performance. The caching system stores query results in the application database and serves them directly when the same query is executed again, bypassing the need to requery external databases. This significantly improves response times for dashboards with complex or long-running queries.

The caching system is configurable with several strategies:
1. **Duration-based caching** - Invalidate cache after a specific time period
2. **Schedule-based caching** - Clear cache on a regular schedule (hourly, daily, weekly, monthly)
3. **Adaptive caching** - Dynamically determine cache duration based on query execution time
4. **No caching** - Always execute the query against the database

The caching system is implemented as middleware in the query processor pipeline, allowing it to be transparently inserted into the query execution flow.

## Dependencies

### Upstream Dependencies
- **Query Processor Pipeline** - The cache middleware integrates into the query processing pipeline
- **Settings System** - Caching behavior is controlled by system settings
- **Query Normalization** - Queries must be normalized to correctly compute hash keys
- **Security/Authentication** - Cached results are security-context aware

### Downstream Dependencies
- **Database Drivers** - Query execution times affect adaptive caching
- **Results Streaming** - Results format must be compatible with caching
- **Dashboard Rendering** - Uses cached results for visualization
- **Enterprise Features** - Some caching strategies are enterprise-only

## Key Data Structures

1. **Cache Entry** - Core data structure with:
   - Query hash (identifies uniquely normalized queries)
   - Results (serialized query results)
   - Updated timestamp (for cache invalidation)

2. **Cache Strategy** - Configuration object that contains:
   - Type (`:ttl`, `:schedule`, `:adaptive`, `:nocache`)
   - Strategy-specific configuration:
     - TTL values
     - Min duration thresholds
     - Multipliers for adaptive caching

3. **Cache Backend** - Protocol-based interface for storage:
   ```clojure
   (p.types/defprotocol+ CacheBackend
     (cached-results [this ^bytes query-hash strategy respond])
     (save-results! [this ^bytes query-hash ^bytes results])
     (purge-old-entries! [this max-age-seconds]))
   ```

## Core Functions

1. **maybe-return-cached-results** - Main middleware function that determines if caching should be applied
   ```clojure
   (defn maybe-return-cached-results [qp]
     (fn maybe-return-cached-results* [query rff]
       (let [cacheable? (is-cacheable? query)]
         (if cacheable?
           (run-query-with-cache qp query rff)
           (qp query rff)))))
   ```

2. **run-query-with-cache** - Handles cache lookup and execution flow
   ```clojure
   (mu/defn- run-query-with-cache :- :some
     [qp query cache-strategy rff]
     (let [query-hash (qp.util/query-hash query)
           [status result] (maybe-reduce-cached-results middleware query-hash cache-strategy rff)]
       (case status
         ::ok result
         ::canceled ::canceled
         ::miss (execute-and-cache-query qp query query-hash cache-strategy rff))))
   ```

3. **save-results-xform** - Transforms and stores query results in cache
   ```clojure
   (defn- save-results-xform [start-time-ns metadata query-hash strategy rf]
     (let [has-rows? (volatile! false)]
       ;; Implementation that adds objects to cache and determines eligibility
       ))
   ```

4. **cached-results-rff** - Transforms cached results back into expected format
   ```clojure
   (defn- cached-results-rff [rff query-hash]
     (fn [{:keys [last-ran], :as metadata}]
       ;; Implementation that processes cached results
       ))
   ```

## Configuration Points

1. **Settings**:
   - `enable-query-caching` - Master toggle for the caching system
   - `query-caching-max-kb` - Maximum size of cached results (default 2000KB)
   - `query-caching-max-ttl` - Maximum cache retention time (default 35 days)

2. **Cache Backend Configuration**:
   - Configurable via environment variable `MB_QP_CACHE_BACKEND`
   - Default backend is `:db` (application database)

3. **Per-item Cache Configurations**:
   - Dashboard-level caching policies
   - Question-level caching policies
   - Database-level caching policies
   - Default (site-wide) caching policy

## Enterprise Extensions

1. **Advanced Cache Strategies**:
   - The enterprise version extends caching with additional strategies
   - Custom fetch-cache-stmt implementations for enterprise-specific caching

2. **Automatic Cache Refreshing**:
   - Enterprise-only feature to proactively refresh cache based on policies
   - Supports parameter value caching for up to 10 most frequent parameter combinations

3. **Database-specific and Dashboard-specific Caching Policies**:
   - Enterprise allows setting cache policies at multiple levels
   - Policy precedence: Question > Dashboard > Database > Default

## Testing Approach

The caching system is designed with testing in mind, with key testability features:

1. **Dynamic Backend Binding**:
   ```clojure
   (def ^:dynamic *backend*
     "Current cache backend. Dynamically rebindable primary for test purposes."
     (i/cache-backend (config/config-kw :mb-qp-cache-backend)))
   ```

2. **Protocol-based Cache Backend**:
   - Allows for mocking/stubbing in tests
   - Test implementations can be provided that don't require database

3. **Serialization Testing**:
   - Tests for serialization format compatibility
   - Tests for handling large result sets
   - Tests for proper cache invalidation

## Error Handling

1. **Serialization Errors**:
   - Captures and logs serialization exceptions
   - Falls back to non-cached execution
   ```clojure
   (catch Throwable e
     (if (= (:type (ex-data e)) ::impl/max-bytes)
       (log/debugf e "Not caching results: results are larger than %s KB" (public-settings/query-caching-max-kb))
       (log/errorf e "Error saving query results to cache: %s" (ex-message e))))
   ```

2. **Cache Lookup Failures**:
   - Gracefully handles cache misses and errors
   - Always falls back to direct database query
   ```clojure
   (catch Throwable e
     (log/errorf e "Error attempting to fetch cached results for query with hash %s: %s"
                 (i/short-hex-hash query-hash)
                 (ex-message e))
     [::miss nil])
   ```

3. **Cache Purge Errors**:
   - Non-fatal approach to purging old entries
   - System continues to function even if purge fails
   ```clojure
   (catch Throwable e
     (log/error e "Error purging old cache entries"))
   ```

## Performance Optimizations

1. **Serialization Format**:
   - Custom serialization using Nippy for efficient serialization/deserialization
   - Compressed storage using GZIP to minimize storage requirements
   - Version-tagged format for backward compatibility

2. **Thresholding**:
   - Only caches results for queries that exceed minimum duration
   - Prevents caching fast queries where caching overhead exceeds benefits
   ```clojure
   (let [duration-ms (/ (- (System/nanoTime) start-time-ns) 1e6)
         min-duration-ms (:min-duration-ms strategy 0)
         eligible? (and @has-rows?
                     (> duration-ms min-duration-ms))]
     ;; Cache if eligible
   )
   ```

3. **Automatic Cache Maintenance**:
   - Periodic purging of old entries to prevent unbounded growth
   - Size limits to prevent memory issues with large result sets

4. **Query Hash Optimization**:
   - Efficient hash computation for query identity
   - Short hash representation for logging