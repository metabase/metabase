(ns metabase.api.advanced-computation.public
  "/api/advanced_computation/public endpoints, like pivot table generation"
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [compojure.core :refer [GET]]
            [metabase.api
             [card :as api.card]
             [common :as api]
             [embed :as api.embed]
             [preview-embed :as api.preview]
             [public :as api.public]]
            [metabase.api.advanced-computation.common :as advcomp-common]
            [metabase.async.util :as async.u]
            [metabase.models
             [card :as card :refer [Card]]
             [dashboard :as dashboard :refer [Dashboard]]]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.util :as u]
            [metabase.util
             [embed :as eu]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

;;
;; helper functions
;;

(defn run-query-for-card-with-id-async
  "Run the query belonging to Card with `card-id` with `parameters` and other query options (e.g. `:constraints`).
  Returns a `StreamingResponse` object that should be returned as the result of an API endpoint."
  [card-id export-format parameters & options]
  {:pre [(integer? card-id)]}
  ;; run this query with full superuser perms
  ;;
  ;; we actually need to bind the current user perms here twice, once so `card-api` will have the full perms when it
  ;; tries to do the `read-check`, and a second time for when the query is ran (async) so the QP middleware will have
  ;; the correct perms
  (binding [api/*current-user-permissions-set* (atom #{"/"})]
    (apply api.card/run-query-for-card-async card-id export-format
           :parameters parameters
           :context    :public-question
           :run        (fn [query info]
                         (qp.streaming/streaming-response [{:keys [reducedf], :as context} export-format]
                           (let [context  (assoc context :reducedf (api.public/public-reducedf reducedf))
                                 in-chan  (binding [api/*current-user-permissions-set* (atom #{"/"})]
                                            (advcomp-common/run-query context query info))
                                 out-chan (a/promise-chan (map api.public/transform-results))]
                             (async.u/promise-pipe in-chan out-chan)
                             out-chan)))
           options)))

(defn public-dashcard-results-async
  "Return the results of running a query with `parameters` for Card with `card-id` belonging to Dashboard with
  `dashboard-id`. Throws a 404 immediately if the Card isn't part of the Dashboard. Returns a `StreamingResponse`."
  [dashboard-id card-id export-format parameters
   & {:keys [context constraints]
      :or   {context     :public-dashboard}}]
  (api.public/check-card-is-in-dashboard card-id dashboard-id)
  (let [params (api.public/resolve-params dashboard-id (if (string? parameters)
                                                         (json/parse-string parameters keyword)
                                                         parameters))]
    (run-query-for-card-with-id-async
     card-id export-format params
     :dashboard-id dashboard-id
     :context      context
     :constraints  constraints)))

(defn run-query-for-card-with-params-async
  "Run the query associated with Card with `card-id` using JWT `token-params`, user-supplied URL `query-params`,
   an `embedding-params` whitelist, and additional query `options`. Returns `StreamingResponse` that should be
  returned as the API endpoint result."
  {:style/indent 0}
  [& {:keys [export-format card-id embedding-params token-params query-params options]}]
  {:pre [(integer? card-id) (u/maybe? map? embedding-params) (map? token-params) (map? query-params)]}
  (let [merged-id->value (api.embed/validate-and-merge-params embedding-params token-params (api.embed/normalize-query-params query-params))
        parameters       (api.embed/apply-merged-id->value (api.embed/resolve-card-parameters card-id) merged-id->value)]
    (apply run-query-for-card-with-id-async
           card-id export-format parameters
           :context :embedded-question, options)))

(defn run-query-for-unsigned-token-async
  "Run the query belonging to Card identified by `unsigned-token`. Checks that embedding is enabled both globally and
  for this Card. Returns core.async channel to fetch the results."
  [unsigned-token export-format query-params & options]
  (let [card-id (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (api.embed/check-embedding-enabled-for-card card-id)
    (run-query-for-card-with-params-async
      :export-format     export-format
      :card-id           card-id
      :token-params      (eu/get-in-unsigned-token-or-throw unsigned-token [:params])
      :embedding-params  (db/select-one-field :embedding_params Card :id card-id)
      :query-params      query-params
      :options           options)))

(defn dashcard-results-async
  "Return results for running the query belonging to a DashboardCard. Returns a `StreamingResponse`."
  {:style/indent 0}
  [& {:keys [dashboard-id dashcard-id card-id export-format embedding-params token-params
             query-params constraints]}]
  {:pre [(integer? dashboard-id) (integer? dashcard-id) (integer? card-id) (u/maybe? map? embedding-params)
         (map? token-params) (map? query-params)]}
  (let [merged-id->value (api.embed/validate-and-merge-params embedding-params token-params (api.embed/normalize-query-params query-params))
        parameters       (api.embed/apply-merged-id->value (api.embed/resolve-dashboard-parameters dashboard-id dashcard-id card-id)
                                                           merged-id->value)]
    (public-dashcard-results-async
     dashboard-id card-id export-format parameters
     :context     :embedded-dashboard
     :constraints constraints)))

;;
;; endpoints
;;

(api/defendpoint ^:streaming GET "/pivot/card/:uuid/query"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid parameters]
  {parameters (s/maybe su/JSONString)}

  (api/check-public-sharing-enabled)
  (let [card-id (api/check-404 (db/select-one-id Card :public_uuid uuid, :archived false))]
    (binding [api/*current-user-permissions-set* (atom #{"/"})]
      (apply api.card/run-query-for-card-async card-id :api
             :parameters (json/parse-string parameters keyword)
             :context    :public-question
             :run        (fn [query info]
                           (qp.streaming/streaming-response [{:keys [reducedf]
                                                              :as   context} :api]
                             (let [context  (assoc context :reducedf (api.public/public-reducedf reducedf))
                                   in-chan  (binding [api/*current-user-permissions-set* (atom #{"/"})]
                                              (advcomp-common/run-query context (assoc query :async? true) info))
                                   out-chan (a/promise-chan (map api.public/transform-results))]
                               (async.u/promise-pipe in-chan out-chan)
                               out-chan)))
             nil))))

(api/defendpoint ^:streaming GET "/pivot/dashboard/:uuid/card/:card-id"
  "Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled."
  [uuid card-id parameters]
  {parameters (s/maybe su/JSONString)}
  (api/check-public-sharing-enabled)

  (let [dashboard-id (api/check-404 (db/select-one-id Dashboard :public_uuid uuid, :archived false))]
    (public-dashcard-results-async dashboard-id card-id :api parameters)))

;; /embed/card/:token/query
(api/defendpoint ^:streaming GET "/pivot/embed/card/:token/query"
  "Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}"
  [token & query-params]
  (run-query-for-unsigned-token-async (eu/unsign token) :api query-params))

;; /preview_embed/card/:token/query
(api/defendpoint ^:streaming GET "/pivot/preview_embed/card/:token/query"
  "Fetch the query results for a Card you're considering embedding by passing a JWT `token`."
  [token & query-params]
  (let [unsigned-token (api.preview/check-and-unsign token)
        card-id        (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (run-query-for-card-with-params-async
      :export-format    :api
      :card-id          card-id
      :token-params     (eu/get-in-unsigned-token-or-throw unsigned-token [:params])
      :embedding-params (eu/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params])
      :query-params     query-params)))

;; /preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id
(api/defendpoint ^:streaming GET "/pivot/preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT `token`."
  [token dashcard-id card-id & query-params]
  (let [unsigned-token   (api.preview/check-and-unsign token)
        dashboard-id     (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        embedding-params (eu/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params])
        token-params     (eu/get-in-unsigned-token-or-throw unsigned-token [:params])]
    (dashcard-results-async
      :export-format    :api
      :dashboard-id     dashboard-id
      :dashcard-id      dashcard-id
      :card-id          card-id
      :embedding-params embedding-params
      :token-params     token-params
      :query-params     query-params)))

(api/define-routes)
