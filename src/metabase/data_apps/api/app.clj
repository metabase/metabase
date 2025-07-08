(ns metabase.data-apps.api.app
  "/api/app endpoints for data app consumers"
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.data-apps.models :as data-apps.models]
   [metabase.request.core :as request]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn get-published-data-app
  "Get the published version of a data app by id."
  [url]
  (let [app                 (api/check-404 (t2/select-one :model/DataApp :url url :status :published))
        released-definition (data-apps.models/released-definition (:id app))]
    (when-not released-definition
      (throw (ex-info "Data app is not released"
                      {:status-code 404})))
    (assoc app :definition released-definition)))

(api.macros/defendpoint :get "/"
  "Fetch a list of published data apps. Takes `limit`, `offset` for pagination."
  [_route-params
   _query-params]
  (let [limit   (request/limit)
        offset  (request/offset)
        clauses (cond-> {:where [:exists {:select [1]
                                          :from [:data_app_release]
                                          :where [:and
                                                  [:= :data_app_release.app_id :data_app.id]
                                                  [:= :data_app_release.retracted false]]}]}
                  limit (sql.helpers/limit limit)
                  offset (sql.helpers/offset offset))
        filter-clauses-without-paging (dissoc clauses :limit :offset)]
    {:data (-> (t2/select :model/DataApp
                          (sql.helpers/order-by clauses [:created_at :desc]))
               (t2/hydrate :released-definition))
     :total (t2/count :model/DataApp filter-clauses-without-paging)
     :limit limit
     :offset offset}))

(api.macros/defendpoint :get "/:url"
  "Fetch the published definition of a data app."
  [{:keys [id]} :- [:map [:url :string]]]
  (-> (get-published-data-app id)
      api/read-check))
