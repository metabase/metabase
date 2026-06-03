(ns metabase.explorations.ai-summary
  "Two-phase LLM-driven AI Summary generation for a completed exploration thread.

  Invoked from `metabase.explorations.task.runner` after a thread has reached
  terminal state. The pipeline is split into two structured LLM calls so each
  can specialize:

  Phase 1 — Curation (see [[metabase.explorations.ai-summary.phase1]]).
    Sees a *thin* index of up to 100 pre-ranked charts (id, name, score, plus a
    one-line summary derived from `chart_stats`). Picks which charts deserve
    deep analysis (top tier: full data point grounding for citation) and which
    are awareness-only (model knows they exist but won't cite values).

  Phase 2 — Analysis (see [[metabase.explorations.ai-summary.phase2]]).
    Sees only what Phase 1 selected, with the curation rationale. Top-tier
    charts get full chart blocks (stats + key-points + verbatim data points);
    awareness-tier charts get slim blocks (title + summary + key-points). The
    model writes the research-paper-shaped AI Summary document.

  Both phases use extended thinking, both have one repair retry on validation
  failure, both have their prompt / response / reasoning persisted to the
  thread's `ai_summary_transcript` column for after-the-fact debugging.
  If either phase fails validation after repair, the document is replaced
  with a minimal *error document* that explains the failure — we never
  silently fall back to a different selection strategy. This is intentional
  during development: surface the failure so we can fix it.

  The user's manually-created `Findings` document is left untouched; the
  auto-generated artifact is a separate document per thread.

  This namespace is the orchestrator: [[generate-ai-summary!]] wires Phase 1
  and Phase 2 together, handles the success / failure / skip branches, writes
  the resulting `Document`, materializes chart embeds, persists the transcript,
  and exposes the `debug-*` REPL helpers. Shared chart-rendering and LLM-call
  infrastructure lives in [[metabase.explorations.ai-summary.common]]."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.explorations.ai-summary.common :as common]
   [metabase.explorations.ai-summary.phase1 :as phase1]
   [metabase.explorations.ai-summary.phase2 :as phase2]
   [metabase.explorations.groups :as groups]
   [metabase.explorations.models.exploration-query-result :as eqr]
   [metabase.explorations.models.exploration-thread-group :as thread-group]
   [metabase.explorations.models.exploration-thread-timeline :as thread-timeline]
   [metabase.metabot.core :as metabot]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (java.time Instant)))

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
  during contextual scoring (see [[metabase.explorations.task.runner]])."
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
      (into {}
            (map (fn [{:keys [exploration_query_id stored_result_id chart_stats
                              metric_description chart_description]}]
                   [exploration_query_id {:result-data        (get sr-blobs stored_result_id)
                                          :chart-stats        chart_stats
                                          :stored-result-id   stored_result_id
                                          :metric-description metric_description
                                          :chart-description  chart_description}]))
            eqr-rows))))

(defn- selection-context
  "Plain-text recap of metric / dimension / timeline names selected on the
  thread, used to remind the LLM what the user was looking at."
  [thread-id]
  (let [metrics    (thread-group/selected-metric-names thread-id)
        dimensions (thread-group/selected-dimension-names thread-id)
        timelines  (thread-timeline/selected-names thread-id)]
    (cond-> []
      (seq metrics)    (conj (str "Metrics:    " (str/join ", " metrics)))
      (seq dimensions) (conj (str "Dimensions: " (str/join ", " dimensions)))
      (seq timelines)  (conj (str "Timelines:  " (str/join ", " timelines))))))

(defn- save-transcript!
  "Persist the debug transcript for a generation run on `exploration_thread`.
  Failure to save is logged but never thrown — the transcript is purely for
  debugging and must not break the main flow."
  [thread-id transcript]
  (try
    (t2/update! :model/ExplorationThread thread-id
                {:ai_summary_transcript transcript})
    (catch Throwable e
      (log/warnf e "Failed to save AI Summary transcript for thread %d" thread-id))))

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
  {:type    "doc"
   :content [{:type    "heading"
              :attrs   {:level 2}
              :content [{:type "text" :text (tru "Analysis underway…")}]}
             {:type    "paragraph"
              :content [{:type  "text"
                         :text  (tru "The {0} is generating. This page will update when it''s ready." auto-doc-name)
                         :marks [{:type "italic"}]}]}]})

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

;;; ----- Debug helpers (REPL-friendly accessors for the persisted transcript) -----

(defn debug-transcript
  "Return the full AI Summary transcript for `thread-id`, or nil when
  no transcript has been written yet. Includes pool info, both phase prompts
  and attempts, the curation, the final document, and the outcome keyword."
  [thread-id]
  (t2/select-one-fn :ai_summary_transcript :model/ExplorationThread :id thread-id))

(defn- get-phases
  "Apply `f` to each phase sub-map of a transcript, returning
  `{:phase-1 (f phase-1) :phase-2 (f phase-2)}`."
  [{:keys [phase-1 phase-2]} f]
  {:phase-1 (f phase-1)
   :phase-2 (f phase-2)})

(defn- attempt-reasonings
  "Extract per-attempt reasoning entries from an attempts vector. Each entry is
  one of:
    - `{:attempt N :reasoning \"...\"}` — readable extended-thinking text.
    - `{:attempt N :opaque? true}`     — thinking ran but the API returned
      only encrypted signature blocks (currently the case for Opus 4.7 with
      adaptive thinking), so we have no text to display. Surfacing this as a
      stub rather than dropping the entry lets the renderer flag *that*
      thinking happened without pretending the trace is there.
  Attempts with no reasoning content block at all are dropped entirely."
  [attempts]
  (u/keepv
   (fn [{:keys [attempt trace]}]
     (or (when-let [text (not-empty (:reasoning trace))]
           {:attempt attempt :reasoning text})
         ;; A reasoning content block was emitted iff `summarize-parts` saw at least one
         ;; `:type :reasoning` chunk in the raw parts list. With readable thinking the text is
         ;; also populated; with opaque/encrypted thinking we only get the part with an empty
         ;; `:reasoning` field.
         (when (some #(= :reasoning (:type %)) (:all trace))
           {:attempt attempt :opaque? true})))
   attempts))

(defn debug-reasoning
  "Return the extended-thinking traces for `thread-id` as a map keyed by phase:
  `{:phase-1 [{:attempt N :reasoning \"...\"} ...]
    :phase-2 [...]}`. Each entry includes the model's deliberation for that
  attempt. Empty vectors when thinking was disabled or no reasoning emitted."
  [thread-id]
  (-> (debug-transcript thread-id)
      (get-phases :attempts)
      (update-vals attempt-reasonings)))

(defn debug-prompt
  "Return both phase prompts: `{:phase-1 \"...\" :phase-2 \"...\"}`. Phase-2 is
  nil when the run didn't reach Phase 2."
  [thread-id]
  (-> (debug-transcript thread-id)
      (get-phases :prompt)))

(defn debug-document
  "Return the ProseMirror document the analyst (Phase 2) produced, pre-chart-
  materialization. Nil when Phase 2 didn't succeed."
  [thread-id]
  (-> thread-id debug-transcript :phase-2 :final-pm-doc))

(defn debug-curation
  "Return the Phase-1 curation map: `{:top_tier [...] :awareness_tier [...]
  :rationale \"...\"}`. Nil when Phase 1 didn't succeed."
  [thread-id]
  (-> thread-id debug-transcript :phase-1 :curation))

;;; ----- Reasoning section rendering -----

(defn- reasoning-paragraphs
  "Split a raw reasoning string on blank lines into prose-mirror paragraph nodes."
  [reasoning]
  (into []
        (comp (map str/trim)
              (remove str/blank?)
              (map (fn [p]
                     {:type    "paragraph"
                      :content [{:type "text" :text p}]})))
        (str/split reasoning #"\n\s*\n")))

(def ^:private opaque-thinking-blocks
  "Stub body for an attempt where extended thinking ran but the trace came
  back encrypted (e.g. Opus 4.7 adaptive thinking — Anthropic returns only a
  cryptographic signature, no readable `thinking_delta` events). One italic
  paragraph so the section shows up rather than being silently dropped."
  [{:type    "paragraph"
    :content [{:type  "text"
               :text  "The model used extended thinking on this attempt, but the trace came back encrypted and could not be displayed."
               :marks [{:type "italic"}]}]}])

(defn- attempt-blocks
  "Render one reasoning-attempt entry as a list of prose-mirror blocks.
  Readable entries produce one paragraph per blank-line-separated chunk;
  opaque entries (thinking ran but the text was encrypted) produce the
  italic stub."
  [{:keys [reasoning opaque?]}]
  (cond
    reasoning (reasoning-paragraphs reasoning)
    opaque?   opaque-thinking-blocks
    :else     []))

(defn- prompt-blocks
  "Render the full prompt sent to the model as a level-4 sub-section followed by
  blank-line-split paragraphs. Returns [] when `prompt` is blank."
  [prompt]
  (if (str/blank? prompt)
    []
    (into [{:type    "heading"
            :attrs   {:level 4}
            :content [{:type "text" :text "Prompt sent to model"}]}]
          (reasoning-paragraphs prompt))))

(defn- reasonings-blocks
  "Render a vector of reasoning-attempt entries as prose-mirror blocks.
  Single-attempt sequences are rendered flat; multi-attempt sequences use
  level-4 sub-headings to separate each attempt."
  [reasonings]
  (if (= 1 (count reasonings))
    (attempt-blocks (first reasonings))
    (mapcat (fn [{:keys [attempt] :as entry}]
              (cons {:type    "heading"
                     :attrs   {:level 4}
                     :content [{:type "text" :text (str "Attempt " attempt)}]}
                    (attempt-blocks entry)))
            reasonings)))

(defn- repl-helpers-blocks
  "Build the prose-mirror block list that documents the REPL helpers a
  developer can call to dig into this thread's debug info."
  [thread-id]
  (let [calls [["debug-transcript" "full transcript — pool, both phase prompts, attempts, curation, final doc, outcome"]
               ["debug-reasoning"  "extended-thinking traces, grouped by phase"]
               ["debug-prompt"     "both phase prompts (map with :phase-1 and :phase-2 keys)"]
               ["debug-curation"   "the Phase-1 curation map (top_tier / awareness_tier / rationale)"]
               ["debug-document"   "the Phase-2 ProseMirror doc (pre-chart-materialization)"]]]
    (into [{:type    "heading"
            :attrs   {:level 3}
            :content [{:type "text" :text "REPL helpers"}]}
           {:type    "paragraph"
            :content [{:type "text"
                       :text "Run these from a Clojure REPL to inspect this thread's debug info:"}]}]
          (map (fn [[fn-name doc]]
                 {:type    "paragraph"
                  :content [{:type  "text"
                             :text  (format "(metabase.explorations.ai-summary/%s %d)"
                                            fn-name thread-id)
                             :marks [{:type "code"}]}
                            {:type "text" :text (str " — " doc)}]})
               calls))))

(defn- append-reasoning-section
  "Append a `Reasoning` debug section to the end of `pm-doc`. Includes:
   - Phase-1 (curation) rationale + reasoning attempts
   - Phase-2 (analysis) reasoning attempts
   - REPL helpers footer
  Sub-sections are at heading level 3; per-attempt headings (when >1 attempt
  in a phase) are level 4. No-op when nothing useful to show."
  [pm-doc {:keys [phase-1 phase-2 thread-id]}]
  (let [p1-reasonings (:reasonings phase-1)
        p2-reasonings (:reasonings phase-2)
        rationale     (:rationale phase-1)
        p1-blocks (when (or (seq p1-reasonings) (seq rationale) (:prompt phase-1))
                    (concat
                     [{:type    "heading"
                       :attrs   {:level 3}
                       :content [{:type "text" :text "Phase 1 — Chart curation"}]}]
                     (when (seq rationale)
                       [{:type    "paragraph"
                         :content [{:type  "text"
                                    :text  "Curator's rationale: "
                                    :marks [{:type "bold"}]}
                                   {:type "text" :text rationale}]}])
                     (reasonings-blocks p1-reasonings)
                     (prompt-blocks (:prompt phase-1))))
        p2-blocks (when (or (seq p2-reasonings) (:prompt phase-2))
                    (concat
                     [{:type    "heading"
                       :attrs   {:level 3}
                       :content [{:type "text" :text "Phase 2 — Analysis"}]}]
                     (reasonings-blocks p2-reasonings)
                     (prompt-blocks (:prompt phase-2))))]
    (if-not (or (seq p1-blocks) (seq p2-blocks))
      pm-doc
      (let [intro [{:type    "heading"
                    :attrs   {:level 2}
                    :content [{:type "text" :text "Reasoning"}]}
                   {:type    "paragraph"
                    :content [{:type  "text"
                               :text  "Debug — the model's extended-thinking trace used to generate this document."
                               :marks [{:type "italic"}]}]}]
            extra (vec (concat intro p1-blocks p2-blocks (repl-helpers-blocks thread-id)))]
        (update pm-doc :content (fnil into []) extra)))))

;;; ----- Error document — used when a phase fatally fails validation -----

(defn error-doc
  "Build a minimal ProseMirror document explaining why generation failed.
  Used when Phase 1 or Phase 2 hits validation errors that survived the
  repair retry. The doc is intentionally diagnostic, not pretty — this is
  development-time signal that something is wrong with the prompt, schema,
  or model behavior, and someone should look.

  Shared with `metabase.explorations.query-plan` so a planning failure can
  swap the same AI Summary placeholder doc to an error body."
  [{:keys [phase thread-id final-errors detail]}]
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
                         :content [{:type "text" :text "(no specific errors captured — see transcript for details)"}]})]
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
                                  :text (str "Re-running may succeed if this was a transient issue. To debug, run "
                                             (format "(metabase.explorations.ai-summary/debug-transcript %d)" thread-id)
                                             " in a Clojure REPL — the persisted transcript contains both phase prompts, every LLM response, validation errors, and the extended-thinking trace.")}]}]])}))

;;; ----- Main entry point -----

(defn- base-transcript
  "Common preamble for the debug transcript — call-site metadata that's true
  regardless of which branch the run takes. Timestamp is stored as an ISO-8601
  string so the EDN round-trip works without registering custom data readers."
  [thread-id]
  {:generated-at      (u.date/format (Instant/now))
   :thread-id         thread-id
   :phase-1-llm-config phase1/llm-config
   :phase-2-llm-config phase2/llm-config})

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
  "Walk the LLM-generated PM doc and wrap each top-level `cardEmbed` in a `resizeNode` so the
  FE node-view inherits an explicit height (matching the structure produced by the user-facing
  append endpoint). Without the wrapper, static cardEmbeds inside paragraphs collapse to 0
  height because `.cardEmbed` is `height: 100%` of an unsized parent."
  [pm-doc]
  (letfn [(wrap [node]
            (if (card-embed? node)
              {:type "resizeNode" :attrs {:height 400} :content [node]}
              node))]
    (cond-> pm-doc
      (and (map? pm-doc) (sequential? (:content pm-doc)))
      (update :content (fn [content] (mapv wrap content))))))

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
                 chart-href (groups/chart-page-url exploration-id
                                                   (:group_id primary-eq)
                                                   (:card_id primary-eq)
                                                   (:dimension_id primary-eq))]
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
  in the rendered doc. Returns `{:document-id ... :rendered-pm-doc ...}`."
  [{:keys [doc pm-doc creator-id exploration-id]}]
  (request/with-current-user creator-id
    (let [creator (t2/select-one [:model/User :id] :id creator-id)
          pm-doc  (-> pm-doc
                      (materialize-cards-for-card-embeds {:document-id    (:id doc)
                                                          :collection-id  (:collection_id doc)
                                                          :creator        creator
                                                          :exploration-id exploration-id})
                      wrap-card-embeds-in-resize-nodes)]
      (t2/update! :model/Document (:id doc)
                  {:document     pm-doc
                   :content_type prose-mirror/prose-mirror-content-type})
      {:document-id (:id doc) :rendered-pm-doc pm-doc})))

(defn- gate-closed-skip!
  "Persist and return the `:skip-*` outcome for a closed pre-flight gate `reason`."
  [thread-id preamble reason]
  (let [outcome (case reason
                  :metabot-disabled  :skip-metabot-disabled
                  :no-llm            :skip-no-llm
                  :usage-limit       :skip-usage-limit
                  :permission-denied :skip-no-permission)]
    (log/infof "Skipping AI Summary for thread %d: pre-flight gate closed (%s)"
               thread-id (name reason))
    (save-transcript! thread-id (assoc preamble :outcome outcome))
    outcome))

(defn- finalize-doc!
  "Append the reasoning section to `pm-doc`, write it through `write-document!`,
  persist the transcript with `transcript-extras` merged in, log via `log-fn`
  with the resulting document id, and return `outcome`. Shared by the
  phase-1-failed, phase-2-failed, and ok branches of [[run-phases!]]."
  [{:keys [placeholder-doc pm-doc reasoning-ctx creator-id thread-id
           preamble outcome transcript-extras log-fn exploration-id]}]
  (let [pm-doc+ (append-reasoning-section pm-doc reasoning-ctx)
        {:keys [document-id rendered-pm-doc]}
        (write-document! {:doc            placeholder-doc
                          :pm-doc         pm-doc+
                          :creator-id     creator-id
                          :exploration-id exploration-id})]
    (save-transcript! thread-id
                      (merge preamble transcript-extras
                             {:outcome         outcome
                              :document-id     document-id
                              :rendered-pm-doc rendered-pm-doc}))
    (log-fn document-id)
    outcome))

(defn- run-phase-2!
  "Run Phase 2 (analysis) given Phase 1 succeeded. Builds the analysis prompt,
  invokes the analyst, and routes to a failure or success doc."
  [{:keys [thread-id thread creator-id placeholder-doc done-queries
           selections timelines preamble breakouts breakouts-by-rep
           curation-prompt p1-transcript p1-reasonings rationale
           top_tier awareness_tier]}]
  (let [top-breakouts       (u/keepv breakouts-by-rep top_tier)
        awareness-breakouts (u/keepv breakouts-by-rep awareness_tier)
        categorical-top-ids (into #{}
                                  (comp (mapcat :variants)
                                        (filter #(-> % :cfg phase2/x-axis-kind (= :categorical)))
                                        (keep :stored-result-id))
                                  top-breakouts)
        analysis-prompt   (phase2/build-analysis-prompt
                           {:thread-prompt       (:prompt thread)
                            :selections          selections
                            :curation-rationale  rationale
                            :timelines           timelines
                            :top-breakouts       top-breakouts
                            :awareness-breakouts awareness-breakouts
                            :total-chart-count   (count done-queries)
                            :pool-size           (count breakouts)})
        p2 (phase2/run-analysis! thread-id analysis-prompt categorical-top-ids)
        p2-transcript {:prompt       analysis-prompt
                       :attempts     (:attempts p2)
                       :outcome      (:outcome p2)
                       :final-pm-doc (:value p2)
                       :final-errors (:final-errors p2)}
        p2-reasonings (attempt-reasonings (:attempts p2))
        reasoning-ctx {:phase-1   {:reasonings p1-reasonings
                                   :rationale  rationale
                                   :prompt     curation-prompt}
                       :phase-2   {:reasonings p2-reasonings
                                   :prompt     analysis-prompt}
                       :thread-id thread-id}
        common-args   {:placeholder-doc   placeholder-doc
                       :reasoning-ctx     reasoning-ctx
                       :creator-id        creator-id
                       :thread-id         thread-id
                       :exploration-id    (:exploration_id thread)
                       :preamble          preamble
                       :transcript-extras {:phase-1 p1-transcript
                                           :phase-2 p2-transcript}}]
    (if (= :failed (:outcome p2))
      (finalize-doc! (assoc common-args
                            :pm-doc  (error-doc
                                      {:phase        :phase-2
                                       :thread-id    thread-id
                                       :final-errors (:final-errors p2)
                                       :detail       "Phase 2 (analysis) failed validation after a repair retry. Phase 1's curation is in the transcript for reference."})
                            :outcome :phase-2-failed
                            :log-fn  (fn [doc-id]
                                       (log/warnf "AI Summary for thread %d: Phase 2 failed; wrote error doc %d"
                                                  thread-id doc-id))))
      (finalize-doc! (assoc common-args
                            :pm-doc  (prepend-disclaimer (:value p2))
                            :outcome :ok
                            :log-fn  (fn [doc-id]
                                       (log/infof "Wrote AI Summary for thread %d to document %d"
                                                  thread-id doc-id)))))))

(defn- finalize-phase-1-failure!
  "Phase 1 couldn't be repaired: swap the placeholder for an error doc and record the
  `:phase-1-failed` outcome. No Phase 2 is attempted."
  [{:keys [placeholder-doc thread-id creator-id exploration-id preamble
           p1 p1-transcript p1-reasonings curation-prompt]}]
  (finalize-doc!
   {:placeholder-doc   placeholder-doc
    :pm-doc            (error-doc
                        {:phase        :phase-1
                         :thread-id    thread-id
                         :final-errors (:final-errors p1)
                         :detail       "Chart curation failed validation after a repair retry."})
    :reasoning-ctx     {:phase-1   {:reasonings p1-reasonings
                                    :rationale  (get-in p1 [:value :rationale])
                                    :prompt     curation-prompt}
                        :phase-2   {:reasonings []}
                        :thread-id thread-id}
    :creator-id        creator-id
    :thread-id         thread-id
    :exploration-id    exploration-id
    :preamble          preamble
    :outcome           :phase-1-failed
    :transcript-extras {:phase-1 p1-transcript}
    :log-fn            (fn [doc-id]
                         (log/warnf "AI Summary for thread %d: Phase 1 failed; wrote error doc %d"
                                    thread-id doc-id))}))

(defn- run-curation-phase!
  "Build the curation prompt and run Phase 1, returning the raw result plus the transcript /
  reasoning derivatives the rest of the pipeline needs."
  [{:keys [thread-id thread selections timelines breakouts breakouts-by-rep done-queries]}]
  (let [curation-prompt (phase1/build-curation-prompt
                         {:thread-prompt     (:prompt thread)
                          :selections        selections
                          :timelines         timelines
                          :index-entries     breakouts
                          :pool-size         (count breakouts)
                          :total-chart-count (count done-queries)})
        p1              (phase1/run-curation! thread-id curation-prompt (keys breakouts-by-rep))]
    {:curation-prompt curation-prompt
     :p1              p1
     :p1-transcript   {:prompt       curation-prompt
                       :attempts     (:attempts p1)
                       :outcome      (:outcome p1)
                       :curation     (:value p1)
                       :final-errors (:final-errors p1)}
     :p1-reasonings   (attempt-reasonings (:attempts p1))}))

(defn- mid-run-skip!
  "Map a mid-run `ExceptionInfo` — a usage limit crossed (or perms revoked) *between* the
  pre-flight gate and a phase's actual LLM call — to the matching skip outcome. Anything
  else is rethrown to bubble to the outer `try` in [[generate-ai-summary!]]."
  [thread-id creator-id preamble e]
  (case (:type (ex-data e))
    :metabot/permission-denied
    (do (log/infof "Skipping AI Summary for thread %d: creator %s lacks required metabot permissions"
                   thread-id creator-id)
        (save-transcript! thread-id (assoc preamble :outcome :skip-no-permission))
        :skip-no-permission)

    :metabot/usage-limit-reached
    (do (log/infof "Skipping AI Summary for thread %d: AI usage limit reached (%s)"
                   thread-id (ex-message e))
        (save-transcript! thread-id (assoc preamble :outcome :skip-usage-limit))
        :skip-usage-limit)

    (throw e)))

(defn- run-phases!
  "Inner body of [[generate-ai-summary!]]: runs Phase 1 + Phase 2 inside a
  `with-current-user creator-id` binding so the LLM calls see the creator's
  metabot permissions / usage limits. The mid-run `ExceptionInfo` safety net routes a
  perms/usage change to a skip via [[mid-run-skip!]]."
  [{:keys [thread-id thread creator-id coll-id done-queries prepped
           selections timelines preamble]}]
  (request/with-current-user creator-id
    (try
      (b/cond
        :let [placeholder-doc  (or (find-placeholder-doc thread-id)
                                   (create-placeholder-doc! thread-id creator-id coll-id))
              breakouts        (common/group-breakouts prepped)
              breakouts-by-rep (u/index-by :rep-id breakouts)
              {:keys [curation-prompt p1 p1-transcript p1-reasonings]}
              (run-curation-phase! {:thread-id        thread-id
                                    :thread           thread
                                    :selections       selections
                                    :timelines        timelines
                                    :breakouts        breakouts
                                    :breakouts-by-rep breakouts-by-rep
                                    :done-queries     done-queries})]

        (= :failed (:outcome p1))
        (finalize-phase-1-failure! {:placeholder-doc placeholder-doc
                                    :thread-id       thread-id
                                    :creator-id      creator-id
                                    :exploration-id  (:exploration_id thread)
                                    :preamble        preamble
                                    :p1              p1
                                    :p1-transcript   p1-transcript
                                    :p1-reasonings   p1-reasonings
                                    :curation-prompt curation-prompt})

        :let [{:keys [top_tier awareness_tier rationale]} (:value p1)]

        :else
        (run-phase-2! {:thread-id        thread-id
                       :thread           thread
                       :creator-id       creator-id
                       :placeholder-doc  placeholder-doc
                       :done-queries     done-queries
                       :selections       selections
                       :timelines        timelines
                       :preamble         preamble
                       :breakouts        breakouts
                       :breakouts-by-rep breakouts-by-rep
                       :curation-prompt  curation-prompt
                       :p1-transcript    p1-transcript
                       :p1-reasonings    p1-reasonings
                       :rationale        rationale
                       :top_tier         top_tier
                       :awareness_tier   awareness_tier}))
      (catch ExceptionInfo e
        (mid-run-skip! thread-id creator-id preamble e)))))

(defn- prepare-pool
  "Load the Phase-1 curation pool for `thread-id`: select the done queries,
  trim to the metric-balanced cap, load result rows + cached stats, and prep
  each chart. Returns `{:done-queries :prepped :selections :timelines :preamble}`
  ready to hand to [[run-phases!]]."
  [thread-id thread]
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
        timelines    (thread-timeline/load-timeline-events thread-id)
        preamble     (assoc (base-transcript thread-id)
                            :thread-prompt       (:prompt thread)
                            :total-chart-count   (count done-queries)
                            :charts-in-pool      (count prepped)
                            :pool-chart-ids      (mapv :exploration-query-id prepped)
                            :timelines           timelines)]
    {:done-queries done-queries
     :prepped      prepped
     :selections   (selection-context thread-id)
     :timelines    timelines
     :preamble     preamble}))

(defn- skip-no-charts!
  "Persist the `:skip-no-charts` outcome and return it."
  [thread-id preamble]
  (log/infof "No usable chart blocks for thread %d; skipping AI Summary" thread-id)
  (save-transcript! thread-id (assoc preamble :outcome :skip-no-charts))
  :skip-no-charts)

(defn- handle-uncaught-error!
  "Best-effort cleanup after an uncaught throwable in [[generate-ai-summary!]]:
  persist the error to the transcript and swap the placeholder doc for an
  error body so the user doesn't stare at a spinner forever. Defensive — this
  branch may run before a placeholder was created, the thread may have been
  deleted, or the doc may have been archived; secondary failures are
  swallowed rather than masking the original throw."
  [thread-id ^Throwable e]
  (log/errorf e "generate-ai-summary! failed for thread %d" thread-id)
  (save-transcript! thread-id (assoc (base-transcript thread-id)
                                     :outcome :error
                                     :error   (.getMessage e)))
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
                                                 :thread-id    thread-id
                                                 :final-errors [(or (.getMessage e) (.toString e))]
                                                 :detail       "Unexpected error generating the document."})
                       :content_type prose-mirror/prose-mirror-content-type}))))
    (catch Throwable e2
      (log/warnf e2 "Failed to write error doc for thread %d after generate-ai-summary! failure" thread-id)))
  nil)

(defn generate-ai-summary!
  "Two-phase generation of the `AI Summary` document for `thread-id`.
  Always inserts a new document — the manually-created `Findings` doc is the
  user's working space and is left untouched. The full transcript (both phase
  prompts, every LLM response, validation errors, extended-thinking traces,
  the validated document) is persisted to
  `exploration_thread.ai_summary_transcript` on every outcome (including
  skips and failures) for after-the-fact debugging — `(debug-transcript
  <thread-id>)` to inspect.

  If either phase fails validation after a repair retry, the document is
  replaced with a minimal *error document* that explains the failure.
  We do not silently fall back to a different selection strategy during
  development — failures are surfaced so they can be fixed.

  Returns `:ok` on success, a keyword reason on graceful skip
  (`:skip-metabot-disabled`, `:skip-no-llm`, `:skip-usage-limit`, `:skip-no-permission`,
  `:skip-no-charts`), `:phase-1-failed` / `:phase-2-failed` when the corresponding phase
  couldn't be repaired, or `nil` on an uncaught throwable (logged but never thrown)."
  [thread-id]
  (try
    (b/cond
      :let [thread (t2/select-one [:model/ExplorationThread :id :prompt :exploration_id]
                                  :id thread-id)]

      (nil? thread)
      (do (log/warnf "Thread %d not found" thread-id) nil)

      :let [exploration (t2/select-one [:model/Exploration :creator_id :collection_id]
                                       :id (:exploration_id thread))
            creator-id  (:creator_id exploration)
            reason      (request/with-current-user creator-id
                          (metabot/llm-call-unavailable-reason :permission/metabot-other-tools))]

      reason
      (gate-closed-skip! thread-id (base-transcript thread-id) reason)

      :let [{:keys [done-queries prepped selections timelines preamble]}
            (prepare-pool thread-id thread)]

      (empty? prepped)
      (skip-no-charts! thread-id preamble)

      ;; The placeholder doc was created up-front by the exploration POST endpoint so the FE
      ;; sidebar shows it the moment the exploration is created. Every branch in `run-phases!`
      ;; (phase-1-failed, phase-2-failed, ok) swaps this doc's body in place — we never insert a
      ;; second doc. For threads created before the endpoint started pre-creating it,
      ;; `run-phases!` falls back to creating one.
      :else
      (run-phases! {:thread-id     thread-id
                    :thread        thread
                    :creator-id    creator-id
                    :coll-id       (:collection_id exploration)
                    :done-queries  done-queries
                    :prepped       prepped
                    :selections    selections
                    :timelines     timelines
                    :preamble      preamble}))
    (catch Throwable e
      (handle-uncaught-error! thread-id e))))
