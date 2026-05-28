(ns metabase.metabot.quality.schema
  "Malli schemas for the persisted quality payloads — the conversation-level
  `metabot_conversation.quality_breakdown` and the per-message
  `metabot_message.quality_attribution`.

  The metric-bearing pieces are *generated* from the metric registry in
  [[metabase.metabot.quality.constants]], so the enumerated metric keys and
  enums can't drift from the pipeline that produces them. Enforced where bugs
  are caught — `mu/defn` instrumentation is on in dev/test and inert (zero
  cost, no throw) in prod (`metabase.util.malli.fn/instrument-ns?`)."
  (:require
   [metabase.metabot.quality.constants :as constants]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Leaf schemas
;;; ---------------------------------------------------------------------------

(def ^:private health
  "A metric or subscore health: a double in `[0, 1]`, or null when N/A."
  [:maybe [:double {:min 0.0 :max 1.0}]])

(def ^:private score
  "A composite/headline score: a double in `[0, 1]` (never null on a real
  breakdown — Execution Health always contributes a member)."
  [:double {:min 0.0 :max 1.0}])

(def ^:private nat-int
  "A non-negative count."
  [:int {:min 0}])

(def ^:private metric-ref
  "The metric an observable is evidence for, as its snake_case name. Exactly
  the metrics that own an observable (derived from the registry)."
  (into [:enum]
        (comp (map constants/metric-json-name) (distinct))
        (vals constants/observable->metric)))

(def ^:private entity-ref
  "An entity an observable points at. `:id` keeps the LLM-authored type."
  [:map {:closed true}
   [:type :string]
   [:id   [:or :int :string]]])

;;; ---------------------------------------------------------------------------
;;; Subscores (shared by both payloads)
;;; ---------------------------------------------------------------------------

(defn- closed-metric-map
  "Closed `:map` schema with one `[json-key health]` entry per metric that
  composes `subscore`, generated from the registry in registry order."
  [subscore]
  (into [:map {:closed true}]
        (map (fn [k] [(constants/metric-json-key k) health]))
        (constants/metrics-for-subscore subscore)))

(mr/def ::data-source-quality
  [:map {:closed true}
   [:value   health]
   [:metrics (closed-metric-map :data-source-quality)]])

(mr/def ::execution-health
  [:map {:closed true}
   [:value   health]
   [:metrics (closed-metric-map :execution-health)]])

(mr/def ::artifact-validity
  [:map {:closed true}
   [:value   health]
   [:metrics (closed-metric-map :artifact-validity)]])

(mr/def ::subscores
  [:map {:closed true}
   [:data_source_quality ::data-source-quality]
   [:execution_health    ::execution-health]
   [:artifact_validity   ::artifact-validity]])

;;; ---------------------------------------------------------------------------
;;; Conversation-level breakdown
;;; ---------------------------------------------------------------------------

(mr/def ::diagnostics
  [:map {:closed true}
   [:n_iterations  nat-int]
   [:n_tool_calls  nat-int]
   [:n_errors      nat-int]
   [:termination   (into [:enum] (map name) constants/terminal-states)]
   [:entity_counts [:map {:closed true}
                    [:prompt_context nat-int]
                    [:discovered     nat-int]
                    [:authored       nat-int]
                    [:inspected      nat-int]
                    [:hallucinated   nat-int]]]])

(mr/def ::projected
  "The piece [[metabase.metabot.quality.subscores/project-json]] produces and
  both payloads embed: the headline score plus the nested subscores."
  [:map {:closed true}
   [:quality_score score]
   [:subscores     ::subscores]])

(mr/def ::full-breakdown
  [:map {:closed true}
   [:version       :string]
   [:quality_score score]
   [:subscores     ::subscores]
   [:diagnostics   ::diagnostics]])

(mr/def ::sentinel-breakdown
  [:map {:closed true}
   [:version     :string]
   [:unscoreable (into [:enum] (vals constants/unscoreable-reasons))]])

(mr/def ::breakdown
  "Either a full scored breakdown or an unscoreable sentinel."
  [:multi {:dispatch (fn [m] (if (:unscoreable m) :sentinel :full))}
   [:sentinel ::sentinel-breakdown]
   [:full     ::full-breakdown]])

;;; ---------------------------------------------------------------------------
;;; Per-message attribution
;;; ---------------------------------------------------------------------------

(defn- observable-schema
  "Closed `:map` for one observation type: the shared discriminators plus the
  observation-specific `extras`."
  [observation & extras]
  (into [:map {:closed true}
         [:observation [:= observation]]
         [:metric      metric-ref]]
        extras))

(mr/def ::observable
  [:multi {:dispatch :observation}
   ["unproductive_search"
    (observable-schema "unproductive_search"
                       [:context [:map {:closed true}
                                  [:tool_call         :string]
                                  [:overlapping_calls [:vector :string]]]])]
   ["hallucinated_ref"
    (observable-schema "hallucinated_ref"
                       [:entity  entity-ref]
                       [:context [:map {:closed true} [:tool_call :string]]])]
   ["tool_error"
    (observable-schema "tool_error"
                       [:context [:map {:closed true}
                                  [:tool_call :string]
                                  [:function  :string]
                                  [:error     :any]]])]
   ["iter_cap"
    (observable-schema "iter_cap"
                       [:context [:map {:closed true} [:terminal_state [:= "iter_cap"]]]])]
   ["error_termination"
    (observable-schema "error_termination"
                       [:context [:map {:closed true} [:terminal_state [:enum "error" "aborted"]]]])]
   ["invalid_artifact"
    (observable-schema "invalid_artifact"
                       [:context [:map {:closed true}
                                  [:tool_call :string]
                                  [:function  :string]]])]])

(mr/def ::attribution
  [:map {:closed true}
   [:version       :string]
   [:observables   [:sequential ::observable]]
   [:quality_score score]
   [:subscores     ::subscores]])

(mr/def ::attributions
  "[[metabase.metabot.quality.attribution/project]]'s return: one attribution
  per assistant message id."
  [:map-of :int ::attribution])
