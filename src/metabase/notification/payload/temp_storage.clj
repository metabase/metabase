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
   [metabase.analytics-interface.core :as analytics]
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

(deftype StreamingTempFileStorage [^File file file-context]
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
      (format "#StreamingTempFileStorage{:file %s, :size %s, :file-context %s}"
              (.getName file)
              (human-readable-size (.length file))
              (pr-str file-context))
      (format "#StreamingTempFileStorage{:file %s (deleted), :file-context %s}"
              (.getName file)
              (pr-str file-context))))

  (equals [_this other]
    (and (instance? StreamingTempFileStorage other)
         (= file (.file ^StreamingTempFileStorage other))))

  (hashCode [_]
    (.hashCode file)))

(defmethod print-method StreamingTempFileStorage
  [^StreamingTempFileStorage storage ^java.io.Writer w]
  (.write w (.toString storage)))

(def ^:private ResidentBudget
  "Shared mutable budget threaded across all of a notification's cards (created once per notification by
  [[make-resident-budget]]). `:resident` is an atom tracking the cells currently held in memory across cards;
  the rest are the cell limits used to decide when a query spills to disk. See [[should-spill?]]."
  [:map
   [:resident       [:fn #(instance? clojure.lang.IAtom %)]]
   [:per-card     pos-int?]    ; spill a single query once it alone holds this many cells in memory
   [:resident-cap pos-int?]    ; once resident cells exceed this across cards, squeeze remaining queries down to `:floor`
   [:floor        pos-int?]])  ; ...but never spill a query holding fewer than this (no point writing tiny results)

(def ^:private NotificationRffOptions
  "Options controlling how [[notification-rff]] decides when to spill to disk."
  [:map
   ;; shared across a notification's cards so they can't collectively exhaust memory. A standalone query just passes its
   ;; own freshly-made budget.
   [:budget ResidentBudget]])

(defn make-resident-budget
  "Create a shared [[ResidentBudget]] for one notification. `limits` is a map of `:per-card`/`:resident-cap`/`:floor`
  cell counts. Created once (e.g. per dashboard) and passed to every card's [[notification-rff]] via `:budget` so that
  many small cards can't collectively exhaust memory."
  [limits]
  (assoc limits :resident (atom 0)))

(defn- should-spill?
  "Given the shared `budget` and the cells `this-query` currently holds in memory, decide whether to spill it to disk.
  Spill when this query alone is large, or when this query plus what sibling cards already hold resident would push total
  in-memory cells past the cap and this query isn't trivially tiny. We add `this-query` to `@resident` because the
  current card hasn't folded itself into the resident total yet (that happens at completion), so `@resident` alone
  understates live memory while this card is accumulating."
  [{:keys [resident per-card resident-cap floor]} this-query]
  (or (>= this-query per-card)
      (and (>= (+ @resident this-query) resident-cap)
           (>= this-query floor))))

;; ----------------------------------------------------------------------------------------------------------------- ;;
;; Disk-backed row storage
;;
;; Side storage for a single notification query's rows, used alongside the query processor's own reducing accumulator
;; (the `result` map - see [[metabase.query-processor.reducible/default-rff]]). Rows accumulate in an in-memory transient
;; vector until the cell threshold is crossed, at which point everything accumulated is spilled to a temp file and
;; subsequent rows are streamed straight to disk.
;;
;; State lives in two places, by design:
;;   :state - an `(atom state-map)` of plain immutable fields, updated with pure `swap!` fns:
;;     :row-count     total rows seen
;;     :cell-count    cells (values) currently held in memory (0 once spilled)
;;     :streaming?    whether we've spilled and are now writing straight to disk
;;     :file          the spill File, once streaming
;;     :output-stream the spill DataOutputStream, once streaming
;;     :truncated?    whether the file grew past the size cap and rows are being dropped
;;   :rows - a `(volatile! transient-vector)` of the in-memory rows. This is kept OUT of the atom: a transient is a
;;     mutable, single-thread value and `conj!` mutates in place, which would be unsafe inside a `swap!` fn (atoms may
;;     retry their update fn). The rff is single-threaded, so a volatile is the right container - no CAS, no retry.
;; I/O (opening/writing/closing the file) likewise happens as explicit statements in the fns below, never inside `swap!`.
;; ----------------------------------------------------------------------------------------------------------------- ;;

(defn- new-row-storage
  "Create the row storage for one query. `budget` is the shared [[ResidentBudget]] (this query reads it to decide spills
  and, if it stays in memory, folds its cells into it at completion); `file-context` is captured in the spill file's
  preamble and on the resulting StreamingTempFileStorage."
  [budget file-context]
  {:state        (atom {:row-count 0
                        :cell-count 0
                        :streaming? false
                        :file nil
                        :output-stream nil
                        :truncated? false})
   :rows         (volatile! (transient []))
   :budget       budget
   :file-context file-context})

(defn- spill-to-disk!
  "Transition from in-memory accumulation to disk streaming: open a temp file, write the preamble + streaming sentinel,
  flush the rows accumulated so far, then flip the state into streaming mode and release the in-memory rows."
  [{:keys [state rows file-context]}]
  (let [opened   (open-streaming-file!)
        new-file (:file opened)
        ^DataOutputStream new-os (:output-stream opened)]
    (try
      (nippy/freeze-to-out! new-os {:preamble file-context})
      (.flush new-os)
      (nippy/freeze-to-out! new-os ::streaming)
      (.flush new-os)
      (doseq [row (persistent! @rows)]
        (write-row-to-stream! new-os row))
      (vreset! rows (transient [])) ; release memory
      (swap! state assoc
             :streaming? true
             :file new-file
             :output-stream new-os)
      (catch Exception e
        (u/ignore-exceptions (.close new-os))
        (u/ignore-exceptions (io/delete-file new-file))
        (throw e)))))

(defn- add-row!
  "Store one `row` (in memory, or appended to the spill file if already streaming). Returns true to keep reducing, or
  false once truncation has kicked in and the caller should stop."
  [{:keys [state rows budget file-context] :as row-storage} row]
  (let [{:keys [streaming? ^DataOutputStream output-stream ^File file]}
        (swap! state update :row-count inc)]
    (if streaming?
      ;; already spilled: write straight to disk, truncating (stop reducing) if the file grew past 1.3x the size cap
      (let [max-bytes (notification.settings/notification-temp-file-size-max-bytes)]
        (write-row-to-stream! output-stream row)
        (if (and (pos? max-bytes)
                 (> (.length file) (* 1.3 max-bytes)))
          (do
            (swap! state assoc :truncated? true)
            (log/warnf "Results have exceeded 1.3 times of `notification-temp-file-size-max-bytes` of %s (max: %s). Truncating query results. %s"
                       (human-readable-size (.length file))
                       (human-readable-size max-bytes)
                       (when file-context (format "(%s)" (pr-str file-context))))
            false)
          true))
      ;; still in memory: accumulate the row (in the sibling volatile) and its cells, then let the policy decide whether
      ;; to spill given the cells this query holds and the cells resident across the notification. We never truncate
      ;; while in memory, so always keep reducing.
      (let [_          (vswap! rows conj! row)
            cell-count (:cell-count (swap! state update :cell-count + (count row)))]
        (when (should-spill? budget cell-count)
          (log/infof "Spilling to disk (%d cells, %d rows in memory)" cell-count (:row-count @state))
          (spill-to-disk! row-storage))
        true))))

(defn- finish!
  "Fold the stored rows (or a file reference), `:row_count`, and stats into the query processor's `result` map. A query
  that stays in memory folds its cells into the shared [[ResidentBudget]] so sibling cards see the added memory pressure;
  a query that spilled adds nothing (its rows are on disk, not resident)."
  [{:keys [state rows budget file-context]} result]
  (let [{:keys [row-count cell-count streaming? truncated?
                ^DataOutputStream output-stream ^File file]} @state]
    (if streaming?
      ;; close the file and hand back a file reference; nothing is resident in memory
      (try
        (.close output-stream)
        (let [file-size (.length file)
              max-bytes (notification.settings/notification-temp-file-size-max-bytes)
              storage   (cond truncated?              :truncated
                              (zero? max-bytes)        :not-limited
                              (< max-bytes file-size)  :above-threshold
                              :else                    :disk)]
          (analytics/inc! :metabase-notification/temp-storage {:storage storage})
          (log/infof "💾 Stored %d rows to disk: %s (never loaded into memory)%s"
                     row-count
                     (human-readable-size file-size)
                     (if truncated? " (note query results were truncated)" ""))
          (-> result
              (assoc :row_count row-count
                     :status :completed
                     :data.rows-file-size file-size
                     :notification/storage (if truncated? :truncated :disk)
                     :notification/resident-cells 0)
              (cond-> truncated? (assoc :notification/truncated? true))
              (assoc-in [:data :rows] (StreamingTempFileStorage. file file-context))))
        (catch Exception e
          (u/ignore-exceptions (.close output-stream))
          (throw e)))
      ;; stayed under threshold: fold this query's cells into the shared resident total, then hand back the in-memory
      ;; rows (reporting the cells held resident).
      (do
        (swap! (:resident budget) + cell-count)
        (analytics/inc! :metabase-notification/temp-storage {:storage :memory})
        (log/infof "✓ Completed with %d rows in memory (under threshold)" row-count)
        (-> result
            (assoc :row_count row-count
                   :status :completed
                   :notification/storage :memory
                   :notification/resident-cells cell-count)
            (assoc-in [:data :rows] (persistent! @rows)))))))

(mu/defn notification-rff :- ::qp.schema/rff
  "Reducing function factory for notifications that streams to disk when a threshold is exceeded.

  Returns an rff (function that takes metadata and returns an rf) that:
  - Accumulates rows in memory initially
  - Once the spill threshold is reached, spills accumulated rows to disk and streams the rest
  - Final result contains either in-memory rows or a StreamingTempFileStorage reference, plus stats:
    `:notification/storage` (:memory | :disk | :truncated) and `:notification/resident-cells` (cells held in memory,
    0 once spilled).

  Parameters:

  - options: a map describing when to switch to disk. Keys:
    - :budget (required) - a shared [[ResidentBudget]] (from [[make-resident-budget]]) tracking memory across a whole
      notification's cards, so many small cards can't collectively exhaust memory. A standalone query passes its own
      freshly-made budget.
  - file-context: Optional map describing the data being stored (e.g. the originating card/dashcard). It is captured
    in the temp file preamble and on the resulting StreamingTempFileStorage (for debugging)."
  ([options :- NotificationRffOptions]
   (notification-rff options {}))
  ([options :- NotificationRffOptions file-context]
   (fn rff [metadata]
     ;; `row-storage` is OUR side storage for rows (it spills to disk); the query processor's reducing accumulator is
     ;; the `result` map, which we thread through untouched until completion - exactly like
     ;; [[metabase.query-processor.reducible/default-rff]]'s `row-count`/`rows` volatiles.
     (let [row-storage (new-row-storage (:budget options) file-context)]
       (fn notification-rf
         ;; Init arity
         ([]
          {:data metadata})

         ;; Completion arity - fold the stored rows (or a file reference) and stats into `result`.
         ([result]
          {:pre [(map? (unreduced result))]}
          (finish! row-storage (unreduced result)))

         ;; Step arity - store the row beside `result`, then thread `result` onward (stopping if truncated).
         ([result row]
          (if (add-row! row-storage row)
            result
            (reduced result))))))))

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
