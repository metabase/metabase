(ns metabase-enterprise.transforms-inspector.api
  (:require
   [metabase-enterprise.transforms-inspector.core :as inspector]
   [metabase-enterprise.transforms-inspector.lens.core :as lens.core]
   [metabase-enterprise.transforms-inspector.schema :as inspector.schema]
   [metabase.analytics-interface.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.events.core :as events]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.server.core :as server]
   [metabase.tracing.core :as tracing]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.core :as transforms.core]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- known-lens-id?
  "True if `lens-id` matches a registered lens type (including drill lenses)."
  [lens-id]
  (contains? (set (map name (lens.core/registered-lens-types true))) lens-id))

(defn- lens-type-label
  "Clamp `lens-id` (a user-controlled path param) to its registered form or
   \"unknown\", bounding the cardinality of the `:lens-type` metric label."
  [lens-id]
  (if (known-lens-id? lens-id) lens-id "unknown"))

(defn- lens-labels
  "Return clamped `:lens-type` and `:complexity` metric labels for `lens-id`.
   For unregistered lens-ids both fall back to \"unknown\"."
  [lens-id]
  (let [known? (known-lens-id? lens-id)]
    {:lens-type  (if known? lens-id "unknown")
     :complexity (if known?
                   (-> (lens.core/lens-metadata (keyword lens-id) {}) :complexity :level name)
                   "unknown")}))

(defn- query-result->status-label
  "Classify a `qp/process-query` outcome for the `:status` Prometheus label.
   `canceled?` short-circuits to \"canceled\"; otherwise the keyword in
   `(:status result)` decides. Unknown keywords fall through to
   \"unknown\" as a drift sentinel."
  [canceled? result]
  (cond
    (or canceled? (nil? result))      "canceled"
    (= :completed (:status result))   "ok"
    (= :failed (:status result))      "error"
    (= :interrupted (:status result)) "interrupted"
    :else                             "unknown"))

(api.macros/defendpoint :get "/:id/inspect"
  :- ::inspector.schema/discovery-response
  "Phase 1: Discover available lenses for a transform.
   Returns structural metadata and available lens types."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [transform (api/read-check :model/Transform id)
        _         (transforms.core/check-feature-enabled! transform)
        result    (tracing/with-span :transforms "transforms.inspector.discover"
                    {:transform/id          id
                     :transform/source-type (name (transforms-base.u/transform-source-type (:source transform)))}
                    (try
                      (let [r (inspector/discover-lenses transform)]
                        (analytics/inc! :metabase-transforms/inspector-discovery {:status "ok"})
                        r)
                      (catch Throwable t
                        (analytics/inc! :metabase-transforms/inspector-discovery {:status "error"})
                        (throw t))))]
    (events/publish-event! :event/transform-inspect-discover
                           {:object  transform
                            :user-id api/*current-user-id*})
    result))

(api.macros/defendpoint :get "/:id/inspect/:lens-id"
  :- ::inspector.schema/lens
  "Phase 2: Get full lens contents for a transform.
   Returns sections, cards with dataset_query, and trigger definitions.
   Accepts optional params for drill lenses as query params."
  [{:keys [id lens-id]} :- [:map
                            [:id ms/PositiveInt]
                            [:lens-id ms/NonBlankString]]
   params :- [:map-of :keyword :any]]
  (let [transform (api/read-check :model/Transform id)
        _         (transforms.core/check-feature-enabled! transform)
        result    (tracing/with-span :transforms "transforms.inspector.lens"
                    {:transform/id          id
                     :transform/source-type (name (transforms-base.u/transform-source-type (:source transform)))
                     :inspector/lens-id     lens-id}
                    (try
                      (let [r (inspector/get-lens transform lens-id params)]
                        (analytics/inc! :metabase-transforms/inspector-lens
                                        (assoc (lens-labels lens-id) :status "ok"))
                        r)
                      (catch Throwable t
                        (analytics/inc! :metabase-transforms/inspector-lens
                                        (assoc (lens-labels lens-id) :status "error"))
                        (throw t))))]
    (events/publish-event! :event/transform-inspect-lens
                           {:object  transform
                            :user-id api/*current-user-id*
                            :details {:lens-id            lens-id
                                      :num-cards          (count (:cards result))
                                      :num-drill-lenses   (count (:drill_lenses result))
                                      :num-alert-triggers (count (:alert_triggers result))}})
    result))

(api.macros/defendpoint :post "/:id/inspect/:lens-id/query"
  :- (server/streaming-response-schema ::qp.schema/query-result)
  "Execute a query in the context of a transform inspector lens."
  [{:keys [id lens-id]} :- [:map
                            [:id ms/PositiveInt]
                            [:lens-id ms/NonBlankString]]
   _query-params
   {query :query, lens-params :lens_params}
   :- [:map
       [:query [:map [:database {:optional true} [:maybe :int]]]]
       [:lens_params {:optional true} [:maybe [:map-of :keyword :any]]]]]
  (let [transform (api/read-check :model/Transform id)]
    (transforms.core/check-feature-enabled! transform)
    (let [info {:executed-by  api/*current-user-id*
                :context      :transform-inspector
                :transform-id id
                :lens-id      lens-id
                :lens-params  lens-params}]
      (qp.streaming/streaming-response [rff :api]
        (let [timer (u/start-timer)]
          (tracing/with-span :transforms "transforms.inspector.query"
            {:transform/id      id
             :inspector/lens-id lens-id}
            (try
              (let [result (qp/process-query
                            (-> query
                                (update-in [:middleware :js-int-to-string?] (fnil identity true))
                                (assoc :constraints (qp.constraints/default-query-constraints))
                                (update :info merge info)
                                qp/userland-query)
                            rff)
                    ;; Pass `(qp.pipeline/canceled?)` because `qp.streaming/-streaming-response`
                    ;; synthesizes `{:status :canceled}` *after* this body returns — it never
                    ;; appears on `result` from inside the streaming body, so we read the chan
                    ;; directly. The chan is bound by the streaming-response wrapper for the
                    ;; duration of this body. `:failed` / `:interrupted` come from
                    ;; qp.middleware.catch-exceptions.
                    status (query-result->status-label (qp.pipeline/canceled?) result)]
                (analytics/observe! :metabase-transforms/inspector-query-duration-ms
                                    {:lens-type (lens-type-label lens-id) :status status}
                                    (u/since-ms timer))
                result)
              (catch Throwable t
                (analytics/observe! :metabase-transforms/inspector-query-duration-ms
                                    {:lens-type (lens-type-label lens-id) :status "error"}
                                    (u/since-ms timer))
                (throw t)))))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transforms` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
