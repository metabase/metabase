(ns metabase-enterprise.transforms-inspector.api
  (:require
   [metabase-enterprise.transforms-inspector.core :as inspector]
   [metabase-enterprise.transforms-inspector.schema :as inspector.schema]
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
   [metabase.transforms.core :as transforms.core]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/:id/inspect"
  :- ::inspector.schema/discovery-response
  "Phase 1: Discover available lenses for a transform.
   Returns structural metadata and available lens types."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [transform (api/read-check :model/Transform id)
        result    (do (transforms.core/check-feature-enabled! transform)
                      (inspector/discover-lenses transform))]
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
        result    (do (transforms.core/check-feature-enabled! transform)
                      (inspector/get-lens transform lens-id params))]
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
        (qp/process-query
         (-> query
             (update-in [:middleware :js-int-to-string?] (fnil identity true))
             (assoc :constraints (qp.constraints/default-query-constraints))
             (update :info merge info)
             qp/userland-query)
         rff)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transforms` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
