(ns metabase.api.advanced-computation.public
  "/api/advanced_computation/public endpoints, like pivot table generation"
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [compojure.core :refer [GET]]
            [metabase.api
             [card :as api.card]
             [common :as api]
             [public :as api.public]]
            [metabase.api.advanced-computation.common :as advcomp-common]
            [metabase.async.util :as async.u]
            [metabase.models.card :as card :refer [Card]]
            [metabase.query-processor.streaming :as qp.streaming]
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

(api/define-routes)
