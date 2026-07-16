(ns metabase.explorations.runner
  "The work an exploration does in the background, as three plain functions:

    [[plan-thread!]]  — ask the LLM which charts to build, and materialize them as
                        `:model/ExplorationQuery` rows
    [[run-query!]]    — run one query's MBQL through the QP and store the result
    [[score-pair!]]   — score one `(query, timeline)` pair for interestingness

  Each is idempotent for calling from MQ."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.core :as analytics]
   [metabase.contextual-interestingness.core :as contextual-interestingness]
   [metabase.explorations.ai-summary :as explorations.ai-summary]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.explorations.query-plan :as explorations.query-plan]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.explorations.query-plan.variants :as qp.variants]
   [metabase.explorations.timeline-interestingness :as explorations.timeline-interestingness]
   [metabase.interestingness.core :as interestingness]
   [metabase.lib.core :as lib]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.core :as qp]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Duration OffsetDateTime)
   (java.util.concurrent TimeoutException)))

(set! *warn-on-reflection* true)

(def ^:private llm-scoring-deadline-ms
  "Hard wall-clock cap on a single timeline-scoring LLM call, enforced via [[u/with-timeout]] (which
  runs the call in a `future`, conveying dynamic bindings, and cancels it on timeout)."
  (* 90 1000))

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

(defn- runnable-query
  "Load the `ExplorationQuery` `query-id` if it is still work to do, else nil."
  [query-id]
  (t2/select-one :model/ExplorationQuery
                 {:select [:eq.*]
                  :from   [[:exploration_query :eq]]
                  :join   [[:exploration_thread :et] [:= :et.id :eq.exploration_thread_id]]
                  :where  [:and
                           [:= :eq.id query-id]
                           [:= :eq.status "pending"]
                           [:= :et.canceled_at nil]]}))

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
  (qp/do-with-serialization
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

(defn maybe-complete-thread!
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
  "Resolve the *expensive* inputs the contextual scorer needs from `exploration-query`: the
  (trimmed, non-blank) source Card description and the compiled SQL of the dataset_query.
  Called only after the cheap gates in [[safe-score+describe]] (chart-config present, creator
  known, non-blank thread prompt) have passed, so the Card select and SQL compile never run for
  charts that won't be scored."
  [exploration-query]
  {:card-description (when-let [card-id (:card_id exploration-query)]
                       (some-> (t2/select-one-fn :description :model/Card :id card-id)
                               str/trim
                               not-empty))
   :sql              (contextual-interestingness/dataset-query->sql (:dataset_query exploration-query))})

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
  AI usage-limit check sit in `score-and-describe-chart`'s own pre-flight `cond`
  (via `metabot/llm-call-available?`); a closed gate makes it return nil rather
  than throw, leaving the EQR row's contextual fields nil — same fail-soft
  contract as `safe-score`.

  Returns nil whenever scoring isn't applicable (no prompt, no chart-config, no
  creator) or anything throws — so a scoring failure can never break the query
  lifecycle. The cheap gates run before [[build-score-context]]'s DB reads and
  SQL compile, so non-applicable charts cost nothing here."
  [exploration-query chart-config creator-id]
  (try
    (when-let [thread-id (and chart-config (:exploration_thread_id exploration-query))]
      (if (nil? creator-id)
        (log/warnf "Skipping contextual interestingness for ExplorationQuery %d: no creator-id on exploration"
                   (:id exploration-query))
        (let [prompt (t2/select-one-fn :prompt :model/ExplorationThread :id thread-id)]
          (when-not (str/blank? prompt)
            (let [{:keys [card-description sql]} (build-score-context exploration-query)]
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
                  result)))))))
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

(defn- compute-query-result
  "The slow half of running `row`: the warehouse query, its serialization, and the chart-config /
  stats / scores (`safe-score+describe` makes an LLM call). Returns everything
  [[persist-query-result!]] needs to write.

  Deliberately holds no transaction.

  The query runs as the exploration's creator, so the snapshot reflects the creator's own lens —
  sandboxing, connection impersonation, and database routing (all applied by the QP's own
  middleware under the bound user). The same lens is captured as a `:data_access_token` so
  non-creator readers can be gated against it."
  [row]
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
        chart-config (safe-chart-config row qp-result)
        stats        (safe-deep-stats row chart-config)]
    {:creator-id creator-id
     :db-id      db-id
     :bytes      (serialize-result qp-result)
     :token      token
     :stats      stats
     :score      (safe-score row chart-config stats)
     :ctx        (safe-score+describe row chart-config creator-id)}))

(defn- persist-query-result!
  "Write what [[compute-query-result]] produced and flip the query to `done` transactionally.

  Returns false when a peer delivery already persisted this query."
  [row ^OffsetDateTime started {:keys [creator-id db-id bytes token stats score ctx]}]
  (try
    (t2/with-transaction [_conn]
      (let [sr-id (first
                   (t2/insert-returning-pks!
                    :model/StoredResult
                    {:result_data       bytes
                     :creator_id        creator-id
                     :database_id       db-id
                     :dataset_query     (:dataset_query row)
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
    true
    (catch Exception e
      (if (t2/exists? :model/ExplorationQueryResult :exploration_query_id (:id row))
        (do (log/infof "ExplorationQuery %d was already completed by a peer; discarding this run's duplicate result"
                       (:id row))
            false)
        (throw e)))))

(defn run-query!
  "Execute the pending `ExplorationQuery` `query-id`, flip it to `done`, and return its thread id.

  Also returns the thread id — without re-running anything — for a query that is *already* `done`:
  the delivery that ran it may have persisted the result but then failed to publish its timeline
  pairs, and the redelivery is what re-runs that follow-up (which is idempotent). Skipping it there
  would strand the pairs unpublished forever. Returns nil when there is nothing to publish: the
  query is still pending (or on a canceled thread), terminally `error`, or gone."
  [query-id]
  (if-let [row (runnable-query query-id)]
    (let [row      (finalize-row! row)
          started  (OffsetDateTime/now)
          computed (compute-query-result row)]
      (when (persist-query-result! row started computed)
        (record-query-outcome! "done"))
      (:exploration_thread_id row))
    (t2/select-one-fn :exploration_thread_id :model/ExplorationQuery
                      :id query-id :status "done")))

(defn fail-query!
  "Terminally mark `query-id` as `error` with `message`, the user-visible failure state the UI
  renders.

  No-ops on a row that is no longer `pending` (a later delivery succeeded, or it was canceled)."
  [query-id message]
  (let [thread-id (t2/select-one-fn :exploration_thread_id :model/ExplorationQuery :id query-id)]
    (when (pos? (t2/update! :model/ExplorationQuery
                            {:id query-id :status "pending"}
                            {:status        "error"
                             :error_message message
                             :finished_at   (OffsetDateTime/now)}))
      (record-query-outcome! "error"))
    thread-id))

(defn- score-pair-row!
  "Run the LLM scorer for `(query-id, timeline-id)` and write `interestingness_score` +
  `scored_at` onto claim row `id`. Failures (including a scorer that overruns
  [[llm-scoring-deadline-ms]]) are caught and recorded as a nil score, not rethrown: a poison pair
  must not be retried forever, and an unscored pair would stall its thread's completion gate.

  Runs inside `request/with-current-user` on the exploration's creator so the scorer's metabot
  permission / usage-limit gate resolves against them. A nil creator (deleted exploration) scores nil."
  [id query-id timeline-id creator-id]
  (let [score (try
                (when creator-id
                  (request/with-current-user creator-id
                    (u/with-timeout llm-scoring-deadline-ms
                      (explorations.timeline-interestingness/score-query-timeline query-id timeline-id))))
                (catch TimeoutException _
                  (log/warnf "Timeline scoring for query=%s timeline=%s timed out after %dms; treating as unscored"
                             query-id timeline-id llm-scoring-deadline-ms)
                  nil)
                (catch Throwable e
                  (log/warnf e "Timeline scoring failed for query=%s timeline=%s" query-id timeline-id)
                  nil))]
    (t2/update! :model/ExplorationQueryTimelineInterestingness id
                {:interestingness_score score
                 :scored_at             (OffsetDateTime/now)})))

(defn score-pair!
  "Score the `(query-id, timeline-id)` pair and return the query's thread id, or nil if there was
  nothing to do.

  Idempotent for use in MQ. Skips a canceled thread — like [[run-query!]] and [[plan-thread!]], a
  terminal thread nobody is waiting on must not cost an LLM scoring call."
  [query-id timeline-id]
  (when-let [eq (t2/select-one :model/ExplorationQuery
                               {:select [:eq.id :eq.exploration_thread_id :eq.status]
                                :from   [[:exploration_query :eq]]
                                :join   [[:exploration_thread :et] [:= :et.id :eq.exploration_thread_id]]
                                :where  [:and
                                         [:= :eq.id query-id]
                                         [:= :eq.status "done"]
                                         [:= :et.canceled_at nil]]})]
    (let [existing (t2/select-one [:model/ExplorationQueryTimelineInterestingness :id :scored_at]
                                  :exploration_query_id query-id :timeline_id timeline-id)
          row-id   (cond
                     (:scored_at existing) nil                          ; already scored — nothing to do
                     existing              (:id existing)               ; reserved but unscored — take it
                     :else                 (try
                                             (:id (first (t2/insert-returning-instances!
                                                          :model/ExplorationQueryTimelineInterestingness
                                                          {:exploration_query_id query-id
                                                           :timeline_id          timeline-id})))
                                             (catch Throwable e
                                               ;; Only a genuine unique-constraint race leaves a row behind — treat
                                               ;; that as a benign loss and let the winner score it. A transient
                                               ;; failure leaves no row: rethrow so the message is retried, rather
                                               ;; than swallowing it and leaving the pair unscored forever.
                                               (if (t2/exists? :model/ExplorationQueryTimelineInterestingness
                                                               :exploration_query_id query-id :timeline_id timeline-id)
                                                 (do (log/tracef e "Lost race reserving timeline pair (q=%s, t=%s)"
                                                                 query-id timeline-id)
                                                     nil)
                                                 (throw e)))))]
      (when row-id
        (score-pair-row! row-id query-id timeline-id (exploration-creator-id eq)))
      (:exploration_thread_id eq))))

(defn fail-pair!
  "Record a terminal scoring failure for `(query-id, timeline-id)`"
  [query-id timeline-id]
  (let [thread-id (t2/select-one-fn :exploration_thread_id :model/ExplorationQuery :id query-id)]
    (when thread-id
      (if-let [existing (t2/select-one [:model/ExplorationQueryTimelineInterestingness :id :scored_at]
                                       :exploration_query_id query-id :timeline_id timeline-id)]
        (when-not (:scored_at existing)
          (t2/update! :model/ExplorationQueryTimelineInterestingness (:id existing)
                      {:scored_at (OffsetDateTime/now)}))
        (t2/insert! :model/ExplorationQueryTimelineInterestingness
                    {:exploration_query_id query-id
                     :timeline_id          timeline-id
                     :scored_at            (OffsetDateTime/now)})))
    thread-id))

(defn- canceled-mid-plan-cleanup!
  "Planner-race repair: the user can cancel a thread *after* the plan message was published but
  *before* the planner inserted its rows. The cancel endpoint's bulk pending→canceled UPDATE only
  saw the rows that existed at cancel time; rows the planner inserted after that are still `pending`
  on a canceled thread. Flip them so the query table matches its owning thread's terminal state."
  [thread-id]
  (when (t2/exists? :model/ExplorationThread :id thread-id :canceled_at [:not= nil])
    (t2/update! :model/ExplorationQuery
                {:exploration_thread_id thread-id
                 :status                "pending"}
                {:status "canceled"})))

(defn plan-thread!
  "Run the LLM planner for `thread-id`, materializing its `ExplorationQuery` rows. Idempotent for MQ."
  [thread-id]
  (let [thread   (t2/select-one [:model/ExplorationThread :id :canceled_at :analysis_started_at] :id thread-id)
        planned? (cond
                   ;; `restart` deletes and re-creates a thread's work; a message for a thread that
                   ;; no longer exists is a no-op.
                   (nil? thread)
                   false

                   ;; The user canceled between publishing the message and delivering it. Don't
                   ;; spend an LLM call on work nobody is waiting for.
                   (:canceled_at thread)
                   (do (log/infof "Exploration thread %d was canceled; skipping planning" thread-id)
                       false)

                   ;; A plan that produced no queries completes its thread without inserting any
                   ;; ExplorationQuery rows, so the row-existence check below can't tell it apart from
                   ;; a never-planned thread. `analysis_started_at` — claimed once, synchronously,
                   ;; when the thread has no pending work — catches that case, so a redelivered plan
                   ;; message can't re-run the planner and resurrect a completed exploration.
                   (:analysis_started_at thread)
                   (do (log/infof "Exploration thread %d already completed its analysis; skipping planning" thread-id)
                       false)

                   (t2/exists? :model/ExplorationQuery :exploration_thread_id thread-id)
                   (do (log/infof "Exploration thread %d is already planned; skipping" thread-id)
                       false)

                   :else
                   (do (explorations.query-plan/generate-query-plan! thread-id)
                       true))]
    (canceled-mid-plan-cleanup! thread-id)
    planned?))

(defn fail-plan!
  "Durably record that the queue gave up on planning `thread-id`: write the same terminal state
  the planner's own failure path does (transcript, planning-failed doc, terminal stamp), so the
  client stops polling and sees why instead of an exploration that silently never fills in.
  `message` is the error that exhausted the retries.

  A thread that already has query rows is left alone - planning succeeded there, and a failing
  duplicate delivery must not stamp 'planning failed' over work that is in flight. Also flips any
  rows a canceled thread left `pending`."
  [thread-id message]
  (explorations.query-plan/record-terminal-planning-failure! thread-id message)
  (canceled-mid-plan-cleanup! thread-id))

(defn pending-query-ids
  "Ids of `thread-id`'s queries still awaiting execution."
  [thread-id]
  (t2/select-pks-vec :model/ExplorationQuery :exploration_thread_id thread-id :status "pending"))

(defn thread-timeline-ids
  "Ids of the timelines selected on `thread-id`, each of which is scored against every done query."
  [thread-id]
  (t2/select-fn-vec :timeline_id :model/ExplorationThreadTimeline :exploration_thread_id thread-id))
