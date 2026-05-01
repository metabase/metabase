(ns metabase.contextual-interestingness.core
  "LLM-backed contextual relevance scorer.

  Given a chart-config and a piece of natural-language context (typically a
  user's question), returns a `double` in `[0.0, 1.0]` estimating how well the
  chart answers/illuminates that context. Range matches
  `metabase.interestingness.core/chart-interestingness` so the two scores
  compose cleanly.

  Intentionally callable from any module: the only inputs are a chart-config
  and a string of context. Explorations passes the user's `prompt`; Metabot
  could pass the user's last message; X-rays could pass a description of the
  seed entity.

  Returns `nil` on any failure path — blank context, unconfigured LLM,
  malformed model output, transport error. Never throws.

  Lives in its own module (rather than inside `interestingness`) because
  `metabot` already `:uses interestingness`; routing the LLM call back through
  `metabot.self` from inside `interestingness` would form a module cycle. A
  small dedicated module sidesteps that and keeps the public surface tidy:
  one fn, `contextual-chart-interestingness`."
  (:require
   [clojure.string :as str]
   [metabase.interestingness.core :as interestingness]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private response-schema
  {:type       "object"
   :properties {:score     {:type        "number"
                            :minimum     0
                            :maximum     1
                            :description "Relevance in [0.0, 1.0]. 1 = directly answers; 0.5 = tangentially useful; 0 = unrelated or misleading."}
                :reasoning {:type        "string"
                            :description "One short sentence justifying the score, retained for debugging only."}}
   :required   ["score" "reasoning"]})

(def ^:private rubric-preamble
  "We fold the rubric into the user message instead of using a `system` role
  message — `metabot.self/call-llm-structured` doesn't expose Anthropic's
  top-level `system` parameter, and `{:role \"system\"}` messages are rejected
  by the Messages API."
  "You are an analytics assistant that rates how well a single chart answers a user's question.

You see a structured description of the chart (title, display type, axis types, summary statistics, notable values) and the user's natural-language question.

Score in [0.0, 1.0]:
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
(def ^:private max-tokens 256)

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
  [chart-config context-string]
  (str rubric-preamble
       "USER QUESTION:\n" context-string
       "\n\n---\n\nCHART:\n" (chart->representation chart-config)))

(defn- clamp01
  [x]
  (-> x double (max 0.0) (min 1.0)))

(defn- llm-score!
  "Single seam for tests to `with-redefs`. Returns a `double` in `[0.0, 1.0]`,
  or `nil` on any failure (transport error, malformed response, missing field)."
  [chart-config context-string]
  (try
    (let [response (metabot.self/call-llm-structured
                    model
                    [{:role "user" :content (build-user-message chart-config context-string)}]
                    response-schema
                    temperature
                    max-tokens
                    {:request-id (str (random-uuid))
                     :source     "contextual_interestingness"
                     :tag        "contextual-interestingness"})
          score    (:score response)]
      (if (number? score)
        (clamp01 score)
        (do (log/warnf "Contextual interestingness: malformed LLM response %s"
                       (pr-str response))
            nil)))
    (catch Throwable e
      (log/warn e "Contextual interestingness: LLM call failed")
      nil)))

(defn contextual-chart-interestingness
  "Score how well `chart-config` answers `context-string`. Returns a `double`
  in `[0.0, 1.0]` — same range as `chart-interestingness` so the two compose.
  Returns `nil` on any failure: blank context, nil chart-config, LLM
  unconfigured, malformed response, network error. Never throws.

  Reusable lego: any caller with a chart-config and natural-language context
  can use this. Callers are responsible for any feature-flag / rate-limit
  gating they want on top."
  [chart-config context-string]
  (cond
    (nil? chart-config)                               nil
    (or (nil? context-string)
        (str/blank? context-string))                  nil
    (not (metabot.settings/llm-metabot-configured?))  nil
    :else                                             (llm-score! chart-config context-string)))
