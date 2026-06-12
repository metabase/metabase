(ns metabase.explorations.ai-summary.phase2
  "Phase 2 — ANALYSIS.

  Given the Phase-1 curation, the analyst LLM produces the ProseMirror document
  the user sees. This namespace holds the phase-2 LLM config, schema,
  slim/full chart block renderers, prompt builder, validation (including the
  per-node validator for static-mode `cardEmbed` nodes), the repair-prompt
  builder, and the `run-analysis!` entry point. Display + visualization_settings
  live on the `stored_result` row, written once by the query runner — Phase 2
  doesn't touch viz config and the doc keeps the LLM-emitted nodes verbatim.

  Common chart-rendering and LLM-call infrastructure lives in
  [[metabase.explorations.ai-summary.common]]."
  (:require
   [clojure.string :as str]
   [metabase.documents.core :as documents]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.explorations.ai-summary.common :as common]
   [metabase.explorations.ai-summary.prompts :as prompts]
   [metabase.interestingness.core :as interestingness]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.queries.core :as queries]))

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

(defn llm-config
  "Phase-2 LLM settings. Analysis composes a research-paper-style document,
  correlates timeline events with data inflections, judges evidence strength,
  and structures the argument — the most reasoning-intensive step in the
  pipeline, run with high-effort extended thinking when possible."
  []
  {:model           (metabot.settings/llm-metabot-provider)
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

(defn x-axis-kind
  "Classify a chart-config's x-axis type for sort-attribute purposes. Returns one of
  `:categorical`, `:temporal`, `:numeric`, or `:unknown`. Drives the per-chart sort
  instruction in [[full-block]] and the categorical set passed into
  [[validate-categorical-sorts]] — funneling both readers through one helper keeps the
  prompt and the validator from disagreeing about which charts require sort."
  [cfg]
  (let [xt (some-> cfg :series first val :x :type)]
    (cond
      (#{"datetime" "date" "time"} xt) :temporal
      (= "number" xt)                  :numeric
      xt                               :categorical
      :else                            :unknown)))

(defn- sort-instruction-line
  "Per-chart directive inserted into [[full-block]] telling the model exactly what to do with
  the `sort` attribute on a `cardEmbed` referencing this chart. The categorical-vs-non-
  categorical decision is computed deterministically here so the model never has to infer it
  from column metadata — the inference miss is the failure mode behind the most common
  Phase-2 repair round."
  [cfg]
  (case (x-axis-kind cfg)
    :categorical "- **sort attribute**: REQUIRED — choose one of \"value_desc\", \"value_asc\", \"label_asc\", \"label_desc\"."
    :temporal    "- **sort attribute**: OMIT — rows are already in chronological order."
    :numeric     "- **sort attribute**: OMIT — rows are already in binned order."
    :unknown     "- **sort attribute**: OMIT."))

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
         "- **dim**: " (or dim-detail "(unknown)") "\n"
         (sort-instruction-line cfg) "\n\n"
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

(defn- breakout-heading
  "Header for one breakout (metric × dimension × segment) above its rendering variants. When a
  breakout has more than one rendering, tells the analyst to embed just the best-fitting one."
  [{:keys [representative variants]}]
  (let [{:keys [metric-detail dim-detail]} representative
        n (count variants)]
    (str "## Breakout: " (or metric-detail "(metric)") " by " (or dim-detail "(dimension)")
         (when (> n 1)
           (str "\n_" n " renderings of this breakout are available below — embed the ONE that best "
                "supports the point you're making; do not embed several renderings of the same breakout._"))
         "\n")))

(defn- sibling-block
  "Lighter rendering for a NON-primary variant of a top-tier breakout. Same identity + chart
  Markdown + pre-computed key points as a full block, but WITHOUT the verbatim
  `Actual data points` dump — that dump is the dominant prompt-token cost and the variants of
  one breakout are alternate views of the same underlying data. The analyst can still embed
  this rendering; for verbatim point-by-point values it cites the primary rendering, whose
  full dump is one block above. `primary-srid` names that primary."
  [primary-srid {:keys [stored-result-id name cfg stats dim-detail metric-detail chart-description]}]
  (let [repr    (interestingness/generate-representation
                 {:title                  (:title cfg)
                  :display-type           (:display_type cfg)
                  :stats                  stats
                  :omit-temporal-context? true})
        key-pts (render-key-points-section cfg stats)]
    (str "### stored_result_id " stored-result-id " — " name " (alternate rendering)\n\n"
         (when chart-description
           (str "- **chart**: " chart-description "\n"))
         "- **metric**: " (or metric-detail "(unknown)") "\n"
         "- **dim**: " (or dim-detail "(unknown)") "\n"
         (sort-instruction-line cfg) "\n\n"
         "Alternate rendering of the same breakout — embed via `stored_result_id: "
         stored-result-id "`. Verbatim point-by-point values are NOT repeated here; for those, "
         "cite the primary rendering (`stored_result_id: " primary-srid "`) above.\n\n"
         repr
         (when key-pts (str "\n\n" key-pts)))))

(defn- top-breakout-block
  "Top-tier breakout rendering: the heading, then the FULL block (with verbatim data points)
  for the representative rendering, then a lighter `sibling-block` (no verbatim dump) for each
  remaining rendering. Cuts the per-breakout verbatim data from N× to 1× while keeping every
  rendering embeddable."
  [{:keys [variants] :as breakout}]
  (let [[primary & siblings] variants
        primary-srid (:stored-result-id primary)]
    (str (breakout-heading breakout) "\n"
         (full-block primary)
         (when (seq siblings)
           (str "\n\n" (str/join "\n\n" (map #(sibling-block primary-srid %) siblings)))))))

(defn- breakout-block
  "Render one curated breakout: the heading followed by each rendering variant via `render-fn`
  (used for the awareness tier with `slim-block` — every awareness variant is summary-only, so
  there's no verbatim dump to dedup)."
  [render-fn breakout]
  (str (breakout-heading breakout) "\n"
       (str/join "\n\n" (map render-fn (:variants breakout)))))

(defn build-analysis-prompt
  "Phase 2 prompt: research-paper-shaped AI Summary document grounded in the Phase-1-curated
  breakouts. Each curated breakout is rendered as a listing of its rendering variants (full
  data for top-tier, summary for awareness) so the analyst can embed whichever rendering best
  supports each point. The Selmer template lives at
  `resources/explorations/ai_summary/prompts/phase2_analysis.selmer`."
  [{:keys [thread-prompt selections curation-rationale timelines
           top-breakouts awareness-breakouts
           total-chart-count pool-size]}]
  (prompts/render
   "phase2_analysis.selmer"
   {:temporal_context      (interestingness/temporal-context)
    :thread_prompt         (when-not (str/blank? thread-prompt) thread-prompt)
    :selections            (when (seq selections) (str/join "\n" selections))
    :curation_rationale    (when-not (str/blank? curation-rationale) curation-rationale)
    :timeline_md           (common/format-timeline-events timelines)
    :top_block_count       (count top-breakouts)
    :awareness_block_count (count awareness-breakouts)
    :pool_size             pool-size
    :total_chart_count     total-chart-count
    :top_md                (str/join "\n\n---\n\n" (map top-breakout-block top-breakouts))
    :awareness_blocks      (boolean (seq awareness-breakouts))
    :slim_md               (str/join "\n\n---\n\n" (map #(breakout-block slim-block %) awareness-breakouts))}))

(defn- extract-doc [response]
  (when (map? response)
    (:document response)))

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
  (let [{:keys [attrs content]} node
        {:keys [stored_result_id sort id]} attrs
        sr-id stored_result_id]
    (if (and (nil? sr-id) (some? id))
      ;; Live-mode embed: defer to the generic validator.
      []
      (cond-> []
        (not (or (integer? sr-id)
                 (and (string? sr-id) (re-matches #"\d+" sr-id))))
        (conj (str path ".attrs.stored_result_id: must be an integer, got "
                   (pr-str sr-id)))

        (and (some? sort) (not (contains? queries/allowed-chart-sorts sort)))
        (conj (str path ".attrs.sort: must be one of "
                   (str/join ", " (clojure.core/sort queries/allowed-chart-sorts))
                   " (or omitted), got " (pr-str sort)))

        content
        (conj (str path ": cardEmbed must not have a `content` array"
                   " (it's a leaf node); got " (count content) " children"))))))

(def ^:private validation-opts
  {:custom-block-nodes {prose-mirror/card-embed-type validate-static-card-embed}})

(defn- node-type [node]
  (when (map? node)
    (:type node)))

(defn- card-embed-stored-result-id
  "Pull a numeric `stored_result_id` out of a static `cardEmbed` node, tolerating numeric
  strings. Returns nil for live-mode embeds (those without `:stored_result_id`)."
  [node]
  (when (= prose-mirror/card-embed-type (node-type node))
    (let [raw (get-in node [:attrs :stored_result_id])]
      (cond
        (integer? raw) raw
        (string? raw)  (try (Long/parseLong raw) (catch Exception _ nil))))))

(defn- card-embed-sort
  "Pull the validated `sort` attribute out of a static `cardEmbed` node, or nil when absent."
  [node]
  (let [raw (get-in node [:attrs :sort])]
    (when (contains? queries/allowed-chart-sorts raw) raw)))

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
    (mapcat all-static-card-embed-nodes (:content pm-doc))

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
  (let [raw  (pr-str previous-doc)
        echo (if (<= (count raw) max-repair-echo-chars)
               raw
               (str (subs raw 0 max-repair-echo-chars) "\n... (truncated)"))]
    (prompts/render
     "phase2_repair.selmer"
     {:no_tool_call  (nil? previous-doc)
      :errors        (common/format-errors errors)
      :previous_echo echo})))

(defn run-analysis!
  "Phase 2 entry point. `prompt` is the pre-rendered prompt string built by
  [[build-analysis-prompt]]; `categorical-chart-ids` is the set of
  stored_result_ids whose underlying chart has a categorical x-axis
  (used by [[validate-categorical-sorts]] to require a `sort` attr on every
  embed of those charts). Returns
  `{:value :attempts :outcome [:final-errors]}` where `:value` is the
  validated ProseMirror document map."
  [thread-id prompt categorical-chart-ids]
  (common/run-with-repair {:thread-id      thread-id
                           :phase-name     "phase-2"
                           :llm-config     (llm-config)
                           :prompt         prompt
                           :schema         response-schema
                           :extract-fn     extract-doc
                           :validate-fn    #(validate-doc % categorical-chart-ids)
                           :repair-builder repair-prompt}))
