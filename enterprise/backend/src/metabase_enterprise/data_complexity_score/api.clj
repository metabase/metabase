(ns metabase-enterprise.data-complexity-score.api
  "Admin-only HTTP endpoint exposing the data complexity score."
  (:require
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.metabot.config :as metabot.config]
   [metabase.premium-features.core :as premium-features]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------- variable-level schemas -----------------------------
;;;
;;; Variables come in two flavours:
;;;   - scored       `{:value <num> :score <num>}`           contributes to a dimension sub-total
;;;   - descriptive  `{:value <scalar-or-nil>}`              doesn't contribute
;;; `:value` may be nil (undefined ratio) or a richer structure (see DegreeSummary below).

(def ^:private ScoredVar
  [:map
   [:value  [:maybe number?]]
   [:score  number?]
   [:error  {:optional true} string?]])

(def ^:private ValueVar
  [:map
   [:value [:maybe some?]]])

(def ^:private DegreeSummary
  [:map
   [:p50 nat-int?]
   [:p90 nat-int?]
   [:max nat-int?]])

(def ^:private DegreeSummaryVar
  [:map
   [:value DegreeSummary]])

;;; ------------------------------ dimension schemas --------------------------------

(def ^:private ScaleDim
  [:map
   [:variables
    [:map
     [:entity-count         ScoredVar]
     [:field-count          ScoredVar]
     [:collection-tree-size ScoredVar]
     [:fields-per-entity    ValueVar]
     [:measure-to-dim-ratio ValueVar]]]
   [:sub-total number?]])

(def ^:private NominalDim
  [:map
   [:variables
    [:map
     [:name-collisions         ScoredVar]
     [:repeated-measures       ScoredVar]
     [:field-level-collisions  ScoredVar]
     [:name-collisions-density ValueVar]
     [:name-concentration      ValueVar]]]
   [:sub-total number?]])

(def ^:private SemanticDim
  [:map
   [:variables
    [:map
     [:synonym-pairs              ScoredVar]
     [:synonym-edge-density       ValueVar]
     [:synonym-components         ValueVar]
     [:synonym-largest-component  ValueVar]
     [:synonym-avg-component      ValueVar]
     [:synonym-clustering-coef    ValueVar]
     [:synonym-avg-degree         ValueVar]
     [:synonym-degree-summary     DegreeSummaryVar]]]
   [:sub-total number?]])

(def ^:private MetadataDim
  [:map
   [:variables
    [:map
     [:description-coverage       ValueVar]
     [:field-description-coverage ValueVar]
     [:semantic-type-coverage     ValueVar]
     [:curated-metric-coverage    ValueVar]
     [:embedding-coverage         ValueVar]
     [:description-quality        ValueVar]]]
   [:coverage [:maybe number?]]])

(def ^:private Dimensions
  "All dimensions optional — level 0 omits everything, level 1 omits `:semantic`."
  [:map
   [:scale    {:optional true} ScaleDim]
   [:nominal  {:optional true} NominalDim]
   [:semantic {:optional true} SemanticDim]
   [:metadata {:optional true} MetadataDim]])

(def ^:private Catalog
  [:map
   [:dimensions Dimensions]
   [:total      number?]])

(def ^:private EmbeddingModelMeta
  [:maybe
   [:map
    [:provider   string?]
    [:model-name string?]]])

(def ^:private ComplexityScoresResponse
  [:map
   [:library  Catalog]
   [:universe Catalog]
   [:metabot  Catalog]
   [:meta
    [:map
     [:formula-version   pos-int?]
     [:level             nat-int?]
     [:synonym-threshold {:optional true} number?]
     [:embedding-model   {:optional true} EmbeddingModelMeta]]]])

(defn- internal-metabot-scope
  "Resolve the internal Metabot's retrieval scope — the pair of filters
  `metabase.metabot.tools.util/metabot-metrics-and-models-query` applies when Metabot looks up
  metric/model Cards. Returned as `{:verified-only? <bool> :collection-id <nil|Long>}` so the
  complexity scorer can keep the `:metabot` catalog in lock-step with what Metabot actually
  retrieves. Kept here (not in `complexity`) so the scoring namespace stays free of
  settings/feature-flag/Metabot-row reads."
  []
  (let [metabot (t2/select-one :model/Metabot
                               :entity_id (get-in metabot.config/metabot-config
                                                  [metabot.config/internal-metabot-id :entity-id]))]
    {:verified-only? (and (premium-features/has-feature? :content-verification)
                          (boolean (:use_verified_content metabot)))
     :collection-id  (:collection_id metabot)}))

(api.macros/defendpoint :get "/complexity" :- ComplexityScoresResponse
  "Return the current data complexity score for this instance.
  Superuser-only, and quite expensive at higher detail levels."
  [_route _query _body]
  (api/check-superuser)
  (complexity/complexity-scores :metabot-scope (internal-metabot-scope)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-complexity-score` routes."
  (api.macros/ns-handler *ns* +auth))
