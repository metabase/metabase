(ns metabase.dynamic-goals.api
  "/api/dynamic-goal endpoints."
  (:require
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.macros :as api.macros]
   [metabase.data-apps.core :as data-apps]
   [metabase.dynamic-goals.core :as dynamic-goals]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util.malli.schema :as ms]))

(api.macros/defendpoint :post "/values"
  :- (streaming-response/streaming-response-schema ::dynamic-goals/goal-values)
  "Run the goal `sources` (cards and measures) as the current user and return each one's single-row result, keyed by
  source type, then id. A source that can't run fails on its own. `dashboard_id` picks card cache settings."
  {:scope api-scope/data-app}
  [_route-params
   _query-params
   {:keys [sources dashboard_id ignore_cache]} :- [:map {:closed true}
                                                   [:sources      dynamic-goals/sources-schema]
                                                   [:dashboard_id {:optional true} [:maybe ms/PositiveInt]]
                                                   [:ignore_cache {:optional true} [:maybe :boolean]]]
   request]
  ;; resolved on the request thread, so a missing or unreadable data app is a 404 or 403, not a streamed error
  (let [data-app (data-apps/request-data-app request)]
    (dynamic-goals/goal-values-response
     #(dynamic-goals/goal-values sources
                                 :check-sources (when data-app
                                                  (partial data-apps/goal-source-refusals data-app))
                                 :dashboard-id  dashboard_id
                                 :ignore-cache? ignore_cache))))
