(ns metabase.query-processor.middleware.cache.impl
  (:require
   [clojure.tools.logging :as log]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.util :as u])
  (:import
   (java.io ByteArrayOutputStream InputStream)))



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
   (do-with-serialization serializer f (i/-options serializer)))

  ([serializer f options]
   (with-open [bos (ByteArrayOutputStream.)]
     (let [os    (i/-wrapped-output-stream serializer bos options)
           error (atom nil)]
       (try
         (f (fn in* [obj]
              (when-not @error
                (try
                  (i/-add! serializer os obj)
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
  (i/-metadata-and-reducible-rows serializer is f))

(defmacro with-reducible-deserialized-results
  "Fetches metadata and reducible rows from an InputStream `is` and executes body with them bound

    (with-reducible-deserialized-results [[metadata reducible-rows] is]
      ...)

  `metadata` and `reducible-rows` will be `nil` if the data fetched from the input stream is invalid, from an older
  cache version, or otherwise unusable."
  [serializer [metadata-rows-binding is] & body]
  `(do-reducible-deserialized-results ~serializer ~is (fn [~metadata-rows-binding] ~@body)))
