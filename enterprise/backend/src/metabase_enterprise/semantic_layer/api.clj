(ns metabase-enterprise.semantic-layer.api
  "Admin-only HTTP endpoint exposing the semantic-layer complexity score."
  (:require
   [metabase-enterprise.semantic-layer.complexity :as complexity]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(set! *warn-on-reflection* true)

(def ^:private CountSubScore
  "Sub-score block for components counted as raw entity/item counts."
  [:map
   [:count nat-int?]
   [:score nat-int?]])

(def ^:private PairsSubScore
  "Sub-score block for components counted as pairs (collision or synonym pairs). `:error` is set
  when synonym detection failed at runtime and the score was forced to 0."
  [:map
   [:pairs nat-int?]
   [:score nat-int?]
   [:error {:optional true} string?]])

(def ^:private Catalog
  "One catalog's total + per-component breakdown."
  [:map
   [:total nat-int?]
   [:components
    [:map
     [:entity-count      CountSubScore]
     [:name-collisions   PairsSubScore]
     [:synonym-pairs     PairsSubScore]
     [:field-count       CountSubScore]
     [:repeated-measures CountSubScore]]]])

(def ^:private EmbeddingModelMeta
  "Identifies the embedding model backing the synonym axis, so benchmark consumers can pin to it.
  `nil` when semantic search isn't configured on this instance."
  [:maybe
   [:map
    [:provider   string?]
    [:model-name string?]]])

(def ^:private ComplexityScoresResponse
  "Full response body for `GET /api/ee/semantic-layer/complexity`."
  [:map
   [:library  Catalog]
   [:universe Catalog]
   [:meta
    [:map
     [:formula-version   pos-int?]
     [:synonym-threshold number?]
     [:embedding-model {:optional true} EmbeddingModelMeta]]]])

(api.macros/defendpoint :get "/complexity" :- ComplexityScoresResponse
  "Return the current semantic-layer complexity score for this instance. Superuser-only, and quite expensive."
  [_route _query _body]
  (api/check-superuser)
  (complexity/complexity-scores))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/semantic-layer` routes."
  (api.macros/ns-handler *ns* +auth))
