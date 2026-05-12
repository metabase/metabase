(ns metabase.explorations.task.runner
  "Background worker that drains pending `:model/ExplorationQuery` rows. Each iteration claims one
  row with `FOR UPDATE SKIP LOCKED`, runs the snapshotted MBQL through the QP, writes the
  serialized result to `:model/ExplorationQueryResult`, and commits the whole thing in a single
  transaction. Crash recovery is automatic: a JVM kill drops the connection, the DB rolls back
  the tx, and the row is left as `pending` for another worker to pick up.

  Each iteration also handles per-`(query, timeline)` interestingness scoring: when no query is
  pending, the worker looks for a thread-selected timeline that hasn't yet been scored against a
  done query in the same thread, claims the pair via INSERT (the unique constraint serializes
  competing claims), runs the LLM scorer, and UPDATEs the row with the score. The INSERT and
  UPDATE are deliberately separate autocommits — wrapping them in one transaction would hold the
  unique-index lock for the duration of the LLM call and serialize all scoring workers.

  Crash recovery is via stale-row reclaim: rows whose `scored_at` is still `NULL` longer than
  [[stale-claim-cutoff-minutes]] are eligible for re-claim by a future iteration. The cutoff
  comfortably exceeds metabot.self's bounded retry budget for a single LLM call, so a still-alive
  worker will never be stale-reclaimed. A *caught* scorer failure (poison input, transient LLM
  error past retries) writes a sentinel row with `score=NULL, scored_at=NOW()` so that pair isn't
  retried forever."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.contextual-interestingness.core :as contextual-interestingness]
   [metabase.explorations.auto-insights :as explorations.auto-insights]
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

(defn- safe-chart-config
  "Best-effort `qp-result->chart-config`. Returns nil on failure (>2 cols,
  no numeric measure, unexpected shape, or any throw)."
  [exploration-query qp-result]
  (try
    (explorations.interestingness/qp-result->chart-config exploration-query qp-result)
    (catch Throwable e
      (log/warnf e "Failed to build chart-config for ExplorationQuery %d" (:id exploration-query))
      nil)))

(defn- safe-deep-stats
  "Best-effort deep `compute-chart-stats`. Returns nil on failure. Stored on
  the result row so summarization, chart-detail UIs, and any other consumer
  read the cached stats instead of re-running the pipeline against the
  serialized result blob."
  [exploration-query chart-config]
  (when chart-config
    (try
      (interestingness/compute-chart-stats chart-config {:deep? true})
      (catch Throwable e
        (log/warnf e "Failed to compute chart stats for ExplorationQuery %d" (:id exploration-query))
        nil))))

(defn- safe-score
  "Best-effort interestingness score. Reuses the pre-computed `stats` so we
  don't run the stats pipeline twice. Logs and returns nil on any failure so
  the worker still persists the result row — a scoring bug must never flip a
  successful query to errored."
  [exploration-query chart-config stats]
  (try
    (when (and chart-config stats)
      (interestingness/chart-interestingness chart-config stats))
    (catch Throwable e
      (log/warnf e "Failed to compute interestingness for ExplorationQuery %d"
                 (:id exploration-query))
      nil)))

(defn- claim-analysis-if-ready!
  "Atomically flip `exploration_thread.analysis_started_at` from NULL to NOW() iff every
  query on the thread has reached a terminal status (anything other than `pending`)
  AND every (query, timeline) pair has `scored_at` set. Returns true iff this caller
  was the one that claimed it — the unique caller who should run the handler. The
  matching `completed_at` flip happens later, after the handler finishes."
  [thread-id]
  (pos?
   (t2/query-one
    {:update :exploration_thread
     :set    {:analysis_started_at (OffsetDateTime/now)}
     :where  [:and
              [:= :id thread-id]
              [:= :analysis_started_at nil]
              [:not-exists {:select [1]
                            :from   [:exploration_query]
                            :where  [:and
                                     [:= :exploration_thread_id thread-id]
                                     [:= :status "pending"]]}]
              [:not-exists {:select    [1]
                            :from      [[:exploration_query :q]]
                            :join      [[:exploration_thread_timeline :ett]
                                        [:= :ett.exploration_thread_id :q.exploration_thread_id]]
                            :left-join [[:exploration_query_timeline_interestingness :s]
                                        [:and
                                         [:= :s.exploration_query_id :q.id]
                                         [:= :s.timeline_id :ett.timeline_id]]]
                            :where     [:and
                                        [:= :q.exploration_thread_id thread-id]
                                        [:= :q.status "done"]
                                        [:or
                                         [:= :s.id nil]
                                         [:= :s.scored_at nil]]]}]]})))

(defn- mark-thread-fully-completed!
  "Set `completed_at` to NOW(). Called after the auto-insights handler has finished
  (success, skip, or failure). This is what the UI polls on to decide it's done
  watching the thread."
  [thread-id]
  (t2/update! :model/ExplorationThread thread-id {:completed_at (OffsetDateTime/now)}))

(defn- on-thread-completed
  "Single entry point for post-completion work. Always invoked with `thread-id` (a long)
  exactly once per thread, on a background daemon thread. Runs after the runner's row
  transaction has committed, so it's free to do its own DB I/O, HTTP, LLM calls, etc.

  Stamps `completed_at` last so the UI's polling loop sees a clean done signal only
  after the auto-insights doc has been written (or failed)."
  [thread-id]
  (log/infof "Exploration thread %d: queries+scoring done, running auto-insights" thread-id)
  (try
    (explorations.auto-insights/generate-auto-insights! thread-id)
    (catch Throwable e
      (log/errorf e "generate-auto-insights! threw for thread %d" thread-id))
    (finally
      (try
        (mark-thread-fully-completed! thread-id)
        (catch Throwable e
          (log/errorf e "Failed to set completed_at for thread %d" thread-id))))))

(defn- maybe-complete-thread!
  "Invoke after any state transition that could be the last unit of work for `thread-id`
  (a query reaching a terminal status, or a timeline pair being scored). If this call is
  the one that claims the analysis run, runs `on-thread-completed` on a background
  `future`. Safe to call repeatedly: subsequent calls are no-ops thanks to the
  `analysis_started_at IS NULL` predicate.

  `thread-id` may be nil (e.g. the runner couldn't resolve the thread for a now-deleted
  query); in that case this is a no-op."
  [thread-id]
  (when (and thread-id (claim-analysis-if-ready! thread-id))
    (future
      (try
        (on-thread-completed thread-id)
        (catch Throwable e
          (log/errorf e "on-thread-completed failed for thread %d" thread-id))))))

(defn- safe-contextual-score
  "Best-effort contextual interestingness score against the thread's `prompt`.
  Returns nil whenever scoring isn't applicable (no prompt, no chart-config) or anything throws,
  so a scoring failure can never break the query lifecycle. Same fail-soft contract as
  `safe-score`."
  [exploration-query chart-config]
  (try
    (when-let [thread-id (:exploration_thread_id exploration-query)]
      (let [prompt (:prompt (t2/select-one [:model/ExplorationThread :prompt] :id thread-id))]
        (when (and chart-config (not (str/blank? prompt)))
          (contextual-interestingness/contextual-chart-interestingness chart-config prompt))))
    (catch Throwable e
      (log/warnf e "Failed to compute contextual interestingness for ExplorationQuery %d"
                 (:id exploration-query))
      nil)))

(defn- run-one-query-iteration!
  "Try to claim and execute a single pending query. Returns truthy when work was done so the
  caller knows whether to sleep.

  Returns `{:thread-id ...}` on a row transition so the caller can run the
  thread-completion check after the claim transaction commits — we don't want the
  completion CAS UPDATE (or any handlers it triggers) inside the row's transaction
  because it would extend the lock window."
  []
  (let [row-thread (atom nil)]
    (t2/with-transaction [_conn]
      (when-let [row (claim-pending-query)]
        (reset! row-thread (:exploration_thread_id row))
        (let [started (OffsetDateTime/now)]
          (try
            (let [qp-result    (qp/process-query
                                (qp/userland-query-with-default-constraints
                                 (:dataset_query row)
                                 {:context :exploration}))
                  bytes        (serialize-result qp-result)
                  chart-config (safe-chart-config row qp-result)
                  stats        (safe-deep-stats row chart-config)
                  score        (safe-score row chart-config stats)
                  ctx-score    (safe-contextual-score row chart-config)]
              (t2/insert! :model/ExplorationQueryResult
                          {:exploration_query_id             (:id row)
                           :result_data                      bytes
                           :chart_stats                      stats
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
        :worked))
    (when-let [tid @row-thread]
      (maybe-complete-thread! tid)
      :worked)))

(def ^:private ^:const stale-claim-cutoff-minutes
  "How long after a claim row's `created_at` we treat it as stale and reclaimable. Bounded above
  by metabot.self's retry budget for a single LLM call (~60s worst case), so a still-alive worker
  will never be stale-reclaimed. Five minutes gives plenty of headroom."
  5)

(defn- stale-cutoff
  "Cutoff `OffsetDateTime`: claim rows with `created_at` older than this and `scored_at` still
  `NULL` are eligible for stale-reclaim."
  ^OffsetDateTime []
  (.minusMinutes (OffsetDateTime/now) stale-claim-cutoff-minutes))

(defn- find-unscored-pair
  "Return one `{:exploration_query_id _ :timeline_id _ :stale_id _}` map for a `(query, timeline)`
  pair that needs scoring. A pair is eligible if the query is `done`, the timeline is selected on
  the same thread, and either:
   - no claim row exists yet (`:stale_id` is nil → fresh INSERT), or
   - a claim row exists with `scored_at` still NULL and `created_at` older than
     [[stale-claim-cutoff-minutes]] (`:stale_id` is the row id → reclaim via CAS UPDATE).
  Returns nil when there's no pending work."
  []
  (first
   (t2/query
    {:select    [[:q.id :exploration_query_id]
                 [:ett.timeline_id :timeline_id]
                 [:s.id :stale_id]]
     :from      [[:exploration_query :q]]
     :join      [[:exploration_thread_timeline :ett]
                 [:= :ett.exploration_thread_id :q.exploration_thread_id]]
     :left-join [[:exploration_query_timeline_interestingness :s]
                 [:and [:= :s.exploration_query_id :q.id]
                  [:= :s.timeline_id :ett.timeline_id]]]
     :where     [:and [:= :q.status "done"]
                 [:or [:= :s.id nil]
                  [:and [:= :s.scored_at nil]
                   [:< :s.created_at (stale-cutoff)]]]]
     :order-by  [[:q.id :asc] [:ett.timeline_id :asc]]
     :limit     1})))

(defn- claim-pending-timeline-pair!
  "Reserve one `(query, timeline)` pair. For a fresh pair, INSERT a row with `scored_at=NULL`;
  the unique constraint serializes competing INSERTs and the loser catches the conflict. For a
  stale pair (a previous worker's claim row whose `scored_at` is still NULL and `created_at` is
  older than the cutoff), CAS-bump `created_at` so any other worker that also saw the row stale
  loses the reclaim race when its `WHERE created_at < cutoff` matches zero rows.

  Returns the claim row's id on success, nil on race loss / no work."
  []
  (when-let [{:keys [exploration_query_id timeline_id stale_id]} (find-unscored-pair)]
    (if stale_id
      (when (pos? (t2/update! :model/ExplorationQueryTimelineInterestingness
                              :id         stale_id
                              :scored_at  nil
                              :created_at [:< (stale-cutoff)]
                              {:created_at (OffsetDateTime/now)}))
        (log/infof "Stale-reclaimed timeline pair (q=%s, t=%s, id=%s)"
                   exploration_query_id timeline_id stale_id)
        ;; CAS won; we own the row.
        {:id                   stale_id
         :exploration_query_id exploration_query_id
         :timeline_id          timeline_id})
      (try
        (when-let [row (first (t2/insert-returning-instances!
                               :model/ExplorationQueryTimelineInterestingness
                               {:exploration_query_id exploration_query_id
                                :timeline_id          timeline_id}))]
          {:id                   (:id row)
           :exploration_query_id exploration_query_id
           :timeline_id          timeline_id})
        (catch Throwable e
          (log/tracef e "Lost race claiming timeline pair (q=%s, t=%s)"
                      exploration_query_id timeline_id)
          nil)))))

(defn- run-one-timeline-iteration!
  "Try to claim and score one `(query, timeline)` pair. The scorer's own try/catch (in
  [[explorations.timeline-interestingness/score-query-timeline]]) already returns nil on failure
  paths, but we wrap the call here too so a poison input that escapes still produces a sentinel
  row with `score=NULL, scored_at=NOW()` instead of leaving the claim row stuck. Returns truthy
  when work was done."
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
    (maybe-complete-thread!
     (:exploration_thread_id
      (t2/select-one [:model/ExplorationQuery :exploration_thread_id]
                     :id exploration_query_id)))
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
