(ns metabase.query-processor.middleware.cache.impl
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.util.i18n :refer [trs tru]]
            [taoensso.nippy :as nippy])
  (:import [java.io BufferedInputStream BufferedOutputStream ByteArrayOutputStream DataInputStream DataOutputStream EOFException FilterOutputStream InputStream OutputStream]
           [java.util.zip GZIPInputStream GZIPOutputStream]))

(defn- max-bytes-output-stream ^OutputStream [max-bytes ^OutputStream os]
  (let [byte-count  (atom 0)
        check-total (fn [current-total]
                      (when (> current-total max-bytes)
                        (log/info (trs "Results are too large to cache.") (u/emoji "😫"))
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

(def ^:private serialization-timeout-ms (u/minutes->ms 10))

(defn- start-out-chan-close-block!
  "When `out-chan` closes, close everything. Wait up to 10 minutes for `out-chan` to close, and throw an Exception if
  it's not done by then."
  [in-chan out-chan ^ByteArrayOutputStream bos ^DataOutputStream os]
  (a/go
    (let [timeout-chan (a/timeout serialization-timeout-ms)
          [val port]   (a/alts! [out-chan timeout-chan])]
      (when (= port timeout-chan)
        (a/>! out-chan (ex-info (tru "Serialization timed out after {0}." (u/format-milliseconds serialization-timeout-ms))
                                {}))))
    (log/tracef "Closing core.async channels and output streams.")
    (try
      ;; don't really need to close both, probably
      (.close os)
      (.close bos)
      (catch Throwable e
        (a/>! out-chan e)))
    (a/close! out-chan)
    (a/close! in-chan)))

(defn- freeze! [^OutputStream os obj]
  (try
    (nippy/freeze-to-out! os obj)
    (.flush os)
    :ok
    (catch Throwable e
      e)))

(defn- start-input-loop!
  "Listen for things sent to `in-chan`. When we get an object to `in-chan`, write it to the ouput stream (async), then
  recur and wait for the next obj. When `in-chan` is closed, write the bytes to `out-chan` (async).

  If serialization fails, writes thrown Exception to `out-chan`."
  [in-chan out-chan ^ByteArrayOutputStream bos ^DataOutputStream os]
  (a/go-loop []
    ;; we got a result
    (if-let [obj (a/<! in-chan)]
      (do
        (log/tracef "Serializing %s" (pr-str obj))
        (let [result (a/<! (a/thread (freeze! os obj)))]
          (if (instance? Throwable result)
            (do
              ;; Serialization has failed, close the channel as there's no point in continuing writing to it
              (a/close! in-chan)
              ;; Drain the channel to unblock
              (while (a/poll! in-chan))
              (a/>! out-chan result))
            (recur))))
      ;; `in-chan` is closed
      (a/thread
        (try
          (.flush os)
          (let [result (.toByteArray bos)]
            (a/>!! out-chan result))
          (catch Throwable e
            (a/>!! out-chan e)))))))

(defn serialize-async
  "Create output streams for serializing QP results. Returns a map of core.async channels, `in-chan` and `out-chan`.
  Send all objects to be serialized to `in-chan`; then close it when finished; the result of `out-chan` will be the
  serialized byte array (or an Exception, if one was thrown).

  `out-chan` is closed automatically upon receiving a result; all chans and output streams are closed thereafter.

    (let [{:keys [in-chan out-chan]} (serialize-async)]
      (doseq [obj objects]
        (a/put! in-chan obj))
      (a/close! in-chan)
      (let [[val] (a/alts!! [out-chan (a/timeout 1000)])]
        (when (instance? Throwable val)
          (throw val))
         val))"
  ([]
   (serialize-async {:max-bytes (* (public-settings/query-caching-max-kb) 1024)}))

  ([{:keys [max-bytes]}]
   (let [in-chan  (a/chan 1)
         out-chan (a/promise-chan)
         bos      (ByteArrayOutputStream.)
         os       (-> (max-bytes-output-stream max-bytes bos)
                      BufferedOutputStream.
                      (GZIPOutputStream. true)
                      DataOutputStream.)]
     (start-out-chan-close-block! in-chan out-chan bos os)
     (start-input-loop! in-chan out-chan bos os)
     {:in-chan in-chan, :out-chan out-chan})))

(defn- thaw! [^InputStream is]
  (try (nippy/thaw-from-in! is)
       (catch EOFException _
         ::eof)))

(defn- reducible-rows [^InputStream is]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (loop [acc init]
        (if (reduced? acc)
          (reduced acc)
          (let [row (thaw! is)]
            (if (= ::eof row)
              acc
              (recur (rf acc row)))))))))

(defn do-reducible-deserialized-results
  "Impl for `with-reducible-deserialized-results`."
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
