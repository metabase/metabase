(ns metabase.api.advanced-computation.preview-embed
  "/api/advanced_computation/preview_embed endpoints, like pivot table generation"
  (:require [metabase.api.advanced-computation.common :as advcomp-common]
            [metabase.api.common :as api]
            [metabase.api.preview-embed :as api.preview]
            [metabase.util.embed :as eu]))

;; /preview_embed/card/:token/query
(api/defendpoint ^:streaming GET "/pivot/card/:token/query"
  "Fetch the query results for a Card you're considering embedding by passing a JWT `token`."
  [token & query-params]
  (let [unsigned-token (api.preview/check-and-unsign token)
        card-id        (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (advcomp-common/run-query-for-card-with-params-async
      :export-format    :api
      :card-id          card-id
      :token-params     (eu/get-in-unsigned-token-or-throw unsigned-token [:params])
      :embedding-params (eu/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params])
      :query-params     query-params)))

;; /preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id
(api/defendpoint ^:streaming GET "/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT `token`."
  [token dashcard-id card-id & query-params]
  (let [unsigned-token   (api.preview/check-and-unsign token)
        dashboard-id     (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        embedding-params (eu/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params])
        token-params     (eu/get-in-unsigned-token-or-throw unsigned-token [:params])]
    (advcomp-common/dashcard-results-async
      :export-format    :api
      :dashboard-id     dashboard-id
      :dashcard-id      dashcard-id
      :card-id          card-id
      :embedding-params embedding-params
      :token-params     token-params
      :query-params     query-params)))

(api/define-routes)
