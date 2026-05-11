(ns metabase.explorations.auto-insights.phase1
  "Phase 1 — CURATION.

  Given the thin index of pre-ranked charts, the curator LLM picks which charts
  the analyst (Phase 2) gets and at what depth: TOP TIER (full data points, the
  analyst may cite values) or AWARENESS TIER (summary only, mentioned but not
  cited).

  Holds the phase-1 LLM config, schema, tier bounds, index-entry renderer,
  prompt builder, response extractor, validator, repair-prompt builder, and
  the `run-curation!` entry point. Common chart-rendering and LLM-call
  infrastructure lives in [[metabase.explorations.auto-insights.common]]."
  (:require
   [clojure.string :as str]
   [metabase.explorations.auto-insights.common :as common]))

(set! *warn-on-reflection* true)

(def llm-config
  "Phase-1 LLM settings. Curation is pattern matching against a
  richly-annotated index — Sonnet 4.6 with extended thinking handles the
  edge-case tie-breaking (near-duplicate charts, ambiguous question framing)
  noticeably better than Haiku while costing materially less than Opus."
  {:model           "anthropic/claude-sonnet-4-6"
   :temperature     1.0
   :max-tokens      16000
   :thinking-config {:type "enabled" :budget_tokens 8000}})

(defn index-entry
  "Phase-1 entry for one chart. Multi-line so the curator can tell apart
  charts that share a title but differ on dimension granularity, FK source,
  or aggregation type. Built from a `common/prep-chart` record."
  [{:keys [exploration-query-id name score summary-line dim-detail metric-detail]}]
  (str "- id=" exploration-query-id
       " score=" (format "%.2f" (double (or score 0.0)))
       " | " name "\n"
       "  metric: " (or metric-detail "(unknown)") "\n"
       "  dim:    " (or dim-detail "(unknown)") "\n"
       "  data:   " summary-line))

(def curation-schema
  "Phase-1 output: `{top_tier [ids] awareness_tier [ids] rationale string}`.
  Strict schema since the shape is simple and we want fast rejection of
  malformed responses."
  {:type                 "object"
   :properties           {:top_tier       {:type        "array"
                                           :items       {:type "integer"}
                                           :description "exploration_query_ids of charts that will receive full data point grounding so the analyst can cite specific values."}
                          :awareness_tier {:type        "array"
                                           :items       {:type "integer"}
                                           :description "exploration_query_ids of charts the analyst should be aware of but won't cite at value level."}
                          :rationale      {:type        "string"
                                           :description "1-3 sentence explanation of why these charts were selected and at these tiers."}}
   :required             ["top_tier" "awareness_tier" "rationale"]
   :additionalProperties false})

(def curation-bounds
  "Soft size guidance for Phase-1's curation. Used both in the prompt (as
  guidance to the model) and in validation (as hard bounds). Min top-tier of
  1 guarantees the analysis has at least one citable chart; the upper caps
  bound prompt size for Phase 2."
  {:top-tier-min       1
   :top-tier-max       30
   :awareness-tier-min 0
   :awareness-tier-max 50
   :combined-max       60})

(defn build-curation-prompt
  "Phase 1 prompt: pick top-tier (full-data) and awareness-tier (summary-only)
  charts from a thin index of the pool. Emits guidance about size targets,
  diversification, and (when timelines are attached) prioritizing charts that
  overlap timeline events."
  [{:keys [thread-prompt selections timelines index-entries pool-size total-chart-count]}]
  (let [{:keys [top-tier-min top-tier-max
                awareness-tier-min awareness-tier-max
                combined-max]} curation-bounds
        timeline-md (common/format-timeline-events timelines)
        intro (str "You are the CURATOR for an Automatic Insights document. A second LLM\n"
                   "pass (the ANALYST) will write the actual research-paper-style document; your\n"
                   "job is to choose which charts that analyst gets to work with and at what\n"
                   "depth.\n"
                   "\n"
                   "WHY THIS MATTERS:\n"
                   "The analyst only sees what you select. Charts you omit are unreachable —\n"
                   "they will not appear in the document and will not influence the analysis.\n"
                   "Choose carefully against the user's question, not against generic relevance.\n"
                   "\n"
                   "YOUR CHOICES:\n"
                   "- TOP TIER (" top-tier-min "–" top-tier-max ", aim for ~8–15): these charts get the FULL\n"
                   "  data point list so the analyst can cite specific values verbatim. Pick\n"
                   "  charts whose actual numbers the analyst should be quoting in the document.\n"
                   "- AWARENESS TIER (" awareness-tier-min "–" awareness-tier-max ", aim for ~15–25): these get only\n"
                   "  a one-line summary and pre-computed key points (peak, trough, first → last,\n"
                   "  mean). The analyst can mention them, suggest them as follow-up directions,\n"
                   "  or use them for context — but won't cite specific values from them.\n"
                   "- Total of both tiers MUST be ≤ " combined-max ".\n"
                   "- A chart should appear in at most one tier.\n"
                   "- All ids you return MUST come from the pool below.\n"
                   "\n"
                   "GUIDANCE:\n"
                   "- Diversify evidence angles. If \"Revenue by Day\" and \"Revenue by Week\"\n"
                   "  both rank high but tell the same story, pick one (probably the finer\n"
                   "  granularity) and put the other in awareness or skip it. Do NOT spend top\n"
                   "  tier slots on near-duplicates.\n"
                   "- Prefer charts whose summary line shows something *notable* (a sharp\n"
                   "  trend, an extreme value, a concentration) over flat / noisy ones.\n"
                   "- The upstream score is a hint, not a verdict. A rank-30 chart with a\n"
                   "  striking summary that directly answers the question beats a rank-1\n"
                   "  chart that just barely touches the question.\n"
                   "- A broad / open-ended user question warrants more charts; a focused\n"
                   "  question (\"why did revenue drop in Q4?\") warrants fewer, more targeted\n"
                   "  ones. Tune the tier sizes within the allowed ranges accordingly.\n"
                   (when timeline-md
                     (str "- TIMELINE EVENTS ARE A MAJOR SIGNAL (see the TIMELINE EVENTS section\n"
                          "  below). When the user has attached timelines, they expect the\n"
                          "  analyst to correlate event dates with movements in the data. PRIORITIZE\n"
                          "  for the top tier any chart whose:\n"
                          "    * x-axis (time) range contains one or more event dates, AND\n"
                          "    * data shows a visible inflection point near an event date (peak,\n"
                          "      trough, sudden change in slope, sustained level shift).\n"
                          "  A chart with even moderate base relevance becomes high-priority if\n"
                          "  events sit on top of its inflection points — that's the story the\n"
                          "  user is hoping to find. Conversely, charts whose dimension is\n"
                          "  unrelated to time (pure categorical) cannot intersect events; only\n"
                          "  consider these on their own merits.\n"))
                   "\n"
                   "OUTPUT: call the `structured_output` tool exactly once with\n"
                   "`{top_tier: [ids], awareness_tier: [ids], rationale: \"...\"}`. The\n"
                   "rationale should be 1–3 sentences explaining the selection logic so the\n"
                   "analyst (and humans debugging the run) can understand your choices."
                   (when timeline-md
                     " If timeline events drove specific picks, mention which ones.")
                   "\n"
                   "\n"
                   "Use your extended thinking to deliberate. Skim every entry in the pool\n"
                   "below before deciding.\n"
                   "\n"
                   "---\n\n")
        question (if (str/blank? thread-prompt)
                   "USER QUESTION: (none provided — infer from the metrics/dimensions selected)\n"
                   (str "USER QUESTION:\n" thread-prompt "\n"))
        sel-text (if (seq selections)
                   (str "SELECTIONS:\n" (str/join "\n" selections) "\n")
                   "")
        pool-md  (str/join "\n" (map index-entry index-entries))]
    (str intro question "\n" sel-text "\n"
         (when timeline-md (str "---\n\n" timeline-md "\n\n"))
         "---\n\nCHART POOL (" pool-size " of " total-chart-count " total, ranked best-first):\n\n"
         pool-md)))

(defn- extract-curation
  "Pull the parsed curation map out of the LLM's structured-tool response."
  [response]
  (when (map? response)
    (let [g (fn [k] (or (get response k) (get response (name k))))]
      {:top_tier       (some-> (g :top_tier) vec)
       :awareness_tier (some-> (g :awareness_tier) vec)
       :rationale      (g :rationale)})))

(defn- validate-curation
  "Returns a vector of error strings (empty when the curation is valid).
  Accumulates ALL errors found rather than short-circuiting — repair retries
  do better when they can fix everything in one round-trip."
  [pool-ids curation]
  (let [pool-set (set pool-ids)
        {:keys [top-tier-min top-tier-max
                awareness-tier-min awareness-tier-max
                combined-max]} curation-bounds]
    (cond
      (not (map? curation))
      ["response must be an object with top_tier, awareness_tier, and rationale fields"]

      :else
      (let [{:keys [top_tier awareness_tier rationale]} curation
            top-seq?   (sequential? top_tier)
            aware-seq? (sequential? awareness_tier)
            top        (when top-seq? (vec top_tier))
            aware      (when aware-seq? (vec awareness_tier))
            non-int    (when (or top aware)
                         (concat (remove integer? (or top []))
                                 (remove integer? (or aware []))))
            outside    (when (and top aware)
                         (remove pool-set (concat top aware)))
            overlap    (when (and top aware)
                         (filter (set top) aware))
            combined   (+ (count (or top [])) (count (or aware [])))]
        (cond-> []
          (not top-seq?)
          (conj "top_tier must be an array of integer exploration_query_ids")

          (not aware-seq?)
          (conj "awareness_tier must be an array of integer exploration_query_ids")

          (or (not (string? rationale)) (str/blank? rationale))
          (conj "rationale must be a non-empty string explaining the selection")

          (seq non-int)
          (conj (str "every chart id must be an integer; found: "
                     (str/join ", " (map pr-str non-int))))

          (seq outside)
          (conj (str "these ids are not in the supplied chart pool: "
                     (str/join ", " outside)
                     " (pool contains " (count pool-ids) " ids — see the prompt's CHART POOL section)"))

          (seq overlap)
          (conj (str "the same chart appears in both top_tier and awareness_tier: "
                     (str/join ", " overlap)
                     ". A chart must appear in at most one tier."))

          (and top-seq? (< (count top) top-tier-min))
          (conj (str "top_tier has " (count top) " entries; need at least " top-tier-min))

          (and top-seq? (> (count top) top-tier-max))
          (conj (str "top_tier has " (count top) " entries; max allowed is " top-tier-max))

          (and aware-seq? (< (count aware) awareness-tier-min))
          (conj (str "awareness_tier has " (count aware) " entries; need at least " awareness-tier-min))

          (and aware-seq? (> (count aware) awareness-tier-max))
          (conj (str "awareness_tier has " (count aware) " entries; max allowed is " awareness-tier-max))

          (and top-seq? aware-seq? (> combined combined-max))
          (conj (str "top_tier + awareness_tier = " combined " entries; combined max is " combined-max)))))))

(defn- repair-prompt
  "Repair message for Phase 1: re-state the validation errors and ask for a
  corrected curation, preserving the original intent where possible."
  [previous-curation errors]
  (str "Your curation didn't validate. Errors:\n\n"
       (common/format-errors errors)
       "\n\nReturn a corrected `structured_output` tool call with valid top_tier, "
       "awareness_tier, and rationale fields. Keep the same overall selection logic — "
       "only fix what the errors above point at. Your previous response was:\n```json\n"
       (pr-str previous-curation)
       "\n```"))

(defn run-curation!
  "Phase 1 entry point. `prompt` is the pre-rendered prompt string (built by
  [[build-curation-prompt]]); `pool-ids` is the set of legal chart ids the
  curator can pick from. Returns `{:value :attempts :outcome [:final-errors]}`
  where `:value` is the parsed `{:top_tier :awareness_tier :rationale}` map."
  [thread-id prompt pool-ids]
  (common/run-with-repair {:thread-id      thread-id
                           :phase-name     "phase-1"
                           :llm-config     llm-config
                           :prompt         prompt
                           :schema         curation-schema
                           :extract-fn     extract-curation
                           :validate-fn    (partial validate-curation pool-ids)
                           :repair-builder repair-prompt}))
