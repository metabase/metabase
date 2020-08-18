(ns metabase.models.dashboard-card
  (:require [clojure.set :as set]
            [metabase
             [db :as mdb]
             [events :as events]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [interface :as i]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]
             [models :as models]]))

(models/defmodel DashboardCard :report_dashboardcard)

(declare series)

(defn- perms-objects-set
  "Return the set of permissions required to `read-or-write` this DashboardCard. If `:card` and `:series` are already
  hydrated this method doesn't need to make any DB calls."
  [dashcard read-or-write]
  (let [card   (or (:card dashcard)
                   (db/select-one [Card :dataset_query] :id (u/get-id (:card_id dashcard))))
        series (or (:series dashcard)
                   (series dashcard))]
    (apply set/union (i/perms-objects-set card read-or-write) (for [series-card series]
                                                                (i/perms-objects-set series-card read-or-write)))))

(defn- pre-insert [dashcard]
  (let [defaults {:sizeX                  2
                  :sizeY                  2
                  :parameter_mappings     []
                  :visualization_settings {}}]
    (merge defaults dashcard)))

(u/strict-extend (class DashboardCard)
  models/IModel
  (merge models/IModelDefaults
         {:properties  (constantly {:timestamped? true})
          :types       (constantly {:parameter_mappings :parameter-mappings, :visualization_settings :json})
          :pre-insert  pre-insert
          :post-select (u/rpartial set/rename-keys {:sizex :sizeX, :sizey :sizeY})})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:perms-objects-set  perms-objects-set
          :can-read?          (partial i/current-user-has-full-permissions? :read)
          :can-write?         (partial i/current-user-has-full-permissions? :write)}))


;;; --------------------------------------------------- HYDRATION ----------------------------------------------------

(defn dashboard
  "Return the Dashboard associated with the DashboardCard."
  [{:keys [dashboard_id]}]
  {:pre [(integer? dashboard_id)]}
  (db/select-one 'Dashboard, :id dashboard_id))


(defn ^:hydrate series
  "Return the `Cards` associated as additional series on this DashboardCard."
  [{:keys [id]}]
  (db/select [Card :id :name :description :display :dataset_query :visualization_settings :collection_id]
    (mdb/join [Card :id] [DashboardCardSeries :card_id])
    (db/qualify DashboardCardSeries :dashboardcard_id) id
    {:order-by [[(db/qualify DashboardCardSeries :position) :asc]]}))


;;; ---------------------------------------------------- CRUD FNS ----------------------------------------------------

(s/defn retrieve-dashboard-card
  "Fetch a single DashboardCard by its ID value."
  [id :- su/IntGreaterThanZero]
  (-> (DashboardCard id)
      (hydrate :series)))

(s/defn update-dashboard-card-series!
  "Update the DashboardCardSeries for a given DashboardCard.
   `card-ids` should be a definitive collection of *all* IDs of cards for the dashboard card in the desired order.

   *  If an ID in `card-ids` has no corresponding existing DashboardCardSeries object, one will be created.
   *  If an existing DashboardCardSeries has no corresponding ID in `card-ids`, it will be deleted.
   *  All cards will be updated with a `position` according to their place in the collection of `card-ids`"
  {:arglists '([dashboard-card card-ids])}
  [{:keys [id]} :- {:id su/IntGreaterThanZero, s/Keyword s/Any}
   card-ids     :- [su/IntGreaterThanZero]]
  ;; first off, just delete all series on the dashboard card (we add them again below)
  (db/delete! DashboardCardSeries :dashboardcard_id id)
  ;; now just insert all of the series that were given to us
  (when (seq card-ids)
    (let [cards (map-indexed (fn [i card-id]
                               {:dashboardcard_id id, :card_id card-id, :position i})
                             card-ids)]
      (db/insert-many! DashboardCardSeries cards))))

(def ^:private DashboardCardUpdates
  {:id                                      su/IntGreaterThanZero
   (s/optional-key :parameter_mappings)     (s/maybe [su/Map])
   (s/optional-key :visualization_settings) (s/maybe su/Map)
   ;; series is a sequence of IDs of additional cards after the first to include as "additional serieses"
   (s/optional-key :series)                 (s/maybe [su/IntGreaterThanZero])
   s/Keyword                                s/Any})

(s/defn update-dashboard-card!
  "Update an existing DashboardCard` including all DashboardCardSeries.
   Returns the updated DashboardCard or throws an Exception."
  [{:keys [id series parameter_mappings visualization_settings] :as dashboard-card} :- DashboardCardUpdates]
  (let [{:keys [sizeX sizeY row col series]} (merge {:series []} dashboard-card)]
    (db/transaction
      ;; update the dashcard itself (positional attributes)
      (when (and sizeX sizeY row col)
        (db/update-non-nil-keys! DashboardCard id
          :sizeX                  sizeX
          :sizeY                  sizeY
          :row                    row
          :col                    col
          :parameter_mappings     parameter_mappings
          :visualization_settings visualization_settings))
      ;; update series (only if they changed)
      (when-not (= series (map :card_id (db/select [DashboardCardSeries :card_id]
                                          :dashboardcard_id id
                                          {:order-by [[:position :asc]]})))
        (update-dashboard-card-series! dashboard-card series))
      ;; fetch the fully updated dashboard card then return it (and fire off an event)
      (->> (retrieve-dashboard-card id)
           (events/publish-event! :dashboard-card-update)))))

(def ^:private NewDashboardCard
  {:dashboard_id                            su/IntGreaterThanZero
   (s/optional-key :card_id)                (s/maybe su/IntGreaterThanZero)
   (s/optional-key :parameter_mappings)     (s/maybe [su/Map])
   (s/optional-key :visualization_settings) (s/maybe su/Map)
   ;; TODO - make the rest of the options explicit instead of just allowing whatever for other keys
   s/Keyword                                s/Any})

(s/defn create-dashboard-card!
  "Create a new DashboardCard by inserting it into the database along with all associated pieces of data such as
   DashboardCardSeries. Returns the newly created DashboardCard or throws an Exception."
  [dashboard-card :- NewDashboardCard]
  (let [{:keys [dashboard_id card_id creator_id parameter_mappings visualization_settings sizeX sizeY row col series]
         :or   {sizeX 2, sizeY 2, series []}} dashboard-card]
    (db/transaction
      (let [{:keys [id] :as dashboard-card} (db/insert! DashboardCard
                                              :dashboard_id           dashboard_id
                                              :card_id                card_id
                                              :sizeX                  sizeX
                                              :sizeY                  sizeY
                                              :row                    (or row 0)
                                              :col                    (or col 0)
                                              :parameter_mappings     (or parameter_mappings [])
                                              :visualization_settings (or visualization_settings {}))]
        ;; add series to the DashboardCard
        (update-dashboard-card-series! dashboard-card series)
        ;; return the full DashboardCard (and record our create event)
        (as-> (retrieve-dashboard-card id) dashcard
          (assoc dashcard :actor_id creator_id)
          (events/publish-event! :dashboard-card-create dashcard)
          (dissoc dashcard :actor_id))))))

(defn delete-dashboard-card!
  "Delete a DashboardCard`"
  [dashboard-card user-id]
  {:pre [(map? dashboard-card)
         (integer? user-id)]}
  (let [{:keys [id]} (dashboard dashboard-card)]
    (db/delete! DashboardCard :id (:id dashboard-card))
    (events/publish-event! :dashboard-remove-cards {:id id :actor_id user-id :dashcards [dashboard-card]})))
