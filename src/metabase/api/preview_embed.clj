(ns metabase.api.preview-embed
  "Endpoints for previewing how Cards and Dashboards will look when embedding them.
   These endpoints are basically identical in functionality to the ones in `/api/embed`, but:

   1.  Require admin access
   2.  Ignore the values of `:enabled_embedding` for Cards/Dashboards
   3.  Ignore the `:embed_params` whitelist for Card/Dashboards, instead using a field called `:_embedding_params` in
       the JWT token itself.

   Refer to the documentation for those endpoints for further details."
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.embed :as api.embed]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.util.embed :as embed]))

(defn- check-and-unsign [token]
  (api/check-superuser)
  (validation/check-embedding-enabled)
  (embed/unsign token))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/card/:token"
  "Fetch a Card you're considering embedding by passing a JWT `token`."
  [token]
  (let [unsigned-token (check-and-unsign token)]
    (api.embed/card-for-unsigned-token unsigned-token
      :embedding-params (embed/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params]))))

(def ^:private max-results
  "Embedding previews need to be limited in size to avoid performance issues (#20938)."
  2000)

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/card/:token/query"
  "Fetch the query results for a Card you're considering embedding by passing a JWT `token`."
  [token & query-params]
  (let [unsigned-token (check-and-unsign token)
        card-id        (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (api.embed/run-query-for-card-with-params-async
      :export-format    :api
      :card-id          card-id
      :token-params     (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
      :embedding-params (embed/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params])
      :constraints      {:max-results max-results}
      :query-params     query-params)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/dashboard/:token"
  "Fetch a Dashboard you're considering embedding by passing a JWT `token`. "
  [token]
  (let [unsigned-token (check-and-unsign token)]
    (api.embed/dashboard-for-unsigned-token unsigned-token
      :embedding-params (embed/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params]))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT `token`."
  [token dashcard-id card-id & query-params]
  (let [unsigned-token   (check-and-unsign token)
        dashboard-id     (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        embedding-params (embed/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params])
        token-params     (embed/get-in-unsigned-token-or-throw unsigned-token [:params])]
    (api.embed/dashcard-results-async
      :export-format    :api
      :dashboard-id     dashboard-id
      :dashcard-id      dashcard-id
      :card-id          card-id
      :embedding-params embedding-params
      :token-params     token-params
      :query-params     query-params)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/pivot/card/:token/query"
  "Fetch the query results for a Card you're considering embedding by passing a JWT `token`."
  [token & query-params]
  (let [unsigned-token (check-and-unsign token)
        card-id        (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (api.embed/run-query-for-card-with-params-async
      :export-format    :api
      :card-id          card-id
      :token-params     (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
      :embedding-params (embed/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params])
      :query-params     query-params
      :qp-runner        qp.pivot/run-pivot-query)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT `token`."
  [token dashcard-id card-id & query-params]
  (let [unsigned-token   (check-and-unsign token)
        dashboard-id     (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        embedding-params (embed/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params])
        token-params     (embed/get-in-unsigned-token-or-throw unsigned-token [:params])]
    (api.embed/dashcard-results-async
      :export-format    :api
      :dashboard-id     dashboard-id
      :dashcard-id      dashcard-id
      :card-id          card-id
      :embedding-params embedding-params
      :token-params     token-params
      :query-params     query-params
      :qp-runner        qp.pivot/run-pivot-query)))

(api/define-routes)
