(ns metabase.data-app.api.app
  "/api/app endpoints for data app consumers"
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.data-app.models :as data-app.models]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn get-published-data-app
  "Get the published version of a data app by id."
  [id]
  (let [app                 (api/check-404 (t2/select-one :model/DataApp id))
        released-definition (data-app.models/released-definition id)]
    (when-not released-definition
      (throw (ex-info "Data app is not released"
                      {:status-code 404})))
    (assoc app :released_definition released-definition)))

(api.macros/defendpoint :get "/"
  "Fetch a list of published data apps. Takes `limit`, `offset` for pagination."
  [_route-params
   _query-params]
  (let [clauses (cond-> {:where [:exists {:select [1]
                                          :from [:data_app_release]
                                          :where [:and
                                                  [:= :data_app_release.app_id :data_app.id]
                                                  [:= :data_app_release.retracted false]]}]}
                  (request/limit) (sql.helpers/limit (request/limit))
                  (request/offset) (sql.helpers/offset (request/offset)))
        filter-clauses-without-paging (dissoc clauses :limit :offset)]
    {:data (-> (t2/select :model/DataApp
                          (sql.helpers/order-by clauses [:created_at :desc]))
               (t2/hydrate :released-definition))
     :total (t2/count :model/DataApp filter-clauses-without-paging)
     :limit (request/limit)
     :offset (request/offset)}))

(api.macros/defendpoint :get "/:id"
  "Fetch the published definition of a data app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (-> (get-published-data-app id)
      api/read-check))
