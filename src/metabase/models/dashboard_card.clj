(ns metabase.models.dashboard-card
  (:require [clojure.set :as set]
            [korma.db :as kdb]
            [metabase.db :as db]
            [metabase.events :as events]
            [metabase.models.card :refer [Card]]
            [metabase.models.hydrate :refer :all]
            [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
            [metabase.models.interface :as i]
            [metabase.util :as u]))

(i/defentity DashboardCard :report_dashboardcard)

(defn- pre-insert [dashcard]
  (let [defaults {:sizeX 2
                  :sizeY 2}]
    (merge defaults dashcard)))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete! 'DashboardCardSeries :dashboardcard_id id))

(u/strict-extend (class DashboardCard)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped?       (constantly true)
          :pre-insert         pre-insert
          :pre-cascade-delete pre-cascade-delete
          :post-select        (u/rpartial set/rename-keys {:sizex :sizeX, :sizey :sizeY})}))


;;; ## ---------------------------------------- HYDRATION ----------------------------------------


(defn dashboard
  "Return the `Dashboard` associated with the `DashboardCard`."
  [{:keys [dashboard_id]}]
  {:pre [(integer? dashboard_id)]}
  (db/select-one 'Dashboard, :id dashboard_id))


(defn ^:hydrate series
  "Return the `Cards` associated as additional series on this `DashboardCard`."
  [{:keys [id]}]
  (db/select [Card :id :name :description :display :dataset_query :visualization_settings]
    (db/join [Card :id] [DashboardCardSeries :card_id])
    (db/qualify DashboardCardSeries :dashboardcard_id) id
    {:order-by [[(db/qualify DashboardCardSeries :position) :asc]]}))


;;; ## ---------------------------------------- CRUD FNS ----------------------------------------


(defn retrieve-dashboard-card
  "Fetch a single `DashboardCard` by its ID value."
  [id]
  {:pre [(integer? id)]}
  (-> (DashboardCard id)
      (hydrate :series)))

(defn update-dashboard-card-series
  "Update the `DashboardCardSeries` for a given `DashboardCard`.
   CARD-IDS should be a definitive collection of *all* IDs of cards for the dashboard card in the desired order.

   *  If an ID in CARD-IDS has no corresponding existing `DashboardCardSeries` object, one will be created.
   *  If an existing `DashboardCardSeries` has no corresponding ID in CARD-IDs, it will be deleted.
   *  All cards will be updated with a `position` according to their place in the collection of CARD-IDS"
  {:arglists '([dashboard-card card-ids])}
  [{:keys [id]} card-ids]
  {:pre [(integer? id)
         (sequential? card-ids)
         (every? integer? card-ids)]}
  ;; first off, just delete all series on the dashboard card (we add them again below)
  (db/cascade-delete! DashboardCardSeries :dashboardcard_id id)
  ;; now just insert all of the series that were given to us
  (when-not (empty? card-ids)
    (let [cards (map-indexed (fn [i card-id]
                               {:dashboardcard_id id, :card_id card-id, :position i})
                             card-ids)]
      (db/insert-many! DashboardCardSeries cards))))

(defn update-dashboard-card
  "Update an existing `DashboardCard`, including all `DashboardCardSeries`.
   Returns the updated `DashboardCard` or throws an Exception."
  [{:keys [id series] :as dashboard-card}]
  {:pre [(integer? id)
         (every? integer? series)]}
  (let [{:keys [sizeX sizeY row col series]} (merge {:series []} dashboard-card)]
    (kdb/transaction
      ;; update the dashcard itself (positional attributes)
      (when (and sizeX sizeY row col)
        (db/update! DashboardCard id, :sizeX sizeX, :sizeY sizeY, :row row, :col col))
      ;; update series (only if they changed)
      (when (not= series (map :card_id (db/select [DashboardCardSeries :card_id], :dashboardcard_id id, {:order-by [[:position :asc]]})))
        (update-dashboard-card-series dashboard-card series))
      ;; fetch the fully updated dashboard card then return it (and fire off an event)
      (->> (retrieve-dashboard-card id)
           (events/publish-event :dashboard-card-update)))))

(defn create-dashboard-card
  "Create a new `DashboardCard` by inserting it into the database along with all associated pieces of data such as `DashboardCardSeries`.
   Returns the newly created `DashboardCard` or throws an Exception."
  [{:keys [dashboard_id card_id creator_id] :as dashboard-card}]
  {:pre [(integer? dashboard_id)
         (integer? card_id)
         (integer? creator_id)]}
  (let [{:keys [sizeX sizeY row col series]} (merge {:sizeX 2, :sizeY 2, :series []}
                                                    dashboard-card)]
    (kdb/transaction
      (let [{:keys [id] :as dashboard-card} (db/insert! DashboardCard
                                              :dashboard_id dashboard_id
                                              :card_id      card_id
                                              :sizeX        sizeX
                                              :sizeY        sizeY
                                              :row          row
                                              :col          col)]
        ;; add series to the DashboardCard
        (update-dashboard-card-series dashboard-card series)
        ;; return the full DashboardCard (and record our create event)
        (-> (retrieve-dashboard-card id)
            (assoc :actor_id creator_id)
            (->> (events/publish-event :dashboard-card-create))
            (dissoc :actor_id))))))

(defn delete-dashboard-card
  "Delete a `DashboardCard`."
  [dashboard-card user-id]
  {:pre [(map? dashboard-card)
         (integer? user-id)]}
  (let [{:keys [id]} (dashboard dashboard-card)]
    (db/cascade-delete! DashboardCard :id (:id dashboard-card))
    (events/publish-event :dashboard-remove-cards {:id id :actor_id user-id :dashcards [dashboard-card]})))
