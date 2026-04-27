(ns metabase-enterprise.data-complexity-score.api
  "Admin-only HTTP endpoint exposing the Data Complexity Score."
  (:require
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.metabot-scope :as metabot-scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

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
     [:embedding-model {:optional true} EmbeddingModelMeta]]]])

;; Per-JVM single-flight guard for the /complexity endpoint. Each scoring run walks the entire
;; app-db catalog and emits Snowplow events, so concurrent superuser requests on the same node
;; would just multiply load and noise without producing different results — fast-fail with 409
;; instead. In a clustered deployment the guard is per-node, so up to one pass per node can still
;; run concurrently; we accept that since superuser API traffic is low-volume. The Quartz job
;; already has its own concurrency control (`DisallowConcurrentExecution` + cluster lock for boot
;; emission), so we deliberately don't share this guard with the task path; a daily cron run that
;; coincided with an API call shouldn't be cancelled.
(defonce ^:private ^java.util.concurrent.atomic.AtomicBoolean api-scoring-running?
  (java.util.concurrent.atomic.AtomicBoolean. false))

(api.macros/defendpoint :get "/complexity" :- ComplexityScoresResponse
  "Return the current Data Complexity Score for this instance.
  Superuser-only, expensive, and emits Snowplow events for benchmark consumers. Concurrent
  requests on the same JVM fast-fail with HTTP 409 — a scoring pass walks the full app-db
  catalog and one in-flight run per node is enough. The guard is per-JVM, so in a clustered
  deployment each node can still run one pass concurrently."
  [_route _query _body]
  (api/check-superuser)
  (when-not (.compareAndSet api-scoring-running? false true)
    (throw (ex-info "Data Complexity Score calculation already in progress" {:status-code 409})))
  (try
    (complexity/complexity-scores :metabot-scope (metabot-scope/internal-metabot-scope))
    (finally
      (.set api-scoring-running? false))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-complexity-score` routes."
  (api.macros/ns-handler *ns* +auth))
