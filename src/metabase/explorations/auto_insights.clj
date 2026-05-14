(ns metabase.explorations.auto-insights
  "Two-phase LLM-driven Automatic Insights generation for a completed exploration thread.

  Invoked from `metabase.explorations.task.runner` after a thread has reached
  terminal state. The pipeline is split into two structured LLM calls so each
  can specialize:

  Phase 1 — Curation (see [[metabase.explorations.auto-insights.phase1]]).
    Sees a *thin* index of up to 100 pre-ranked charts (id, name, score, plus a
    one-line summary derived from `chart_stats`). Picks which charts deserve
    deep analysis (top tier: full data point grounding for citation) and which
    are awareness-only (model knows they exist but won't cite values).

  Phase 2 — Analysis (see [[metabase.explorations.auto-insights.phase2]]).
    Sees only what Phase 1 selected, with the curation rationale. Top-tier
    charts get full chart blocks (stats + key-points + verbatim data points);
    awareness-tier charts get slim blocks (title + summary + key-points). The
    model writes the research-paper-shaped Automatic Insights document.

  Both phases use extended thinking, both have one repair retry on validation
  failure, both have their prompt / response / reasoning persisted to the
  thread's `auto_insights_transcript` column for after-the-fact debugging.
  If either phase fails validation after repair, the document is replaced
  with a minimal *error document* that explains the failure — we never
  silently fall back to a different selection strategy. This is intentional
  during development: surface the failure so we can fix it.

  The user's manually-created `Findings` document is left untouched; the
  auto-generated artifact is a separate document per thread.

  This namespace is the orchestrator: [[generate-auto-insights!]] wires Phase 1
  and Phase 2 together, handles the success / failure / skip branches, writes
  the resulting `Document`, materializes chart embeds, persists the transcript,
  and exposes the `debug-*` REPL helpers. Shared chart-rendering and LLM-call
  infrastructure lives in [[metabase.explorations.auto-insights.common]]."
  (:require
   [clojure.string :as str]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.explorations.auto-insights.common :as common]
   [metabase.explorations.auto-insights.phase1 :as phase1]
   [metabase.explorations.auto-insights.phase2 :as phase2]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.request.core :as request]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

;;; ----- pool sizing + thread-scoped data loading -----

(def ^:private max-charts-in-pool
  "Hard cap on charts in the Phase-1 curation pool. Picked from the top of the
  contextual / deterministic interestingness ranking; the rest of the
  ranked-but-not-pooled charts are unreachable for this run."
  100)

(defn- load-result-rows
  "Returns `{exploration_query_id {:result_data bytes :chart_stats m :metric_description s
   :chart_description s}}` for the given ids. `chart_stats` is the cached deep-stats blob
  written by the runner alongside the result; descriptions are LLM-generated during
  contextual scoring (see [[metabase.explorations.task.runner]])."
  [query-ids]
  (when (seq query-ids)
    (into {}
          (map (fn [{:keys [exploration_query_id result_data chart_stats
                            metric_description chart_description]}]
                 [exploration_query_id {:result_data        result_data
                                        :chart_stats        chart_stats
                                        :metric_description metric_description
                                        :chart_description  chart_description}]))
          (t2/select [:model/ExplorationQueryResult
                      :exploration_query_id :result_data :chart_stats
                      :metric_description :chart_description]
                     :exploration_query_id [:in query-ids]))))

(defn- load-timeline-events
  "Fetch every non-archived timeline event from each timeline the user selected
  on this thread, grouped by timeline. The events themselves carry the bulk
  of the analytical signal — names, descriptions, and timestamps tell the
  model *what happened* around the time the data changed. Returns a vector of
  `{:timeline-id :timeline-name :timeline-description :events [...]}` maps,
  events sorted by timestamp ascending."
  [thread-id]
  (let [rows (t2/query
              {:select   [[:t.id :timeline_id]
                          [:t.name :timeline_name]
                          [:t.description :timeline_description]
                          [:te.id :event_id]
                          [:te.name :event_name]
                          [:te.description :event_description]
                          [:te.timestamp :event_timestamp]
                          [:te.icon :event_icon]
                          [:ett.position :position]]
               :from     [[:exploration_thread_timeline :ett]]
               :join     [[:timeline :t] [:= :t.id :ett.timeline_id]]
               :left-join [[:timeline_event :te] [:and
                                                  [:= :te.timeline_id :t.id]
                                                  [:= :te.archived false]]]
               :where    [:= :ett.exploration_thread_id thread-id]
               :order-by [[:ett.position :asc] [:te.timestamp :asc]]})]
    (->> rows
         (group-by :timeline_id)
         (sort-by (fn [[_ rs]] (:position (first rs))))
         (mapv (fn [[_ tl-rows]]
                 (let [head (first tl-rows)]
                   {:timeline-id          (:timeline_id head)
                    :timeline-name        (:timeline_name head)
                    :timeline-description (:timeline_description head)
                    :events (->> tl-rows
                                 (keep (fn [r]
                                         (when (:event_id r)
                                           {:id          (:event_id r)
                                            :name        (:event_name r)
                                            :description (:event_description r)
                                            :timestamp   (u.date/format (:event_timestamp r))
                                            :icon        (:event_icon r)})))
                                 (sort-by :timestamp)
                                 vec)}))))))

(defn- selection-context
  "Plain-text recap of metric / dimension / timeline names selected on the
  thread, used to remind the LLM what the user was looking at."
  [thread-id]
  (let [metrics    (->> (t2/query
                         {:select    [[:c.name :name]]
                          :from      [[:exploration_thread_metric :m]]
                          :left-join [[:report_card :c] [:= :c.id :m.card_id]]
                          :where     [:= :m.exploration_thread_id thread-id]
                          :order-by  [[:m.position :asc]]})
                        (keep :name))
        dimensions (->> (t2/select [:model/ExplorationThreadDimension :display_name :dimension_id]
                                   :exploration_thread_id thread-id
                                   {:order-by [[:position :asc]]})
                        (map (fn [d] (or (:display_name d) (:dimension_id d))))
                        (remove nil?))
        timelines  (->> (t2/query
                         {:select    [[:t.name :name]]
                          :from      [[:exploration_thread_timeline :ett]]
                          :left-join [[:timeline :t] [:= :t.id :ett.timeline_id]]
                          :where     [:= :ett.exploration_thread_id thread-id]
                          :order-by  [[:ett.position :asc]]})
                        (keep :name))]
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
                {:auto_insights_transcript transcript})
    (catch Throwable e
      (log/warnf e "Failed to save Automatic Insights transcript for thread %d" thread-id))))

(def ^:private auto-doc-name
  "Name for the LLM-generated Automatic Insights document. Distinct from the
  user-owned 'Findings' doc that's auto-created at exploration time — that one
  is the user's working space and we never overwrite it."
  "Automatic Insights")

(defn placeholder-pm-doc
  "ProseMirror doc body shown while auto-insights generation is still running.
  The sidebar links to this doc the moment the exploration is created; we
  swap its `:document` content in-place when generation finishes (success,
  skip, or failure). Public because the API endpoint creates the doc at
  exploration-creation time, before any worker has touched the thread."
  []
  {:type    "doc"
   :content [{:type    "heading"
              :attrs   {:level 2}
              :content [{:type "text" :text "Analysis underway…"}]}
             {:type    "paragraph"
              :content [{:type  "text"
                         :text  "Automatic Insights is generating an analysis of this exploration. This page will update when it's ready."
                         :marks [{:type "italic"}]}]}]})

(defn create-placeholder-doc!
  "Insert a fresh `Automatic Insights` document on `thread-id` owned by
  `creator-id`, populated with the `Analysis underway…` placeholder. Caller
  must establish a current-user binding. The doc is created up-front by the
  exploration POST endpoint so the FE sidebar shows it immediately; the
  later `write-document!` in this namespace updates it in place."
  [thread-id creator-id]
  (let [doc (first
             (t2/insert-returning-instances! :model/Document
                                             {:name                  auto-doc-name
                                              :document              (placeholder-pm-doc)
                                              :content_type          prose-mirror/prose-mirror-content-type
                                              :creator_id            creator-id
                                              :exploration_thread_id thread-id}))]
    (t2/update! :model/ExplorationThread thread-id
                {:auto_insights_document_id (:id doc)})
    doc))

(defn- find-placeholder-doc
  "Look up the Automatic Insights document for `thread-id`. Returns nil when
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
  "Return the full Automatic Insights transcript for `thread-id`, or nil when
  no transcript has been written yet. Includes pool info, both phase prompts
  and attempts, the curation, the final document, and the outcome keyword."
  [thread-id]
  (:auto_insights_transcript
   (t2/select-one [:model/ExplorationThread :id :auto_insights_transcript]
                  :id thread-id)))

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
  (->> attempts
       (keep (fn [{:keys [attempt trace]}]
               (let [text (not-empty (:reasoning trace))
                     ;; A reasoning content block was emitted iff `summarize-parts`
                     ;; saw at least one `:type :reasoning` chunk in the raw parts
                     ;; list. With readable thinking the text is also populated;
                     ;; with opaque/encrypted thinking we only get the part with
                     ;; an empty `:reasoning` field.
                     had-reasoning-part? (some #(= :reasoning (:type %))
                                               (:all trace))]
                 (cond
                   text                {:attempt attempt :reasoning text}
                   had-reasoning-part? {:attempt attempt :opaque? true}))))
       vec))

(defn debug-reasoning
  "Return the extended-thinking traces for `thread-id` as a map keyed by phase:
  `{:phase-1 [{:attempt N :reasoning \"...\"} ...]
    :phase-2 [...]}`. Each entry includes the model's deliberation for that
  attempt. Empty vectors when thinking was disabled or no reasoning emitted."
  [thread-id]
  (let [t (debug-transcript thread-id)]
    {:phase-1 (attempt-reasonings (get-in t [:phase-1 :attempts]))
     :phase-2 (attempt-reasonings (get-in t [:phase-2 :attempts]))}))

(defn debug-prompt
  "Return both phase prompts: `{:phase-1 \"...\" :phase-2 \"...\"}`. Phase-2 is
  nil when the run didn't reach Phase 2."
  [thread-id]
  (let [t (debug-transcript thread-id)]
    {:phase-1 (get-in t [:phase-1 :prompt])
     :phase-2 (get-in t [:phase-2 :prompt])}))

(defn debug-document
  "Return the ProseMirror document the analyst (Phase 2) produced, pre-chart-
  materialization. Nil when Phase 2 didn't succeed."
  [thread-id]
  (get-in (debug-transcript thread-id) [:phase-2 :final-pm-doc]))

(defn debug-curation
  "Return the Phase-1 curation map: `{:top_tier [...] :awareness_tier [...]
  :rationale \"...\"}`. Nil when Phase 1 didn't succeed."
  [thread-id]
  (get-in (debug-transcript thread-id) [:phase-1 :curation]))

;;; ----- Reasoning section rendering -----

(defn- reasoning-paragraphs
  "Split a raw reasoning string on blank lines into prose-mirror paragraph nodes."
  [reasoning]
  (->> (str/split reasoning #"\n\s*\n")
       (map str/trim)
       (remove str/blank?)
       (mapv (fn [p]
               {:type    "paragraph"
                :content [{:type "text" :text p}]}))))

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
                             :text  (format "(metabase.explorations.auto-insights/%s %d)"
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
        anything? (or (seq p1-reasonings) (seq p2-reasonings) (seq rationale)
                      (:prompt phase-1) (:prompt phase-2))]
    (if-not anything?
      pm-doc
      (let [intro [{:type    "heading"
                    :attrs   {:level 2}
                    :content [{:type "text" :text "Reasoning"}]}
                   {:type    "paragraph"
                    :content [{:type  "text"
                               :text  "Debug — the model's extended-thinking trace used to generate this document."
                               :marks [{:type "italic"}]}]}]
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
                         (prompt-blocks (:prompt phase-2))))
            extra (vec (concat intro p1-blocks p2-blocks (repl-helpers-blocks thread-id)))]
        (update pm-doc :content (fnil into []) extra)))))

;;; ----- Error document — used when a phase fatally fails validation -----

(defn- error-doc
  "Build a minimal ProseMirror document explaining why generation failed.
  Used when Phase 1 or Phase 2 hits validation errors that survived the
  repair retry. The doc is intentionally diagnostic, not pretty — this is
  development-time signal that something is wrong with the prompt, schema,
  or model behavior, and someone should look."
  [{:keys [phase thread-id final-errors detail]}]
  (let [phase-label (case phase
                      :phase-1  "Phase 1 — Chart curation"
                      :phase-2  "Phase 2 — Analysis"
                      :uncaught "an unexpected error before any phase ran"
                      (str phase))
        err-items   (mapv (fn [e]
                            {:type    "listItem"
                             :content [{:type    "paragraph"
                                        :content [{:type "text" :text e}]}]})
                          (or final-errors []))]
    {:type    "doc"
     :content (cond-> [{:type    "heading"
                        :attrs   {:level 2}
                        :content [{:type "text" :text "Automatic Insights generation failed"}]}
                       {:type    "paragraph"
                        :content [{:type "text" :text "The system couldn't generate an analysis for this exploration. The failure happened in "}
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
                detail
                (conj {:type    "heading"
                       :attrs   {:level 3}
                       :content [{:type "text" :text "Details"}]}
                      {:type    "paragraph"
                       :content [{:type "text" :text detail}]})

                :always
                (conj {:type    "heading"
                       :attrs   {:level 3}
                       :content [{:type "text" :text "Next steps"}]}
                      {:type    "paragraph"
                       :content [{:type "text"
                                  :text (str "Re-running the exploration may succeed if this was a transient issue. To debug, run "
                                             (format "(metabase.explorations.auto-insights/debug-transcript %d)" thread-id)
                                             " in a Clojure REPL — the persisted transcript contains both phase prompts, every LLM response, validation errors, and the extended-thinking trace.")}]}))}))

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

(defn- write-document!
  "Update the placeholder `doc` (created up-front by [[create-placeholder-doc!]])
  with the final content. The `staticCardEmbed` nodes the LLM emitted reference
  `exploration_query_id`s whose viz config is already on the matching
  `exploration_query_result` rows — written once at result-write time by the
  query runner. Returns `{:document-id ... :rendered-pm-doc ...}`."
  [{:keys [doc pm-doc creator-id]}]
  (request/with-current-user creator-id
    (t2/update! :model/Document (:id doc)
                {:document     pm-doc
                 :content_type prose-mirror/prose-mirror-content-type})
    {:document-id (:id doc) :rendered-pm-doc pm-doc}))

(defn generate-auto-insights!
  "Two-phase generation of the `Automatic Insights` document for `thread-id`.
  Always inserts a new document — the manually-created `Findings` doc is the
  user's working space and is left untouched. The full transcript (both phase
  prompts, every LLM response, validation errors, extended-thinking traces,
  the validated document) is persisted to
  `exploration_thread.auto_insights_transcript` on every outcome (including
  skips and failures) for after-the-fact debugging — `(debug-transcript
  <thread-id>)` to inspect.

  If either phase fails validation after a repair retry, the document is
  replaced with a minimal *error document* that explains the failure.
  We do not silently fall back to a different selection strategy during
  development — failures are surfaced so they can be fixed.

  Returns `:ok` on success, a keyword reason on graceful skip
  (`:skip-no-llm`, `:skip-no-charts`), `:phase-1-failed` /
  `:phase-2-failed` when the corresponding phase couldn't be repaired, or
  `nil` on an uncaught throwable (logged but never thrown)."
  [thread-id]
  (try
    (if-not (metabot.settings/llm-metabot-configured?)
      (do (log/infof "Skipping Automatic Insights for thread %d: LLM not configured" thread-id)
          (save-transcript! thread-id (assoc (base-transcript thread-id) :outcome :skip-no-llm))
          :skip-no-llm)
      (let [thread (t2/select-one [:model/ExplorationThread :id :prompt :exploration_id]
                                  :id thread-id)]
        (if (nil? thread)
          (do (log/warnf "Thread %d not found" thread-id) nil)
          (let [exploration  (t2/select-one [:model/Exploration :creator_id]
                                            :id (:exploration_id thread))
                done-queries (->> (t2/hydrate
                                   (t2/select :model/ExplorationQuery
                                              :exploration_thread_id thread-id
                                              :status "done")
                                   :interestingness_score
                                   :contextual_interestingness_score)
                                  (sort-by common/chart-rank-score >))
                pool-queries (vec (take max-charts-in-pool done-queries))
                result-rows  (load-result-rows (map :id pool-queries))
                prepped      (vec (keep (fn [q]
                                          (let [{:keys [result_data chart_stats
                                                        metric_description chart_description]}
                                                (get result-rows (:id q))]
                                            (common/prep-chart q
                                                               {:result-data        result_data
                                                                :chart-stats        chart_stats
                                                                :metric-description metric_description
                                                                :chart-description  chart_description})))
                                        pool-queries))
                prepped-by-id (into {} (map (juxt :exploration-query-id identity)) prepped)
                pool-ids     (mapv :exploration-query-id prepped)
                selections   (selection-context thread-id)
                timelines    (load-timeline-events thread-id)
                preamble     (assoc (base-transcript thread-id)
                                    :thread-prompt       (:prompt thread)
                                    :total-chart-count   (count done-queries)
                                    :charts-in-pool      (count prepped)
                                    :pool-chart-ids      pool-ids
                                    :timelines           timelines)]
            (cond
              (empty? prepped)
              (do (log/infof "No usable chart blocks for thread %d; skipping Automatic Insights" thread-id)
                  (save-transcript! thread-id (assoc preamble :outcome :skip-no-charts))
                  :skip-no-charts)

              :else
              ;; -------- The placeholder doc was created up-front by the
              ;; exploration POST endpoint so the FE sidebar shows it the
              ;; moment the exploration is created. Every branch below
              ;; (phase-1-failed, phase-2-failed, ok) swaps this doc's body
              ;; in place — we never insert a second doc. For threads created
              ;; before the endpoint started pre-creating it, fall back to
              ;; creating one here so old data still works.
              (let [creator-id (:creator_id exploration)
                    placeholder-doc (or (find-placeholder-doc thread-id)
                                        (request/with-current-user creator-id
                                          (create-placeholder-doc! thread-id creator-id)))
                    curation-prompt (phase1/build-curation-prompt
                                     {:thread-prompt     (:prompt thread)
                                      :selections        selections
                                      :timelines         timelines
                                      :index-entries     prepped
                                      :pool-size         (count prepped)
                                      :total-chart-count (count done-queries)})
                    p1 (phase1/run-curation! thread-id curation-prompt pool-ids)
                    p1-transcript {:prompt     curation-prompt
                                   :attempts   (:attempts p1)
                                   :outcome    (:outcome p1)
                                   :curation   (:value p1)
                                   :final-errors (:final-errors p1)}
                    p1-reasonings (attempt-reasonings (:attempts p1))]
                (if (= :failed (:outcome p1))
                  ;; Phase-1 fatal — write error doc + transcript, do NOT fall back.
                  (let [err-pm  (error-doc {:phase        :phase-1
                                            :thread-id    thread-id
                                            :final-errors (:final-errors p1)
                                            :detail       "Phase 1 (chart curation) failed validation after a repair retry. No Phase 2 was attempted."})
                        err-pm+ (append-reasoning-section
                                 err-pm
                                 {:phase-1   {:reasonings p1-reasonings
                                              :rationale  (get-in p1 [:value :rationale])
                                              :prompt     curation-prompt}
                                  :phase-2   {:reasonings []}
                                  :thread-id thread-id})
                        {:keys [document-id rendered-pm-doc]}
                        (write-document! {:doc        placeholder-doc
                                          :pm-doc     err-pm+
                                          :creator-id creator-id})]
                    (save-transcript! thread-id
                                      (assoc preamble
                                             :outcome         :phase-1-failed
                                             :phase-1         p1-transcript
                                             :document-id     document-id
                                             :rendered-pm-doc rendered-pm-doc))
                    (log/warnf "Automatic Insights for thread %d: Phase 1 failed; wrote error doc %d"
                               thread-id document-id)
                    :phase-1-failed)

                  ;; -------- Phase 1 OK — run Phase 2 --------
                  (let [{:keys [top_tier awareness_tier rationale]} (:value p1)
                        top-prepped       (vec (keep prepped-by-id top_tier))
                        awareness-prepped (vec (keep prepped-by-id awareness_tier))
                        ;; Top-tier charts whose x-axis is neither time nor
                        ;; numeric. Passed into Phase 2 validation so the
                        ;; repair loop catches embeds that forgot the `sort`
                        ;; attribute on a categorical chart (see the prompt's
                        ;; sort decision tree). Awareness-tier ids aren't
                        ;; included since the analyst is told not to embed
                        ;; them; if one slips in, the per-node validator
                        ;; catches the malformed reference separately.
                        categorical-top-ids (->> top-prepped
                                                 (filter (fn [p]
                                                           (let [xt (some-> p :cfg :series first val :x :type)]
                                                             (and xt (not (#{"datetime" "number"} xt))))))
                                                 (map :exploration-query-id)
                                                 set)
                        analysis-prompt   (phase2/build-analysis-prompt
                                           {:thread-prompt      (:prompt thread)
                                            :selections         selections
                                            :curation-rationale rationale
                                            :timelines          timelines
                                            :top-blocks         top-prepped
                                            :awareness-blocks   awareness-prepped
                                            :total-chart-count  (count done-queries)
                                            :pool-size          (count prepped)})
                        p2 (phase2/run-analysis! thread-id analysis-prompt categorical-top-ids)
                        p2-transcript {:prompt       analysis-prompt
                                       :attempts     (:attempts p2)
                                       :outcome      (:outcome p2)
                                       :final-pm-doc (:value p2)
                                       :final-errors (:final-errors p2)}
                        p2-reasonings (attempt-reasonings (:attempts p2))]
                    (if (= :failed (:outcome p2))
                      ;; Phase 2 fatal — error doc with phase 1 context preserved.
                      (let [err-pm  (error-doc {:phase        :phase-2
                                                :thread-id    thread-id
                                                :final-errors (:final-errors p2)
                                                :detail       "Phase 2 (analysis) failed validation after a repair retry. Phase 1's curation is in the transcript for reference."})
                            err-pm+ (append-reasoning-section
                                     err-pm
                                     {:phase-1   {:reasonings p1-reasonings
                                                  :rationale  rationale
                                                  :prompt     curation-prompt}
                                      :phase-2   {:reasonings p2-reasonings
                                                  :prompt     analysis-prompt}
                                      :thread-id thread-id})
                            {:keys [document-id rendered-pm-doc]}
                            (write-document! {:doc        placeholder-doc
                                              :pm-doc     err-pm+
                                              :creator-id creator-id})]
                        (save-transcript! thread-id
                                          (assoc preamble
                                                 :outcome         :phase-2-failed
                                                 :phase-1         p1-transcript
                                                 :phase-2         p2-transcript
                                                 :document-id     document-id
                                                 :rendered-pm-doc rendered-pm-doc))
                        (log/warnf "Automatic Insights for thread %d: Phase 2 failed; wrote error doc %d"
                                   thread-id document-id)
                        :phase-2-failed)

                      ;; -------- Both phases OK — write the real analysis --------
                      (let [pm-doc  (:value p2)
                            pm-doc+ (append-reasoning-section
                                     pm-doc
                                     {:phase-1   {:reasonings p1-reasonings
                                                  :rationale  rationale
                                                  :prompt     curation-prompt}
                                      :phase-2   {:reasonings p2-reasonings
                                                  :prompt     analysis-prompt}
                                      :thread-id thread-id})
                            {:keys [document-id rendered-pm-doc]}
                            (write-document! {:doc        placeholder-doc
                                              :pm-doc     pm-doc+
                                              :creator-id creator-id})]
                        (save-transcript! thread-id
                                          (assoc preamble
                                                 :outcome         :ok
                                                 :phase-1         p1-transcript
                                                 :phase-2         p2-transcript
                                                 :document-id     document-id
                                                 :rendered-pm-doc rendered-pm-doc))
                        (log/infof "Wrote Automatic Insights for thread %d to document %d"
                                   thread-id document-id)
                        :ok))))))))))
    (catch Throwable e
      (log/errorf e "generate-auto-insights! failed for thread %d" thread-id)
      (save-transcript! thread-id (assoc (base-transcript thread-id)
                                         :outcome :error
                                         :error   (.getMessage e)))
      ;; Replace the "Analysis underway…" placeholder with an error doc so
      ;; the user doesn't stare at a spinner forever. Defensive: this branch
      ;; may run before a placeholder was created, the thread may have been
      ;; deleted, or the doc may have been archived — swallow any secondary
      ;; failure rather than mask the original throw.
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
                                                     :detail       "Automatic Insights hit an unexpected error before it could produce a document. The transcript has the full stack trace."})
                           :content_type prose-mirror/prose-mirror-content-type}))))
        (catch Throwable e2
          (log/warnf e2 "Failed to write error doc for thread %d after generate-auto-insights! failure" thread-id)))
      nil)))
