(ns metabase-enterprise.transforms-inspector.api
  (:require
   [metabase-enterprise.transforms-inspector.core :as inspector]
   [metabase-enterprise.transforms-inspector.lens.core :as lens.core]
   [metabase-enterprise.transforms-inspector.schema :as inspector.schema]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.events.core :as events]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.server.core :as server]
   [metabase.tracing.core :as tracing]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.core :as transforms.core]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- lens-label
  "Clamp `lens-id` (a user-controlled path param) to a registered lens type or
   \"unknown\" to bound the cardinality of the `:lens-type` metric label."
  [lens-id]
  (if (some #(= (name %) lens-id) (lens.core/registered-lens-types true))
    lens-id
    "unknown"))

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
                        (prometheus/inc! :metabase-transforms/inspector-discovery {:status "ok"})
                        r)
                      (catch Throwable t
                        (prometheus/inc! :metabase-transforms/inspector-discovery {:status "error"})
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
                        (prometheus/inc! :metabase-transforms/inspector-lens
                                         {:lens-type (lens-label lens-id) :status "ok"})
                        r)
                      (catch Throwable t
                        (prometheus/inc! :metabase-transforms/inspector-lens
                                         {:lens-type (lens-label lens-id) :status "error"})
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
                    ;; qp/process-query can signal failure by returning {:status :failed}
                    ;; instead of throwing — see qp.streaming/-streaming-response.
                    status (if (= :failed (:status result)) "error" "ok")]
                (prometheus/observe! :metabase-transforms/inspector-query-duration-ms
                                     {:lens-type (lens-label lens-id) :status status}
                                     (u/since-ms timer))
                result)
              (catch Throwable t
                (prometheus/observe! :metabase-transforms/inspector-query-duration-ms
                                     {:lens-type (lens-label lens-id) :status "error"}
                                     (u/since-ms timer))
                (throw t)))))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transforms` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
