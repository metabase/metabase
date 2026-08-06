(ns metabase-enterprise.data-complexity-score.api
  "Admin-only HTTP endpoint exposing the Data Complexity Score."
  (:require
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.metabot-scope :as metabot-scope]
   [metabase-enterprise.data-complexity-score.models.data-complexity-score :as data-complexity-score]
   [metabase-enterprise.data-complexity-score.synonym-source :as synonym-source]
   [metabase-enterprise.data-complexity-score.task.complexity-score :as task.complexity-score]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util :as m.util]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private Rating
  "A rating band label drawn from `complexity-bands`."
  [:enum "low" "medium" "high"])

(def ^:private Failure
  "Sub-score that couldn't be computed; carries only the failure message.
  (Named `Failure` rather than `Error` to avoid shadowing `java.lang.Error`.)"
  [:map {:closed true}
   [:error string?]])

(def ^:private Leaf
  "Computed leaf sub-score with a raw `:measurement` and its weighted `:score`."
  [:map {:closed true}
   [:measurement  number?]
   [:score        nat-int?]
   [:rating       [:maybe Rating]]
   [:rating_label [:maybe string?]]])

(def ^:private Grouping
  "Internal node whose `:score` is the rolled-up sum of its `:components` children."
  [:map {:closed true}
   [:score        [:maybe nat-int?]]
   [:rating       [:maybe Rating]]
   [:rating_label [:maybe string?]]
   [:components   [:map-of :keyword [:ref ::node]]]])

(def ^:private Node
  "Recursive score node: a [[Failure]], a [[Leaf]], or a [[Grouping]] whose children are themselves Nodes."
  [:schema
   {:registry {::node [:or Failure Leaf Grouping]}}
   [:ref ::node]])

(def ^:private EmbeddingModelMeta
  "Identifies the embedding model backing the synonym calculations, so benchmark consumers can pin to it.
  `nil` when semantic search isn't configured on this instance."
  [:maybe
   [:map
    [:provider   string?]
    [:model_name string?]]])

(def ^:private ComplexityScoresResponse
  "Full response body for `GET /api/ee/data-complexity-score/complexity`."
  [:map
   [:library  Node]
   [:universe Node]
   [:metabot  Node]
   [:meta
    [:map
     [:formula_version   pos-int?]
     [:format_version    pos-int?]
     [:synonym_threshold number?]
     [:calculated_at {:optional true} some?]
     [:embedding_model {:optional true} EmbeddingModelMeta]]]])

;; Per-JVM single-flight guard for the /complexity endpoint. Each scoring run walks the entire
;; app-db catalog and emits Snowplow events, so concurrent superuser requests on the same node
;; would just multiply load and noise without producing different results — fast-fail with 409
;; instead. In a clustered deployment the guard is per-node, so up to one pass per node can still
;; run concurrently; we accept that since superuser API traffic is low-volume. The Quartz job
;; already has its own concurrency control (`DisallowConcurrentExecution` + cluster lock for boot
;; emission), so we deliberately don't share this guard with the task path; a weekly cron run that
;; coincided with an API call shouldn't be cancelled.
(defonce ^:private ^java.util.concurrent.atomic.AtomicBoolean api-scoring-running?
  (java.util.concurrent.atomic.AtomicBoolean. false))

(defn- force-recalculate-score!
  "Run the Data Complexity Score job now, persist the fresh snapshot, and return it.
  This is expensive and emits Snowplow events for benchmark consumers. Concurrent requests
  on the same JVM fast-fail with HTTP 409 — a scoring pass walks the full app-db catalog
  and one in-flight run per node is enough. The guard is per-JVM, so in a clustered
  deployment each node can still run one pass concurrently."
  []
  (when-not (.compareAndSet api-scoring-running? false true)
    (throw (ex-info "Data Complexity Score calculation already in progress" {:status-code 409})))
  (try
    (let [fingerprint (task.complexity-score/current-fingerprint)
          result      (complexity/complexity-scores
                       (assoc (synonym-source/complexity-scores-opts)
                              :metabot-scope (metabot-scope/internal-metabot-scope)))
          stored      (data-complexity-score/record-score! fingerprint "appdb" result)]
      (task.complexity-score/maybe-advance-last-fingerprint! fingerprint result)
      (m.util/deep-snake-keys (complexity/decorate-with-ratings (or stored result))))
    (finally
      (.set api-scoring-running? false))))

(api.macros/defendpoint :get "/complexity" :- ComplexityScoresResponse
  "Return the most recently stored Data Complexity Score for this instance.
  Pass `force-recalculation=true` to recompute, persist, and return a fresh score.
  Superuser-only."
  [_route
   {force-recalculation? :force-recalculation} :- [:map
                                                   [:force-recalculation {:default false} ms/BooleanValue]]
   _body]
  (api/check-superuser)
  (if force-recalculation?
    (force-recalculate-score!)
    (api/check-404 (some-> (data-complexity-score/latest-score (task.complexity-score/current-fingerprint))
                           complexity/decorate-with-ratings
                           m.util/deep-snake-keys)
                   (tru "Data Complexity Score has not been computed yet. Recompute it to create the first snapshot."))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-complexity-score` routes."
  (api.macros/ns-handler *ns* +auth))
