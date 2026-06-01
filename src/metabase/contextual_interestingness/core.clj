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

  The LLM call, prompt construction, and response parsing live in
  [[metabase.contextual-interestingness.llm]]; this namespace is the thin user-facing seam.

  Lives in its own module (rather than inside `interestingness`) because `metabot` already
  `:uses interestingness`; routing the LLM call back through `metabot.self` from inside
  `interestingness` would form a module cycle."
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

      {:score :chart-description :metric-description}

  or nil when the call can't or shouldn't run (blank context, nil chart-config, or the shared
  [[metabase.metabot.core/llm-call-available?]] gate is closed — Metabot disabled, provider
  unconfigured, over usage limits, or the current user lacks permission) and on any failure
  (malformed response, network error). Never throws.

  Inputs:
    `:chart-config`     — same shape as `chart-interestingness` consumes. Required.
    `:context-string`   — user's natural-language question. Required (blank → nil out).
    `:card-description` — optional already-authored metric description. When present, the
                          model is instructed not to regenerate it; `:metric-description`
                          in the response is always nil.
    `:sql`              — optional compiled SQL string for the underlying query. Used as
                          extra semantic context for description generation. Nil-safe."
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
