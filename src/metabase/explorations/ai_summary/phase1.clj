(ns metabase.explorations.ai-summary.phase1
  "Phase 1 — CURATION.

  Given the thin index of pre-ranked charts, the curator LLM picks which charts
  the analyst (Phase 2) gets and at what depth: TOP TIER (full data points, the
  analyst may cite values) or AWARENESS TIER (summary only, mentioned but not
  cited).

  Holds the phase-1 LLM config, schema, tier bounds, index-entry renderer,
  prompt builder, response extractor, validator, repair-prompt builder, and
  the `run-curation!` entry point. Common chart-rendering and LLM-call
  infrastructure lives in [[metabase.explorations.ai-summary.common]]."
  (:require
   [clojure.string :as str]
   [metabase.explorations.ai-summary.common :as common]
   [metabase.explorations.ai-summary.prompts :as prompts]
   [metabase.metabot.settings :as metabot.settings]))

(set! *warn-on-reflection* true)

(defn llm-config
  "Phase-1 LLM settings. Curation is pattern matching against a
  richly-annotated index, run with extended thinking so the model handles the
  edge-case tie-breaking (near-duplicate charts, ambiguous question framing)."
  []
  {:model           (metabot.settings/llm-metabot-provider)
   :temperature     1.0
   :max-tokens      16000
   :thinking-config {:type "enabled" :budget_tokens 8000}})

(defn index-entry
  "Phase-1 entry for one breakout (metric × dimension × segment), built from a
  `common/group-breakouts` record. The curator picks breakouts by their `id=`; every
  rendering of a chosen breakout then flows to Phase 2 automatically, where the analyst
  embeds whichever one best supports each point — so the curator never sees or chooses
  renderings. Multi-line so the curator can tell apart breakouts that share a title but
  differ on granularity, FK source, or aggregation."
  [{:keys [rep-id score]
    {:keys [name summary-line dim-detail metric-detail
            metric-description chart-description]} :representative}]
  (str "- id=" rep-id
       " score=" (format "%.2f" (double (or score 0.0)))
       " | " name "\n"
       (when chart-description
         (str "  chart:  " chart-description "\n"))
       (when metric-description
         (str "  metric description: " metric-description "\n"))
       "  metric: " (or metric-detail "(unknown)") "\n"
       "  dim:    " (or dim-detail "(unknown)") "\n"
       "  data:   " summary-line))

(def ^:private curation-schema
  "Phase-1 output: `{top_tier [ids] awareness_tier [ids] rationale string}`.
  Strict schema since the shape is simple and we want fast rejection of
  malformed responses."
  {:type                 "object"
   :properties           {:top_tier       {:type        "array"
                                           :items       {:type "integer"}
                                           :description "breakout ids (the id= of a pool entry) whose renderings will receive full data point grounding so the analyst can cite specific values."}
                          :awareness_tier {:type        "array"
                                           :items       {:type "integer"}
                                           :description "breakout ids the analyst should be aware of but won't cite at value level."}
                          :rationale      {:type        "string"
                                           :description "1-3 sentence explanation of why these charts were selected and at these tiers."}}
   :required             ["top_tier" "awareness_tier" "rationale"]
   :additionalProperties false})

(def ^:private curation-bounds
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
  charts from a thin index of the pool. The Selmer template lives at
  `resources/explorations/ai_summary/prompts/phase1_curation.selmer`."
  [{:keys [thread-prompt selections timelines index-entries pool-size total-chart-count]}]
  (let [{:keys [top-tier-min top-tier-max
                awareness-tier-min awareness-tier-max
                combined-max]} curation-bounds]
    (prompts/render
     "phase1_curation.selmer"
     {:top_tier_min       top-tier-min
      :top_tier_max       top-tier-max
      :awareness_tier_min awareness-tier-min
      :awareness_tier_max awareness-tier-max
      :combined_max       combined-max
      :thread_prompt      (when-not (str/blank? thread-prompt) thread-prompt)
      :selections         (when (seq selections) (str/join "\n" selections))
      :timeline_md        (common/format-timeline-events timelines)
      :pool_md            (str/join "\n" (map index-entry index-entries))
      :pool_size          pool-size
      :total_chart_count  total-chart-count})))

(defn- extract-curation
  "Pull the parsed curation map out of the LLM's structured-tool response. The tool response
  may arrive with string or keyword keys, so normalize to keywords once up front rather than
  dual-looking-up each field."
  [response]
  (when (map? response)
    (let [{:keys [top_tier awareness_tier rationale]} (update-keys response keyword)]
      {:top_tier       (some-> top_tier vec)
       :awareness_tier (some-> awareness_tier vec)
       :rationale      rationale})))

(defn- validate-curation
  "Returns a vector of error strings (empty when the curation is valid).
  Accumulates ALL errors found rather than short-circuiting — repair retries
  do better when they can fix everything in one round-trip."
  [pool-ids curation]
  (if-not (map? curation)
    ["response must be an object with top_tier, awareness_tier, and rationale fields"]
    (let [pool-set (set pool-ids)
          {:keys [top-tier-min top-tier-max
                  awareness-tier-min awareness-tier-max
                  combined-max]} curation-bounds
          {:keys [top_tier awareness_tier rationale]} curation
          top      (when (sequential? top_tier) top_tier)
          aware    (when (sequential? awareness_tier) awareness_tier)
          non-int  (concat (remove integer? top) (remove integer? aware))
          outside  (remove pool-set (concat top aware))
          overlap  (filter (set top) aware)
          combined (+ (count top) (count aware))]
      (cond-> []
        (not (sequential? top_tier))
        (conj "top_tier must be an array of integer breakout ids")

        (not (sequential? awareness_tier))
        (conj "awareness_tier must be an array of integer breakout ids")

        (or (not (string? rationale)) (str/blank? rationale))
        (conj "rationale must be a non-empty string explaining the selection")

        (seq non-int)
        (conj (str "every breakout id must be an integer; found: "
                   (str/join ", " (map pr-str non-int))))

        (seq outside)
        (conj (str "these ids are not in the supplied breakout pool: "
                   (str/join ", " outside)
                   " (pool contains " (count pool-ids) " breakout ids — pick from the id= values in the prompt's POOL section)"))

        (seq overlap)
        (conj (str "the same breakout appears in both top_tier and awareness_tier: "
                   (str/join ", " overlap)
                   ". A breakout must appear in at most one tier."))

        (and top (< (count top) top-tier-min))
        (conj (str "top_tier has " (count top) " entries; need at least " top-tier-min))

        (and top (> (count top) top-tier-max))
        (conj (str "top_tier has " (count top) " entries; max allowed is " top-tier-max))

        (and aware (< (count aware) awareness-tier-min))
        (conj (str "awareness_tier has " (count aware) " entries; need at least " awareness-tier-min))

        (and aware (> (count aware) awareness-tier-max))
        (conj (str "awareness_tier has " (count aware) " entries; max allowed is " awareness-tier-max))

        (and top aware (> combined combined-max))
        (conj (str "top_tier + awareness_tier = " combined " entries; combined max is " combined-max))))))

(def ^:private repair-echo-cap 4000)

(defn- repair-prompt
  "Repair message for Phase 1: re-state the validation errors and ask for a
  corrected curation, preserving the original intent where possible."
  [previous-curation errors]
  (let [raw  (pr-str previous-curation)
        echo (if (<= (count raw) repair-echo-cap)
               raw
               (str (subs raw 0 repair-echo-cap) "\n... (truncated)"))]
    (prompts/render
     "phase1_repair.selmer"
     {:no_tool_call  (nil? previous-curation)
      :errors        (common/format-errors errors)
      :previous_echo echo})))

(defn run-curation!
  "Phase 1 entry point. `prompt` is the pre-rendered prompt string (built by
  [[build-curation-prompt]]); `pool-ids` is the set of legal chart ids the
  curator can pick from. Returns `{:value :attempts :outcome [:final-errors]}`
  where `:value` is the parsed `{:top_tier :awareness_tier :rationale}` map."
  [thread-id prompt pool-ids]
  (common/run-with-repair {:thread-id      thread-id
                           :phase-name     "phase-1"
                           :llm-config     (llm-config)
                           :prompt         prompt
                           :schema         curation-schema
                           :extract-fn     extract-curation
                           :validate-fn    (partial validate-curation pool-ids)
                           :repair-builder repair-prompt}))
