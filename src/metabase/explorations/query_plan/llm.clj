(ns metabase.explorations.query-plan.llm
  "LLM-driven implementation of `metabase.explorations.query-plan.planner/QueryPlanner`.

  NOTE: this planner is a POC and is NOT used in production — the
  `metabase.explorations.query-plan.mechanical` planner is the one that runs.
  It's kept here as a research toggle (reachable via the
  `explorations-query-planner` setting) while we evaluate whether an LLM can
  plan better charts than the mechanical heuristics.

  Owns: the JSON schema for the structured tool response, the prompt
  template binding, the per-item and plan-wide validators, the
  `run-with-repair` invocation, the repair prompt, the LLM-specific
  config (model, temperature, thinking budget), and the `LlmPlanner`
  record that wires those into the protocol."
  (:require
   [clojure.string :as str]
   [metabase.explorations.ai-summary.common :as ai.common]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.explorations.query-plan.mbql :as qp.mbql]
   [metabase.explorations.query-plan.planner :as planner]
   [metabase.explorations.query-plan.prompts :as qp.prompts]
   [metabase.explorations.query-plan.variants :as qp.variants]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.request.core :as request]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; LLM config + schema
;; ---------------------------------------------------------------------------

(defn llm-config
  "Extended-thinking config matching Phase-1 of ai-summary. The planning task is
  structurally similar — pattern-match a moderate landscape against the user's
  intent — and benefits from the same budget."
  []
  {:model           (metabot.settings/llm-metabot-provider)
   :temperature     1.0
   :max-tokens      16000
   :thinking-config {:type "enabled" :budget_tokens 8000}})

(def ^:private plan-bounds
  {:min-items 1
   :max-items 50})

(def ^:private plan-schema
  {:type "object"
   :properties
   {:plan
    {:type "array"
     :items
     {:type "object"
      :properties
      {:group_id     {:type        "integer"
                      :description "group_id of the group this chart belongs to. metric_id and dimension_id must BOTH come from this same group — never cross metrics and dimensions across groups."}
       :metric_id    {:type        "integer"
                      :description "metric_id from this group's METRICS list"}
       :dimension_id {:type        "string"
                      :description "dimension_id from this group's DIMENSIONS list; must be in this metric's applicable_dimensions within the group"}
       :variant      {:enum        (vec (sort qp.variants/known-variants))
                      :description "Variant builder to apply"}
       :params       {:type "object"
                      :properties
                      {:k                    {:type    "integer"
                                              :minimum 3
                                              :maximum 50
                                              :description "Top-K size for top-n-other (3–50) and per-value-time-series (3–20)."}
                       :filter_values        {:type        "array"
                                              :items       {:type "string"}
                                              :minItems    1
                                              :maxItems    10
                                              :description "Explicit dim values for filtered-subset."}
                       :segment_id           {:type        "integer"
                                              :description "Optional segment to apply as a filter; must be in the metric's segments_available."}
                       :temporal_dimension_id {:type        "string"
                                               :description "Optional. For per-value-time-series, name a temporal dimension from the DIMENSIONS list to break the metric out by — overrides the metric's default temporal breakout. Use to bucket by a different time grain than the metric's own, or to enable the variant when the metric has no default temporal breakout. Must be applicable to the metric (in its applicable_dimension_ids) AND be a temporal dim."}}
                      :additionalProperties false}
       :rationale    {:type "string" :description "One sentence on why this chart"}}
      :required ["group_id" "metric_id" "dimension_id" "variant" "rationale"]
      :additionalProperties false}
     :minItems    (:min-items plan-bounds)
     :maxItems    (:max-items plan-bounds)
     :description "Vector of plan items to materialize as exploration_query rows."}
    :rationale {:type "string" :description "1–3 sentence overall rationale for the chosen plan."}}
   :required ["plan" "rationale"]
   :additionalProperties false})

;; ---------------------------------------------------------------------------
;; Validation
;; ---------------------------------------------------------------------------

(def ^:private discrete-dim-variants
  "Variants that require a *discrete* (non-temporal) dim — anything you can
  breakout into a finite set of bars. Numeric columns are intentionally
  allowed: many integer columns are semantically categorical (status codes,
  enum-like IDs) even when the database stores them as numbers, and the LLM
  has the semantic_type info to decide. We rely on its judgement; the
  validator just rules out clearly-wrong temporal cases."
  #{"top-n-other" "per-value-time-series" "filtered-subset"})

(def ^:private temporal-variants
  "Variants that require a temporal dim."
  #{"temporal-pattern-day" "temporal-pattern-hour"})

(defn temporal-axis-resolution
  "Resolve the time axis a `per-value-time-series` item should use. Returns
    `{:from :metric-default}` when falling back to the metric Card's own
        temporal breakout, OR
    `{:from :chosen :target :dim}` when the LLM named a `temporal_dimension_id`
        that resolved on the metric AND is temporal, OR
    `{:from :none :error <error-string>}` when neither path applies.

  Public so the orchestrator can use it from `materialize-item` to pre-resolve
  the temporal target before invoking the variant builder."
  [metric params idx dimension_id]
  (let [tdid    (:temporal_dimension_id params)
        t-appl  (when tdid (get-in metric [:applicability tdid]))
        t-dim   (some-> t-appl :dim)
        chosen-temporal? (and t-dim (qp.mbql/dim-type-isa? t-dim :type/Temporal))]
    (cond
      (and tdid (nil? t-appl))
      {:from :none
       :error (str "item[" idx "] params.temporal_dimension_id=" (pr-str tdid)
                   " has no resolvable target on metric M" (:metric-id metric))}

      (and tdid (not chosen-temporal?))
      {:from :none
       :error (str "item[" idx "] params.temporal_dimension_id=" (pr-str tdid)
                   " is not a temporal dim (effective_type="
                   (or (:effective_type t-dim) "?") ")")}

      tdid
      {:from :chosen :target (:target t-appl) :dim t-dim}

      (:default-temporal-breakout-summary metric)
      {:from :metric-default}

      :else
      {:from :none
       :error (str "item[" idx "] per-value-time-series needs a temporal axis: either"
                   " M" (:metric-id metric) " must carry a default temporal breakout,"
                   " or params.temporal_dimension_id must name a temporal dim that"
                   " resolves on this metric (dim_id=" (pr-str dimension_id) ")")})))

(defn- validate-item
  [metric-by-key group-ids idx {:keys [group_id metric_id dimension_id variant params rationale]}]
  (let [metric (get metric-by-key [group_id metric_id])
        appl   (some-> metric :applicability (get dimension_id))
        dim    (some-> appl :dim)
        errors (cond-> []
                 (not (contains? group-ids group_id))
                 (conj (str "item[" idx "].group_id=" group_id " is not a declared group"))

                 (and (contains? group-ids group_id) (nil? metric))
                 (conj (str "item[" idx "].metric_id=" metric_id " is not in group " group_id))

                 (and metric (nil? appl))
                 (conj (str "item[" idx "].dimension_id=" (pr-str dimension_id)
                            " has no resolvable target on metric M" metric_id " in group " group_id))

                 (not (contains? qp.variants/known-variants variant))
                 (conj (str "item[" idx "].variant=" (pr-str variant) " is not a known variant"))

                 (or (not (string? rationale)) (str/blank? rationale))
                 (conj (str "item[" idx "].rationale must be a non-empty string")))]
    (if dim
      (cond-> errors
        (and (contains? discrete-dim-variants variant)
             (qp.mbql/dim-type-isa? dim :type/Temporal))
        (conj (str "item[" idx "] variant " variant " requires a non-temporal dim; "
                   (pr-str dimension_id) " is temporal"))

        (and (contains? temporal-variants variant) (not (qp.mbql/dim-type-isa? dim :type/Temporal)))
        (conj (str "item[" idx "] variant " variant " requires a temporal dim; "
                   (pr-str dimension_id) " is not temporal"))

        (and (= variant "temporal-pattern-hour") (not (qp.mbql/dim-type-isa? dim :type/DateTime)))
        (conj (str "item[" idx "] variant temporal-pattern-hour requires DateTime (date+time); "
                   (pr-str dimension_id) " is date-only"))

        (and (= variant "time-facet") (not (:default-temporal-breakout-summary metric)))
        (conj (str "item[" idx "] variant time-facet requires the metric to have a default temporal breakout; M"
                   metric_id " does not"))

        (= variant "per-value-time-series")
        (as-> errs (let [{:keys [from error]} (temporal-axis-resolution metric params idx dimension_id)]
                     (if (= from :none) (conj errs error) errs)))

        (and (contains? #{"top-n-other" "per-value-time-series"} variant)
             (not (integer? (:k params))))
        (conj (str "item[" idx "] variant " variant " requires integer params.k"))

        (and (= variant "per-value-time-series")
             (integer? (:k params))
             (or (< (:k params) 3) (> (:k params) 20)))
        (conj (str "item[" idx "] params.k=" (:k params) " out of range for per-value-time-series (3–20)"))

        (and (= variant "top-n-other")
             (integer? (:k params))
             (or (< (:k params) 3) (> (:k params) 50)))
        (conj (str "item[" idx "] params.k=" (:k params) " out of range for top-n-other (3–50)"))

        (and (= variant "filtered-subset")
             (or (not (sequential? (:filter_values params)))
                 (empty? (:filter_values params))))
        (conj (str "item[" idx "] variant filtered-subset requires non-empty params.filter_values"))

        (and (:segment_id params)
             (not (some #(= (:segment_id params) (:id %)) (:segments metric))))
        (conj (str "item[" idx "] params.segment_id=" (:segment_id params)
                   " is not in metric M" metric_id "'s available segments")))
      errors)))

(defn- validate-plan
  "Accumulate ALL errors so a repair retry can fix everything in one pass.
  `group-by-id` is `{group-id <group-context>}` (the output of
  `metric-and-dim-context` indexed by `:group-id`); each item is resolved
  against its own group so metrics never cross group boundaries."
  [group-by-id {:keys [plan rationale] :as value}]
  (cond
    (not (map? value))
    ["plan response must be an object with `plan` and `rationale`"]

    (not (sequential? plan))
    ["`plan` must be an array of plan items"]

    :else
    (let [group-ids     (set (keys group-by-id))
          metric-by-key (into {}
                              (for [[gid g] group-by-id
                                    m       (:metrics g)]
                                [[gid (:metric-id m)] m]))
          item-errors (mapcat #(apply validate-item metric-by-key group-ids %)
                              (map-indexed vector plan))
          ;; group_id is part of the dup key: the SAME (metric, dim, variant) is a
          ;; legitimate distinct chart in two different groups.
          dup-keys    (->> plan
                           (map (fn [i] [(:group_id i) (:metric_id i) (:dimension_id i) (:variant i) (:params i)]))
                           frequencies
                           (filter (fn [[_ n]] (> n 1)))
                           (map (fn [[k _]] k))
                           seq)]
      (cond-> (vec item-errors)
        (or (not (string? rationale)) (str/blank? rationale))
        (conj "`rationale` must be a non-empty string explaining the plan")

        (< (count plan) (:min-items plan-bounds))
        (conj (str "plan has " (count plan) " items; need at least " (:min-items plan-bounds)))

        (> (count plan) (:max-items plan-bounds))
        (conj (str "plan has " (count plan) " items; max is " (:max-items plan-bounds)))

        dup-keys
        (conj (str "plan contains duplicate items (same metric_id + dimension_id + variant + params): "
                   (str/join ", " (map pr-str dup-keys))))))))

(defn- extract-plan
  "Pull the parsed plan out of the structured-tool response, normalizing keys."
  [response]
  (when (map? response)
    (let [{:keys [plan rationale]} (update-keys response keyword)]
      {:plan      (some->> plan
                           (mapv (fn [item]
                                   (let [{:keys [group_id metric_id dimension_id variant params rationale]}
                                         (update-keys item keyword)]
                                     {:group_id     group_id
                                      :metric_id    metric_id
                                      :dimension_id dimension_id
                                      :variant      variant
                                      :params       (or params {})
                                      :rationale    rationale}))))
       :rationale rationale})))

;; ---------------------------------------------------------------------------
;; Repair prompt
;; ---------------------------------------------------------------------------

(def ^:private repair-echo-cap 4000)

(defn- repair-prompt
  [previous errors]
  (let [raw  (pr-str previous)
        echo (if (<= (count raw) repair-echo-cap)
               raw
               (str (subs raw 0 repair-echo-cap) "\n... (truncated)"))]
    (qp.prompts/render
     "repair.selmer"
     {:no_tool_call  (nil? previous)
      :errors        (ai.common/format-errors errors)
      :previous_echo echo})))

;; ---------------------------------------------------------------------------
;; Planner entry point
;; ---------------------------------------------------------------------------

(defn- render-prompt
  [{:keys [thread-prompt metric-dim-ctx]}]
  (qp.prompts/render
   "plan.selmer"
   (qp.context/prompt-vars
    {:metric-dim-ctx metric-dim-ctx
     :thread-prompt  thread-prompt})))

(defn- call-llm
  [{:keys [thread-id creator-id metric-dim-ctx]} rendered-prompt]
  (let [group-by-id (into {} (map (juxt :group-id identity)) (:groups metric-dim-ctx))]
    (request/with-current-user creator-id
      (ai.common/run-with-repair
       {:thread-id      thread-id
        :phase-name     "query-plan"
        :llm-config     (llm-config)
        :prompt         rendered-prompt
        :schema         plan-schema
        :extract-fn     extract-plan
        :validate-fn    (partial validate-plan group-by-id)
        :repair-builder repair-prompt}))))

(defn- run-plan!
  "Render the planning prompt, call the LLM with `run-with-repair`, validate,
  and return a planner result map. Wrapped by `LlmPlanner` below."
  [ctx]
  (let [rendered-prompt (render-prompt ctx)
        {:keys [value attempts outcome final-errors]} (call-llm ctx rendered-prompt)
        transcript {:prompt       rendered-prompt
                    :attempts     attempts
                    :outcome      outcome
                    :raw-value    value
                    :final-errors final-errors}]
    (if (= :ok outcome)
      {:outcome    :ok
       :plan       (:plan value)
       :rationale  (:rationale value)
       :transcript transcript}
      {:outcome      :failed
       :final-errors final-errors
       :transcript   transcript})))

(defrecord LlmPlanner []
  planner/QueryPlanner
  (planner-name [_] :llm)
  (plan!        [_ ctx] (run-plan! ctx)))

(def planner
  "Singleton `LlmPlanner` instance. The orchestrator references this directly
  when its setting / availability heuristic picks the LLM planner. Tests can
  swap in a stub via `with-redefs`."
  (->LlmPlanner))
