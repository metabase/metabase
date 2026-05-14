(ns metabase.contextual-interestingness.core
  "LLM-backed contextual chart scorer + describer.

  Given a chart-config, an optional already-authored description, an optional compiled SQL
  representation of the chart's underlying query, and a piece of natural-language context
  (typically a user's question), returns

      {:score              <double in [0.0, 1.0]>
       :chart-description  <one-sentence chart description, model-generated>
       :metric-description <one-sentence metric description, model-generated>}

  - `:score` ranges match `metabase.interestingness.core/chart-interestingness` so the two
    compose cleanly.
  - `:chart-description` describes the metric+dimension combination as a single human
    sentence (always generated, regardless of authored description).
  - `:metric-description` is generated **only** when the caller did not pass
    `card-description`; otherwise it's nil (we trust the user-authored text and don't
    waste tokens rewriting it).

  The same LLM call produces all three outputs. The JSON schema is ordered so descriptions
  come *before* the score — Anthropic/OpenAI structured outputs fill in declared property
  order, so the model has just written its descriptions when it scores, acting as a
  schema-driven chain of thought. If this proves unreliable, splitting into two calls is a
  small refactor.

  Lives in its own module (rather than inside `interestingness`) because `metabot` already
  `:uses interestingness`; routing the LLM call back through `metabot.self` from inside
  `interestingness` would form a module cycle."
  (:require
   [clojure.string :as str]
   [metabase.contextual-interestingness.sql :as contextual-sql]
   [metabase.interestingness.core :as interestingness]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util.log :as log]))

(def dataset-query->sql
  "Re-exported from [[metabase.contextual-interestingness.sql/dataset-query->sql]] so callers
  only need to depend on this `.core` namespace."
  contextual-sql/dataset-query->sql)

(set! *warn-on-reflection* true)

(defn- response-schema
  "Build the response schema. `metric-description` is required iff the caller signals the
  chart has no authored description (so we ask the LLM to produce one); otherwise it's
  forbidden via `:type \"null\"`."
  [generate-metric?]
  {:type       "object"
   :properties (cond-> {:chart_description
                        {:type        "string"
                         :description (str "One short sentence (≤ 25 words) describing what the chart shows — combining the metric and dimension. "
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
   :required   (cond-> ["chart_description"]
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
  1. chart_description: one sentence describing the metric + dimension as the user would understand them. Pull semantics from the SQL where it clarifies (filters, joins, aggregation). Do not parrot the title; add what the title leaves out.
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

(def ^:private model "anthropic/claude-haiku-4-5")
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
  [{:keys [chart-config card-description sql context-string]}]
  (str rubric-preamble
       "USER QUESTION:\n" context-string
       "\n\n---\n\nCHART:\n"
       (when-not (str/blank? card-description)
         (str "Authored metric description (use as ground truth — do not regenerate metric_description): "
              card-description "\n\n"))
       (chart->representation chart-config)
       (when-not (str/blank? sql)
         (str "\n\nCOMPILED SQL (for semantic context — read filters, joins, aggregation):\n```sql\n"
              sql "\n```"))))

(defn- clamp01
  [x]
  (-> x double (max 0.0) (min 1.0)))

(defn- parse-response
  "Pull `:score`, `:chart-description`, `:metric-description` out of the LLM response map.
  Returns nil when `:score` is missing or non-numeric (the response is unusable)."
  [response]
  (when (map? response)
    (let [score (:score response)]
      (when (number? score)
        (log/infof "Contextual interestingness: score=%.2f reasoning=%s"
                   (double score)
                   (pr-str (:reasoning response)))
        {:score              (clamp01 score)
         :chart-description  (some-> (:chart_description response) str/trim not-empty)
         :metric-description (some-> (:metric_description response) str/trim not-empty)}))))

(defn- llm-call!
  "Single seam for tests to `with-redefs`. Returns the parsed response map, or nil on any
  failure (transport error, malformed response, missing score)."
  [{:keys [card-description] :as inputs}]
  (try
    (let [response (metabot.self/call-llm-structured
                    model
                    [{:role "user" :content (build-user-message inputs)}]
                    (response-schema (str/blank? card-description))
                    temperature
                    max-tokens
                    {:request-id (str (random-uuid))
                     :source     "contextual_interestingness"
                     :tag        "contextual-interestingness"})]
      (or (parse-response response)
          (do (log/warnf "Contextual interestingness: malformed LLM response %s"
                         (pr-str response))
              nil)))
    (catch Throwable e
      (log/warn e "Contextual interestingness: LLM call failed")
      nil)))

(defn score-and-describe-chart
  "Score how well `chart-config` answers `context-string` and generate descriptions in the
  same LLM call. Returns

      {:score :chart-description :metric-description}

  or nil on any failure (blank context, nil chart-config, LLM unconfigured, malformed
  response, network error). Never throws.

  Inputs:
    `:chart-config`     — same shape as `chart-interestingness` consumes. Required.
    `:context-string`   — user's natural-language question. Required (blank → nil out).
    `:card-description` — optional already-authored metric description. When present, the
                          model is instructed not to regenerate it; `:metric-description`
                          in the response is always nil.
    `:sql`              — optional compiled SQL string for the underlying query. Used as
                          extra semantic context for description generation. Nil-safe."
  [{:keys [chart-config context-string] :as inputs}]
  (cond
    (nil? chart-config)                              nil
    (or (nil? context-string)
        (str/blank? context-string))                 nil
    (not (metabot.settings/llm-metabot-configured?)) nil
    :else                                            (llm-call! inputs)))
