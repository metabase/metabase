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
  comfortably exceeds the per-call scoring deadline ([[llm-scoring-deadline-ms]]), so a still-alive
  worker will never be stale-reclaimed. A *caught* scorer failure (poison input, transient LLM
  error past retries, or a deadline overrun) writes a sentinel row with `score=NULL,
  scored_at=NOW()` so that pair isn't retried forever."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.contextual-interestingness.core :as contextual-interestingness]
   [metabase.explorations.ai-summary :as explorations.ai-summary]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.explorations.query-plan :as explorations.query-plan]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.explorations.query-plan.variants :as qp.variants]
   [metabase.explorations.settings :as explorations.settings]
   [metabase.explorations.timeline-interestingness :as explorations.timeline-interestingness]
   [metabase.interestingness.core :as interestingness]
   [metabase.lib.core :as lib]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.request.core :as request]
   [metabase.startup.core :as startup]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Duration OffsetDateTime)
   (java.util.concurrent TimeoutException)))

(set! *warn-on-reflection* true)

(defn- worker-count
  "How many concurrent workers to spin up. H2 has no `FOR UPDATE SKIP LOCKED` so we'd race on
  the claim and double-insert into `exploration_query_result` (1:1 with `exploration_query`);
  cap at 1 there. Postgres/MySQL claim safely via SKIP LOCKED."
  []
  (case (mdb/db-type)
    :h2 1
    (explorations.settings/explorations-worker-count)))

(def ^:private idle-sleep-ms    1000)
(def ^:private error-backoff-ms 5000)
(def ^:private join-timeout-ms  5000)

(def ^:private llm-scoring-deadline-ms
  "Hard wall-clock cap on a single timeline-scoring LLM call, enforced via [[u/with-timeout]] (which
  runs the call in a `future`, conveying dynamic bindings, and cancels it on timeout). Chosen well
  under [[stale-claim-cutoff-minutes]] so a legitimately-running scorer is never stale-reclaimed."
  (* 90 1000))

(defonce ^:private running? (atom false))
(defonce ^:private threads  (atom []))

;;; ------------------------------------- Prometheus metrics -------------------------------------

(defn- pending-query-depth
  "Number of `exploration_query` rows currently awaiting execution."
  []
  (t2/count :model/ExplorationQuery :status "pending"))

(defn- oldest-pending-age-seconds
  "Age in seconds of the oldest still-pending `exploration_query`, or 0 when the queue is empty.
  Computed as `now - min(created_at)` so it keeps climbing while the runner is stalled."
  []
  (if-let [oldest (t2/select-one-fn :created_at :model/ExplorationQuery
                                    {:where    [:= :status "pending"]
                                     :order-by [[:created_at :asc]]
                                     :limit    1})]
    (max 0 (.toSeconds (Duration/between ^OffsetDateTime oldest (OffsetDateTime/now))))
    0))

(defmethod analytics/pull-collector ::queue [_]
  {:min-interval-s 30
   :f (fn []
        (analytics.interface/set-gauge! :metabase-explorations/pending-queue-depth
                                        (pending-query-depth))
        (analytics.interface/set-gauge! :metabase-explorations/oldest-pending-age-seconds
                                        (oldest-pending-age-seconds)))})

(defn- record-query-outcome!
  "Bump the `queries-processed` counter for a terminal query `status` (\"done\" / \"error\")."
  [status]
  (analytics.interface/inc! :metabase-explorations/queries-processed {:status status}))

(defn- claim-pending-query
  "Claim a single pending row with `FOR UPDATE SKIP LOCKED` so peer workers don't fight for it.
  H2 doesn't support SKIP LOCKED, but we cap H2 at one worker (see `worker-count`) so dropping
  the lock clause is safe there.

  Skips rows on a canceled thread: the cancel-thread endpoint may have written `canceled_at` after
  the row was inserted (e.g. by a planner iteration that lost the cancel race), so the claim joins
  to `exploration_thread.canceled_at IS NULL`."
  []
  (t2/select-one :model/ExplorationQuery
                 (cond-> {:select    [:eq.*]
                          :from      [[:exploration_query :eq]]
                          :join      [[:exploration_thread :et] [:= :et.id :eq.exploration_thread_id]]
                          :where     [:and
                                      [:= :eq.status "pending"]
                                      [:= :et.canceled_at nil]]
                          :order-by  [[:eq.id :asc]]
                          :limit     1}
                   (not= :h2 (mdb/db-type)) (assoc :for [:update :skip-locked]))))

(defn- serialize-result
  "Run `cache.impl/do-with-serialization` against a single QP result, returning the gzipped+nippy
  byte array.

  Mirrors the prep step the QP's own result-cache middleware does (see
  `metabase.query-processor.middleware.cache/add-object-to-cache!`):
  `:json_query` and `:preprocessed_query` are passed through
  `lib/prepare-for-serialization` so the metadata provider — a record
  holding caching atoms that Nippy can't freeze — is stripped before
  serialization. Without this prep, Nippy chokes on the `Atom` inside the
  mp the moment we hand it a qp-result whose input query is a pMBQL value
  with `:lib/metadata` still attached."
  ^bytes [qp-result]
  (cache.impl/do-with-serialization
   (fn [in result-fn]
     (in (cond-> qp-result
           (map? qp-result) (-> (m/update-existing :json_query lib/prepare-for-serialization)
                                (m/update-existing :preprocessed_query lib/prepare-for-serialization))))
     (result-fn))))

(defn- finalize-row!
  "If `row` carries a nil `:dataset_query` (planner deferred the MBQL build),
  resolve the per-row context, invoke `qp.variants/dataset-query` and
  `qp.variants/query-name` for the row's variant, persist both back onto the
  row, and return the row with both fields populated. Throws when the
  context can't be built or when the variant's `dataset-query` returns nil
  (e.g. top-K discovery returned no rows) — the caller's catch handler
  records it as a row-level error."
  [row]
  (if (:dataset_query row)
    row
    (let [ctx (qp.context/build-row-context row)]
      (when-not ctx
        (throw (ex-info "Could not build context for row"
                        {:row-id (:id row)})))
      (let [variant (:query_type row)
            dq      (qp.variants/dataset-query variant ctx)
            nm      (qp.variants/query-name variant ctx)]
        (when (nil? dq)
          (throw (ex-info "Could not build dataset_query for row (discovery returned no values?)"
                          {:row-id (:id row) :variant variant})))
        (t2/update! :model/ExplorationQuery (:id row)
                    {:dataset_query dq :name nm})
        (assoc row :dataset_query dq :name nm)))))

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
  successful query to errored.

  At `debug` level, logs the full statistical breakdown (non-degeneracy / signal /
  structure sub-scores + chart-type) so the blended score isn't a black box when
  diagnosing why a chart did or didn't earn the \"potentially interesting\" marker."
  [exploration-query chart-config stats]
  (try
    (when (and chart-config stats)
      (let [breakdown (interestingness/chart-interestingness chart-config stats)]
        (log/debugf "Statistical interestingness for ExplorationQuery %d (thread %d): %s"
                    (:id exploration-query) (:exploration_thread_id exploration-query) (pr-str breakdown))
        (:score breakdown)))
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
              [:= :canceled_at nil]
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
  "Set `completed_at` to NOW(). Called after the ai-summary handler has finished
  (success, skip, or failure). This is what the UI polls on to decide it's done
  watching the thread."
  [thread-id]
  (t2/update! :model/ExplorationThread thread-id {:completed_at (OffsetDateTime/now)}))

(defn- on-thread-completed
  "Single entry point for post-completion work. Always invoked with `thread-id` (a long)
  exactly once per thread, on a background daemon thread. Runs after the runner's row
  transaction has committed, so it's free to do its own DB I/O, HTTP, LLM calls, etc.

  Stamps `completed_at` last so the UI's polling loop sees a clean done signal only
  after the ai-summary doc has been written (or failed)."
  [thread-id]
  (log/infof "Exploration thread %d: queries+scoring done, running ai-summary" thread-id)
  (try
    (explorations.ai-summary/generate-ai-summary! thread-id)
    (catch Throwable e
      (log/errorf e "generate-ai-summary! threw for thread %d" thread-id))
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

(defn- exploration-creator-id
  "Walk EQ → ExplorationThread → Exploration.creator_id for stamping onto the stored_result."
  [exploration-query]
  (t2/select-one-fn :creator_id :model/Exploration
                    {:join  [:exploration_thread
                             [:= :exploration_thread.exploration_id :exploration.id]]
                     :where [:= :exploration_thread.id (:exploration_thread_id exploration-query)]}))

(defn- exploration-id
  "Walk EQ → ExplorationThread → Exploration.id for recording the stored_result_use reference."
  [exploration-query]
  (t2/select-one-fn :exploration_id :model/ExplorationThread
                    :id (:exploration_thread_id exploration-query)))

(defn- variant-note
  "Human phrase for a chart's breakdown variant + params, or nil for the plain `default`
  (which adds no breakdown beyond the bare metric × dimension)."
  [query-type params]
  (case query-type
    "temporal-pattern-day"  "aggregated by day-of-week"
    "temporal-pattern-hour" "aggregated by hour-of-day"
    "time-facet"            "one line per dimension value, over time"
    "top-n-other"           (str "top " (:k params) " values, remainder grouped as Other")
    "filtered-subset"       (let [vs (:filter_values params)]
                              (str "restricted to "
                                   (if (and (sequential? vs) (= 1 (count vs)))
                                     (str (first vs))
                                     (str (count vs) " selected values"))))
    "per-value-time-series" "a single dimension value, tracked over time"
    nil))

(defn- slicing-note
  "Compact, explicit description of how a chart is sliced — its breakdown variant and/or
  segment filter — handed to the contextual scorer/describer so fan-out siblings of one
  metric × dimension get distinct, accurate descriptions instead of collapsing together.
  Returns nil for a plain unsegmented default breakdown (nothing to call out)."
  [row]
  (let [segment-name (when-let [sid (:segment_id row)]
                       (t2/select-one-fn :name :model/Segment :id sid))
        variant      (variant-note (:query_type row) (:params row))
        parts        (cond-> []
                       variant      (conj variant)
                       segment-name (conj (str "filtered to segment \"" segment-name "\"")))]
    (when (seq parts)
      (str/join "; " parts))))

(defn- build-score-context
  "Resolve the inputs the contextual scorer needs from `exploration-query`: the thread prompt,
  the (trimmed, non-blank) source Card description, and the compiled SQL of the dataset_query.
  Returns nil when the row has no thread."
  [exploration-query]
  (when-let [thread-id (:exploration_thread_id exploration-query)]
    {:prompt           (t2/select-one-fn :prompt :model/ExplorationThread :id thread-id)
     :card-description (when-let [card-id (:card_id exploration-query)]
                         (some-> (t2/select-one-fn :description :model/Card :id card-id)
                                 str/trim
                                 not-empty))
     :sql              (contextual-interestingness/dataset-query->sql (:dataset_query exploration-query))}))

(defn- safe-score+describe
  "Best-effort combined contextual scorer + describer for one chart. Threads the source
  Card's description (when present), the compiled SQL of the dataset_query, and the thread
  prompt into a single LLM call that returns

      {:score :chart-description :metric-description}

  `:metric-description` is always the *effective* description — Card-authored when the Card
  has one (the LLM is told not to regenerate it; we substitute the authored text), otherwise
  the LLM-generated one. Downstream consumers can read this directly without caring about
  the source.

  Runs inside a `request/with-current-user creator-id` binding so the LLM call
  (`metabase.metabot.self/call-llm-structured-with-trace`, reached via
  `score-and-describe-chart`) sees the right user context and gets billed/limited
  per-creator. The permission gate (`:permission/metabot-other-tools`) and the
  AI usage-limit check both live in `metabot.self`; on either failure
  `score-and-describe-chart`'s internal try/catch swallows the thrown ex-info
  and returns nil, leaving the EQR row's contextual fields nil — same fail-soft
  contract as `safe-score`.

  Returns nil-map (all three nil) whenever scoring isn't applicable (no prompt, no
  chart-config) or anything throws — so a scoring failure can never break the query
  lifecycle."
  [exploration-query chart-config creator-id]
  (try
    (let [{:keys [prompt card-description sql]} (build-score-context exploration-query)]
      (when (and chart-config (not (str/blank? prompt)))
        (if (nil? creator-id)
          (log/warnf "Skipping contextual interestingness for ExplorationQuery %d: no creator-id on exploration"
                     (:id exploration-query))
          (request/with-current-user creator-id
            (when-let [result (some-> (contextual-interestingness/score-and-describe-chart
                                       {:chart-config     chart-config
                                        :card-description card-description
                                        :chart-slicing    (slicing-note exploration-query)
                                        :sql              sql
                                        :context-string   prompt})
                                      (update :metric-description #(or card-description %)))]
              (log/debugf "Contextual interestingness for ExplorationQuery %d (thread %d): score=%s reasoning=%s chart-description=%s"
                          (:id exploration-query)
                          (:exploration_thread_id exploration-query)
                          (:score result)
                          (pr-str (:reasoning result))
                          (pr-str (:chart-description result)))
              result)))))
    (catch Throwable e
      (log/warnf e "Failed to compute contextual interestingness for ExplorationQuery %d"
                 (:id exploration-query))
      nil)))

(defn- compute-data-access-token
  "The creator's effective-data-access token for `dataset-query` — the sandbox/impersonation/routing
  fingerprint the snapshot is computed under, stored on the `StoredResult` and compared against a
  viewer's token to gate cached reads. Must be called inside the creator's `with-current-user` (+
  routing-on) binding. Best-effort: any failure yields nil, which the read gate treats as
  creator+admin-only."
  [dataset-query db-id]
  (try
    (perms/data-access-token {:database-id db-id
                              :table-ids   (query-perms/query->source-table-ids dataset-query)})
    (catch Throwable e
      (log/warn e "Failed to compute data-access token for exploration query result")
      nil)))

(defn- execute-and-persist-query-result!
  "Run the QP on `row`'s `:dataset_query`, compute the chart-config / stats / scores via the
  `safe-*` helpers, persist a `StoredResult` + `ExplorationQueryResult` + `StoredResultUse`, and
  flip the `ExplorationQuery` to `done`. `started` is the `OffsetDateTime` to stamp as the row's
  `:started_at`.

  The query runs as the exploration's creator, so the snapshot reflects the creator's own lens —
  sandboxing, connection impersonation, and database routing (all applied by the QP's own
  middleware under the bound user). The same lens is captured as a `:data_access_token` so
  non-creator readers can be gated against it."
  [row ^OffsetDateTime started]
  (let [creator-id (exploration-creator-id row)
        db-id      (:database_id row)
        run        (fn []
                     {:qp-result (qp.variants/pin-other-last
                                  (:query_type row)
                                  (qp/process-query
                                   (qp/userland-query-with-default-constraints
                                    (:dataset_query row)
                                    {:context :exploration})))
                      :token     (compute-data-access-token (:dataset_query row) db-id)})
        {:keys [qp-result token]} (if creator-id
                                    (request/with-current-user creator-id
                                      (run))
                                    (run))
        bytes        (serialize-result qp-result)
        chart-config (safe-chart-config row qp-result)
        stats        (safe-deep-stats row chart-config)
        score        (safe-score row chart-config stats)
        ctx          (safe-score+describe row chart-config creator-id)
        sr-id        (first
                      (t2/insert-returning-pks!
                       :model/StoredResult
                       {:result_data       bytes
                        :creator_id        creator-id
                        :database_id       db-id
                        :dataset_query     (:dataset_query row)
                        :row_count         (:row_count qp-result)
                        :data_access_token token}))]
    (t2/insert! :model/ExplorationQueryResult
                {:exploration_query_id             (:id row)
                 :stored_result_id                 sr-id
                 :chart_stats                      stats
                 :interestingness_score            score
                 :contextual_interestingness_score (:score ctx)
                 :metric_description               (:metric-description ctx)
                 :chart_description                (:chart-description ctx)})
    ;; Record the (exploration -> stored_result) reference for lifecycle/GC tracking.
    (t2/insert! :model/StoredResultUse
                {:stored_result_id sr-id
                 :exploration_id   (exploration-id row)})
    (t2/update! :model/ExplorationQuery (:id row)
                {:status      "done"
                 :started_at  started
                 :finished_at (OffsetDateTime/now)})))

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
            (execute-and-persist-query-result! (finalize-row! row) started)
            (record-query-outcome! "done")
            (catch Throwable e
              (log/errorf e "ExplorationQuery %d failed" (:id row))
              (t2/update! :model/ExplorationQuery (:id row)
                          {:status        "error"
                           :error_message (.getMessage e)
                           :started_at    started
                           :finished_at   (OffsetDateTime/now)})
              (record-query-outcome! "error"))))
        :worked))
    (when-let [tid @row-thread]
      (maybe-complete-thread! tid)
      :worked)))

(def ^:private ^:const stale-claim-cutoff-minutes
  "How long after a claim row's `created_at` we treat it as stale and reclaimable. Must comfortably
  exceed the wall-clock cost of one scoring iteration so a still-alive worker is never
  stale-reclaimed. Scoring LLM calls are hard-capped at [[llm-scoring-deadline-ms]] (90s), so five
  minutes leaves ample headroom."
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
     :join      [[:exploration_thread :et]
                 [:= :et.id :q.exploration_thread_id]
                 [:exploration_thread_timeline :ett]
                 [:= :ett.exploration_thread_id :q.exploration_thread_id]]
     :left-join [[:exploration_query_timeline_interestingness :s]
                 [:and [:= :s.exploration_query_id :q.id]
                  [:= :s.timeline_id :ett.timeline_id]]]
     :where     [:and [:= :q.status "done"]
                 [:= :et.canceled_at nil]
                 [:or [:= :s.id nil]
                  [:and [:= :s.scored_at nil]
                   [:< :s.created_at (stale-cutoff)]]]]
     :order-by  [[:q.id :asc] [:ett.timeline_id :asc]]
     :limit     1})))

(defn- reclaim-stale-timeline-pair!
  "CAS-bump `created_at` on an existing claim row whose `scored_at` is still NULL and `created_at`
  is older than the cutoff. Returns the claim shape on success, nil if another worker won the
  reclaim race."
  [exploration_query_id timeline_id stale_id]
  (when (pos? (t2/update! :model/ExplorationQueryTimelineInterestingness
                          :id         stale_id
                          :scored_at  nil
                          :created_at [:< (stale-cutoff)]
                          {:created_at (OffsetDateTime/now)}))
    (log/infof "Stale-reclaimed timeline pair (q=%s, t=%s, id=%s)"
               exploration_query_id timeline_id stale_id)
    {:id                   stale_id
     :exploration_query_id exploration_query_id
     :timeline_id          timeline_id}))

(defn- insert-fresh-timeline-pair!
  "INSERT a fresh claim row with `scored_at=NULL`; the unique constraint serializes competing
  INSERTs. Returns the claim shape on success, nil on conflict (the loser of the race)."
  [exploration_query_id timeline_id]
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
      nil)))

(defn- claim-pending-timeline-pair!
  "Reserve one `(query, timeline)` pair. Dispatches to [[reclaim-stale-timeline-pair!]] when
  there's an existing stale claim row, otherwise to [[insert-fresh-timeline-pair!]]. Returns
  the claim shape on success, nil on race loss / no work."
  []
  (when-let [pair (find-unscored-pair)]
    (let [{:keys [exploration_query_id timeline_id stale_id]} pair]
      (if stale_id
        (reclaim-stale-timeline-pair! exploration_query_id timeline_id stale_id)
        (insert-fresh-timeline-pair! exploration_query_id timeline_id)))))

(defn- run-one-timeline-iteration!
  "Try to claim and score one `(query, timeline)` pair. The scorer's own try/catch (in
  [[explorations.timeline-interestingness/score-query-timeline]]) already returns nil on failure
  paths, but we wrap the call here too so a poison input that escapes still produces a sentinel
  row with `score=NULL, scored_at=NOW()` instead of leaving the claim row stuck. Returns truthy
  when work was done.

  Runs the scorer inside a `request/with-current-user creator-id` binding (same as the contextual
  scorer in [[safe-score+describe]]) so the scorer's metabot permission / usage-limit gate resolves
  against the exploration's creator. A nil creator (deleted exploration) leaves the score nil."
  []
  (when-let [{:keys [id exploration_query_id timeline_id]} (claim-pending-timeline-pair!)]
    (let [eq         (t2/select-one [:model/ExplorationQuery :exploration_thread_id]
                                    :id exploration_query_id)
          creator-id (when eq (exploration-creator-id eq))
          score      (try
                       (when creator-id
                         (request/with-current-user creator-id
                           (u/with-timeout llm-scoring-deadline-ms
                             (explorations.timeline-interestingness/score-query-timeline
                              exploration_query_id timeline_id))))
                       (catch TimeoutException _
                         (log/warnf "Timeline scoring for query=%s timeline=%s timed out after %dms; treating as unscored"
                                    exploration_query_id timeline_id llm-scoring-deadline-ms)
                         nil)
                       (catch Throwable e
                         (log/warnf e "Timeline scoring failed for query=%s timeline=%s"
                                    exploration_query_id timeline_id)
                         nil))]
      (t2/update! :model/ExplorationQueryTimelineInterestingness id
                  {:interestingness_score score
                   :scored_at             (OffsetDateTime/now)})
      (maybe-complete-thread! (:exploration_thread_id eq)))
    :worked))

(def ^:private ^:const plan-stale-cutoff-minutes
  "Crash-recovery window for the planning phase."
  10)

(defn- plan-stale-cutoff
  "Cutoff `OffsetDateTime`: started threads whose `query_plan_started_at` is older than this and
  that still have no query rows are eligible for planner-crash reclaim."
  ^OffsetDateTime []
  (.minusMinutes (OffsetDateTime/now) plan-stale-cutoff-minutes))

(defn- claim-unplanned-thread!
  "CAS-claim a started thread for planning. A thread is claimable when it has no `exploration_query`
  rows yet and its `query_plan_started_at` is either NULL (never planned) or older than
  [[plan-stale-cutoff-minutes]] — the latter being planner-crash recovery: a pod claimed the thread
  for planning and died before producing any rows. Returns the claimed thread id, or nil when there's
  no work or we lost the race.

  Excludes canceled threads and ones that already started analysis/completion. Those last two guards
  matter only for the stale branch — they distinguish a crash from a legitimately-empty thread that
  planned 0 charts and finished. A never-planned thread always has `completed_at`/`analysis_started_at`
  NULL (they're set only after a plan iteration runs, and `reset-thread-for-rerun!` clears them on
  restart), so the guards are no-ops for the fresh branch.

  The CAS repeats the `query_plan_started_at` predicate (still NULL, or still older than the
  freshly-recomputed cutoff) so it serializes competing workers; because the cutoff exceeds any
  planner's run time, a still-alive planner is never reclaimed."
  []
  (let [claimable (fn [] [:or [:= :query_plan_started_at nil]
                          [:< :query_plan_started_at (plan-stale-cutoff)]])]
    (when-let [{:keys [id query_plan_started_at]}
               (t2/select-one [:model/ExplorationThread :id :query_plan_started_at]
                              {:where    [:and
                                          [:not= :started_at nil]
                                          [:= :canceled_at nil]
                                          [:= :completed_at nil]
                                          [:= :analysis_started_at nil]
                                          (claimable)
                                          [:not-exists {:select [1]
                                                        :from   [:exploration_query]
                                                        :where  [:= :exploration_query.exploration_thread_id
                                                                 :exploration_thread.id]}]]
                               :order-by [[:id :asc]]
                               :limit    1})]
      (when (pos? (t2/query-one
                   {:update :exploration_thread
                    :set    {:query_plan_started_at (OffsetDateTime/now)}
                    :where  [:and [:= :id id] (claimable)]}))
        ;; a non-nil prior timestamp means this was a crash reclaim, not a first-time claim
        (when query_plan_started_at
          (log/infof "Stale-reclaimed unplanned thread %d (planner appears to have crashed mid-plan)" id))
        id))))

(defn- canceled-mid-plan-cleanup!
  "Planner-race repair: the user can cancel a thread *after* the planner claimed it (set
  `query_plan_started_at`) but *before* `generate-query-plan!` returned. The cancel endpoint's
  bulk pending→canceled UPDATE only saw the EQ rows that existed at cancel time; rows the planner
  inserted after that are still `pending` on a canceled thread. Flip them here so the EQ table
  matches its owning thread's terminal state."
  [thread-id]
  (when (t2/exists? :model/ExplorationThread :id thread-id :canceled_at [:not= nil])
    (t2/update! :model/ExplorationQuery
                {:exploration_thread_id thread-id
                 :status                "pending"}
                {:status "canceled"})))

(defn- run-one-plan-iteration!
  "Try to claim one unplanned thread and run the LLM planner against it. Returns
  truthy when work was done so the worker loop knows whether to sleep."
  []
  (when-let [thread-id (claim-unplanned-thread!)]
    (try
      (explorations.query-plan/generate-query-plan! thread-id)
      (catch Throwable e
        (log/errorf e "Exploration thread %d: query plan iteration crashed" thread-id)))
    (canceled-mid-plan-cleanup! thread-id)
    ;; A successful plan inserts ExplorationQuery rows; downstream iterations
    ;; will execute them. A failed plan terminally stamps the thread, so the
    ;; completion-check we run below is also the right thing — no queries, but
    ;; `analysis_started_at` is already set so it short-circuits.
    (maybe-complete-thread! thread-id)
    :worked))

(defn- run-one-iteration!
  "Do one unit of work: plan any unplanned threads first, then queries, then
  timeline scoring. Returns truthy when something was processed."
  []
  (or (run-one-plan-iteration!)
      (run-one-query-iteration!)
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
