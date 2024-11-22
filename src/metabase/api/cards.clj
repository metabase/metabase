(ns metabase.api.cards
  "Bulk endpoints for Cards"
  (:require [compojure.core :refer [POST]]
            [metabase.api.card :as api.card]
            [metabase.api.common :as api]
            [metabase.models.interface :as mi]
            [metabase.util.malli :as mu]
            [metabase.util.malli.schema :as ms]
            [toucan2.core :as t2]))

(mu/defn get-dashboards
  "Get dashboards that a card appears in. The result looks like
  ```
  {:card_id 123
   :dashboards [{:error :unwritable-dashboard :name \"foo\" :id 456}
                {:error :unreadable-dashboard}
                {:name \"foo\" :id 678}]}
  ```"
  [card-id :- ms/PositiveInt]
  (let [card (t2/select-one :model/Card :id card-id)
        dashboards (:in_dashboards (t2/hydrate card :in_dashboards))]
    {:card_id card-id :dashboards (->> dashboards
                                       (map #(cond
                                               (not (mi/can-read? %)) {:error :unreadable-dashboard}
                                               (not (mi/can-write? %)) (merge % {:error :unwritable-dashboard})
                                               :else %))
                                       (map #(dissoc % :collection_id)))}))

(api/defendpoint POST "/dashboards"
  "Get the dashboards that multiple cards appear in. The response is a sequence of maps, each of which has a `card_id`
  and `dashboards`. `dashboard` may include an `:error` key, either `:unreadable-dashboard` or
  `:unwritable-dashboard`. In the case of an `unreadable-dashboard` the dashboard details (name, ID) will NOT be
  present."
  [:as {{:keys [card_ids]} :body}]
  {card_ids [:sequential ms/PositiveInt]}
  (map get-dashboards card_ids))

(api/defendpoint POST "/move"
  "Moves a number of Cards to a single collection or dashboard.

  For now, just either succeed or fail as a batch - we can think more about error handling later down the road."
  [:as {{:keys [card_ids
                collection_id
                dashboard_id], :as body} :body}]
  {card_ids [:sequential ms/PositiveInt]
   collection_id [:maybe ms/PositiveInt]
   dashboard_id [:maybe ms/PositiveInt]}
  (t2/with-transaction [_conn]
    (doseq [card-id card_ids]
      (api.card/update-card! card-id (select-keys body [:collection_id :dashboard_id]) true)))
  {:status :success})

(api/define-routes)
