(ns metabase.explorations.query-plan
  "Orchestrator for the Explorations query planner.

  Concrete planners implement
  `metabase.explorations.query-plan.planner/QueryPlanner` — see that
  namespace for the contract. This orchestrator selects one based on the
  `explorations-query-planner` setting + LLM availability, dispatches
  through the protocol, materializes the returned plan items into
  `ExplorationQuery` rows via the variant builders, persists the full
  transcript to `exploration_thread.query_plan_transcript`, and on a fatal
  failure terminally stamps the thread and replaces the AI Summary
  placeholder with a 'Planning failed' doc.

  Add a new planner by writing `metabase.explorations.query-plan.<name>`,
  defining a record that implements `QueryPlanner`, exposing a singleton
  instance, and teaching `pick-planner!` to dispatch to it."
  (:require
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.explorations.ai-summary :as ai-summary]
   [metabase.explorations.query-plan.adaptive :as qp.adaptive]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.explorations.query-plan.llm :as qp.llm]
   [metabase.explorations.query-plan.mechanical :as qp.mechanical]
   [metabase.explorations.query-plan.planner :as planner]
   [metabase.explorations.query-plan.variants :as qp.variants]
   [metabase.explorations.settings :as explorations.settings]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.request.core :as request]
   [metabase.util :as u]
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

  Setting `explorations-query-planner` (`:auto` / `:llm` / `:mechanical` /
  `:adaptive`):
   - `:auto`       — LLM when configured, otherwise mechanical (never skips).
   - `:llm`        — LLM if configured; if not, returns `{:skip :skip-no-llm}`.
   - `:mechanical` — always the mechanical planner.
   - `:adaptive`   — the greedy best-first loop (no LLM dependency).

  Public so tests can `with-redefs` it to inject a stub planner. The `!`
  suffix marks that it inspects mutable global state (the setting + the
  LLM-configured flag); it has no side effects of its own."
  []
  (let [choice (explorations.settings/explorations-query-planner)
        llm?   (metabot.settings/llm-metabot-configured?)]
    (case choice
      :auto       (if llm? qp.llm/planner qp.mechanical/planner)
      :llm        (if llm? qp.llm/planner {:skip :skip-no-llm})
      :mechanical qp.mechanical/planner
      :adaptive   qp.adaptive/planner
      ;; The setting's setter already restricts writes to `valid-query-planners`, so an
      ;; unrecognized value here means a new planner was added to that enum without a `case`
      ;; branch — a programming error worth surfacing, not silently running mechanical.
      ;; `generate-query-plan!`'s top-level catch keeps it from crashing more than this thread.
      (throw (ex-info "No planner wired for explorations-query-planner value"
                      {:value choice :valid explorations.settings/valid-query-planners})))))

;; ---------------------------------------------------------------------------
;; Plan materialization (planner-agnostic)
;; ---------------------------------------------------------------------------

(defn- segment-for
  [metric segment-id]
  (when segment-id
    (some #(when (= segment-id (:id %)) %) (:segments metric))))

(defn- materialize-item
  "Translate one plan item into a vector of row *recipes* via the variant's
  `plan-rows` multimethod, then enrich each recipe with its localized
  `:name` via `qp.variants/plan-time-name`.

  The `:name` is computed here but may be modified later for variants that fan out
  (and note that the mechanical planner doesn't choose any of these variants)."
  [metric-by-key item]
  (let [metric    (get metric-by-key [(:group_id item) (:metric_id item)])
        appl      (get-in metric [:applicability (:dimension_id item)])
        dim       (:dim appl)
        dim-label (or (:display_name dim) (:dimension_id dim))
        item-seg  (segment-for metric (get-in item [:params :segment_id]))
        plan-ctx  {:segment item-seg :params (:params item)}]
    (mapv (fn [recipe]
            (assoc recipe :name
                   (qp.variants/plan-time-name
                    (:query_type recipe)
                    {:card      (:card metric)
                     :dim-label dim-label
                     :segment   (segment-for metric (:segment_id recipe))
                     :params    (:params recipe)})))
          (qp.variants/plan-rows (:variant item) plan-ctx))))

(defn- insert-plan-rows!
  "Materialize each plan item into row recipes and insert them as
  `ExplorationQuery` rows. Returns the number of rows inserted."
  [thread-id metric-by-key plan]
  (let [rows (vec
              (for [item   plan
                    :let   [metric (get metric-by-key [(:group_id item) (:metric_id item)])]
                    recipe (try
                             (materialize-item metric-by-key item)
                             (catch Throwable e
                               (log/warnf e "Skipping plan item that failed to materialize: %s"
                                          (pr-str item))
                               []))]
                {:exploration_thread_id thread-id
                 :group_id              (:group_id item)
                 :card_id               (:metric_id item)
                 :database_id           (:database_id (:card metric))
                 :segment_id            (:segment_id recipe)
                 :dimension_id          (:dimension_id item)
                 :query_type            (:query_type recipe)
                 :display               (:display recipe)
                 :name                  (:name recipe)
                 :params                (:params recipe)
                 :status                "pending"}))]
    (when (seq rows)
      (t2/insert! :model/ExplorationQuery
                  (map-indexed (fn [i r] (assoc r :position i)) rows)))
    (count rows)))

;; ---------------------------------------------------------------------------
;; Failure path
;; ---------------------------------------------------------------------------

(defn- write-planning-failed-doc!
  "Replace the AI Summary placeholder with an error doc describing the
  planning failure. Best-effort: any secondary failure here is logged but
  never thrown."
  [thread-id creator-id final-errors]
  (try
    (when-let [doc (t2/select-one :model/Document
                                  :exploration_thread_id thread-id
                                  :name                  "AI Summary"
                                  :archived              false)]
      (when creator-id
        (request/with-current-user creator-id
          (t2/update! :model/Document (:id doc)
                      {:document     (ai-summary/error-doc
                                      {:phase        :query-plan
                                       :thread-id    thread-id
                                       :final-errors final-errors
                                       :detail       "Query planning failed. No queries were materialized; the exploration is empty."})
                       :content_type prose-mirror/prose-mirror-content-type}))))
    (catch Throwable e
      (log/warnf e "Failed to write Planning-failed doc for thread %d" thread-id))))

(defn- mark-thread-terminally-failed!
  "Stamp `analysis_started_at` and `completed_at` so the thread doesn't
  deadlock the AI Summary completion machinery (which waits for queries
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

(defn- record-outcome!
  "Persist a transcript with `:outcome` (and any extra kv pairs) merged onto `pre`."
  [thread-id pre outcome & {:as extras}]
  (save-transcript! thread-id (assoc (merge pre extras) :outcome outcome)))

(defn- preamble
  "Common transcript preamble: who chose what, when, with which planner."
  [thread-id planner-name]
  {:generated-at (u.date/format (Instant/now))
   :thread-id    thread-id
   :planner      planner-name
   :setting      (explorations.settings/explorations-query-planner)
   :llm-config   (when (= planner-name :llm) (qp.llm/llm-config))})

;; ---------------------------------------------------------------------------
;; Ctx building
;; ---------------------------------------------------------------------------

(defn- thread-prompt-for
  [thread-id]
  (t2/select-one-fn :prompt :model/ExplorationThread :id thread-id))

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
  (let [thread-groups  (t2/select :model/ExplorationThreadGroup
                                  :exploration_thread_id thread-id
                                  {:order-by [[:position :asc] [:id :asc]]})
        metric-dim-ctx (qp.context/metric-and-dim-context thread-groups)
        ;; [group-id metric-id] -> metric-context, so materialization resolves a plan
        ;; item against the same group the planner emitted it under (a metric can live
        ;; in several groups).
        metric-by-key  (into {}
                             (for [g (:groups metric-dim-ctx)
                                   m (:metrics g)]
                               [[(:group-id g) (:metric-id m)] m]))]
    {:thread-id      thread-id
     :thread-prompt  (thread-prompt-for thread-id)
     :metric-dim-ctx metric-dim-ctx
     :metric-by-key  metric-by-key
     :creator-id     (creator-id-for-thread thread-id)
     :thread-groups  thread-groups
     ;; Cooperative-cancellation probe: `plan!` now runs many live QP measurement queries, so a
     ;; planner that loops over groups can check this between them and bail early when the user
     ;; cancels mid-plan (the runner's `canceled-mid-plan-cleanup!` then reconciles any rows).
     :cancelled?     (fn [] (t2/exists? :model/ExplorationThread :id thread-id :canceled_at [:not= nil]))}))

;; ---------------------------------------------------------------------------
;; Public entry point — called from the worker
;; ---------------------------------------------------------------------------

(defn- safe-plan!
  "Invoke `picked`'s `plan!`, converting an uncaught throw into a `:failed`
  result so outcome handling (and the mechanical fallback) stays uniform. Logs
  the resolved planner, outcome, and wall-clock duration — `plan!` now runs live
  QP measurement queries, so its cost is worth tracing per thread."
  [picked planner-id {:keys [thread-id] :as ctx}]
  (let [timer  (u/start-timer)
        result (try
                 (planner/plan! picked ctx)
                 (catch Throwable e
                   (log/errorf e "Planner %s threw for thread %d" (name planner-id) thread-id)
                   {:outcome      :failed
                    :final-errors [(str "Planner " (name planner-id) " threw: "
                                        (or (ex-message e) (str e)))]}))]
    (log/infof "Query plan for thread %d (%s): plan! outcome=%s in %.0f ms"
               thread-id (name planner-id) (name (:outcome result))
               (u/since-ms timer))
    result))

(defn- fail-thread!
  "Shared terminal-failure path: persist the failed transcript, replace the AI
  Summary placeholder with an error doc, and terminally stamp the thread."
  [thread-id creator-id pre transcript-body final-errors]
  (record-outcome! thread-id pre :failed :transcript transcript-body)
  (write-planning-failed-doc! thread-id creator-id final-errors)
  (mark-thread-terminally-failed! thread-id)
  :failed)

(defn- run-planner!
  "Invoke the picked planner — falling back to the mechanical matrix when an
  adaptive/LLM planner fails — persist rows / mark terminal as appropriate, and
  return the outcome keyword (`:ok`, `:skip-empty`, or `:failed`)."
  [{:keys [thread-id metric-by-key creator-id] :as ctx} picked planner-id pre]
  (let [result0   (safe-plan! picked planner-id ctx)
        ;; Adaptive and LLM are built on top of the mechanical matrix, which runs no live
        ;; queries; if they fail, fall back to it before terminal-failing the thread.
        fell-back? (and (= :failed (:outcome result0))
                        (contains? #{:adaptive :llm} planner-id))
        [planner-id result]
        (if fell-back?
          (do (log/warnf "Query plan for thread %d (%s): planner failed; falling back to mechanical"
                         thread-id (name planner-id))
              [:mechanical (safe-plan! qp.mechanical/planner :mechanical ctx)])
          [planner-id result0])
        {:keys [outcome plan rationale transcript final-errors]} result
        transcript-body {:outcome      outcome
                         :rationale    rationale
                         :plan         plan
                         :final-errors final-errors
                         :planner      transcript
                         :planner-id   planner-id
                         :fell-back?   fell-back?}]
    (when (seq final-errors)
      (log/warnf "Query plan for thread %d (%s): planner reported %d soft error(s): %s"
                 thread-id (name planner-id) (count final-errors) (pr-str final-errors)))
    (case outcome
      :ok
      (let [emitted (count plan)
            n       (insert-plan-rows! thread-id metric-by-key plan)]
        (if (zero? n)
          ;; Items were emitted but none materialized → an empty exploration. That is a
          ;; failure, not a success: reporting :ok would leave the thread "completed" with
          ;; zero charts and no error (and run the AI summary over an empty thread).
          (do (log/warnf "Query plan for thread %d (%s): emitted %d item(s) but none materialized; treating as failed"
                         thread-id (name planner-id) emitted)
              (fail-thread! thread-id creator-id pre transcript-body final-errors))
          (do (record-outcome! thread-id pre :ok :rows-count n :transcript transcript-body)
              (log/infof "Query plan for thread %d (%s): emitted %d item(s), inserted %d ExplorationQuery rows"
                         thread-id (name planner-id) emitted n)
              (when (not= emitted n)
                (log/warnf "Query plan for thread %d (%s): %d of %d plan item(s) failed to materialize"
                           thread-id (name planner-id) (- emitted n) emitted))
              :ok)))

      :skip-not-applicable
      (do (log/infof "Query plan for thread %d (%s): planner reported nothing to do"
                     thread-id (name planner-id))
          (record-outcome! thread-id pre :skip-empty :transcript transcript-body)
          (mark-thread-terminally-failed! thread-id)
          :skip-empty)

      :failed
      (do (log/warnf "Query plan for thread %d (%s): planner failed; terminally marking thread"
                     thread-id (name planner-id))
          (fail-thread! thread-id creator-id pre transcript-body final-errors)))))

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
    (let [{:keys [thread-groups] :as ctx} (build-planner-ctx thread-id)
          picked     (pick-planner!)
          skip?      (:skip picked)
          planner-id (when-not skip? (planner/planner-name picked))
          pre        (preamble thread-id planner-id)]
      (when planner-id
        (log/infof "Thread %d: planner=%s (setting=%s llm-configured=%s)"
                   thread-id (name planner-id)
                   (explorations.settings/explorations-query-planner)
                   (metabot.settings/llm-metabot-configured?)))
      (cond
        (not-any? #(and (seq (:metrics %)) (seq (:dimensions %))) thread-groups)
        (do (log/infof "Thread %d: no group has both a metric and a dimension; skipping query plan" thread-id)
            (record-outcome! thread-id pre :skip-empty)
            :skip-empty)

        skip?
        (do (log/infof "Thread %d: planner setting=%s and LLM not configured; skipping" thread-id
                       (explorations.settings/explorations-query-planner))
            (record-outcome! thread-id pre skip?)
            skip?)

        :else
        (run-planner! ctx picked planner-id pre)))
    (catch Throwable e
      (log/errorf e "generate-query-plan! failed for thread %d" thread-id)
      (record-outcome! thread-id (preamble thread-id :unknown) :error
                       :error (.getMessage e))
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
  (t2/select-one-fn :query_plan_transcript :model/ExplorationThread :id thread-id))
