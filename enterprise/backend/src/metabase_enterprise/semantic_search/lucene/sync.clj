(ns metabase-enterprise.semantic-search.lucene.sync
  "Keeps this node's Lucene index in step with `semantic_search_embedding`.

  Quartz jobs are clustered, so they fire on one node — but every node has its own Lucene index to refresh. This
  runs on a plain per-JVM daemon timer instead. A write made on this node is searchable here immediately (the
  write path indexes it directly) and on every other node within one tick."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.lucene.index :as lucene.index]
   [metabase-enterprise.semantic-search.lucene.store :as lucene.store]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.startup.core :as startup]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
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
  ;; {:space :n :mx :diff-timer}, describing what this node last synced. nil until the first tick.
  (atom nil))

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

(defn- since-watermark [mx]
  (when mx
    (t/minus mx (t/seconds watermark-overlap-seconds))))

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
          previous       (when (= space (:space @state)) @state)
          diff-due?      (or (nil? previous)
                             (not= n (lucene.index/live-count))
                             (< id-diff-interval-ms (u/since-ms (:diff-timer previous))))]
      (if (and previous (= n (:n previous)) (= mx (:mx previous)) (not diff-due?))
        {:space space :skipped true}
        (let [indexed (import-rows! space (since-watermark (:mx previous)))
              diff    (when diff-due? (reconcile-ids! space))]
          (reset! state {:space      space
                         :n          n
                         :mx         mx
                         :diff-timer (if diff-due? (u/start-timer) (:diff-timer previous))})
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
