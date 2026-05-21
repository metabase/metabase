(ns metabase.explorations.query-plan
  "Orchestrator for the Explorations query planner.

  Concrete planners implement
  `metabase.explorations.query-plan.planner/QueryPlanner` — see that
  namespace for the contract. This orchestrator selects one based on the
  `explorations-query-planner` setting + LLM availability, dispatches
  through the protocol, materializes the returned plan items into
  `ExplorationQuery` rows via the variant builders, persists the full
  transcript to `exploration_thread.query_plan_transcript`, and on a fatal
  failure terminally stamps the thread and replaces the Auto-Insights
  placeholder with a 'Planning failed' doc.

  Add a new planner by writing `metabase.explorations.query-plan.<name>`,
  defining a record that implements `QueryPlanner`, exposing a singleton
  instance, and teaching `pick-planner!` to dispatch to it."
  (:require
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.explorations.auto-insights :as auto-insights]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.explorations.query-plan.llm :as qp.llm]
   [metabase.explorations.query-plan.mbql :as qp.mbql]
   [metabase.explorations.query-plan.mechanical :as qp.mechanical]
   [metabase.explorations.query-plan.planner :as planner]
   [metabase.explorations.query-plan.variants :as qp.variants]
   [metabase.explorations.settings :as explorations.settings]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.request.core :as request]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant OffsetDateTime)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Planner selection
;; ---------------------------------------------------------------------------

(defn pick-planner!
  "Decide which planner to invoke. Returns either:
    - a `QueryPlanner` instance the caller should dispatch through, or
    - `{:skip <reason-keyword>}` when the caller should skip entirely.

  Setting `explorations-query-planner` (`:auto` / `:llm` / `:mechanical`):
   - `:auto`       — LLM when configured, otherwise mechanical (never skips).
   - `:llm`        — LLM if configured; if not, returns `{:skip :skip-no-llm}`.
   - `:mechanical` — always the mechanical planner.

  Public so tests can `with-redefs` it to inject a stub planner. The `!`
  suffix marks that it inspects mutable global state (the setting + the
  LLM-configured flag); it has no side effects of its own."
  []
  (let [choice (explorations.settings/explorations-query-planner)
        llm?   (metabot.settings/llm-metabot-configured?)]
    (case choice
      :auto       (if llm? qp.llm/planner qp.mechanical/planner)
      :llm        (if llm? qp.llm/planner {:skip :skip-no-llm})
      :mechanical qp.mechanical/planner)))

;; ---------------------------------------------------------------------------
;; Plan materialization (planner-agnostic)
;; ---------------------------------------------------------------------------

(defn- segment-for
  [metric segment-id]
  (when segment-id
    (some #(when (= segment-id (:id %)) %) (:segments metric))))

(defn- materialize-item
  "Translate one plan item to a vector of candidate maps via its variant
  builder. Returns `[]` when the builder can't produce anything (e.g.
  discovery query returned no rows) — the caller logs and continues.

  For `per-value-time-series` we pre-resolve the temporal axis (LLM-chosen
  override or metric default) and thread it into the builder ctx. Mechanical
  plan items never carry `:temporal_dimension_id`, so the resolution falls
  through to the metric default and `:temporal-target` is nil — both paths
  are equivalent through `variants/build`."
  [metric-by-id item]
  (let [metric  (get metric-by-id (:metric_id item))
        appl    (get-in metric [:applicability (:dimension_id item)])
        dim     (:dim appl)
        target  (:target appl)
        segment (segment-for metric (get-in item [:params :segment_id]))
        t-res   (when (= "per-value-time-series" (:variant item))
                  (qp.llm/temporal-axis-resolution metric (:params item) 0 (:dimension_id item)))
        ctx     {:mp              (:mp metric)
                 :card            (:card metric)
                 :target          target
                 :dim             dim
                 :dim-label       (or (:display_name dim) (:dimension_id dim))
                 :segment         segment
                 :params          (:params item)
                 :temporal-target (when (= :chosen (:from t-res)) (:target t-res))
                 :temporal-dim    (when (= :chosen (:from t-res)) (:dim t-res))}]
    (qp.variants/build (:variant item) ctx)))

(defn- insert-plan-rows!
  "Materialize each plan item via its variant builder and insert the resulting
  `ExplorationQuery` rows. Builders that fail to produce anything (discovery
  query empty, unexpected throw) are logged and skipped. Returns the number
  of rows inserted."
  [thread-id metric-by-id plan]
  (let [rows (vec
              (for [item plan
                    candidate (try
                                (materialize-item metric-by-id item)
                                (catch Throwable e
                                  (log/warnf e "Skipping plan item that failed to materialize: %s"
                                             (pr-str item))
                                  []))]
                {:exploration_thread_id thread-id
                 :card_id               (:metric_id item)
                 :segment_id            (:segment_id candidate)
                 :dimension_id          (:dimension_id item)
                 :query_type            (:query_type candidate)
                 :display               (:display candidate)
                 :name                  (:name candidate)
                 :dataset_query         (:dataset_query candidate)
                 :status                "pending"}))]
    (when (seq rows)
      (t2/insert! :model/ExplorationQuery
                  (map-indexed (fn [i r] (assoc r :position i)) rows)))
    (count rows)))

;; ---------------------------------------------------------------------------
;; Failure path
;; ---------------------------------------------------------------------------

(defn- write-planning-failed-doc!
  "Replace the Auto-Insights placeholder with an error doc describing the
  planning failure. Best-effort: any secondary failure here is logged but
  never thrown."
  [thread-id creator-id final-errors]
  (try
    (when-let [doc (t2/select-one :model/Document
                                  :exploration_thread_id thread-id
                                  :name                  "Automatic Insights"
                                  :archived              false)]
      (when creator-id
        (request/with-current-user creator-id
          (t2/update! :model/Document (:id doc)
                      {:document     (auto-insights/error-doc
                                      {:phase        :query-plan
                                       :thread-id    thread-id
                                       :final-errors final-errors
                                       :detail       "Query planning failed. No queries were materialized; the exploration is empty."})
                       :content_type prose-mirror/prose-mirror-content-type}))))
    (catch Throwable e
      (log/warnf e "Failed to write Planning-failed doc for thread %d" thread-id))))

(defn- mark-thread-terminally-failed!
  "Stamp `analysis_started_at` and `completed_at` so the thread doesn't
  deadlock the auto-insights completion machinery (which waits for queries
  to finish — but there are no queries)."
  [thread-id]
  (let [now (OffsetDateTime/now)]
    (t2/update! :model/ExplorationThread thread-id
                {:analysis_started_at now
                 :completed_at        now})))

;; ---------------------------------------------------------------------------
;; Transcript persistence
;; ---------------------------------------------------------------------------

(defn- save-transcript!
  [thread-id transcript]
  (try
    (t2/update! :model/ExplorationThread thread-id
                {:query_plan_transcript transcript})
    (catch Throwable e
      (log/warnf e "Failed to save query-plan transcript for thread %d" thread-id))))

(defn- preamble
  "Common transcript preamble: who chose what, when, with which planner."
  [thread-id planner-name]
  {:generated-at (u.date/format (Instant/now))
   :thread-id    thread-id
   :planner      planner-name
   :setting      (explorations.settings/explorations-query-planner)
   :llm-config   (when (= planner-name :llm) qp.llm/llm-config)})

;; ---------------------------------------------------------------------------
;; Ctx building
;; ---------------------------------------------------------------------------

(defn- thread-prompt-for
  [thread-id]
  (:prompt (t2/select-one [:model/ExplorationThread :id :prompt] :id thread-id)))

(defn- creator-id-for-thread
  [thread-id]
  (t2/select-one-fn :creator_id :model/Exploration
                    {:join  [:exploration_thread
                             [:= :exploration_thread.exploration_id :exploration.id]]
                     :where [:= :exploration_thread.id thread-id]}))

(defn- build-planner-ctx
  "Build the planner-contract ctx the chosen planner consumes. Pure compute
  modulo the t2 selects for thread / metrics / dims."
  [thread-id]
  (let [thread-metrics (t2/select :model/ExplorationThreadMetric
                                  :exploration_thread_id thread-id
                                  {:order-by [[:position :asc] [:id :asc]]})
        thread-dims    (t2/select :model/ExplorationThreadDimension
                                  :exploration_thread_id thread-id
                                  {:order-by [[:position :asc] [:id :asc]]})
        metric-dim-ctx (qp.context/metric-and-dim-context thread-metrics thread-dims)]
    {:thread-id      thread-id
     :thread-prompt  (thread-prompt-for thread-id)
     :metric-dim-ctx metric-dim-ctx
     :metric-by-id   (into {} (map (juxt :metric-id identity)) (:metrics metric-dim-ctx))
     :creator-id     (creator-id-for-thread thread-id)
     :thread-metrics thread-metrics
     :thread-dims    thread-dims}))

;; ---------------------------------------------------------------------------
;; Public entry point — called from the worker
;; ---------------------------------------------------------------------------

(defn generate-query-plan!
  "Build a query plan for `thread-id` and materialize ExplorationQuery rows.

  Returns one of:
    `:ok`                — plan succeeded, rows inserted, transcript written
    `:skip-no-llm`       — `explorations-query-planner :llm` set but no LLM
                           configured (mechanical fallback disabled)
    `:skip-empty`        — thread has no metrics or no dimensions
    `:failed`            — planner reported failure; thread terminally
                           stamped, placeholder doc replaced with error
    `nil`                — uncaught throwable (logged, transcript best-effort)"
  [thread-id]
  (try
    (let [{:keys [thread-metrics thread-dims metric-dim-ctx metric-by-id creator-id]
           :as ctx} (build-planner-ctx thread-id)
          picked     (pick-planner!)
          skip?      (:skip picked)
          planner-id (when-not skip? (planner/planner-name picked))
          pre        (preamble thread-id planner-id)]
      (cond
        (or (empty? thread-metrics) (empty? thread-dims))
        (do (log/infof "Thread %d: no metrics or no dimensions; skipping query plan" thread-id)
            (save-transcript! thread-id (assoc pre :outcome :skip-empty))
            :skip-empty)

        skip?
        (do (log/infof "Thread %d: planner setting=%s and LLM not configured; skipping" thread-id
                       (explorations.settings/explorations-query-planner))
            (save-transcript! thread-id (assoc pre :outcome skip?))
            skip?)

        :else
        (do
          ;; Enforce the no-routed-databases constraint up front; both planners would
          ;; produce items but the variant builders would later fail when running queries.
          (qp.mbql/check-no-routed-databases!
           (into {} (for [m (:metrics metric-dim-ctx)] [(:metric-id m) (:card m)])))
          (let [{:keys [outcome plan rationale transcript final-errors]} (planner/plan! picked ctx)
                transcript-body {:outcome      outcome
                                 :rationale    rationale
                                 :plan         plan
                                 :final-errors final-errors
                                 :planner      transcript}]
            (case outcome
              :ok
              (let [n (insert-plan-rows! thread-id metric-by-id plan)]
                (save-transcript! thread-id (assoc pre
                                                   :outcome    :ok
                                                   :rows-count n
                                                   :transcript transcript-body))
                (log/infof "Query plan for thread %d (%s): inserted %d ExplorationQuery rows"
                           thread-id (name planner-id) n)
                :ok)

              :skip-not-applicable
              (do (log/infof "Query plan for thread %d (%s): planner reported nothing to do"
                             thread-id (name planner-id))
                  (save-transcript! thread-id (assoc pre
                                                     :outcome    :skip-empty
                                                     :transcript transcript-body))
                  ;; Treat as empty — no rows, no error doc. Mark terminally done so
                  ;; the completion machinery doesn't wait forever.
                  (mark-thread-terminally-failed! thread-id)
                  :skip-empty)

              :failed
              (do (log/warnf "Query plan for thread %d (%s): planner failed; terminally marking thread"
                             thread-id (name planner-id))
                  (save-transcript! thread-id (assoc pre
                                                     :outcome    :failed
                                                     :transcript transcript-body))
                  (write-planning-failed-doc! thread-id creator-id final-errors)
                  (mark-thread-terminally-failed! thread-id)
                  :failed))))))
    (catch Throwable e
      (log/errorf e "generate-query-plan! failed for thread %d" thread-id)
      (save-transcript! thread-id (assoc (preamble thread-id :unknown)
                                         :outcome :error
                                         :error   (.getMessage e)))
      (try
        (write-planning-failed-doc! thread-id
                                    (creator-id-for-thread thread-id)
                                    [(or (.getMessage e) (.toString e))])
        (mark-thread-terminally-failed! thread-id)
        (catch Throwable e2
          (log/warnf e2 "Secondary failure after generate-query-plan! threw for thread %d" thread-id)))
      nil)))

;; ---------------------------------------------------------------------------
;; Debug helpers
;; ---------------------------------------------------------------------------

(defn debug-transcript
  "Return the persisted query-plan transcript for `thread-id`."
  [thread-id]
  (:query_plan_transcript
   (t2/select-one [:model/ExplorationThread :id :query_plan_transcript] :id thread-id)))
