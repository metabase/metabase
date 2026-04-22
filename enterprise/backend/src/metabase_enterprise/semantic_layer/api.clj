(ns metabase-enterprise.semantic-layer.api
  "Admin-only HTTP endpoint exposing the Data Complexity Score."
  (:require
   [metabase-enterprise.semantic-layer.complexity :as complexity]
   [metabase-enterprise.semantic-layer.metabot-scope :as metabot-scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(set! *warn-on-reflection* true)

(def ^:private SubScore
  "Raw `:measurement` (double, future-proofs non-integer metrics) + weighted `:score`.
  `:error` is present only on `:synonym-pairs` when the embedder threw and we fell back to 0."
  [:map
   [:measurement number?]
   [:score       nat-int?]
   [:error       {:optional true} string?]])

(def ^:private Catalog
  "One catalog's total + per-component breakdown."
  [:map
   [:total nat-int?]
   [:components
    [:map
     [:entity-count      SubScore]
     [:name-collisions   SubScore]
     [:synonym-pairs     SubScore]
     [:field-count       SubScore]
     [:repeated-measures SubScore]]]])

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
   [:metabot  Catalog]
   [:meta
    [:map
     [:formula-version   pos-int?]
     [:synonym-threshold number?]
     [:embedding-model {:optional true} EmbeddingModelMeta]]]])

(api.macros/defendpoint :get "/complexity" :- ComplexityScoresResponse
  "Return the current Data Complexity Score for this instance.
  Superuser-only, and quite expensive."
  [_route _query _body]
  (api/check-superuser)
  (complexity/complexity-scores :metabot-scope (metabot-scope/internal-metabot-scope)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/semantic-layer` routes."
  (api.macros/ns-handler *ns* +auth))
