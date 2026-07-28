(ns metabase.contextual-interestingness.core
  "LLM-backed contextual chart scorer + describer.

  Given a chart-config, an optional already-authored description, an optional compiled SQL
  representation of the chart's underlying query, and a piece of natural-language context
  (typically a user's question), returns

      {:score              <double in [0.0, 1.0]>
       :chart-description  <one-sentence chart description, model-generated>
       :metric-description <one-sentence metric description, model-generated>
       :reasoning          <one-sentence score justification, kept for debugging>}

  - `:score` is on the same scale as `metabase.interestingness.core/chart-interestingness`.
  - `:chart-description` describes the metric+dimension combination, and is always generated.
  - `:metric-description` is generated only when the caller passed no `card-description`;
    otherwise it is nil.

  The LLM call, prompt construction, and response parsing live in
  [[metabase.contextual-interestingness.llm]]; this namespace is the thin user-facing seam."
  (:require
   [clojure.string :as str]
   [metabase.contextual-interestingness.llm :as llm]
   [metabase.contextual-interestingness.sql :as contextual-sql]
   [metabase.metabot.core :as metabot]
   [metabase.util.log :as log]
   [metabase.util.namespaces :as shared.ns]))

(set! *warn-on-reflection* true)

(shared.ns/import-fns
 [contextual-sql dataset-query->sql])

(defn score-and-describe-chart
  "Score how well `chart-config` answers `context-string` and generate descriptions in the
  same LLM call. Returns

      {:score :chart-description :metric-description :reasoning}

  or nil when the call can't or shouldn't run (blank context, nil chart-config, or a closed
  [[metabase.metabot.core/llm-call-available?]] gate) and on any failure. Never throws.

  Inputs:
    `:chart-config`     — same shape as `chart-interestingness` consumes. Required.
    `:context-string`   — user's natural-language question. Required (blank → nil out).
    `:stats`            — optional already-computed `compute-chart-stats` result for
                          `chart-config`. Pass it when you have one; omitted → shallow stats
                          are computed here.
    `:card-description` — optional already-authored metric description. When present,
                          `:metric-description` in the response is always nil.
    `:chart-slicing`    — optional one-line description of how this chart slices its metric,
                          folded into `:chart-description`. Nil-safe.
    `:sql`              — optional compiled SQL for the underlying query, used as extra
                          semantic context. Nil-safe."
  [{:keys [chart-config context-string] :as inputs}]
  (try
    (cond
      (nil? chart-config)              nil
      (or (nil? context-string)
          (str/blank? context-string)) nil
      ;; `llm-call-available?` reaches `check-usage-limits!` / `resolve-user-permissions`, which
      ;; hit the DB and can throw; keep the whole body inside the try so we honor "Never throws".
      (not (metabot/llm-call-available? :permission/metabot-other-tools)) nil
      :else                            (llm/llm-call! inputs))
    (catch Throwable e
      (log/warn e "Contextual interestingness: scoring failed")
      nil)))
