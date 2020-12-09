(ns metabase.api.advanced-computation.authenticated
  "Authenticated /api/advanced_computation endpoints, like pivot table generation"
  (:require [compojure.core :refer [POST]]
            [metabase.api
             [card :as api.card]
             [common :as api]]
            [metabase.api.advanced-computation.common :as advcomp-common]
            [metabase.models.database :as database :refer [Database]]
            [metabase.query-processor.middleware.cache :as cache]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]))

(api/defendpoint POST "/pivot/dataset"
  "Generate a pivoted dataset for an ad-hoc query"
  [:as {{:keys      [database]
         query-type :type
         :as        query} :body}]
  {database (s/maybe s/Int)}

  (when-not database
    (throw (Exception. (str (tru "`database` is required for all queries.")))))
  (api/read-check Database database)

  (qp.streaming/streaming-response [context :api]
    (advcomp-common/run-query context (assoc query :async? true))))

(api/defendpoint ^:streaming POST "/pivot/card/:card-id/query"
  "Run the query associated with a Card."
  [card-id :as {{:keys [parameters ignore_cache]
                 :or   {ignore_cache false}} :body}]
  {ignore_cache (s/maybe s/Bool)}

  (qp.streaming/streaming-response [context :api]
    (binding [cache/*ignore-cached-results* ignore_cache]
      (api.card/run-query-for-card-async card-id :api, :parameters parameters, :run (partial advcomp-common/run-query context) :context context))))

(api/define-routes)
