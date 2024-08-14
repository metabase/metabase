(ns metabase.query-processor.middleware.cache.impl
  (:require
   [flatland.ordered.map :as ordered-map]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [taoensso.nippy :as nippy])
  (:import
   (java.io BufferedInputStream BufferedOutputStream ByteArrayOutputStream DataInputStream DataOutputStream
            EOFException FilterOutputStream InputStream OutputStream)
   (java.util.zip GZIPInputStream GZIPOutputStream)))

(set! *warn-on-reflection* true)

(defn- max-bytes-output-stream ^OutputStream
  [max-bytes ^OutputStream os]
  (let [byte-count  (atom 0)
        check-total (fn [current-total]
                      (when (> current-total max-bytes)
                        (log/info "Results are too large to cache." (u/emoji "😫"))
                        (throw (ex-info (trs "Results are too large to cache.") {:type ::max-bytes}))))]
    (proxy [FilterOutputStream] [os]
      (write
        ([x]
         (if (int? x)
           (do
             (check-total (swap! byte-count inc))
             (.write os ^int x))
           (do
             (check-total (swap! byte-count + (alength ^bytes x)))
             (.write os ^bytes x))))

        ([^bytes ba ^Integer off ^Integer len]
         (check-total (swap! byte-count + len))
         (.write os ba off len))))))

;; flatland.ordered.map.OrderedMap gets encoded and decoded incorrectly, for some reason. See #25915

(nippy/extend-freeze flatland.ordered.map.OrderedMap :flatland/ordered-map
                     [x data-output]
                     (nippy/freeze-to-out! data-output (vec x)))

(nippy/extend-thaw :flatland/ordered-map
                   [data-input]
                   (ordered-map/ordered-map-reader-clj (nippy/thaw-from-in! data-input)))

(defn- freeze!
  [^OutputStream os obj]
  (log/tracef "Freezing %s" (pr-str obj))
  (nippy/freeze-to-out! os obj)
  (.flush os))

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
  ([f]
   (do-with-serialization f {:max-bytes (* (public-settings/query-caching-max-kb) 1024)}))

  ([f {:keys [max-bytes]}]
   (with-open [bos (ByteArrayOutputStream.)]
     (let [os    (-> (max-bytes-output-stream max-bytes bos)
                     BufferedOutputStream.
                     (GZIPOutputStream. true)
                     DataOutputStream.)
           error (atom nil)]
       (try
         (f (fn in* [obj]
              (when-not @error
                (try
                  (freeze! os obj)
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

(defn- thaw!
  [^InputStream is]
  (try
    (nippy/thaw-from-in! is)
    (catch EOFException _e
      ::eof)))

(defn- reducible-rows
  [^InputStream is]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (loop [acc init]
        ;; NORMALLY we would be checking whether `acc` is `reduced?` here and stop reading from the database if it was,
        ;; but since we currently store the final metadata at the very end of the database entry as a special pseudo-row
        ;; we actually have to keep reading the whole thing until we get to that last result. Don't worry, the reducing
        ;; functions can just throw out everything we don't need. See
        ;; [[metabase.query-processor.middleware.cache/cache-version]] for a description of our caching format.
        (let [row (thaw! is)]
          (if (= row ::eof)
            acc
            (recur (rf acc row))))))))

(defn do-reducible-deserialized-results
  "Impl for [[with-reducible-deserialized-results]]."
  [^InputStream is f]
  (with-open [is (DataInputStream. (GZIPInputStream. (BufferedInputStream. is)))]
    (let [metadata (thaw! is)]
      (if (= metadata ::eof)
        (f nil)
        (f [metadata (reducible-rows is)])))))

(defmacro with-reducible-deserialized-results
  "Fetches metadata and reducible rows from an InputStream `is` and executes body with them bound

    (with-reducible-deserialized-results [[metadata reducible-rows] is]
      ...)

  `metadata` and `reducible-rows` will be `nil` if the data fetched from the input stream is invalid, from an older
  cache version, or otherwise unusable."
  [[metadata-rows-binding is] & body]
  `(do-reducible-deserialized-results ~is (fn [~metadata-rows-binding] ~@body)))
