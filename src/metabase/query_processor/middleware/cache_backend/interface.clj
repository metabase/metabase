(ns metabase.query-processor.middleware.cache-backend.interface
  "Interface used to define different Query Processor cache backends. To add a new backend, implement `cache-backend`
  and have it return an object that implements the `CacheBackend` protocol.

  See `metabase.query-processor.middleware.cache-backend.db` for a complete example of how this is done."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.tools.logging :as log]
   [metabase.util :as u]
   [potemkin.types :as p.types])
  (:import
   (java.io ByteArrayOutputStream InputStream)))

(p.types/defprotocol+ CacheBackend
  "Protocol that different Metabase cache backends must implement.

   `query-hash` as passed below is a byte-array representing a 256-byte SHA3 hash; encode this as needed for use as a
   cache entry key. `results` are passed as a compressed byte array.

  The implementation is responsible for purging old cache entries when appropriate."
  (^{:style/indent 3} cached-results [this ^bytes query-hash max-age-seconds respond]
    "Call `respond` with cached results for the query (as an `InputStream` to the raw bytes) if present and not
  expired; otherwise, call `respond` with `nil.

    (cached-results [_ hash _ respond]
      (with-open [is (...)]
        (respond is)))

  `max-age-seconds` may be floating-point. This method *must* return the result of `respond`.")

  (save-results! [this ^bytes query-hash ^bytes results serializer-name]
    "Add a cache entry with the `results` of running query with byte array `query-hash`. This should replace any prior
  entries for `query-hash` and update the cache timestamp to the current system time.")

  (purge-old-entries! [this max-age-seconds]
    "Purge all cache entries older than `max-age-seconds`. Will be called periodically when this backend is in use.
  `max-age-seconds` may be floating-point."))

(p.types/defprotocol+ Ser
  (-wrapped-output-stream [_ os options])
  (-add! [_ os obj])
  (-options [_])
  (-name [_]))

(p.types/defprotocol+ Des
  (-metadata-and-reducible-rows [_ is f]))

(defmacro with-cached-results
  "Macro version for consuming `cached-results` from a `backend`.

    (with-cached-results backend query-hash max-age-seconds [is]
      ...)

  InputStream `is` will be `nil` if no cached results were available."
  {:style/indent 4}
  [backend query-hash max-age-seconds [is-binding] & body]
  `(cached-results ~backend ~query-hash ~max-age-seconds
                   (fn [~(vary-meta is-binding assoc :tag 'java.io.InputStream)]
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

(defn do-with-serialization
  "Create output streams for serializing QP results and invoke `f`, a function of the form

    (f in-fn result-fn)

  `in-fn` is of the form `(in-fn object)` and should be called once for each object that should be serialized. `in-fn`
  will catch any exceptions thrown during serialization; these will be thrown later when invoking `result-fn`. After
  the first exception `in-fn` will no-op for all subsequent calls.

  When you have serialized *all* objects, call `result-fn` to get the serialized byte array. If an error was
  encountered during serialization (such as the serialized bytes being longer than `max-bytes`), `result-fn` will
  throw an Exception rather than returning a byte array; be sure to handle this case.

    (do-with-serialization
      (fn [in result]
        (doseq [obj objects]
          (in obj))
        (result)))"
  ([serializer f]
   (do-with-serialization serializer f (-options serializer)))

  ([serializer f options]
   (with-open [bos (ByteArrayOutputStream.)]
     (let [os    (-wrapped-output-stream serializer bos options)
           error (atom nil)]
       (try
         (f (fn in* [obj]
              (when-not @error
                (try
                  (-add! serializer os obj)
                  (catch Throwable e
                    (log/trace e "Caught error when freezing object")
                    (reset! error e))))
              nil)
            (fn result* []
              (when @error
                (throw @error))
              (log/trace "Getting result byte array")
              (.toByteArray bos)))
         ;; this is done manually instead of `with-open` because it might throw an Exception when we close it if it's
         ;; past the byte limit; that's fine and we can ignore it
         (finally
           (u/ignore-exceptions (.close os))))))))



(defn do-reducible-deserialized-results
  "Impl for [[with-reducible-deserialized-results]]."
  [serializer ^InputStream is f]
  (-metadata-and-reducible-rows serializer is f))

(defmacro with-reducible-deserialized-results
  "Fetches metadata and reducible rows from an InputStream `is` and executes body with them bound

    (with-reducible-deserialized-results [[metadata reducible-rows] is]
      ...)

  `metadata` and `reducible-rows` will be `nil` if the data fetched from the input stream is invalid, from an older
  cache version, or otherwise unusable."
  [serializer [metadata-rows-binding cache-info] & body]
  `(do-reducible-deserialized-results ~serializer ~cache-info
                                      (fn [~metadata-rows-binding] ~@body)))
