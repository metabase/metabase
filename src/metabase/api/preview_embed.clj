(ns metabase.api.preview-embed
  "Endpoints for previewing how Cards and Dashboards will look when embedding them.
   These endpoints are basically identical in functionality to the ones in `/api/embed`, but:

   1.  Require admin access
   2.  Ignore the values of `:enabled_embedding` for Cards/Dashboards
   3.  Ignore the `:embed_params` whitelist for Card/Dashboards, instead using a field called `:_embedding_params` in
       the JWT token itself.

   Refer to the documentation for those endpoints for further details."
  (:require [compojure.core :refer [GET]]
            [metabase.api
             [common :as api]
             [embed :as embed-api]]
            [metabase.util.embed :as eu]))

(defn- check-and-unsign [token]
  (api/check-superuser)
  (api/check-embedding-enabled)
  (eu/unsign token))

(api/defendpoint GET "/card/:token"
  "Fetch a Card you're considering embedding by passing a JWT `token`."
  [token]
  (let [unsigned-token (check-and-unsign token)]
    (embed-api/card-for-unsigned-token unsigned-token
      :embedding-params (eu/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params]))))

(api/defendpoint ^:streaming GET "/card/:token/query"
  "Fetch the query results for a Card you're considering embedding by passing a JWT `token`."
  [token & query-params]
  (let [unsigned-token (check-and-unsign token)
        card-id        (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (embed-api/run-query-for-card-with-params-async
      :export-format    :api
      :card-id          card-id
      :token-params     (eu/get-in-unsigned-token-or-throw unsigned-token [:params])
      :embedding-params (eu/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params])
      :query-params     query-params)))

(api/defendpoint GET "/dashboard/:token"
  "Fetch a Dashboard you're considering embedding by passing a JWT `token`. "
  [token]
  (let [unsigned-token (check-and-unsign token)]
    (embed-api/dashboard-for-unsigned-token unsigned-token
      :embedding-params (eu/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params]))))

(api/defendpoint ^:streaming GET "/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT `token`."
  [token dashcard-id card-id & query-params]
  (let [unsigned-token   (check-and-unsign token)
        dashboard-id     (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        embedding-params (eu/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params])
        token-params     (eu/get-in-unsigned-token-or-throw unsigned-token [:params])]
    (embed-api/dashcard-results-async
      :export-format    :api
      :dashboard-id     dashboard-id
      :dashcard-id      dashcard-id
      :card-id          card-id
      :embedding-params embedding-params
      :token-params     token-params
      :query-params     query-params)))


(api/define-routes)
