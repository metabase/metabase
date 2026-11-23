(ns metabase.queries-rest.api.cards
  "Bulk endpoints for Cards"
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.models.interface :as mi]
   [metabase.queries-rest.api.card :as api.card]
   [metabase.queries-rest.db :as queries-rest.db]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- hydrate-dashboard-permissions
  "`cards`, each with its `:in_dashboards` hydrated with `:can_read` and `:can_write`, from one read of the permissions."
  [cards]
  (let [id->dashboard (u/index-by :id (t2/hydrate (vec (mapcat :in_dashboards cards)) :can_read :can_write))]
    (mapv (fn [card] (update card :in_dashboards #(mapv (comp id->dashboard :id) %))) cards)))

(defn- present-dashboard [dashboard]
  (-> (cond
        (not (mi/can-read? dashboard)) {:error :unreadable-dashboard}
        (not (mi/can-write? dashboard)) (merge dashboard {:error :unwritable-dashboard})
        :else dashboard)
      (select-keys [:id :name :error])))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/dashboards"
  "Get the dashboards that multiple cards appear in. The response is a sequence of maps, each of which has a `card_id`
  and `dashboards`. `dashboard` may include an `:error` key, either `:unreadable-dashboard` or
  `:unwritable-dashboard`. In the case of an `unreadable-dashboard` the dashboard details (name, ID) will NOT be
  present."
  [_route-params
   _query-params
   {:keys [card_ids]} :- [:map {:closed true}
                          [:card_ids [:sequential ms/PositiveInt]]]]
  (let [id->card (queries-rest.db/cards-by-id card_ids)]
    (as-> card_ids $
      (mapv id->card $)
      (t2/hydrate $ :in_dashboards)
      (hydrate-dashboard-permissions $)
      (mapv (fn [{:keys [id in_dashboards]}]
              {:card_id id :dashboards (map present-dashboard in_dashboards)})
            $))))

(api.macros/defendpoint :post "/move" :- [:map {:closed true} [:status [:= :success]]]
  "Moves a number of Cards to a single collection or dashboard.

  For now, just either succeed or fail as a batch - we can think more about error handling later down the road."
  [_route-params
   _query-params
   {:keys [card_ids], :as body} :- [:map {:closed true}
                                    [:card_ids      [:sequential ms/PositiveInt]]
                                    [:collection_id {:optional true} [:maybe ms/PositiveInt]]
                                    [:dashboard_id  {:optional true} [:maybe ms/PositiveInt]]]]
  (t2/with-transaction [_conn]
    (api.card/move-cards! card_ids (select-keys body [:collection_id :dashboard_id])))
  {:status :success})
