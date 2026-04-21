(ns metabase.notification.payload.temp-storage
  "Util to put data into a temporary file and delete after the notification sends.  Cleanup happens with
  notification.send/do-after-notification-sent for dashboards and cards which calls cleanup! on each part. This is
  extended to Object as a no-op and on the type defined here deletes the temporary file.

  When getting query results for notifications (alerts, subscriptions) once the query row count
  exceeds [[metabase.notification.payload.execute/cells-to-disk-threshold]], we then start streaming all rows to
  disk. This ensures that smaller queries don't needlessly write to disk and then reload, while large results don't
  attempt to reside in memory and kill an instance.

  The key to memory savings here is that the file will not be dereferenced if it is larger than some
  threshold. Because of this, we are safe to truncate results once the filesize goes above this
  threshold. See :notification/file-too-large and :notification/truncated?."
  (:require
   [clojure.java.io :as io]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.notification.settings :as notification.settings]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.random :as random]
   [taoensso.nippy :as nippy])
  (:import
   (java.io BufferedOutputStream DataOutputStream File)
   (java.util.concurrent Executors ScheduledThreadPoolExecutor)))

(set! *warn-on-reflection* true)

(def ^:private temp-dir
  (delay
    (let [dir (io/file (System/getProperty "java.io.tmpdir")
                       (str "metabase-notification-" (random/random-name)))]
      (.mkdirs dir)
      (.deleteOnExit dir)
      dir)))

(defonce ^:private deletion-scheduler
  (delay
    (Executors/newScheduledThreadPool 1)))

(defn- temp-file!
  []
  (doto (File/createTempFile "notification-" ".npy" @temp-dir)
    (.deleteOnExit)))

(defn- human-readable-size [bytes]
  (cond (nil? bytes) "0 bytes"
        (zero? bytes) "0 bytes"
        :else
        (let [units ["b" "kb" "mb" "gb" "tb"]
              magnitude 1024.0]
          (loop [[unit & remaining] units
                 current (double bytes)]
            (if (and (seq remaining) (> current magnitude))
              (recur remaining (/ current magnitude))
              (format "%.1f %s" current unit))))))

(defn- open-streaming-file!
  "Create and open a temp file for streaming rows. Returns map with :file and :output-stream."
  []
  (let [file (temp-file!)
        ;; make sure this is the mirror analogue of how we open it in [[read-rows-from-file]]
        os (-> (io/output-stream file)
               (BufferedOutputStream. (* 8 1024))
               DataOutputStream.)]
    {:file file
     :output-stream os}))

(defn- write-row-to-stream!
  "Write a collection of rows to the output stream using nippy serialization."
  [^DataOutputStream os row]
  (nippy/freeze-to-out! os row))

(defn- read-rows-from-file
  "Read rows from a temp file. Returns vector of rows.
  Throws exception if file is larger than [[notification.settings/notification-temp-file-size-max-bytes]] unless that
  value is 0. Handles both counted and streaming formats."
  [^File file]
  (when-not (.exists file)
    (throw (ex-info "Temp file no longer exists" {:file file})))

  (let [file-size (.length file)
        size-human (human-readable-size file-size)]
    (when (and (pos? (notification.settings/notification-temp-file-size-max-bytes))
               (> file-size (notification.settings/notification-temp-file-size-max-bytes)))
      (log/warnf "⚠️  SKIPPING LOAD - File too large: %s (max: %s). File will NOT be loaded into memory."
                 size-human
                 (human-readable-size (notification.settings/notification-temp-file-size-max-bytes)))
      (throw (ex-info "Result file too large to load into memory"
                      {:type :notification/file-too-large
                       :file-size file-size
                       :max-size (notification.settings/notification-temp-file-size-max-bytes)
                       :max-size-human-readable (human-readable-size
                                                 (notification.settings/notification-temp-file-size-max-bytes))})))

    (log/infof "📂 Loading streamed results from disk: %s" size-human)

    (let [start-time (System/nanoTime)
          result (with-open [is (-> (io/input-stream file)
                                    java.io.BufferedInputStream.
                                    java.io.DataInputStream.)]
                   ;; Read preamble
                   (let [{:keys [preamble]} (nippy/thaw-from-in! is)]
                     (when (seq preamble)
                       (log/debugf "File context: %s" (pr-str preamble))))

                   ;; Read row count/marker
                   (let [count-or-marker (nippy/thaw-from-in! is)]
                     (if (= count-or-marker ::streaming)
                       ;; Streaming format - read until EOF
                       (loop [rows (transient [])]
                         (let [row-read (try
                                          (nippy/thaw-from-in! is)
                                          (catch java.io.EOFException _
                                            ::eof))]
                           (if (= row-read ::eof)
                             (persistent! rows)
                             (recur (conj! rows row-read)))))

                       ;; Counted format - read exact number of rows
                       (loop [rows (transient [])
                              i 0]
                         (if (< i count-or-marker)
                           (recur (conj! rows (nippy/thaw-from-in! is))
                                  (inc i))
                           (persistent! rows))))))
          elapsed-ms (/ (- (System/nanoTime) start-time) 1000000.0)
          row-count (count result)]
      (log/infof "✅ Loaded %d rows from disk in %.0f ms (%s)" row-count elapsed-ms size-human)
      result)))

(.addShutdownHook
 (Runtime/getRuntime)
 (Thread. ^Runnable (fn []
                      (when @deletion-scheduler
                        (.shutdown ^ScheduledThreadPoolExecutor @deletion-scheduler)))))

(defprotocol Cleanable
  (cleanup! [this] "Cleanup any resources associated with this object"))

;; Add a default implementation that does nothing
(extend-protocol Cleanable
  Object
  (cleanup! [_] nil))

(deftype StreamingTempFileStorage [^File file context]
  Cleanable
  (cleanup! [_]
    (when (.exists file)
      (io/delete-file file true)))

  clojure.lang.IDeref
  (deref [_]
    (read-rows-from-file file))

  clojure.lang.IPending
  (isRealized [_]
    ;; Always return false so REPL tools like fipp won't auto-deref
    ;; Reading from disk is expensive and should be explicit
    false)

  Object
  (toString [_]
    (if (.exists file)
      (format "#StreamingTempFileStorage{:file %s, :size %s, :context %s}"
              (.getName file)
              (human-readable-size (.length file))
              (pr-str context))
      (format "#StreamingTempFileStorage{:file %s (deleted), :context %s}"
              (.getName file)
              (pr-str context))))

  (equals [_this other]
    (and (instance? StreamingTempFileStorage other)
         (= file (.file ^StreamingTempFileStorage other))))

  (hashCode [_]
    (.hashCode file)))

(defmethod print-method StreamingTempFileStorage
  [^StreamingTempFileStorage storage ^java.io.Writer w]
  (.write w (.toString storage)))

(mu/defn notification-rff :- ::qp.schema/rff
  "Reducing function factory for notifications that streams to disk when threshold exceeded.

  Returns an rff (function that takes metadata and returns an rf) that:
  - Accumulates rows in memory initially
  - Once max-cell-count is reached, switches to streaming mode
  - In streaming mode, writes all accumulated rows to disk then streams subsequent rows
  - Final result contains either in-memory rows or a StreamingTempFileStorage reference

  Parameters:

  - max-cell-count: Maximum number of \"cells\" or values to keep in memory before streaming to disk.
  - context: Optional context map to include in temp file preamble (for debugging)"
  ([max-cell-count]
   (notification-rff max-cell-count {}))
  ([max-cell-count context]
   (fn rff [metadata]
     (let [row-count (volatile! 0)
           cell-count (volatile! 0)
           rows (volatile! (transient []))
           streaming? (volatile! false)
           streaming-state (volatile! nil)] ; {:file File :output-stream DataOutputStream}
       (fn notification-rf
         ;; Init arity
         ([]
          {:data metadata})

         ;; Completion arity
         ([result]
          {:pre [(map? (unreduced result))]}
          (let [result (unreduced result)]
            (if @streaming?
              ;; Close the streaming file and return TempFileStorage
              (let [{:keys [^DataOutputStream output-stream ^File file]} @streaming-state]
                (try
                  (.close output-stream)
                  (let [file-size (.length file)
                        max-bytes (notification.settings/notification-temp-file-size-max-bytes)]
                    (prometheus/inc! :metabase-notification/temp-storage
                                     {:storage (cond (:notification/truncated? @streaming-state) :truncated
                                                     (zero? max-bytes) :not-limited
                                                     (< max-bytes file-size) :above-threshold
                                                     :else :disk)})
                    (log/infof "💾 Stored %d rows to disk: %s (never loaded into memory)%s"
                               @row-count
                               (human-readable-size file-size)
                               (if (:notification/truncated? @streaming-state)
                                 " (note query results were truncated)"
                                 ""))
                    (-> result
                        (assoc :row_count @row-count
                               :status :completed
                               :data.rows-file-size file-size)
                        (cond-> (:notification/truncated? @streaming-state)
                          (assoc :notification/truncated? true))
                        (assoc-in [:data :rows] (StreamingTempFileStorage. file context))))
                  (catch Exception e
                    (u/ignore-exceptions (.close output-stream))
                    (throw e))))

              ;; Return in-memory rows
              (do
                (prometheus/inc! :metabase-notification/temp-storage
                                 {:storage :memory})
                (log/infof "✓ Completed with %d rows in memory (under threshold)" @row-count)
                (-> result
                    (assoc :row_count @row-count
                           :status :completed)
                    (assoc-in [:data :rows] (persistent! @rows)))))))

         ;; Step arity - accumulate rows
         ([result row]
          ;; unconditionally increment row count and add rows to internal volatile transient collector. If we are
          ;; streaming to disk, we periodically flush this to disk; if we are collecting in memory the collection is
          ;; used the same as in the default-rff
          (vswap! row-count inc)
          (if @streaming?
            ;; Already streaming - write row directly to file
            (let [{:keys [^DataOutputStream output-stream ^File file]} @streaming-state]
              (write-row-to-stream! output-stream row)
              (if (and (pos? (notification.settings/notification-temp-file-size-max-bytes))
                       (> (.length file) (* 1.3 (notification.settings/notification-temp-file-size-max-bytes))))
                (do (vswap! streaming-state assoc :notification/truncated? true)
                    (log/warnf "Results have exceeded 1.3 times of `notification-temp-file-size-max-bytes` of %s (max: %s). Truncating query results. %s"
                               (human-readable-size (.length file))
                               (human-readable-size (notification.settings/notification-temp-file-size-max-bytes))
                               (when context (format "(%s)" (pr-str context))))
                    (reduced result))
                result))

            (do
              (vswap! rows conj! row)
              (vswap! cell-count #(+ % (count row)))
              ;; Check if we've hit the threshold to switch to disk based streaming
              (when (>= @cell-count max-cell-count)
                (log/infof "Cell count reached threshold (%d, %d rows), switching to streaming mode"
                           max-cell-count @row-count)
                ;; Open streaming file
                (let [{:keys [file ^DataOutputStream output-stream]} (open-streaming-file!)]
                  (try
                    ;; Write preamble
                    (nippy/freeze-to-out! output-stream {:preamble context})
                    (.flush output-stream)

                    ;; Write sentinel indicating streaming format
                    (nippy/freeze-to-out! output-stream ::streaming)
                    (.flush output-stream)

                    ;; Write all accumulated rows
                    (doseq [row (persistent! @rows)]
                      (write-row-to-stream! output-stream row))

                    ;; Switch to streaming mode
                    (vreset! streaming? true)
                    (vreset! rows (transient [])) ; Clear memory
                    (vreset! streaming-state {:file file :output-stream output-stream})

                    (catch Exception e
                      (u/ignore-exceptions (.close output-stream))
                      (u/ignore-exceptions (io/delete-file file))
                      (throw e)))))
              result))))))))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Public APIs                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(defn cleanable?
  "Returns true if x implements the Cleanable protocol"
  [x]
  (satisfies? Cleanable x))

(defn streaming-temp-file?
  "Check if x is a StreamingTempFileStorage instance."
  [x]
  (instance? StreamingTempFileStorage x))
