(ns metabase.metabot.quality.constants
  "Constants and the metric registry shared across the Metabot quality-score
  pipeline. The registry ([[metrics]] + [[observable->metric]]) is the single
  source for the metric vocabulary: subscore grouping, the snake_case JSON
  projection, and each observable's `metric` reference all derive from it, so a
  rename happens in one place."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def quality-score-version
  "Version stamp written into every persisted `quality_breakdown` and
  `quality_attribution` payload. Bumps on any change that would alter a
  previously-scored conversation's value."
  "v1.0")

(def jaccard-threshold
  "Two search calls whose result-id sets overlap at or above this Jaccard
  ratio are treated as the same retrieval."
  0.5)

(def max-scoreable-assistant-turns
  "Assistant-turn ceiling for synchronous scoring. Past it, a conversation
  gets a `too-long-to-score` sentinel rather than pay the quadratic per-turn
  re-score on the response path."
  100)

;;; ---------------------------------------------------------------------------
;;; Metric registry
;;; ---------------------------------------------------------------------------

(def metrics
  "Canonical metric vocabulary, in stable order. Each entry maps the internal
  metric keyword (as produced by
  [[metabase.metabot.quality.metrics/compute]]) to the subscore it composes."
  [{:key :canonical-source-share :subscore :data-source-quality}
   {:key :search-efficiency      :subscore :data-source-quality}
   {:key :grounded-source-share  :subscore :data-source-quality}
   {:key :tool-call-failure-rate :subscore :execution-health}
   {:key :termination-health     :subscore :execution-health}
   {:key :artifact-validity-share :subscore :artifact-validity}])

(def observable->metric
  "Per-turn observation type (as persisted, snake_case string) → the metric it
  is evidence for. Drives each observable's `metric` reference, so it can't
  drift from the metric it names."
  {"unproductive_search" :search-efficiency
   "hallucinated_ref"    :grounded-source-share
   "tool_error"          :tool-call-failure-rate
   "iter_cap"            :termination-health
   "error_termination"   :termination-health
   "invalid_artifact"    :artifact-validity-share})

(defn metric-json-name
  "snake_case string form of an internal metric keyword
  (`:canonical-source-share` → `\"canonical_source_share\"`)."
  [k]
  (str/replace (name k) "-" "_"))

(defn metric-json-key
  "snake_case keyword form of an internal metric keyword, for use as a JSON
  map key (`:canonical-source-share` → `:canonical_source_share`)."
  [k]
  (keyword (metric-json-name k)))

(defn metrics-for-subscore
  "Internal metric keywords composing `subscore`, in registry order."
  [subscore]
  (into [] (comp (filter #(= subscore (:subscore %))) (map :key)) metrics))

;;; ---------------------------------------------------------------------------
;;; Categorical enums (hoisted so the schema and the pipeline share one source)
;;; ---------------------------------------------------------------------------

(def terminal-state-reasons
  "Categoricals a `terminal_state` data part legally projects to. Any reason
  outside this set falls through to `:error`."
  #{:model_signaled_done :final_response :iter_cap :error})

(def terminal-states
  "All terminal-state categoricals the pipeline produces — the reasons plus
  the derived `:aborted` (finished = false with no `terminal_state` part)."
  (conj terminal-state-reasons :aborted))

(def unscoreable-reasons
  "Legal `:unscoreable` sentinel reasons, by purpose. A conversation the
  pipeline declines to score writes one of these and leaves `quality_score`
  NULL."
  {:pre-instrumentation "pre-instrumentation"
   :extract-error       "extract-error"
   :too-long            "too-long-to-score"})
