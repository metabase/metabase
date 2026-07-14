(ns metabase.contextual-interestingness.llm
  "Internals of the contextual chart scorer / describer: prompt construction, the
  response JSON schema, response parsing, and the single LLM call. The user-facing
  entry point lives in [[metabase.contextual-interestingness.core]] and calls
  [[llm-call!]] here.

  The JSON schema is ordered so descriptions come *before* the score — structured-output
  models tend to emit properties in declared order (the prompt also spells the order out),
  so the model has typically just written its descriptions when it scores, acting as a
  schema-driven chain of thought."
  (:require
   [clojure.string :as str]
   [metabase.interestingness.core :as interestingness]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- response-schema
  "Build the response schema. `metric-description` is required iff the caller signals the
  chart has no authored description (so we ask the LLM to produce one); otherwise it's
  omitted from the schema and rejected via `additionalProperties: false`."
  [generate-metric?]
  {:type "object"
   :additionalProperties false
   :properties (cond-> {:chart_description
                        {:type        "string"
                         :description (str "One short sentence (≤ 25 words) describing WHAT THE CHART IS — the metric and the dimension it's broken out by, in the terms the user would use. "
                                           "If a Slicing line is present (segment filter, top-N + Other rollup, specific-values subset, per-value over-time view), name it — it's part of what the chart is. "
                                           "Describe the chart, not the data: do NOT narrate the data's shape, trend, or magnitude (no first/last/peak values, no 'rising'/'dramatic decline') and do NOT draw conclusions — the numbers come from the stats, not from you. "
                                           "Ground filters, joins, and aggregation in the COMPILED SQL block when one is provided — do not restate the title. "
                                           "Write this FIRST so the rest of the response is grounded in it.")}}
                 generate-metric?
                 (assoc :metric_description
                        {:type        "string"
                         :description (str "One short sentence (≤ 25 words) describing the metric in business terms (what it measures, what's included/excluded). "
                                           "Read the aggregation, joins, and WHERE clause in the COMPILED SQL block (when provided) to identify what's being summed/counted/averaged and which subset of rows. "
                                           "Do not restate the chart name.")})

                 :always
                 (assoc :reasoning
                        {:type        "string"
                         :description "One short sentence justifying the score, retained for debugging only."}
                        :score
                        {:type        "number"
                         :minimum     0
                         :maximum     1
                         :description "Relevance in [0.0, 1.0]. 1 = directly answers; 0.5 = tangentially useful; 0 = unrelated or misleading."}))
   :required (cond-> ["chart_description"]
               generate-metric? (conj "metric_description")
               :always          (into ["reasoning" "score"]))})

(def ^:private rubric-preamble
  "We fold the rubric into the user message instead of using a `system` role
  message — `metabot.self/call-llm-structured` doesn't expose Anthropic's
  top-level `system` parameter, and `{:role \"system\"}` messages are rejected
  by the Messages API."
  "You are an analytics assistant scoring how well a single chart answers a user's question, and writing concise descriptions of the chart along the way.

You see a structured description of the chart (title, display type, axis types, summary statistics, notable values), optionally the compiled SQL of the underlying query, and the user's natural-language question.

Workflow — fill fields in this order, and DO use your earlier answers as context for the later ones:
  1. chart_description: one sentence describing WHAT THE CHART IS — the metric and the dimension as the user would understand them, with semantics pulled from the SQL (filters, joins, aggregation). If a 'Slicing' line is present, fold it in — a segment filter, a top-N + Other rollup, a specific-values subset, or a per-value over-time view is part of what distinguishes this chart from its siblings, so name it. Describe the chart, not the data: do not narrate the data's shape or trend, do not cite first/last/peak values, and do not draw conclusions — the stats already carry the numbers. Do not parrot the title; add what the title leaves out. GOOD: 'Total fish caught per survey date, summed from fish_catch_summary, restricted to Standard Surveys.' BAD: '...showing a dramatic decline from ~1,700 fish in 1940 to 36 in 2023.'
  2. metric_description (when requested): one sentence describing the underlying metric in business terms.
  3. reasoning: one short sentence justifying the score that follows.
  4. score: in [0.0, 1.0], grounded in your own descriptions, not just the title.

Scoring:
- 1.0   directly answers the question end-to-end
- 0.7+  answers the core of the question; minor gaps
- 0.4   partially relevant; same domain or related metric
- 0.2   weakly related
- 0.0   unrelated, misleading, or empty

Be calibrated. Most charts are tangentially relevant (~0.3-0.6); reserve >=0.8 for charts that clearly nail the question.

Always return a single object matching the supplied schema. Do not respond with prose.

---

")

(def ^:private temperature 0.0)
(def ^:private max-tokens 512)

(defn- chart->representation
  "Humanize the chart's stats into a markdown blob the LLM can read. Uses
  shallow stats (`:deep? false`) to keep prompt size bounded — we don't need
  the per-segment depth that interactive analysis uses."
  [chart-config]
  (let [stats (interestingness/compute-chart-stats chart-config {:deep? false})]
    (interestingness/generate-representation
     {:title           (:title chart-config)
      :display-type    (:display_type chart-config)
      :stats           stats
      :timeline-events (:timeline_events chart-config)})))

(defn- build-user-message
  [{:keys [chart-config card-description chart-slicing sql context-string]}]
  (str rubric-preamble
       "USER QUESTION:\n" context-string
       "\n\n---\n\nCHART:\n"
       (when-not (str/blank? card-description)
         (str "Authored metric description (use as ground truth — do not regenerate metric_description): "
              card-description "\n\n"))
       (when-not (str/blank? chart-slicing)
         (str "Slicing (this chart is a specific cut of the metric — name it in chart_description): "
              chart-slicing "\n\n"))
       (chart->representation chart-config)
       (when-not (str/blank? sql)
         (str "\n\nCOMPILED SQL (for semantic context — read filters, joins, aggregation):\n```sql\n"
              sql "\n```"))))

(defn- clamp01
  [x]
  (-> x double (max 0.0) (min 1.0)))

(defn- parse-response
  "Pull `:score`, `:chart-description`, `:metric-description`, `:reasoning` out of the LLM
  response map. `:reasoning` is the model's own one-sentence justification for the score
  (declared in the schema for debugging) — surfaced here so debug logs / callers can see
  *why* a chart scored the way it did. Returns nil when `:score` is missing or non-numeric
  (the response is unusable)."
  [response]
  (when (map? response)
    (let [score (:score response)]
      (when (number? score)
        {:score              (clamp01 score)
         :chart-description  (some-> (:chart_description response) str/trim not-empty)
         :metric-description (some-> (:metric_description response) str/trim not-empty)
         :reasoning          (some-> (:reasoning response) str/trim not-empty)}))))

(defn llm-call!
  "Single seam for tests to `with-redefs`. Returns the parsed response map, or nil on any
  failure (transport error, malformed response, missing score, permission denied,
  usage limit reached)."
  [{:keys [card-description] :as inputs}]
  (try
    (let [response (metabot.self/call-llm-structured
                    (metabot.settings/llm-metabot-provider)
                    [{:role "user" :content (build-user-message inputs)}]
                    (response-schema (str/blank? card-description))
                    temperature
                    max-tokens
                    {:request-id          (str (random-uuid))
                     :source              "contextual_interestingness"
                     :tag                 "contextual-interestingness"
                     :required-permission :permission/metabot-other-tools})]
      (or (parse-response response)
          (do (log/warnf "Contextual interestingness: malformed LLM response %s"
                         (pr-str response))
              nil)))
    (catch Throwable e
      (log/warn e "Contextual interestingness: LLM call failed")
      nil)))
