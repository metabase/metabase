(ns metabase-enterprise.data-complexity-score.api
  "Admin-only HTTP endpoint exposing the Data Complexity Score."
  (:require
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.metabot-scope :as metabot-scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private SubScore
  "Either a computed sub-score (`:measurement` + `:score`) or an uncomputed one (`:error`)."
  [:or
   [:map {:closed true}
    [:measurement number?]
    [:score       nat-int?]]
   [:map {:closed true}
    [:measurement nil?]
    [:score       nil?]
    [:error       string?]]])

(def ^:private Catalog
  "One catalog's total + per-component breakdown.
  `:total` is nil when any sub-score couldn't be computed — failures cascade through aggregates."
  [:map
   [:total [:maybe nat-int?]]
   [:components
    [:map
     [:entity-count      SubScore]
     [:name-collisions   SubScore]
     [:synonym-pairs     SubScore]
     [:field-count       SubScore]
     [:repeated-measures SubScore]]]])

(def ^:private EmbeddingModelMeta
  "Identifies the embedding model backing the synonym calculations, so benchmark consumers can pin to it.
  `nil` when semantic search isn't configured on this instance."
  [:maybe
   [:map
    [:provider   string?]
    [:model-name string?]]])

(def ^:private ComplexityScoresResponse
  "Full response body for `GET /api/ee/data-complexity-score/complexity`."
  [:map
   [:library  Catalog]
   [:universe Catalog]
   [:metabot  Catalog]
   [:meta
    [:map
     [:formula-version   pos-int?]
     [:synonym-threshold number?]
     [:embedding-model {:optional true} EmbeddingModelMeta]
     [:calculated-at    ms/TemporalInstant]]]])

;; Per-JVM single-flight guard for the compute path. Concurrent scoring on one node only adds
;; load and noise, so we fast-fail the second compute with 409. The Quartz job has its own
;; cluster-wide guard, so we deliberately don't share this one — a coinciding cron tick should
;; not cancel an admin's API call.
(defonce ^:private ^java.util.concurrent.atomic.AtomicBoolean api-scoring-running?
  (java.util.concurrent.atomic.AtomicBoolean. false))

(api.macros/defendpoint :get "/complexity" :- ComplexityScoresResponse
  "Return the current Data Complexity Score for this instance.
  Returns the cached row when the live fingerprint matches; pass `?refresh=true` to force a
  recompute. Compute paths emit Snowplow events and fast-fail concurrent requests with 409."
  [_route
   {:keys [refresh]} :- [:map [:refresh {:default false} [:maybe ms/BooleanValue]]]
   _body]
  (api/check-superuser)
  (let [fingerprint (complexity/current-fingerprint)]
    (or (when-not refresh (complexity/cached-score fingerprint))
        (do
          (when-not (.compareAndSet api-scoring-running? false true)
            (throw (ex-info "Data Complexity Score calculation already in progress" {:status-code 409})))
          (try
            (->> (complexity/complexity-scores :metabot-scope (metabot-scope/internal-metabot-scope))
                 (complexity/cache-score! fingerprint))
            (finally
              (.set api-scoring-running? false)))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-complexity-score` routes."
  (api.macros/ns-handler *ns* +auth))
