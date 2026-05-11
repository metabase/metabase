(ns metabase.explorations.auto-insights.phase2
  "Phase 2 — ANALYSIS.

  Given the Phase-1 curation, the analyst LLM produces the ProseMirror document
  the user sees. This namespace holds the phase-2 LLM config, schema,
  slim/full chart block renderers, prompt builder, validation (including the
  per-node validator for the `explorationChart` placeholder type), the
  repair-prompt builder, the `run-analysis!` entry point, and the chart-
  materialization pipeline that resolves `explorationChart` placeholders into
  real `cardEmbed` nodes.

  Common chart-rendering and LLM-call infrastructure lives in
  [[metabase.explorations.auto-insights.common]]."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.documents.core :as documents]
   [metabase.explorations.auto-insights.common :as common]
   [metabase.interestingness.core :as interestingness]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.queries.core :as queries]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----- chart block rendering (phase-2 only — phase-1 uses the much shorter index entry) -----

(def ^:private max-data-points-per-series
  "Cap on how many (x, y) pairs to dump per series in the full chart block.
  For longer series we pick evenly-spaced indices so the model still sees the
  actual shape (start, middle, end + a uniform sample) rather than only stats.
  Picked so a typical chart block stays well under ~1KB even at the cap."
  40)

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
  (let [series (:series cfg)]
    (when (seq series)
      (str "**Actual data points (chronological)** — every numeric claim and date in your output MUST appear in this list verbatim:\n"
           (str/join
            "\n"
            (for [[sname {:keys [x_values y_values]}] series
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
   :thinking-config {:type "enabled" :budget_tokens 8000}})

(defn slim-block
  "Awareness-tier rendering: title + metric/dim detail + summary line +
  key-points. No stats Markdown, no verbatim data points dump. The model
  knows the chart exists and the gist, but won't cite values from it."
  [{:keys [exploration-query-id name summary-line dim-detail metric-detail cfg stats]}]
  (let [key-pts (render-key-points-section cfg stats)]
    (str "### exploration_query_id " exploration-query-id " — " name "\n\n"
         "- **metric**: " (or metric-detail "(unknown)") "\n"
         "- **dim**: " (or dim-detail "(unknown)") "\n"
         "- **summary**: " summary-line "\n\n"
         (when key-pts (str key-pts "\n\n"))
         "_Awareness-tier chart — you know it exists, but full data points are not provided. "
         "If you need to cite values from this chart, mention it in `Suggestions for further "
         "exploration` instead._")))

(defn full-block
  "Top-tier rendering: title + metric/dim detail + full chart Markdown
  representation, pre-computed key points, AND the verbatim (x, y) data
  points list the model must ground citations against."
  [{:keys [exploration-query-id name cfg stats dim-detail metric-detail]}]
  (let [repr    (interestingness/generate-representation
                 {:title        (:title cfg)
                  :display-type (:display_type cfg)
                  :stats        stats})
        key-pts (render-key-points-section cfg stats)
        points  (render-data-points cfg)
        extras  (str/join "\n\n" (remove nil? [key-pts points]))]
    (str "### exploration_query_id " exploration-query-id " — " name "\n\n"
         "- **metric**: " (or metric-detail "(unknown)") "\n"
         "- **dim**: " (or dim-detail "(unknown)") "\n\n"
         "When referencing this chart in an `explorationChart` node, use "
         "`exploration_query_id: " exploration-query-id "`.\n\n"
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
  "Sort attribute values an `explorationChart` placeholder is allowed to
  request. The set is intentionally small — it's an enum the LLM picks from
  rather than free-form sort expressions."
  #{"value_desc" "value_asc" "label_asc" "label_desc"})

(defn build-analysis-prompt
  "Phase 2 prompt: research-paper-shaped Automatic Insights document grounded
  in the Phase-1-curated chart set. Top-tier charts (full data) are listed
  before awareness-tier (slim) so the model encounters the citation-grade
  evidence first. Timeline events are included in their own section and
  treated as a major analytical signal whenever they're present."
  [{:keys [thread-prompt selections curation-rationale timelines
           top-blocks awareness-blocks
           total-chart-count pool-size]}]
  (let [intro (str "You are writing an Automatic Insights report for a completed Metabase data\n"
                   "exploration. This is an ANALYSIS document — a short research-paper-style\n"
                   "write-up that uses the supplied charts as evidence — NOT a tour of the charts\n"
                   "or a one-paragraph summary per chart.\n"
                   "\n"
                   "PRIMARY GOAL:\n"
                   "Answer the user's question using the data. The charts are evidence; the prose\n"
                   "is the argument. If the data answers the question, say so and prove it. If the\n"
                   "data is inconclusive or contradicts itself, say *that* clearly and prove\n"
                   "*that*. Either way, the supporting charts must be embedded inline at the\n"
                   "moment they support the surrounding sentence — not collected into a gallery.\n"
                   "\n"
                   "The user picked a set of metrics, dimensions, and (optionally) timelines, and\n"
                   "the system generated one chart per (metric × dimension × segment) combination.\n"
                   "A curator (an earlier LLM pass) selected " (count top-blocks) " charts for\n"
                   "TOP-TIER analysis (full data points provided — you may cite specific values\n"
                   "verbatim) and " (count awareness-blocks) " charts for AWARENESS only (you\n"
                   "know they exist; only key-points and a summary are provided — don't cite\n"
                   "values from them, but consider them when suggesting next steps). These were\n"
                   "picked from a pool of " pool-size " upstream-ranked charts (out of "
                   total-chart-count " total).\n"
                   "\n"
                   "CURATOR'S RATIONALE (from Phase 1):\n"
                   (if (str/blank? curation-rationale)
                     "(none provided)"
                     curation-rationale)
                   "\n"
                   "\n"
                   "GROUNDING — NON-NEGOTIABLE:\n"
                   "Each chart block contains a verbatim list of `(x, y)` data points labeled\n"
                   "**Actual data points (chronological)**. EVERY numeric value, date, label, peak,\n"
                   "trough, comparison, and percentage you cite MUST come from those lists. Do NOT\n"
                   "interpolate, extrapolate, or invent values that aren't in the list. If a list\n"
                   "is downsampled (the header will say so), only cite values that actually appear\n"
                   "in the sample — do not guess what's between them. If the data doesn't support\n"
                   "a claim, don't make the claim. A shorter analysis that's correct beats a longer\n"
                   "one that fabricates.\n"
                   "\n"
                   "Before writing each sentence with a number/date in it, find the matching point\n"
                   "in the data list. If you can't find it, drop the sentence.\n"
                   "\n"
                   "DOCUMENT STRUCTURE (required — model after a short research paper):\n"
                   "\n"
                   "1. **Abstract** — heading level 2, titled `Abstract`. One concise paragraph\n"
                   "   (2-4 sentences) stating the user's question, the answer you reached, and\n"
                   "   the strength of the evidence. If the data is inconclusive, say so here.\n"
                   "   No chart embeds in this section.\n"
                   "\n"
                   "2. **Discussion** — heading level 2, titled `Discussion`. The body of the\n"
                   "   document. This is where you build the argument. Embed `explorationChart`\n"
                   "   nodes INLINE, mid-discussion, immediately after the paragraph whose claim\n"
                   "   they support — so each chart functions as a proof point, not a standalone\n"
                   "   item.\n"
                   "\n"
                   "   Organize the discussion into level-3 sub-sections (each with a short,\n"
                   "   descriptive heading) that group the argument by *idea*, not by chart.\n"
                   "   Good sub-section titles describe what the section argues — e.g. `Growth\n"
                   "   is concentrated in two regions`, `Seasonality alone doesn't explain the\n"
                   "   Q4 dip`, `Where the evidence is weakest`. Bad ones name a chart or a\n"
                   "   dimension. Use as many sub-sections as the argument needs; a very short\n"
                   "   discussion may have none. Don't structure it as one sub-section per chart.\n"
                   "\n"
                   "   The discussion should walk the reader through the reasoning: what the data\n"
                   "   shows, what it means for the question, where the evidence is strong, where\n"
                   "   it's weak, what contradicts the leading explanation, and which charts\n"
                   "   support each step. If data points are sparse, noisy, or downsampled (the\n"
                   "   chart's `**Note**:` warnings will say so), discuss that here.\n"
                   "\n"
                   "3. **Conclusion** — heading level 2, titled `Conclusion`. One short paragraph\n"
                   "   re-stating the answer (or the lack of one) in light of the discussion. No\n"
                   "   new evidence here. Then a level-3 sub-heading `Suggestions for further\n"
                   "   exploration` containing a bulletList with concrete next steps: additional\n"
                   "   data that would sharpen the answer, follow-up questions worth asking,\n"
                   "   alternative causes worth checking, dimensions to break out by, segments to\n"
                   "   filter to, timelines whose events might explain notable moments. Only\n"
                   "   suggest things plausibly reachable from the current dataset.\n"
                   "\n"
                   "Output format: you MUST emit your final answer by calling the\n"
                   "`structured_output` tool exactly once, with a single argument\n"
                   "`{\"document\": <prose-mirror-doc>}`. The document is the full page the user\n"
                   "will see. Do not emit the document as free text — only the tool call counts.\n"
                   "Use your thinking/reasoning to plan, then call the tool with the final result.\n"
                   "\n"
                   "SUPPORTED NODE TYPES (ProseMirror):\n"
                   "- Root: `{\"type\": \"doc\", \"content\": [<block>, ...]}`\n"
                   "- Block: paragraph, heading (`attrs.level` 1-3), bulletList, orderedList,\n"
                   "  blockquote, explorationChart.\n"
                   "  - paragraph:  `{\"type\": \"paragraph\", \"content\": [<inline>, ...]}`\n"
                   "  - heading:    `{\"type\": \"heading\", \"attrs\": {\"level\": 2},\n"
                   "                  \"content\": [<inline>, ...]}`\n"
                   "  - bulletList: `{\"type\": \"bulletList\", \"content\": [<listItem>, ...]}`\n"
                   "  - listItem:   `{\"type\": \"listItem\", \"content\": [<paragraph>, ...]}`\n"
                   "  - blockquote: `{\"type\": \"blockquote\", \"content\": [<block>, ...]}`\n"
                   "  - explorationChart: `{\"type\": \"explorationChart\",\n"
                   "                        \"attrs\": {\"exploration_query_id\": <int>,\n"
                   "                                  \"sort\": \"value_desc\"}}`\n"
                   "    Use this to embed one of the supplied charts inline as a proof point.\n"
                   "    Place it immediately after the paragraph whose claim it supports.\n"
                   "    Reference an exploration_query_id from the CHARTS section below — do not\n"
                   "    invent ids. Embed as many charts as the analysis genuinely needs — every\n"
                   "    embed should materially advance the argument, but don't ration them\n"
                   "    artificially. If the argument needs ten proof points, use ten; if it\n"
                   "    only needs two, use two.\n"
                   "\n"
                   "    The `sort` attribute controls how the embedded chart is ordered, and\n"
                   "    is REQUIRED for every embed whose x-axis is a category (state, source,\n"
                   "    category, vendor, etc.) — without it the chart comes back in query\n"
                   "    order, which is almost never what the reader needs. PICK THE SORT THAT\n"
                   "    BEST SUPPORTS THE POINT YOU'RE MAKING; the same chart can be shown\n"
                   "    twice with different sorts to make different points.\n"
                   "\n"
                   "    Decision tree for each embed:\n"
                   "      1. Is the x-axis a TIME column (year/month/day/etc.) or a NUMERIC\n"
                   "         column (price bucket, count bucket, etc.)?\n"
                   "         → OMIT `sort`. Chronological / numeric order is correct.\n"
                   "      2. Otherwise (categorical x-axis): WHAT POINT IS THIS EMBED MAKING?\n"
                   "         • Ranking / showing concentration / \"which is biggest\":\n"
                   "           → `\"value_desc\"` (largest first). This is the default\n"
                   "             choice for comparison/ranking arguments — use it whenever\n"
                   "             you're saying \"X dominates\", \"top contributors are…\",\n"
                   "             \"revenue is concentrated in…\", or similar.\n"
                   "         • Finding outliers / underperformers / \"which is smallest\":\n"
                   "           → `\"value_asc\"` (smallest first).\n"
                   "         • LOOKUP — the reader needs to find a specific named category\n"
                   "           (e.g. \"how did Texas perform?\" in a US-states chart):\n"
                   "           → `\"label_asc\"` (alphabetical).\n"
                   "         • Reverse alphabetical: → `\"label_desc\"` (rare).\n"
                   "\n"
                   "    The default for a categorical comparison is `value_desc`. If you're\n"
                   "    not sure, use `value_desc`. Only use `label_asc` when the surrounding\n"
                   "    prose specifically tells the reader to look something up by name.\n"
                   "    Sort is applied via a query order-by when the chart is rendered.\n"
                   "- Inline: `{\"type\": \"text\", \"text\": \"...\"}`, optionally with\n"
                   "  `\"marks\": [{\"type\": \"bold\"}]` or `{\"type\": \"italic\"}` or\n"
                   "  `{\"type\": \"code\"}`.\n"
                   "\n"
                   "TONE & CALIBRATION:\n"
                   "- Write like an analyst answering a question, not a tour guide describing\n"
                   "  charts. The user can see each chart you embed — don't restate what's on it;\n"
                   "  tell them what it MEANS for the question.\n"
                   "- Don't list summary statistics (mean, std-dev, trend) at the user — use\n"
                   "  those numbers to support the argument, not as the argument itself.\n"
                   "  GOOD: \"Revenue dropped 42% after the pricing change, concentrated in\n"
                   "         enterprise deals — see the chart below.\"\n"
                   "  BAD:  \"The mean is 45.2, std dev 12.8, trend -15%, with peaks at...\".\n"
                   "- Round all percent changes to ONE decimal place when you cite them in\n"
                   "  prose: write `+29,314.1%`, not `+29,314.13%` or `+29314.125%`. The\n"
                   "  pre-computed key-points already follow this; mirror that precision in\n"
                   "  your own numbers. False precision suggests certainty the data doesn't\n"
                   "  support.\n"
                   "- When a chart has a `**Note**:` warning about small values, high variance,\n"
                   "  or limited data points, treat it as a caveat on the evidence and say so in\n"
                   "  the discussion. Small denominators make percentage changes unreliable.\n"
                   "- TIMELINE EVENTS — when present (see the TIMELINE EVENTS section), they are\n"
                   "  a MAJOR part of the analysis. Walk through the relevant events explicitly.\n"
                   "  For each notable inflection point in the data (peak, trough, sustained\n"
                   "  level shift, sudden trend change), check whether a timeline event sits\n"
                   "  within ~1 bucket of the inflection. If it does, name the event and date,\n"
                   "  describe the data movement, and (when reasonable) suggest the causal link.\n"
                   "  Do NOT force a correlation that isn't there — if the events don't align\n"
                   "  with the inflections, say so plainly (\"the [event name] in [date]\n"
                   "  doesn't appear to have moved the data — revenue continued its prior\n"
                   "  trend\"). Either alignment or non-alignment is a finding the user wants\n"
                   "  to know. Treat the timeline analysis as a first-class part of the\n"
                   "  Discussion, not as a footnote.\n"
                   "- A null/inconclusive finding is a finding. Say it plainly and explain why\n"
                   "  the available evidence is insufficient.\n"
                   "\n"
                   "STYLE: Direct, analytical, specific. Avoid hedging language like 'it appears'\n"
                   "and 'might suggest' unless you are explicitly flagging weak evidence.\n"
                   "\n"
                   "---\n\n")
        question (if (str/blank? thread-prompt)
                   "USER QUESTION: (none provided — infer from the metrics/dimensions selected)\n"
                   (str "USER QUESTION:\n" thread-prompt "\n"))
        sel-text (if (seq selections)
                   (str "SELECTIONS:\n" (str/join "\n" selections) "\n")
                   "")
        timeline-md (common/format-timeline-events timelines)
        top-md   (str/join "\n\n---\n\n" (map full-block top-blocks))
        slim-md  (str/join "\n\n---\n\n" (map slim-block awareness-blocks))]
    (str intro
         question "\n"
         sel-text "\n"
         (when timeline-md (str "---\n\n" timeline-md "\n\n"))
         "---\n\nTOP-TIER CHARTS (full data — cite values from these):\n\n"
         top-md
         (when (seq awareness-blocks)
           (str "\n\n---\n\nAWARENESS-TIER CHARTS (summary only — context, not citation):\n\n"
                slim-md)))))

(defn- extract-doc [response]
  (when (map? response)
    (or (:document response) (get response "document"))))

;;; ----- explorationChart placeholder validation -----
;;;
;;; The LLM emits `explorationChart` placeholder nodes that reference an
;;; `exploration_query_id`; we resolve them to real `cardEmbed`s in
;;; [[materialize-chart-embeds]]. The generic prose-mirror validator doesn't
;;; know about this node type, so we register a per-node validator here.

(defn- validate-exploration-chart
  "Validator passed to [[documents/validate-prose-mirror]] via
  `:custom-block-nodes`. Confirms the placeholder has an integer
  `exploration_query_id` attr, an optional but enumerated `sort` attr, and
  no children."
  [node path]
  (let [attrs    (or (get node :attrs) (get node "attrs"))
        eq-id    (or (get attrs :exploration_query_id) (get attrs "exploration_query_id"))
        sort-val (or (get attrs :sort) (get attrs "sort"))
        content  (or (get node :content) (get node "content"))]
    (cond-> []
      (not (or (integer? eq-id)
               (and (string? eq-id) (re-matches #"\d+" eq-id))))
      (conj (str path ".attrs.exploration_query_id: must be an integer, got "
                 (pr-str eq-id)))

      (and (some? sort-val) (not (contains? allowed-chart-sorts sort-val)))
      (conj (str path ".attrs.sort: must be one of "
                 (str/join ", " (sort allowed-chart-sorts))
                 " (or omitted), got " (pr-str sort-val)))

      content
      (conj (str path ": explorationChart must not have a `content` array"
                 " (it's a leaf node); got " (count content) " children")))))

(def ^:private validation-opts
  {:custom-block-nodes {"explorationChart" validate-exploration-chart}})

(defn- validate-doc [pm-doc]
  (documents/validate-prose-mirror pm-doc validation-opts))

(defn- repair-prompt
  "Repair message for Phase 2 (analysis): point at the prose-mirror validation
  errors in the previous response and ask for a corrected document."
  [previous-doc errors]
  (str "The document you returned doesn't conform to the supported ProseMirror schema. "
       "Here are the structural errors I found (paths are JSONPath-style into the document):\n\n"
       (common/format-errors errors)
       "\n\nReturn a corrected JSON object with the SAME analytical content (don't rewrite the prose) "
       "but a valid `document` tree. Allowed node types are listed in my previous message.\n\n"
       "Your previous document was:\n```json\n"
       (pr-str previous-doc)
       "\n```"))

(defn run-analysis!
  "Phase 2 entry point. `prompt` is the pre-rendered prompt string built by
  [[build-analysis-prompt]]. Returns `{:value :attempts :outcome [:final-errors]}`
  where `:value` is the validated ProseMirror document map."
  [thread-id prompt]
  (common/run-with-repair {:thread-id      thread-id
                           :phase-name     "phase-2"
                           :llm-config     llm-config
                           :prompt         prompt
                           :schema         response-schema
                           :extract-fn     extract-doc
                           :validate-fn    validate-doc
                           :repair-builder repair-prompt}))

;;; ----- query sorting -----

(defn- mbql-query?
  "True when `dataset-query` is an MBQL query — either pMBQL (`:lib/type
  :mbql/query`) or legacy MBQLv1 (`:type :query`). Native queries return
  false. Handles keyword and string key/value variants since the source
  data isn't always normalized."
  [dataset-query]
  (let [lt (or (:lib/type dataset-query) (get dataset-query "lib/type"))
        t  (or (:type dataset-query)    (get dataset-query "type"))]
    (boolean
     (or (contains? #{:mbql/query "mbql/query"} lt)
         (contains? #{:query "query"} t)))))

(defn- has-existing-order-by?
  "True when `dataset-query` already specifies an order — either on the last
  pMBQL stage or in MBQLv1's inner query."
  [dataset-query]
  (or (seq (get-in dataset-query [:query :order-by]))
      (some seq (map :order-by (:stages dataset-query)))
      (some seq (map #(get % "order-by") (or (:stages dataset-query)
                                             (get dataset-query "stages"))))))

(defn- apply-chart-sort
  "Add the requested `order-by` to `dataset-query` based on the Phase-2
  `explorationChart` `:sort` attribute, using MLv2 so we work uniformly
  against pMBQL and legacy MBQLv1. The enum values map as:

      \"value_desc\" → ORDER BY <first aggregation> DESC
      \"value_asc\"  → ORDER BY <first aggregation> ASC
      \"label_asc\"  → ORDER BY <first breakout column>  ASC
      \"label_desc\" → ORDER BY <first breakout column>  DESC

  Returns the (possibly-modified) `dataset_query`. The transformation is a
  no-op — leaving the original query intact — when any of these is true:
   - `sort` is nil
   - the query isn't MBQL (e.g. native SQL)
   - the query already has an `order-by` (we respect existing sorts)
   - the requested sort needs a breakout / aggregation the query doesn't have
   - anything throws during the MLv2 round-trip"
  [dataset-query sort]
  (if (or (nil? sort)
          (not (mbql-query? dataset-query))
          (has-existing-order-by? dataset-query))
    dataset-query
    (try
      (let [db-id      (or (:database dataset-query) (get dataset-query "database"))
            mp         (lib-be/application-database-metadata-provider db-id)
            query      (lib/query mp dataset-query)
            ;; `aggregation-ref` produces an MLv2 `:aggregation` clause keyed to
            ;; the aggregation's `:lib/uuid` — that's the kind of ref `order-by`
            ;; wants. Calling order-by on the raw aggregation clause itself
            ;; throws "No method in multimethod 'ref-method'", which is what
            ;; the earlier implementation hit.
            has-agg?   (seq (lib/aggregations query))
            ;; Pass *column metadata* (not the raw breakout clause) so order-by
            ;; generates a fresh ref with its own `:lib/uuid`; passing the
            ;; clause directly produced a "Duplicate :lib/uuid" schema failure.
            first-brk  (first (lib/breakouts-metadata query))
            sorted     (case sort
                         "value_desc" (when has-agg? (lib/order-by query (lib/aggregation-ref query 0) :desc))
                         "value_asc"  (when has-agg? (lib/order-by query (lib/aggregation-ref query 0) :asc))
                         "label_asc"  (when first-brk (lib/order-by query first-brk :asc))
                         "label_desc" (when first-brk (lib/order-by query first-brk :desc))
                         nil)]
        (or sorted dataset-query))
      (catch Throwable e
        (log/warnf e "apply-chart-sort: failed to apply %s; leaving query untouched" (pr-str sort))
        dataset-query))))

;;; ----- chart materialization -----

(defn- materialize-chart-card!
  "Create a real Card in `doc`'s collection for `eq` (an `ExplorationQuery`),
  associated with the document. Mirrors the `/append` endpoint logic so the
  embedded chart behaves identically. Caller must establish a current-user
  binding (via [[metabase.request.core/with-current-user]]) before invoking.

  When `sort` is supplied (one of the values in [[allowed-chart-sorts]]), the
  Card's `dataset_query` is augmented with an `:order-by` so the rendered
  chart presents the data in the order the analyst wanted to make its point.
  See [[apply-chart-sort]] for the no-op cases (native queries, queries with
  an existing order-by, etc.).

  Display precedence:
    1. `(:display eq)` — explicit user override on the query
    2. `(:computed-display eq)` — the `effective-display-type` heuristic
       (line for temporal x, bar otherwise), populated upstream
    3. `(:display src-card)` — the source card's display
    4. `:table` — last-resort fallback"
  [doc eq sort]
  (let [src-card (t2/select-one [:model/Card :name :display :visualization_settings]
                                :id (:card_id eq))]
    (queries/create-card!
     {:name                   (or (:name eq) (:name src-card) "Chart")
      :type                   :question
      :dataset_query          (apply-chart-sort (:dataset_query eq) sort)
      :display                (or (some-> (:display eq) keyword)
                                  (some-> (:computed-display eq) keyword)
                                  (:display src-card)
                                  :table)
      :visualization_settings (or (:visualization_settings eq)
                                  (:visualization_settings src-card)
                                  {})
      :collection_id          (:collection_id doc)
      :document_id            (:id doc)}
     @api/*current-user*)))

(defn- node-type [node]
  (when (map? node)
    (or (get node :type) (get node "type"))))

(defn- explorationchart-eq-id
  "Pull a numeric exploration_query_id out of an `explorationChart` placeholder
  node, tolerating string/keyword keys and numeric strings."
  [node]
  (when (= "explorationChart" (node-type node))
    (let [attrs (or (get node :attrs) (get node "attrs"))
          raw   (or (get attrs :exploration_query_id)
                    (get attrs "exploration_query_id"))]
      (cond
        (integer? raw) raw
        (string? raw)  (try (Long/parseLong raw) (catch Exception _ nil))))))

(defn- explorationchart-sort
  "Pull the validated `sort` attribute out of an `explorationChart` placeholder
  node, or nil when absent. The validator has already enforced that the value
  is one of [[allowed-chart-sorts]] if present."
  [node]
  (let [attrs (or (get node :attrs) (get node "attrs"))
        raw   (or (get attrs :sort) (get attrs "sort"))]
    (when (contains? allowed-chart-sorts raw) raw)))

(defn- transform-nodes
  "Walk a ProseMirror tree depth-first, applying `f` to each node. `f` may
  return nil (drop), a single node, or a vector of nodes (splice in place)."
  [f node]
  (if-not (map? node)
    node
    (let [children-key (cond
                         (contains? node :content)  :content
                         (contains? node "content") "content"
                         :else                      nil)
          node'        (if children-key
                         (let [transformed (->> (get node children-key)
                                                (mapcat (fn [child]
                                                          (let [r (transform-nodes f child)]
                                                            (cond
                                                              (nil? r)    []
                                                              (vector? r) r
                                                              :else       [r]))))
                                                vec)]
                           (assoc node children-key transformed))
                         node)
          result       (f node')]
      result)))

(defn materialize-chart-embeds
  "Walk `pm-doc` and replace every `explorationChart` placeholder with a real
  `cardEmbed` (wrapped in `resizeNode`). One Card is created per unique
  (`exploration_query_id`, `sort`) pair — so the same chart can legitimately
  appear in the document twice with different orderings (e.g. value_desc to
  show top contributors and value_asc to show underperformers). Identical
  references reuse the cached Card. Unknown ids are dropped silently with a
  debug log. Caller must have established a current-user binding."
  [pm-doc eq-by-id doc]
  (let [card-cache (atom {})]            ; [eq-id sort] -> card-id
    (transform-nodes
     (fn [node]
       (if-let [eq-id (explorationchart-eq-id node)]
         (if-let [eq (get eq-by-id eq-id)]
           (let [sort     (explorationchart-sort node)
                 cache-k  [eq-id sort]
                 card-id  (or (get @card-cache cache-k)
                              (let [c (materialize-chart-card! doc eq sort)]
                                (swap! card-cache assoc cache-k (:id c))
                                (:id c)))]
             {:type    "resizeNode"
              :content [{:type "cardEmbed" :attrs {:id card-id :name nil}}]})
           (do (log/debugf "Dropping explorationChart with unknown id %s" eq-id) nil))
         node))
     pm-doc)))
