(ns metabase.explorations.auto-insights.phase2
  "Phase 2 — ANALYSIS.

  Given the Phase-1 curation, the analyst LLM produces the ProseMirror document
  the user sees. This namespace holds the phase-2 LLM config, schema,
  slim/full chart block renderers, prompt builder, validation (including the
  per-node validator for static-mode `cardEmbed` nodes), the repair-prompt
  builder, and the `run-analysis!` entry point. Display + visualization_settings
  live on the `stored_result` row, written once by the query runner — Phase 2
  doesn't touch viz config and the doc keeps the LLM-emitted nodes verbatim.

  Common chart-rendering and LLM-call infrastructure lives in
  [[metabase.explorations.auto-insights.common]]."
  (:require
   [clojure.string :as str]
   [metabase.documents.core :as documents]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.explorations.auto-insights.common :as common]
   [metabase.explorations.auto-insights.prompts :as prompts]
   [metabase.interestingness.core :as interestingness]))

(set! *warn-on-reflection* true)

;;; ----- chart block rendering (phase-2 only — phase-1 uses the much shorter index entry) -----

(def ^:private max-data-points-per-series
  "Cap on how many (x, y) pairs to dump per series in the full chart block.
  For longer series we pick evenly-spaced indices so the model still sees the
  actual shape (start, middle, end + a uniform sample) rather than only stats.
  Picked so a typical chart block stays well under ~1KB even at the cap."
  40)

(def ^:private max-series-per-chart
  "Cap on how many series we dump verbatim into a full chart block. A
  high-cardinality breakout (e.g. 20 vendors × 40 data points) would otherwise
  produce ~800 datapoints of prompt text for a single chart. We render the
  first N by series order; the model still sees them all via the chart's
  Markdown representation."
  10)

(def ^:private max-repair-echo-chars
  "How many chars of the previous malformed response we echo back in the repair
  prompt. A giant malformed response would otherwise double token consumption
  on retry — the assistant turn already has it."
  4000)

(defn- downsample-pairs
  "Given parallel `x-values` and `y-values`, return a vector of `[x y]` pairs
  truncated to at most `n` evenly-spaced indices. Always preserves first and
  last so trend endpoints are exact."
  [x-values y-values n]
  (let [pairs (mapv vector x-values y-values)
        cnt   (count pairs)]
    (if (<= cnt n)
      pairs
      (let [step    (/ (dec cnt) (double (dec n)))
            indices (->> (range n)
                         (mapv #(int (Math/round (* step (double %)))))
                         distinct
                         vec)]
        (mapv pairs indices)))))

(defn- format-pair
  [[x y]]
  (str (cond
         (nil? x)    "null"
         (number? x) x
         :else       (str x))
       "=" (cond
             (nil? y)    "null"
             (number? y) y
             :else       (str y))))

(defn- render-key-points-section
  "Render the per-series key-points block from the cached `chart_stats` blob.
  Used by both `slim-block` (awareness tier) and `full-block` (top tier)."
  [cfg chart-stats]
  (let [entries (for [[sname _] (:series cfg)
                      :let [kp (common/key-points-from-stats chart-stats sname)]
                      :when kp]
                  (let [{:keys [peak trough first last change-pct n mean above-mean categorical?]} kp
                        [px pv] peak
                        [tx tv] trough]
                    (str "- " sname ":\n"
                         "  - Peak: " pv " at " px "\n"
                         "  - Trough: " tv " at " tx "\n"
                         (when-not categorical?
                           (let [[fx fv] first
                                 [lx lv] last]
                             (str "  - First point: " fv " at " fx "\n"
                                  "  - Last point: " lv " at " lx "\n"
                                  "  - First → Last: " fv " → " lv
                                  " (" (common/format-pct change-pct) ")\n")))
                         "  - Mean: " (format "%.2f" (double (or mean 0.0)))
                         (when (and above-mean n)
                           (str "; " above-mean " of " n " points are above the mean")))))]
    (when (seq entries)
      (str "**Key points (pre-computed — quote these verbatim, don't re-derive)**:\n"
           (str/join "\n" entries)))))

(defn- render-data-points
  "Render the verbatim (x, y) sequence for each series in `cfg`. Sequences over
  `max-data-points-per-series` are evenly downsampled with first/last
  preserved; the header notes when downsampling happened so the model knows
  it's a sample. Top-tier full blocks only."
  [cfg]
  (let [series       (:series cfg)
        total-series (count series)
        kept-series  (take max-series-per-chart series)
        dropped      (- total-series (count kept-series))]
    (when (seq kept-series)
      (str "**Actual data points (chronological)** — every numeric claim and date in your output MUST appear in this list verbatim:\n"
           (when (pos? dropped)
             (str "_Note: showing first " (count kept-series) " of " total-series
                  " series — " dropped " series omitted from this verbatim dump (still summarized in the chart Markdown above)._\n"))
           (str/join
            "\n"
            (for [[sname {:keys [x_values y_values]}] kept-series
                  :let [orig-count (count x_values)
                        pairs      (downsample-pairs x_values y_values max-data-points-per-series)
                        downsampled? (< (count pairs) orig-count)]]
              (str "- " sname
                   (when downsampled?
                     (str " (downsampled from " orig-count " to " (count pairs)
                          " evenly-spaced points; first and last preserved)"))
                   ":\n  "
                   (str/join " | " (map format-pair pairs)))))))))

(def llm-config
  "Phase-2 LLM settings. Analysis composes a research-paper-style document,
  correlates timeline events with data inflections, judges evidence strength,
  and structures the argument — the most reasoning-intensive step in the
  pipeline. Opus 4.7 with extended thinking is worth the cost here: the
  document is the user-facing deliverable, and the per-run absolute cost is
  small (async background task, one doc per thread completion)."
  {:model           "anthropic/claude-opus-4-7"
   :temperature     1.0
   :max-tokens      16000
   :thinking-config {:type "adaptive" :effort "high"}})

(defn slim-block
  "Awareness-tier rendering: title + (optional) chart description + (optional) metric
  description + metric/dim column detail + summary line + key-points. No stats Markdown, no
  verbatim data points dump. The model knows the chart exists and the gist, but won't cite
  values from it."
  [{:keys [stored-result-id name summary-line dim-detail metric-detail
           metric-description chart-description cfg stats]}]
  (let [key-pts (render-key-points-section cfg stats)]
    (str "### stored_result_id " stored-result-id " — " name "\n\n"
         (when chart-description
           (str "- **chart**: " chart-description "\n"))
         (when metric-description
           (str "- **metric description**: " metric-description "\n"))
         "- **metric**: " (or metric-detail "(unknown)") "\n"
         "- **dim**: " (or dim-detail "(unknown)") "\n"
         "- **summary**: " summary-line "\n\n"
         (when key-pts (str key-pts "\n\n"))
         "_Awareness-tier chart — you know it exists, but full data points are not provided. "
         "If you need to cite values from this chart, mention it in `Suggestions for further "
         "exploration` instead._")))

(defn full-block
  "Top-tier rendering: title + (optional) chart description + (optional) metric description +
  metric/dim column detail + full chart Markdown representation, pre-computed key points, AND
  the verbatim (x, y) data points list the model must ground citations against."
  [{:keys [stored-result-id name cfg stats dim-detail metric-detail
           metric-description chart-description]}]
  (let [repr    (interestingness/generate-representation
                 {:title                  (:title cfg)
                  :display-type           (:display_type cfg)
                  :stats                  stats
                  :omit-temporal-context? true})
        key-pts (render-key-points-section cfg stats)
        points  (render-data-points cfg)
        extras  (str/join "\n\n" (remove nil? [key-pts points]))]
    (str "### stored_result_id " stored-result-id " — " name "\n\n"
         (when chart-description
           (str "- **chart**: " chart-description "\n"))
         (when metric-description
           (str "- **metric description**: " metric-description "\n"))
         "- **metric**: " (or metric-detail "(unknown)") "\n"
         "- **dim**: " (or dim-detail "(unknown)") "\n\n"
         "When referencing this chart in a `cardEmbed` node, use "
         "`stored_result_id: " stored-result-id "`.\n\n"
         repr
         (when (seq extras) (str "\n\n" extras)))))

(def response-schema
  "Loose wrapper schema — the LLM emits a full ProseMirror doc as the `document`
  field. We document the supported node types in the prompt rather than try to
  encode a recursive PM schema in JSON Schema (which providers handle
  inconsistently). We validate the shape after the fact."
  {:type                 "object"
   :properties           {:document {:type        "object"
                                     :description "A ProseMirror document node (`type: \"doc\"`). See the prompt for the supported node types."}}
   :required             ["document"]
   :additionalProperties false})

(def allowed-chart-sorts
  "Sort attribute values a static `cardEmbed` is allowed to request. Re-exported here so the
  prompt-builder and validators can refer to the same set the read-time renderer enforces."
  documents/allowed-chart-sorts)

(defn build-analysis-prompt
  "Phase 2 prompt: research-paper-shaped Automatic Insights document grounded
  in the Phase-1-curated chart set. The Selmer template lives at
  `resources/explorations/auto_insights/prompts/phase2_analysis.selmer`."
  [{:keys [thread-prompt selections curation-rationale timelines
           top-blocks awareness-blocks
           total-chart-count pool-size]}]
  (prompts/render
   "phase2_analysis.selmer"
   {:temporal_context      (interestingness/temporal-context)
    :thread_prompt         (when-not (str/blank? thread-prompt) thread-prompt)
    :selections            (when (seq selections) (str/join "\n" selections))
    :curation_rationale    (when-not (str/blank? curation-rationale) curation-rationale)
    :timeline_md           (common/format-timeline-events timelines)
    :top_block_count       (count top-blocks)
    :awareness_block_count (count awareness-blocks)
    :pool_size             pool-size
    :total_chart_count     total-chart-count
    :top_md                (str/join "\n\n---\n\n" (map full-block top-blocks))
    :awareness_blocks      (boolean (seq awareness-blocks))
    :slim_md               (str/join "\n\n---\n\n" (map slim-block awareness-blocks))}))

(defn- extract-doc [response]
  (when (map? response)
    (or (:document response) (get response "document"))))

;;; ----- static cardEmbed validation -----
;;;
;;; The LLM emits `cardEmbed` nodes that reference a `stored_result_id` (static mode). The
;;; generic prose-mirror validator accepts `cardEmbed` shape but doesn't know about the
;;; static-mode attrs, so we register a per-node validator here. The doc persists these nodes
;;; verbatim — the frontend resolves them at render time via `/api/document/stored-result/:id`.

(defn- validate-static-card-embed
  "Validator passed to [[documents/validate-prose-mirror]] via `:custom-block-nodes`. Runs on
  every `cardEmbed` node. For static-mode embeds (those carrying `:stored_result_id`)
  confirms the id is an integer, the optional `sort` attr is enumerated, and the node has no
  children. Live-mode embeds (with `:id`) are passed through — the generic validator handles
  them."
  [node path]
  (let [attrs    (or (get node :attrs) (get node "attrs"))
        sr-id    (or (get attrs :stored_result_id) (get attrs "stored_result_id"))
        sort-val (or (get attrs :sort) (get attrs "sort"))
        content  (or (get node :content) (get node "content"))]
    (cond
      ;; Live-mode embed: defer to the generic validator.
      (and (nil? sr-id) (some? (or (get attrs :id) (get attrs "id"))))
      []

      :else
      (cond-> []
        (not (or (integer? sr-id)
                 (and (string? sr-id) (re-matches #"\d+" sr-id))))
        (conj (str path ".attrs.stored_result_id: must be an integer, got "
                   (pr-str sr-id)))

        (and (some? sort-val) (not (contains? allowed-chart-sorts sort-val)))
        (conj (str path ".attrs.sort: must be one of "
                   (str/join ", " (sort allowed-chart-sorts))
                   " (or omitted), got " (pr-str sort-val)))

        content
        (conj (str path ": cardEmbed must not have a `content` array"
                   " (it's a leaf node); got " (count content) " children"))))))

(def ^:private validation-opts
  {:custom-block-nodes {prose-mirror/card-embed-type validate-static-card-embed}})

(defn- node-type [node]
  (when (map? node)
    (or (get node :type) (get node "type"))))

(defn- card-embed-stored-result-id
  "Pull a numeric `stored_result_id` out of a static `cardEmbed` node, tolerating string /
  keyword keys and numeric strings. Returns nil for live-mode embeds (those without
  `:stored_result_id`)."
  [node]
  (when (= prose-mirror/card-embed-type (node-type node))
    (let [attrs (or (get node :attrs) (get node "attrs"))
          raw   (or (get attrs :stored_result_id)
                    (get attrs "stored_result_id"))]
      (cond
        (integer? raw) raw
        (string? raw)  (try (Long/parseLong raw) (catch Exception _ nil))))))

(defn- card-embed-sort
  "Pull the validated `sort` attribute out of a static `cardEmbed` node, or nil when absent."
  [node]
  (let [attrs (or (get node :attrs) (get node "attrs"))
        raw   (or (get attrs :sort) (get attrs "sort"))]
    (when (contains? allowed-chart-sorts raw) raw)))

(defn- all-static-card-embed-nodes
  "Walk `pm-doc` depth-first and return every static-mode `cardEmbed` node (those carrying a
  parseable `:stored_result_id`) in document order. Live-mode embeds are skipped."
  [pm-doc]
  (cond
    (and (map? pm-doc)
         (= prose-mirror/card-embed-type (node-type pm-doc))
         (card-embed-stored-result-id pm-doc))
    [pm-doc]

    (map? pm-doc)
    (mapcat all-static-card-embed-nodes
            (or (:content pm-doc) (get pm-doc "content")))

    (sequential? pm-doc)
    (mapcat all-static-card-embed-nodes pm-doc)

    :else []))

(defn- validate-categorical-sorts
  "Require a `sort` attribute on every static `cardEmbed` whose underlying chart has a
  categorical x-axis. The model's prompt already calls this out as REQUIRED, but the JSON
  schema can't express it (temporal/numeric charts must omit sort). Without this check the
  analyst can write prose calling for a specific ordering and forget to attach the structured
  attribute, which silently renders the chart in query order. The per-node validator already
  enforces enum membership when sort is present — this only enforces presence.

  `categorical-chart-ids` is a set of `stored_result_id`s."
  [pm-doc categorical-chart-ids]
  (->> (all-static-card-embed-nodes pm-doc)
       (keep (fn [node]
               (let [sr-id (card-embed-stored-result-id node)
                     sort  (card-embed-sort node)]
                 (when (and sr-id
                            (contains? categorical-chart-ids sr-id)
                            (nil? sort))
                   (str "cardEmbed with stored_result_id="
                        sr-id " has a categorical x-axis but no `sort` attribute. "
                        "Pick one of \"value_desc\", \"value_asc\", \"label_asc\", "
                        "or \"label_desc\" — see the prompt's sort decision tree.")))))
       vec))

(defn- validate-no-duplicate-embeds
  "Flag any pair of static `cardEmbed`s that share the same (stored_result_id, sort) — they
  render identically, which is almost always an oversight where the prose calls for two
  distinct orderings of the same chart but the second embed lost its sort attribute. The
  error message names a concrete fix."
  [pm-doc]
  (->> (all-static-card-embed-nodes pm-doc)
       (map (juxt card-embed-stored-result-id card-embed-sort))
       (filter first)        ; ids that didn't parse are caught by the per-node validator
       frequencies
       (keep (fn [[[sr-id sort] n]]
               (when (> n 1)
                 (str "cardEmbed for stored_result_id=" sr-id
                      " appears " n " times with the same sort=" (pr-str sort)
                      ". Repeats of the same chart must use distinct sorts "
                      "(e.g. value_desc + value_asc to show top contributors "
                      "vs. underperformers) — otherwise both embeds render "
                      "identically. Pick different sorts or remove the duplicate."))))
       vec))

(defn- validate-doc
  "Phase-2 document validator. Combines:
   - the generic prose-mirror schema validation (knows the standard node types,
     including `cardEmbed`, with the static-mode validator layered via `validation-opts`),
   - the categorical-sort presence check (over static-mode embeds), and
   - the duplicate-embed check.
  Returns one flat vector of error strings so the repair prompt can address
  them all in a single retry."
  [pm-doc categorical-chart-ids]
  (vec (concat (documents/validate-prose-mirror pm-doc validation-opts)
               (validate-categorical-sorts pm-doc categorical-chart-ids)
               (validate-no-duplicate-embeds pm-doc))))

(defn- repair-prompt
  "Repair message for Phase 2 (analysis): point at the prose-mirror validation
  errors in the previous response and ask for a corrected document."
  [previous-doc errors]
  (let [echo (pr-str previous-doc)
        echo (if (<= (count echo) max-repair-echo-chars)
               echo
               (str (subs echo 0 max-repair-echo-chars) "\n... (truncated)"))]
    (prompts/render
     "phase2_repair.selmer"
     {:no_tool_call  (nil? previous-doc)
      :errors        (common/format-errors errors)
      :previous_echo echo})))

(defn run-analysis!
  "Phase 2 entry point. `prompt` is the pre-rendered prompt string built by
  [[build-analysis-prompt]]; `categorical-chart-ids` is the set of
  exploration_query_ids whose underlying chart has a categorical x-axis
  (used by [[validate-categorical-sorts]] to require a `sort` attr on every
  embed of those charts). Returns
  `{:value :attempts :outcome [:final-errors]}` where `:value` is the
  validated ProseMirror document map."
  [thread-id prompt categorical-chart-ids]
  (common/run-with-repair {:thread-id      thread-id
                           :phase-name     "phase-2"
                           :llm-config     llm-config
                           :prompt         prompt
                           :schema         response-schema
                           :extract-fn     extract-doc
                           :validate-fn    #(validate-doc % categorical-chart-ids)
                           :repair-builder repair-prompt}))

