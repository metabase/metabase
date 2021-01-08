(ns metabase.api.advanced-computation.public
  "/api/advanced_computation/public endpoints, like pivot table generation"
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [compojure.core :refer [GET]]
            [metabase.api.advanced-computation.common :as advcomp-common]
            [metabase.api.card :as api.card]
            [metabase.api.common :as api]
            [metabase.api.public :as api.public]
            [metabase.async.util :as async.u]
            [metabase.models.card :as card :refer [Card]]
            [metabase.models.dashboard :as dashboard :refer [Dashboard]]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.util.embed :as eu]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

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
    (advcomp-common/public-dashcard-results-async dashboard-id card-id :api parameters)))

;; /embed/card/:token/query
(api/defendpoint ^:streaming GET "/pivot/embed/card/:token/query"
  "Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}"
  [token & query-params]
  (advcomp-common/run-query-for-unsigned-token-async (eu/unsign token) :api query-params))

(api/define-routes)
