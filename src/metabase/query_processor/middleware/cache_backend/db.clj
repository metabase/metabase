(ns metabase.query-processor.middleware.cache-backend.db
  (:require [clojure.tools.logging :as log]
            [metabase
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.models.query-cache :refer [QueryCache]]
            [metabase.query-processor.middleware.cache-backend.interface :as i]
            [metabase.util.date :as du]
            [taoensso.nippy :as nippy]
            [toucan.db :as db])
  (:import [java.io BufferedOutputStream ByteArrayOutputStream DataOutputStream]
           java.util.zip.GZIPOutputStream))

(defn- cached-results
  "Return cached results for QUERY-HASH if they exist and are newer than MAX-AGE-SECONDS."
  [query-hash max-age-seconds]
  (when-let [{:keys [results updated_at]} (db/select-one [QueryCache :results :updated_at]
                                            :query_hash query-hash
                                            :updated_at [:>= (du/->Timestamp (- (System/currentTimeMillis)
                                                                                (* 1000 max-age-seconds)))])]
    (assoc results :updated_at updated_at)))

(defn- purge-old-cache-entries!
  "Delete any cache entries that are older than the global max age `max-cache-entry-age-seconds` (currently 3 months)."
  []
  (db/simple-delete! QueryCache
    :updated_at [:<= (du/->Timestamp (- (System/currentTimeMillis)
                                        (* 1000 (public-settings/query-caching-max-ttl))))]))

(defn- throw-if-max-exceeded [max-num-bytes bytes-in-flight]
  (when (< max-num-bytes bytes-in-flight)
    (throw (ex-info "Exceeded the max number of bytes" {:type ::max-bytes}))))

(defn- limited-byte-output-stream
  "Returns a `FilterOutputStream` that will throw an exception if more than `max-num-bytes` are written to
  `output-stream`"
  [max-num-bytes output-stream]
  (let [bytes-so-far (atom 0)]
    (proxy [java.io.FilterOutputStream] [output-stream]
      (write
        ([byte-or-byte-array]
         (let [^java.io.OutputStream this this]
           (if-let [^bytes byte-arr (and (bytes? byte-or-byte-array)
                                         byte-or-byte-array)]
             (do
               (swap! bytes-so-far + (alength byte-arr))
               (throw-if-max-exceeded max-num-bytes @bytes-so-far)
               (proxy-super write byte-arr))

             (let [^byte b byte-or-byte-array]
               (swap! bytes-so-far inc)
               (throw-if-max-exceeded max-num-bytes @bytes-so-far)
               (proxy-super write b)))))
        ([byte-arr offset length]
         (let [^java.io.OutputStream this this]
           (swap! bytes-so-far + length)
           (throw-if-max-exceeded max-num-bytes @bytes-so-far)
           (proxy-super write byte-arr offset length)))))))

(defn- compress-until-max
  "Compresses `results` and returns a byte array. If more than `max-bytes` is written, `::exceeded-max-bytes` is
  returned."
  [max-bytes results]
  (try
    (let [bos  (ByteArrayOutputStream.)
          lbos (limited-byte-output-stream max-bytes bos)]
      (with-open [buff-out (BufferedOutputStream. lbos)
                  gz-out   (GZIPOutputStream. buff-out)
                  data-out (DataOutputStream. gz-out)]
        (nippy/freeze-to-out! data-out results))
      (.toByteArray bos))
    (catch clojure.lang.ExceptionInfo e
      (if (= ::max-bytes (:type (ex-data e)))
        ::exceeded-max-bytes
        (throw e)))))

(defn- save-results!
  "Save the RESULTS of query with QUERY-HASH, updating an existing QueryCache entry
  if one already exists, otherwise creating a new entry."
  [query-hash results]
  ;; Explicitly compressing the results here rather than having Toucan compress it automatically. This allows us to
  ;; get the size of the compressed output to decide whether or not to store it.
  (let [max-bytes          (* (public-settings/query-caching-max-kb) 1024)
        compressed-results (compress-until-max max-bytes results)]
    (if-not (= ::exceeded-max-bytes compressed-results)
      (do
        (purge-old-cache-entries!)
        (or (db/update-where! QueryCache {:query_hash query-hash}
              :updated_at (du/new-sql-timestamp)
              :results    compressed-results)
            (db/insert! QueryCache
              :query_hash query-hash
              :results    compressed-results)))
      (log/info "Results are too large to cache." (u/emoji "😫"))))
  :ok)

(def instance
  "Implementation of `IQueryProcessorCacheBackend` that uses the database for caching results."
  (reify i/IQueryProcessorCacheBackend
    (cached-results [_ query-hash max-age-seconds] (cached-results query-hash max-age-seconds))
    (save-results!  [_ query-hash results]         (save-results! query-hash results))))
