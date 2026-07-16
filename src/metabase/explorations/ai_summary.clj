(ns metabase.explorations.ai-summary
  "Two-phase LLM-driven AI Summary generation for a completed exploration thread.

  Invoked from `metabase.explorations.runner` after a thread has reached
  terminal state. The pipeline is split into two structured LLM calls so each
  can specialize:

  Phase 1 — Curation (see [[metabase.explorations.ai-summary.phase1]]).
    Sees a *thin* index of up to a few hundred pre-ranked charts (id, name, score,
    plus a one-line summary derived from `chart_stats`). Picks which charts deserve
    deep analysis (top tier: full data point grounding for citation) and which
    are awareness-only (model knows they exist but won't cite values).

  Phase 2 — Analysis (see [[metabase.explorations.ai-summary.phase2]]).
    Sees only what Phase 1 selected, with the curation rationale. Top-tier
    charts get full chart blocks (stats + key-points + verbatim data points);
    awareness-tier charts get slim blocks (title + summary + key-points). The
    model writes the research-paper-shaped AI Summary document.

  Both phases use extended thinking and both have one repair retry on validation
  failure. If either phase fails validation after repair, the document is replaced
  with a minimal *error document* that explains the failure — we never
  silently fall back to a different selection strategy. This is intentional
  during development: surface the failure so we can fix it.

  The user's manually-created `Findings` document is left untouched; the
  auto-generated artifact is a separate document per thread.

  This namespace is the orchestrator: [[generate-ai-summary!]] wires Phase 1
  and Phase 2 together, handles the success / failure / skip branches, writes
  the resulting `Document`, and materializes chart embeds. Shared
  chart-rendering and LLM-call infrastructure lives in
  [[metabase.explorations.ai-summary.common]]."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.documents.core :as documents]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.explorations.ai-summary.common :as common]
   [metabase.explorations.ai-summary.phase1 :as phase1]
   [metabase.explorations.ai-summary.phase2 :as phase2]
   [metabase.explorations.blocks :as blocks]
   [metabase.explorations.models.exploration-block :as block]
   [metabase.explorations.models.exploration-query-result :as eqr]
   [metabase.explorations.models.exploration-thread-timeline :as thread-timeline]
   [metabase.metabot.core :as metabot]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

;;; ----- pool sizing + thread-scoped data loading -----

(def ^:private max-charts-in-pool
  "Hard cap on charts in the Phase-1 curation pool. Filled by
  [[common/select-pool]], which balances across metrics (a single base metric's
  many breakouts can't monopolize the pool) rather than taking a pure global
  ranking — so what the cap trims is the least-relevant tail, spread fairly across
  metric views. Phase-1 index entries are one compact line each, so a few hundred
  fits comfortably in the curator's context."
  200)

(defn- load-result-rows
  "Returns `{exploration-query-id {:result-data bytes :chart-stats m :stored-result-id N
   :metric-description s :chart-description s}}` (kebab-case — these are massaged in-memory
   records, not raw appdb rows) for the given ids.

  Two selects rather than one `:left-join`: the two columns we need carry per-model Toucan
  transforms a raw join would bypass — `stored_result.result_data` is an *encrypted secret*
  column (`mi/transform-secret-value`) and `exploration_query_result.chart_stats` is EDN. We
  select each through its own model so both transforms run. Descriptions are LLM-generated
  during contextual scoring (see [[metabase.explorations.runner]])."
  [query-ids]
  (when (seq query-ids)
    (let [eqr-rows (t2/select [:model/ExplorationQueryResult
                               :exploration_query_id :stored_result_id :chart_stats
                               :metric_description :chart_description]
                              :exploration_query_id [:in query-ids])
          sr-ids   (keep :stored_result_id eqr-rows)
          sr-blobs (when (seq sr-ids)
                     (into {} (map (juxt :id :result_data))
                           (t2/select [:model/StoredResult :id :result_data]
                                      :id [:in sr-ids])))]
      (u/index-by :exploration_query_id
                  (fn [{:keys [stored_result_id chart_stats metric_description chart_description]}]
                    {:result-data        (get sr-blobs stored_result_id)
                     :chart-stats        chart_stats
                     :stored-result-id   stored_result_id
                     :metric-description metric_description
                     :chart-description  chart_description})
                  eqr-rows))))

(defn- selection-context
  "Plain-text recap of metric / dimension / timeline names selected on the
  thread, used to remind the LLM what the user was looking at."
  [thread-id]
  (let [metrics    (block/selected-metric-names thread-id)
        dimensions (block/selected-dimension-names thread-id)
        timelines  (thread-timeline/selected-names thread-id)]
    (cond-> []
      (seq metrics)    (conj (str "Metrics:    " (str/join ", " metrics)))
      (seq dimensions) (conj (str "Dimensions: " (str/join ", " dimensions)))
      (seq timelines)  (conj (str "Timelines:  " (str/join ", " timelines))))))

(def ^:private auto-doc-name
  "Name for the LLM-generated AI Summary document. Distinct from the
  user-owned 'Findings' doc that's auto-created at exploration time — that one
  is the user's working space and we never overwrite it."
  "AI Summary")

(defn placeholder-pm-doc
  "ProseMirror doc body shown while ai-summary generation is still running.
  The sidebar links to this doc the moment the exploration is created; we
  swap its `:document` content in-place when generation finishes (success,
  skip, or failure). Public because the API endpoint creates the doc at
  exploration-creation time, before any worker has touched the thread."
  []
  (documents/add-ids-to-nodes
   {:type    "doc"
    :content [{:type    "heading"
               :attrs   {:level 2}
               :content [{:type "text" :text (tru "Analysis underway…")}]}
              {:type    "paragraph"
               :content [{:type  "text"
                          :text  (tru "The {0} is generating. This page will update when it''s ready." auto-doc-name)
                          :marks [{:type "italic"}]}]}]}))

(defn current-user-can-create-ai-summary?
  "True when AI Summary can be generated for the **current user**. Must be called with the creator
  bound as the current user so the permission/usage checks resolve correctly."
  []
  (metabot/llm-call-available? :permission/metabot-other-tools))

(defn create-placeholder-doc!
  "Insert a fresh `AI Summary` document on `thread-id` owned by `creator-id`, populated with the
  `Analysis underway…` placeholder. `collection-id` should be the parent Exploration's collection
  so the doc lands beside it and inherits the same permissions. Caller must establish a
  current-user binding. The doc is created up-front by the exploration POST endpoint so the FE
  sidebar shows it immediately; the later `write-document!` in this namespace updates it in place."
  [thread-id creator-id collection-id]
  (u/prog1 (first
            (t2/insert-returning-instances! :model/Document
                                            {:name                  auto-doc-name
                                             :document              (placeholder-pm-doc)
                                             :content_type          prose-mirror/prose-mirror-content-type
                                             :creator_id            creator-id
                                             :collection_id         collection-id
                                             :exploration_thread_id thread-id}))
    (t2/update! :model/ExplorationThread thread-id
                {:ai_summary_document_id (:id <>)})))

(defn- find-placeholder-doc
  "Look up the AI Summary document for `thread-id`. Returns nil when
  none has been created yet (e.g. an old exploration created before the
  endpoint started pre-creating the placeholder); callers should defensively
  re-create it in that case."
  [thread-id]
  (t2/select-one :model/Document
                 :exploration_thread_id thread-id
                 :name                  auto-doc-name
                 :archived              false))

(defn- explore-further-thread?
  [thread-id]
  (->> (t2/select :model/ExplorationBlock :exploration_thread_id thread-id)
       (mapcat :metrics)
       (some (comp seq :explore_filters))
       boolean))

;;; ----- Error document — used when a phase fatally fails validation -----

(defn error-doc
  "Build a minimal ProseMirror document explaining why generation failed.
  Used when Phase 1 or Phase 2 hits validation errors that survived the
  repair retry. The doc is intentionally diagnostic, not pretty — this is
  development-time signal that something is wrong with the prompt, schema,
  or model behavior, and someone should look.

  Shared with `metabase.explorations.query-plan` so a planning failure can
  swap the same AI Summary placeholder doc to an error body."
  [{:keys [phase final-errors detail]}]
  (let [phase-label (case phase
                      :phase-1     "Phase 1 — Chart curation"
                      :phase-2     "Phase 2 — Analysis"
                      :query-plan  "Query plan — choosing which charts to run"
                      :uncaught    "an unexpected error before any phase ran"
                      (str phase))
        err-items   (mapv (fn [e]
                            {:type    "listItem"
                             :content [{:type    "paragraph"
                                        :content [{:type "text" :text e}]}]})
                          (or final-errors []))]
    (documents/add-ids-to-nodes
     {:type    "doc"
      :content (into []
                     cat
                     [[{:type    "heading"
                        :attrs   {:level 2}
                        :content [{:type "text" :text (str auto-doc-name " generation failed")}]}
                       {:type    "paragraph"
                        :content [{:type "text" :text "The failure happened in "}
                                  {:type  "text"
                                   :text  phase-label
                                   :marks [{:type "bold"}]}
                                  {:type "text" :text " after a repair retry."}]}
                       {:type    "heading"
                        :attrs   {:level 3}
                        :content [{:type "text" :text "Validation errors"}]}
                       (if (seq err-items)
                         {:type "bulletList" :content err-items}
                         {:type    "paragraph"
                          :content [{:type "text" :text "(no specific errors captured — see the server logs for details)"}]})]
                      (when detail
                        [{:type    "heading"
                          :attrs   {:level 3}
                          :content [{:type "text" :text "Details"}]}
                         {:type    "paragraph"
                          :content [{:type "text" :text detail}]}])
                      [{:type    "heading"
                        :attrs   {:level 3}
                        :content [{:type "text" :text "Next steps"}]}
                       {:type    "paragraph"
                        :content [{:type "text"
                                   :text "Re-running may succeed if this was a transient issue. Otherwise, check the server logs for the underlying error."}]}]])})))

;;; ----- Main entry point -----

(defn- prepend-disclaimer
  "Prepend an AI-generated disclaimer blockquote to the top of the PM doc.
  Reminds the reader that the analysis is machine-written and should be
  sanity-checked before being shared or acted on."
  [pm-doc]
  (let [disclaimer {:type    "blockquote"
                    :content [{:type    "paragraph"
                               :content [{:type  "text"
                                          :marks [{:type "italic"}]
                                          :text  (tru "Generated automatically by AI. It can miss context or get things wrong — read it over and trust your own judgment before sharing or acting on the findings.")}]}]}]
    (cond-> pm-doc
      (and (map? pm-doc) (sequential? (:content pm-doc)))
      (update :content (fn [content] (into [disclaimer] content))))))

(defn- coerce-int
  "Tolerate string-valued ids (the LLM sometimes returns them as JSON strings)."
  [v]
  (cond
    (integer? v) v
    (string? v)  (try (Long/parseLong v) (catch Throwable _ nil))))

(defn- card-embed? [node]
  (and (map? node) (= prose-mirror/card-embed-type (:type node))))

(defn- card-embed-stored-result-id [node]
  (coerce-int (get-in node [:attrs :stored_result_id])))

(defn- card-embed-id [node]
  (coerce-int (get-in node [:attrs :id])))

(defn- wrap-card-embeds-in-resize-nodes
  "Walk the LLM-generated PM doc and wrap every `cardEmbed` — at any depth, e.g. inside a
  `blockquote` — in a `resizeNode` so the FE node-view inherits an explicit height (matching
  the structure produced by the user-facing append endpoint). Without the wrapper, static
  cardEmbeds collapse to 0 height because `.cardEmbed` is `height: 100%` of an unsized parent.
  Wrapping happens at the parent's `:content` (skipping parents that are already `resizeNode`s)
  so an already-wrapped embed is never double-wrapped."
  [pm-doc]
  (letfn [(wrap [node]
            (if (card-embed? node)
              {:type "resizeNode" :attrs {:height 400} :content [node]}
              node))]
    (walk/postwalk
     (fn [node]
       (if (and (map? node)
                (not= "resizeNode" (:type node))
                (sequential? (:content node)))
         (update node :content (partial mapv wrap))
         node))
     pm-doc)))

(defn- materialize-cards-for-card-embeds
  "Walk every static `cardEmbed` in `pm-doc`, materialize a real `report_card` for each one
  that doesn't already carry an `:id`, and rewrite the node to include the new card id and a
  `:chart_href` deep link back to the source chart's group page in the exploration view. Each
  static embed ends up with both ids set: `:id` for display/viz/dataset_query, and
  `:stored_result_id` for the cached bytes. A failure on any single embed is logged but does not
  abort — the doc still renders the other embeds; the broken one will 404 at read time."
  [pm-doc {:keys [document-id collection-id creator exploration-id]}]
  (walk/postwalk
   (fn [node]
     (let [sr-id (when (card-embed? node) (card-embed-stored-result-id node))]
       (if (or (card-embed-id node) (not sr-id))
         node
         (try
           (let [eq-id (eqr/exploration-query-id-for-stored-result sr-id)
                 {:keys [card-id primary-eq]} (eqr/create-ephemeral-card-for-exploration-queries!
                                               [eq-id] document-id collection-id creator {})
                 chart-href (blocks/page-url exploration-id (:page_id primary-eq))]
             (-> node
                 (assoc-in [:attrs :id] card-id)
                 (assoc-in [:attrs :chart_href] chart-href)))
           (catch Throwable e
             (log/warnf e "Failed to materialize Card for stored_result %d in document %d"
                        sr-id document-id)
             node)))))
   pm-doc))

(defn- write-document!
  "Update the placeholder `doc` (created up-front by [[create-placeholder-doc!]])
  with the final content. For every static `cardEmbed` the LLM emitted (referencing a
  `stored_result_id`) materialize a `report_card` tied to this document and rewrite the embed
  to carry both ids; then wrap each embed in a `resizeNode` so the chart has an explicit height
  in the rendered doc. Returns the document id."
  [{:keys [doc pm-doc creator-id exploration-id]}]
  (request/with-current-user creator-id
    (let [creator (t2/select-one [:model/User :id] :id creator-id)
          pm-doc  (-> pm-doc
                      (materialize-cards-for-card-embeds {:document-id    (:id doc)
                                                          :collection-id  (:collection_id doc)
                                                          :creator        creator
                                                          :exploration-id exploration-id})
                      wrap-card-embeds-in-resize-nodes
                      documents/add-ids-to-nodes)]
      (t2/update! :model/Document (:id doc)
                  {:document     pm-doc
                   :content_type prose-mirror/prose-mirror-content-type})
      (:id doc))))

(defn- gate-closed-skip!
  "Log and return the `:skip-*` outcome for a closed pre-flight gate `reason`."
  [thread-id reason]
  (let [outcome (case reason
                  :metabot-disabled  :skip-metabot-disabled
                  :no-llm            :skip-no-llm
                  :usage-limit       :skip-usage-limit
                  :permission-denied :skip-no-permission)]
    (log/infof "Skipping AI Summary for thread %d: pre-flight gate closed (%s)"
               thread-id (name reason))
    outcome))

(defn- finalize-doc!
  "Write `pm-doc` through `write-document!`, log the resulting document id (at
  `:warn` for a failed outcome, `:info` otherwise), and return `outcome`. Shared
  by the phase-1-failed, phase-2-failed, and ok branches of [[run-phases!]]."
  [{:keys [placeholder-doc pm-doc creator-id exploration-id thread-id outcome]}]
  (let [document-id (write-document! {:doc            placeholder-doc
                                      :pm-doc         pm-doc
                                      :creator-id     creator-id
                                      :exploration-id exploration-id})]
    (log/logf (if (= :ok outcome) :info :warn)
              "AI Summary for thread %d: wrote document %d (%s)" thread-id document-id outcome)
    outcome))

(defn- run-phase-2!
  "Run Phase 2 (analysis) given Phase 1 succeeded. Builds the analysis prompt,
  invokes the analyst, and routes to a failure or success doc."
  [{:keys [thread-id thread creator-id placeholder-doc done-queries
           selections timelines breakouts breakouts-by-rep
           rationale top_tier awareness_tier]}]
  (let [top-breakouts       (u/keepv breakouts-by-rep top_tier)
        awareness-breakouts (u/keepv breakouts-by-rep awareness_tier)
        ;; both tiers: the model may embed awareness-tier charts too, and their prompt blocks
        ;; carry the same per-chart sort instruction (see `phase2/slim-block`).
        categorical-chart-ids (into #{}
                                    (comp (mapcat :variants)
                                          (filter #(-> % :cfg phase2/x-axis-kind (= :categorical)))
                                          (keep :stored-result-id))
                                    (concat top-breakouts awareness-breakouts))
        analysis-prompt   (phase2/build-analysis-prompt
                           {:thread-prompt       (:prompt thread)
                            :selections          selections
                            :curation-rationale  rationale
                            :timelines           timelines
                            :top-breakouts       top-breakouts
                            :awareness-breakouts awareness-breakouts
                            :total-chart-count   (count done-queries)
                            :pool-size           (count breakouts)})
        p2 (phase2/run-analysis! thread-id analysis-prompt categorical-chart-ids)
        common-args {:placeholder-doc placeholder-doc
                     :creator-id      creator-id
                     :exploration-id  (:exploration_id thread)
                     :thread-id       thread-id}]
    (if (= :failed (:outcome p2))
      (finalize-doc! (assoc common-args
                            :pm-doc  (error-doc
                                      {:phase        :phase-2
                                       :final-errors (:final-errors p2)
                                       :detail       "Phase 2 (analysis) failed validation after a repair retry."})
                            :outcome :phase-2-failed))
      (finalize-doc! (assoc common-args
                            :pm-doc  (prepend-disclaimer (:value p2))
                            :outcome :ok)))))

(defn- run-curation-phase!
  "Build the curation prompt and run Phase 1, returning the raw result."
  [{:keys [thread-id thread selections timelines breakouts breakouts-by-rep done-queries]}]
  (let [curation-prompt (phase1/build-curation-prompt
                         {:thread-prompt     (:prompt thread)
                          :selections        selections
                          :timelines         timelines
                          :index-entries     breakouts
                          :pool-size         (count breakouts)
                          :total-chart-count (count done-queries)})]
    (phase1/run-curation! thread-id curation-prompt (keys breakouts-by-rep))))

(defn- mid-run-skip!
  "Map a mid-run `ExceptionInfo` — a usage limit crossed (or perms revoked) *between* the
  pre-flight gate and a phase's actual LLM call — to the matching skip outcome. Anything
  else is rethrown to bubble to the outer `try` in [[generate-ai-summary!]]."
  [thread-id creator-id e]
  (case (:type (ex-data e))
    :metabot/permission-denied
    (do (log/infof "Skipping AI Summary for thread %d: creator %s lacks required metabot permissions"
                   thread-id creator-id)
        :skip-no-permission)

    :metabot/usage-limit-reached
    (do (log/infof "Skipping AI Summary for thread %d: AI usage limit reached (%s)"
                   thread-id (ex-message e))
        :skip-usage-limit)

    (throw e)))

(defn- run-phases!
  "Inner body of [[generate-ai-summary!]]: runs Phase 1 + Phase 2 inside a
  `with-current-user creator-id` binding so the LLM calls see the creator's
  metabot permissions / usage limits. The mid-run `ExceptionInfo` safety net routes a
  perms/usage change to a skip via [[mid-run-skip!]]."
  [{:keys [thread-id thread creator-id collection-id done-queries prepped
           selections timelines]}]
  (request/with-current-user creator-id
    (try
      (b/cond
        :let [placeholder-doc  (or (find-placeholder-doc thread-id)
                                   (create-placeholder-doc! thread-id creator-id collection-id))
              breakouts        (common/group-breakouts prepped)
              breakouts-by-rep (u/index-by :rep-id breakouts)
              p1               (run-curation-phase! {:thread-id        thread-id
                                                     :thread           thread
                                                     :selections       selections
                                                     :timelines        timelines
                                                     :breakouts        breakouts
                                                     :breakouts-by-rep breakouts-by-rep
                                                     :done-queries     done-queries})]

        (= :failed (:outcome p1))
        (finalize-doc! {:placeholder-doc placeholder-doc
                        :pm-doc          (error-doc
                                          {:phase        :phase-1
                                           :final-errors (:final-errors p1)
                                           :detail       "Chart curation failed validation after a repair retry."})
                        :creator-id      creator-id
                        :exploration-id  (:exploration_id thread)
                        :thread-id       thread-id
                        :outcome         :phase-1-failed})

        :let [{:keys [top_tier awareness_tier rationale]} (:value p1)]

        :else
        (run-phase-2! {:thread-id        thread-id
                       :thread           thread
                       :creator-id       creator-id
                       :placeholder-doc  placeholder-doc
                       :done-queries     done-queries
                       :selections       selections
                       :timelines        timelines
                       :breakouts        breakouts
                       :breakouts-by-rep breakouts-by-rep
                       :rationale        rationale
                       :top_tier         top_tier
                       :awareness_tier   awareness_tier}))
      (catch ExceptionInfo e
        (mid-run-skip! thread-id creator-id e)))))

(defn- prepare-pool
  "Load the Phase-1 curation pool for `thread-id`: select the done queries,
  trim to the metric-balanced cap, load result rows + cached stats, and prep
  each chart. Returns `{:done-queries :prepped :selections :timelines}`
  ready to hand to [[run-phases!]]."
  [thread-id]
  (let [done-queries (t2/hydrate
                      (t2/select :model/ExplorationQuery
                                 :exploration_thread_id thread-id
                                 :status "done")
                      :interestingness_score
                      :contextual_interestingness_score)
        ;; metric-balanced selection decides *which* charts survive the cap;
        ;; re-sort the survivors by `chart-rank-key` so the index reads best-first.
        pool-queries (->> (common/select-pool max-charts-in-pool done-queries)
                          (sort-by common/chart-rank-key u/reverse-compare)
                          vec)
        result-rows  (load-result-rows (map :id pool-queries))
        prepped      (u/keepv (fn [q] (common/prep-chart q (get result-rows (:id q))))
                              pool-queries)
        timelines    (thread-timeline/load-timeline-events thread-id)]
    {:done-queries done-queries
     :prepped      prepped
     :selections   (selection-context thread-id)
     :timelines    timelines}))

(defn- skip-no-charts!
  "Log and return the `:skip-no-charts` outcome."
  [thread-id]
  (log/infof "No usable chart blocks for thread %d; skipping AI Summary" thread-id)
  :skip-no-charts)

(defn- skip-explore-further!
  [thread-id]
  (log/infof "Thread %d came from an \"Explore further\" drill; skipping AI Summary" thread-id)
  :skip-explore-further)

(defn- handle-uncaught-error!
  "Best-effort cleanup after an uncaught throwable in [[generate-ai-summary!]]:
  swap the placeholder doc for an error body so the user doesn't stare at a
  spinner forever. Defensive — this branch may run before a placeholder was
  created, the thread may have been deleted, or the doc may have been archived;
  secondary failures are swallowed rather than masking the original throw."
  [thread-id ^Throwable e]
  (log/errorf e "generate-ai-summary! failed for thread %d" thread-id)
  (try
    (let [thread     (t2/select-one [:model/ExplorationThread :id :exploration_id]
                                    :id thread-id)
          creator-id (when thread
                       (:creator_id
                        (t2/select-one [:model/Exploration :creator_id]
                                       :id (:exploration_id thread))))
          doc        (find-placeholder-doc thread-id)]
      (when (and doc creator-id)
        (request/with-current-user creator-id
          (t2/update! :model/Document (:id doc)
                      {:document     (error-doc {:phase        :uncaught
                                                 :final-errors [(or (ex-message e) (.toString e))]
                                                 :detail       "Unexpected error generating the document."})
                       :content_type prose-mirror/prose-mirror-content-type}))))
    (catch Throwable e2
      (log/warnf e2 "Failed to write error doc for thread %d after generate-ai-summary! failure" thread-id)))
  nil)

(defn generate-ai-summary!
  "Two-phase generation of the `AI Summary` document for `thread-id`.
  Always inserts a new document — the manually-created `Findings` doc is the
  user's working space and is left untouched.

  If either phase fails validation after a repair retry, the document is
  replaced with a minimal *error document* that explains the failure.
  We do not silently fall back to a different selection strategy during
  development — failures are surfaced so they can be fixed.

  Returns `:ok` on success, a keyword reason on graceful skip
  (`:skip-metabot-disabled`, `:skip-no-llm`, `:skip-usage-limit`, `:skip-no-permission`,
  `:skip-no-charts`, `:skip-explore-further`), `:phase-1-failed` / `:phase-2-failed` when the
  corresponding phase couldn't be repaired, or `nil` on an uncaught throwable (logged but never
  thrown)."
  [thread-id]
  (try
    (b/cond
      :let [thread (t2/select-one [:model/ExplorationThread :id :prompt :exploration_id]
                                  :id thread-id)]

      (nil? thread)
      (do (log/warnf "Thread %d not found" thread-id) nil)

      (explore-further-thread? thread-id)
      (skip-explore-further! thread-id)

      :let [exploration (t2/select-one [:model/Exploration :creator_id :collection_id]
                                       :id (:exploration_id thread))
            creator-id  (:creator_id exploration)
            reason      (request/with-current-user creator-id
                          (metabot/llm-call-unavailable-reason :permission/metabot-other-tools))]

      reason
      (gate-closed-skip! thread-id reason)

      :let [{:keys [done-queries prepped selections timelines]}
            (prepare-pool thread-id)]

      (empty? prepped)
      (skip-no-charts! thread-id)

      ;; The placeholder doc is created up-front by the exploration POST endpoint so the FE sidebar
      ;; shows it the moment the exploration is created. Every branch in `run-phases!`
      ;; (phase-1-failed, phase-2-failed, ok) swaps this doc's body in place — we never insert a
      ;; second doc. When it's missing, `run-phases!` re-creates it.
      :else
      (run-phases! {:thread-id     thread-id
                    :thread        thread
                    :creator-id    creator-id
                    :collection-id (:collection_id exploration)
                    :done-queries  done-queries
                    :prepped       prepped
                    :selections    selections
                    :timelines     timelines}))
    (catch Throwable e
      (handle-uncaught-error! thread-id e))))
