(ns metabase.api.cards
  "Bulk endpoints for Cards"
  (:require
   [metabase.api.card :as api.card]
   [metabase.api.macros :as api.macros]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn get-dashboards
  "Get dashboards that a card with id `card-id` appears in."
  [card-id :- ms/PositiveInt]
  (let [card (t2/select-one :model/Card :id card-id)]
    (:in_dashboards (t2/hydrate card :in_dashboards))))

(defn- present-dashboard [dashboard]
  (-> (cond
        (not (mi/can-read? dashboard)) {:error :unreadable-dashboard}
        (not (mi/can-write? dashboard)) (merge dashboard {:error :unwritable-dashboard})
        :else dashboard)
      (select-keys [:id :name :error])))

(api.macros/defendpoint :post "/dashboards"
  "Get the dashboards that multiple cards appear in. The response is a sequence of maps, each of which has a `card_id`
  and `dashboards`. `dashboard` may include an `:error` key, either `:unreadable-dashboard` or
  `:unwritable-dashboard`. In the case of an `unreadable-dashboard` the dashboard details (name, ID) will NOT be
  present."
  [_route-params
   _query-params
   {:keys [card_ids]} :- [:map
                          [:card_ids [:sequential ms/PositiveInt]]]]
  (->> card_ids
       (mapv (fn [card-id]
               {:card_id card-id :dashboards (map present-dashboard (get-dashboards card-id))}))))

(api.macros/defendpoint :post "/move"
  "Moves a number of Cards to a single collection or dashboard.

  For now, just either succeed or fail as a batch - we can think more about error handling later down the road."
  [_route-params
   _query-params
   {:keys [card_ids], :as body} :- [:map
                                    [:card_ids      [:sequential ms/PositiveInt]]
                                    [:collection_id {:optional true} [:maybe ms/PositiveInt]]
                                    [:dashboard_id  {:optional true} [:maybe ms/PositiveInt]]]]
  (t2/with-transaction [_conn]
    (doseq [card-id card_ids]
      (api.card/update-card! card-id (select-keys body [:collection_id :dashboard_id]) true)))
  {:status :success})
