(ns metabase.explorations.task.runner
  "Background worker that drains pending `:model/ExplorationQuery` rows. Each iteration claims one
  row with `FOR UPDATE SKIP LOCKED`, runs the snapshotted MBQL through the QP, writes the
  serialized result to `:model/ExplorationQueryResult`, and commits the whole thing in a single
  transaction. Crash recovery is automatic: a JVM kill drops the connection, the DB rolls back
  the tx, and the row is left as `pending` for another worker to pick up.

  Each iteration also handles per-`(query, timeline)` interestingness scoring: when no query is
  pending, the worker looks for a thread-selected timeline that hasn't yet been scored against a
  done query in the same thread, claims the pair via INSERT (the unique constraint serializes
  competing claims), runs the LLM scorer, and writes the result."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.contextual-interestingness.core :as contextual-interestingness]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.explorations.timeline-interestingness :as explorations.timeline-interestingness]
   [metabase.interestingness.core :as interestingness]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

;; TODO the below should clearly become settings soon
(defn- worker-count
  "How many concurrent workers to spin up. H2 has no `FOR UPDATE SKIP LOCKED` so we'd race on
  the claim and double-insert into `exploration_query_result` (1:1 with `exploration_query`);
  cap at 1 there. Postgres/MySQL claim safely via SKIP LOCKED."
  []
  (case (mdb/db-type)
    :h2 1
    4))

(def ^:private idle-sleep-ms    1000)
(def ^:private error-backoff-ms 5000)
(def ^:private join-timeout-ms  5000)

(defonce ^:private running? (atom false))
(defonce ^:private threads  (atom []))

(defn- claim-pending-query
  "Claim a single pending row with `FOR UPDATE SKIP LOCKED` so peer workers don't fight for it.
  H2 doesn't support SKIP LOCKED, but we cap H2 at one worker (see `worker-count`) so dropping
  the lock clause is safe there."
  []
  (let [skip-locked? (not= :h2 (mdb/db-type))
        q            (cond-> {:select   [:*]
                              :from     [:exploration_query]
                              :where    [:= :status "pending"]
                              :order-by [[:id :asc]]
                              :limit    1}
                       skip-locked? (assoc :for [:update :skip-locked]))]
    (t2/select-one :model/ExplorationQuery q)))

(defn- serialize-result
  "Run `cache.impl/do-with-serialization` against a single QP result, returning the gzipped+nippy
  byte array."
  ^bytes [qp-result]
  (cache.impl/do-with-serialization
   (fn [in result-fn]
     (in qp-result)
     (result-fn))))

(defn- safe-score
  "Best-effort interestingness score for `qp-result`. Logs and returns nil on any failure so the
  worker still persists the result row — a scoring bug must never flip a successful query to
  errored."
  [exploration-query qp-result]
  (try
    (when-let [chart-config (explorations.interestingness/qp-result->chart-config
                             exploration-query qp-result)]
      (interestingness/chart-interestingness chart-config))
    (catch Throwable e
      (log/warnf e "Failed to compute interestingness for ExplorationQuery %d"
                 (:id exploration-query))
      nil)))

(defn- safe-contextual-score
  "Best-effort contextual interestingness score for `qp-result` against the thread's `prompt`.
  Returns nil whenever scoring isn't applicable (no prompt, no chart-config) or anything throws,
  so a scoring failure can never break the query lifecycle. Same fail-soft contract as
  `safe-score`."
  [exploration-query qp-result]
  (try
    (when-let [thread-id (:exploration_thread_id exploration-query)]
      (let [prompt (:prompt (t2/select-one [:model/ExplorationThread :prompt] :id thread-id))]
        (when-not (str/blank? prompt)
          (when-let [chart-config (explorations.interestingness/qp-result->chart-config
                                   exploration-query qp-result)]
            (contextual-interestingness/contextual-chart-interestingness chart-config prompt)))))
    (catch Throwable e
      (log/warnf e "Failed to compute contextual interestingness for ExplorationQuery %d"
                 (:id exploration-query))
      nil)))

(defn- run-one-query-iteration!
  "Try to claim and execute a single pending query. Returns truthy when work was done so the
  caller knows whether to sleep."
  []
  (t2/with-transaction [_conn]
    (when-let [row (claim-pending-query)]
      (let [started (OffsetDateTime/now)]
        (try
          (let [qp-result (qp/process-query
                           (qp/userland-query-with-default-constraints (:dataset_query row)))
                bytes     (serialize-result qp-result)
                score     (safe-score row qp-result)
                ctx-score (safe-contextual-score row qp-result)]
            (t2/insert! :model/ExplorationQueryResult
                        {:exploration_query_id             (:id row)
                         :result_data                      bytes
                         :interestingness_score            score
                         :contextual_interestingness_score ctx-score})
            (t2/update! :model/ExplorationQuery (:id row)
                        {:status      "done"
                         :started_at  started
                         :finished_at (OffsetDateTime/now)}))
          (catch Throwable e
            (log/errorf e "ExplorationQuery %d failed" (:id row))
            (t2/update! :model/ExplorationQuery (:id row)
                        {:status        "error"
                         :error_message (.getMessage e)
                         :started_at    started
                         :finished_at   (OffsetDateTime/now)}))))
      :worked)))

(defn- find-unscored-pair
  "Return one `{:exploration_query_id _ :timeline_id _}` map for a `(query, timeline)`
  pair that needs scoring (query is `done`, timeline is selected on the same thread,
  and no row exists in `exploration_query_timeline_interestingness` yet). Returns nil
  when there's no pending work."
  []
  (first
   (t2/query
    {:select   [[:q.id :exploration_query_id]
                [:ett.timeline_id :timeline_id]]
     :from     [[:exploration_query :q]]
     :join     [[:exploration_thread_timeline :ett]
                [:= :ett.exploration_thread_id :q.exploration_thread_id]]
     :left-join [[:exploration_query_timeline_interestingness :s]
                 [:and [:= :s.exploration_query_id :q.id]
                  [:= :s.timeline_id :ett.timeline_id]]]
     :where    [:and [:= :q.status "done"] [:= :s.id nil]]
     :order-by [[:q.id :asc] [:ett.timeline_id :asc]]
     :limit    1})))

(defn- claim-pending-timeline-pair!
  "Atomically reserve one unscored `(query, timeline)` pair by INSERTing a row with
  `scored_at = NULL` (the in-flight marker). The unique constraint serializes
  competing claims: a losing worker catches the conflict and returns nil to retry on
  the next iteration. Returns the inserted row on success, nil on no work or race loss."
  []
  (when-let [{:keys [exploration_query_id timeline_id]} (find-unscored-pair)]
    (try
      (first (t2/insert-returning-instances!
              :model/ExplorationQueryTimelineInterestingness
              {:exploration_query_id exploration_query_id
               :timeline_id          timeline_id
               :scored_at            nil}))
      (catch Throwable e
        (log/tracef e "Lost race claiming timeline pair (q=%s, t=%s)"
                    exploration_query_id timeline_id)
        nil))))

(defn- run-one-timeline-iteration!
  "Try to claim and score one `(query, timeline)` pair. Returns truthy when work was done."
  []
  (when-let [{:keys [id exploration_query_id timeline_id]} (claim-pending-timeline-pair!)]
    (let [score (try
                  (explorations.timeline-interestingness/score-query-timeline
                   exploration_query_id timeline_id)
                  (catch Throwable e
                    (log/warnf e "Timeline scoring failed for query=%s timeline=%s"
                               exploration_query_id timeline_id)
                    nil))]
      (t2/update! :model/ExplorationQueryTimelineInterestingness id
                  {:interestingness_score score
                   :scored_at             (OffsetDateTime/now)}))
    :worked))

(defn- run-one-iteration!
  "Do one unit of work: prefer pending queries, fall back to pending timeline scoring.
  Returns truthy when something was processed."
  []
  (or (run-one-query-iteration!)
      (run-one-timeline-iteration!)))

(defn- worker-loop
  [worker-id]
  (log/infof "Exploration worker %d started" worker-id)
  (while @running?
    (try
      (when-not (run-one-iteration!)
        (Thread/sleep ^long idle-sleep-ms))
      (catch InterruptedException _
        (reset! running? false))
      (catch Throwable e
        (log/errorf e "Exploration worker %d unexpected error" worker-id)
        (try (Thread/sleep ^long error-backoff-ms)
             (catch InterruptedException _ (reset! running? false))))))
  (log/infof "Exploration worker %d stopped" worker-id))

(defn- stop-workers!
  []
  (when (compare-and-set! running? true false)
    (doseq [^Thread t @threads]
      (.interrupt t))
    (doseq [^Thread t @threads]
      (.join t ^long join-timeout-ms))
    (reset! threads [])))

(defn- start-workers!
  []
  (when (compare-and-set! running? false true)
    (reset! threads
            (vec (for [i (range (worker-count))]
                   (doto (Thread. ^Runnable #(worker-loop i)
                                  (str "exploration-worker-" i))
                     (.setDaemon true)
                     (.start)))))
    (.addShutdownHook (Runtime/getRuntime)
                      (Thread. ^Runnable stop-workers! "exploration-worker-shutdown"))))

(defmethod startup/def-startup-logic! ::ExplorationRunner [_]
  (start-workers!))
