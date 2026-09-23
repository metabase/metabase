(ns metabase-enterprise.semantic-search.lucene.sync
  "Keeps this node's Lucene index in step with `semantic_search_embedding`.

  Quartz jobs are clustered, so they fire on one node — but every node has its own Lucene index to refresh. This
  runs on a plain per-JVM daemon timer instead. A write made on this node is searchable here immediately (the
  write path indexes it directly) and on every other node within one tick."
  (:require
   [clojure.edn :as edn]
   [metabase-enterprise.semantic-search.lucene.index :as lucene.index]
   [metabase-enterprise.semantic-search.lucene.store :as lucene.store]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.startup.core :as startup]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log])
  (:import
   (java.nio.file Path)
   (java.sql Timestamp)
   (java.time Instant LocalDateTime OffsetDateTime ZonedDateTime)
   (java.util.concurrent Executors ScheduledExecutorService ThreadFactory TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private tick-seconds 10)

(def ^:private page-size
  "Rows per keyset page while importing. Bounds memory on the first tick, which imports the whole space."
  2000)

(def ^:private watermark-overlap-seconds
  "How far back of the last watermark to re-read. Covers a row that committed late with an older `updated_at`
  than one this node has already seen; re-importing a row it already has is idempotent."
  60)

(def ^:private id-diff-interval-ms
  "How long to go without a full id comparison. Deletes normally show up through the row count, and this is the
  backstop for the case where an insert and a delete land in the same tick."
  (* 5 60 1000))

(defonce ^:private executor (atom nil))

(defonce ^:private state
  ;; {:space :n :mx-ms :diff-timer}, describing what this node last synced. nil until the first tick.
  (atom nil))

(defn- watermark-ms
  "Epoch millis of the `max(updated_at)` the app DB reported, whatever JDBC type it came back as, or nil.

  Millis rather than the value itself: it is compared across a restart, where it has been through EDN, and the
  drivers do not agree on a type. Local timestamps are read in the JVM default zone, exactly as
  `java.sql.Timestamp` converts them, so the value round-trips back into a query bound unchanged."
  [v]
  (cond
    (nil? v)                        nil
    (instance? Timestamp v)         (.getTime ^Timestamp v)
    (instance? LocalDateTime v)     (.getTime (Timestamp/valueOf ^LocalDateTime v))
    (instance? OffsetDateTime v)    (.toEpochMilli (.toInstant ^OffsetDateTime v))
    (instance? ZonedDateTime v)     (.toEpochMilli (.toInstant ^ZonedDateTime v))
    (instance? Instant v)           (.toEpochMilli ^Instant v)
    (instance? java.util.Date v)    (.getTime ^java.util.Date v)
    :else                           nil))

(defn- watermark-file ^Path [space]
  (lucene.index/sidecar-path space ".sync.edn"))

(defn- read-watermark
  "What this node had synced when it last shut down, or nil when there is no usable record.

  Without this a restart walks the whole space again to refill an index that is already on disk."
  [space]
  (let [file (watermark-file space)]
    (when (u.files/exists? file)
      (try
        (let [{:keys [n mx-ms]} (edn/read-string (slurp (.toFile file)))]
          {:space      space
           :n          n
           :mx-ms      mx-ms
           :diff-timer (u/start-timer)})
        (catch Throwable t
          (log/warnf "Ignoring unreadable semantic search sync watermark at %s: %s" file (ex-message t))
          nil)))))

(defn- write-watermark!
  "Record `{:n … :mx-ms …}` beside the index. Never throws: an unwritable plugins dir costs a full import, not a sync."
  [space {:keys [n mx-ms]}]
  (try
    (spit (.toFile (watermark-file space)) (pr-str {:n n :mx-ms mx-ms}))
    (catch Throwable t
      (log/warnf "Could not persist the semantic search sync watermark: %s" (ex-message t)))))

(defn reset-state!
  "Forget what this node last synced, so the next tick does a full import and id comparison."
  []
  (reset! state nil))

(defn- import-rows!
  "Index every row of `space` written at or after `since`, in keyset pages. Returns how many rows were indexed."
  [space since]
  (loop [after-id 0, total 0]
    (let [rows (lucene.store/rows-after space after-id since page-size)]
      (if (empty? rows)
        total
        (do
          (lucene.index/upsert-rows! rows)
          (recur (long (:id (last rows))) (long (+ total (count rows)))))))))

(defn- reconcile-ids!
  "Drop local documents the table no longer has, and import any it has that this node is missing."
  [space]
  (let [by-id   (into {}
                      (map (fn [{:keys [model model_id]}]
                             [(lucene.index/document-id model model_id) [model model_id]]))
                      (lucene.store/model-ids space))
        live    (lucene.index/live-ids)
        stale   (remove by-id live)
        missing (remove live (keys by-id))]
    (when (seq stale)
      (lucene.index/delete-ids! stale))
    (when (seq missing)
      (lucene.index/upsert-rows! (lucene.store/rows-for-model-ids space (map by-id missing))))
    {:stale (count stale) :missing (count missing)}))

(defn- since-bound
  "The `updated_at` lower bound for the next import: the last watermark less the overlap window."
  ^Timestamp [mx-ms]
  (when mx-ms
    (Timestamp. (- (long mx-ms) (* 1000 watermark-overlap-seconds)))))

(defn sync-tick!
  "Refresh this node's Lucene index from the embedding table once, returning what the tick did.

  Returns nil when the Lucene backend is not selected or the semantic engine is not active — both are re-read
  every tick, so a licence or engine change needs no restart."
  []
  (when (and (semantic.util/lucene-backend?)
             (semantic.util/semantic-search-active?))
    (lucene.index/ensure-open!)
    (let [space          (lucene.store/space-id)
          {:keys [n mx]} (lucene.store/space-stats space)
          mx-ms          (watermark-ms mx)
          previous       (or (when (= space (:space @state)) @state)
                             (read-watermark space))
          diff-due?      (or (nil? previous)
                             (not= n (lucene.index/live-count))
                             (< id-diff-interval-ms (u/since-ms (:diff-timer previous))))]
      (if (and previous (= n (:n previous)) (= mx-ms (:mx-ms previous)) (not diff-due?))
        {:space space :skipped true}
        (let [indexed (import-rows! space (since-bound (:mx-ms previous)))
              diff    (when diff-due? (reconcile-ids! space))]
          (reset! state {:space      space
                         :n          n
                         :mx-ms      mx-ms
                         :diff-timer (if diff-due? (u/start-timer) (:diff-timer previous))})
          (write-watermark! space {:n n :mx-ms mx-ms})
          (cond-> {:space space :indexed indexed}
            diff (merge diff)))))))

(defn- tick! []
  (try
    (sync-tick!)
    (catch Throwable t
      ;; scheduleWithFixedDelay stops rescheduling a task that throws, which would freeze this node's index.
      (log/warnf "Semantic search Lucene sync failed, retrying next tick: %s" (ex-message t)))))

(defn start!
  "Start this node's Lucene sync timer. Idempotent; a no-op unless the Lucene backend is selected."
  []
  (when (semantic.util/lucene-backend?)
    (let [new-executor (Executors/newSingleThreadScheduledExecutor
                        (reify ThreadFactory
                          (newThread [_ r]
                            (doto (Thread. ^Runnable r "semantic-search-lucene-sync")
                              (.setDaemon true)))))]
      (if (compare-and-set! executor nil new-executor)
        (do
          (.scheduleWithFixedDelay new-executor
                                   (reify Runnable (run [_] (tick!)))
                                   tick-seconds tick-seconds TimeUnit/SECONDS)
          (log/infof "Started the semantic search Lucene sync, every %ds" tick-seconds)
          true)
        (do
          (.shutdown new-executor)
          false)))))

(defn stop!
  "Stop this node's Lucene sync timer. Idempotent."
  []
  (when-let [^ScheduledExecutorService running (first (reset-vals! executor nil))]
    (.shutdownNow running)
    (log/info "Stopped the semantic search Lucene sync"))
  (reset-state!))

(defmethod startup/def-startup-logic! ::semantic-lucene-sync [_]
  (start!))

(defmethod startup/def-shutdown-logic! ::semantic-lucene-sync [_]
  ;; Order matters, and `run-shutdown-logic!` does not order its methods: stop the timer before closing the
  ;; index out from under it.
  (stop!)
  (lucene.index/close!))
