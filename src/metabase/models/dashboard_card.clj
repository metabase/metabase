(ns metabase.models.dashboard-card
  (:require [clojure.set :as set]
            [metabase.db.util :as mdb.u]
            [metabase.events :as events]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
            [metabase.models.interface :as mi]
            [metabase.models.pulse-card :refer [PulseCard]]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.serialization.util :as serdes.util]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.models :as models]))

(models/defmodel DashboardCard :report_dashboardcard)

(declare series)

(defn- perms-objects-set
  "Return the set of permissions required to `read-or-write` this DashboardCard. If `:card` and `:series` are already
  hydrated this method doesn't need to make any DB calls."
  [dashcard read-or-write]
  (let [card   (or (:card dashcard)
                   (db/select-one [Card :dataset_query] :id (u/the-id (:card_id dashcard))))
        series (or (:series dashcard)
                   (series dashcard))]
    (apply set/union (mi/perms-objects-set card read-or-write) (for [series-card series]
                                                                 (mi/perms-objects-set series-card read-or-write)))))

(defn- pre-insert [dashcard]
  (let [defaults {:sizeX                  2
                  :sizeY                  2
                  :parameter_mappings     []
                  :visualization_settings {}}]
    (merge defaults dashcard)))

(u/strict-extend (class DashboardCard)
  models/IModel
  (merge models/IModelDefaults
         {:properties  (constantly {:timestamped? true
                                    :entity_id    true})
          :types       (constantly {:parameter_mappings     :parameters-list
                                    :visualization_settings :visualization-settings})
          :pre-insert  pre-insert
          :post-select #(set/rename-keys % {:sizex :sizeX, :sizey :sizeY})})
  mi/IObjectPermissions
  (merge mi/IObjectPermissionsDefaults
         {:perms-objects-set perms-objects-set
          :can-read?         (partial mi/current-user-has-full-permissions? :read)
          :can-write?        (partial mi/current-user-has-full-permissions? :write)})

  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [(serdes.hash/hydrated-hash :card)
                                      (comp serdes.hash/identity-hash
                                            #(db/select-one 'Dashboard :id %)
                                            :dashboard_id)
                                      :visualization_settings])})


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
    (mdb.u/join [Card :id] [DashboardCardSeries :card_id])
    (db/qualify DashboardCardSeries :dashboardcard_id) id
    {:order-by [[(db/qualify DashboardCardSeries :position) :asc]]}))


;;; ---------------------------------------------------- CRUD FNS ----------------------------------------------------

(s/defn retrieve-dashboard-card
  "Fetch a single DashboardCard by its ID value."
  [id :- su/IntGreaterThanZero]
  (-> (DashboardCard id)
      (hydrate :series)))

(defn dashcard->multi-cards
  "Return the cards which are other cards with respect to this dashboard card
  in multiple series display for dashboard

  Dashboard (and dashboard only) has this thing where you're displaying multiple cards entirely.

  This is actually completely different from the combo display,
  which is a visualization type in visualization option.

  This is also actually completely different from having multiple series display
  from the visualization with same type (line bar or whatever),
  which is a separate option in line area or bar visualization"
  [dashcard]
  (db/query {:select [:newcard.*]
             :from [[:report_dashboardcard :dashcard]]
             :left-join [[:dashboardcard_series :dashcardseries]
                         [:= :dashcard.id :dashcardseries.dashboardcard_id]
                         [:report_card :newcard]
                         [:= :dashcardseries.card_id :newcard.id]]
             :where [:and
                     [:= :newcard.archived false]
                     [:= :dashcard.id (:id dashcard)]]}))

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
  [{:keys [id parameter_mappings visualization_settings] :as dashboard-card} :- DashboardCardUpdates]
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
       (update-dashboard-card-series! dashboard-card series)))
    (retrieve-dashboard-card id)))

(def ParamMapping
  "Schema for a parameter mapping as it would appear in the DashboardCard `:parameter_mappings` column."
  {:parameter_id su/NonBlankString
   ;; TODO -- validate `:target` as well... breaks a few tests tho so those will have to be fixed
   #_:target       #_s/Any
   s/Keyword     s/Any})

(def ^:private NewDashboardCard
  {:dashboard_id                            su/IntGreaterThanZero
   (s/optional-key :card_id)                (s/maybe su/IntGreaterThanZero)
   ;; TODO - use ParamMapping. Breaks too many tests right now tho
   (s/optional-key :parameter_mappings)     (s/maybe [#_ParamMapping su/Map])
   (s/optional-key :visualization_settings) (s/maybe su/Map)
   ;; TODO - make the rest of the options explicit instead of just allowing whatever for other keys
   s/Keyword                                s/Any})

(s/defn create-dashboard-card!
  "Create a new DashboardCard by inserting it into the database along with all associated pieces of data such as
   DashboardCardSeries. Returns the newly created DashboardCard or throws an Exception."
  [dashboard-card :- NewDashboardCard]
  (let [{:keys [dashboard_id card_id parameter_mappings visualization_settings sizeX sizeY row col series]
         :or   {sizeX 2, sizeY 2, series []}} dashboard-card]
    (db/transaction
     (let [dashboard-card (db/insert! DashboardCard
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
       ;; return the full DashboardCard
       (retrieve-dashboard-card (:id dashboard-card))))))

(defn delete-dashboard-card!
  "Delete a DashboardCard."
  [dashboard-card user-id]
  {:pre [(map? dashboard-card)
         (integer? user-id)]}
  (let [{:keys [id]} (dashboard dashboard-card)]
    (db/transaction
      (db/delete! PulseCard :dashboard_card_id (:id dashboard-card))
      (db/delete! DashboardCard :id (:id dashboard-card)))
    (events/publish-event! :dashboard-remove-cards {:id id :actor_id user-id :dashcards [dashboard-card]})))

;;; ----------------------------------------------- SERIALIZATION ----------------------------------------------------
(defmethod serdes.base/extract-query "DashboardCard" [_ {:keys [user]}]
  ;; TODO This join over the subset of collections this user can see is shared by a few things - factor it out?
  (serdes.base/raw-reducible-query
    "DashboardCard"
    {:select     [:dc.*]
     :from       [[:report_dashboardcard :dc]]
     :left-join  [[:report_dashboard :dash] [:= :dash.id :dc.dashboard_id]
                  [:collection :coll]       [:= :coll.id :dash.collection_id]]
     :where      (if user
                   [:or [:= :coll.personal_owner_id user] [:is :coll.personal_owner_id nil]]
                   [:is :coll.personal_owner_id nil])}))

(defmethod serdes.base/serdes-dependencies "DashboardCard" [{:keys [card_id dashboard_id]}]
  [[{:model "Dashboard" :id dashboard_id}]
   [{:model "Card"      :id card_id}]])

(defmethod serdes.base/serdes-generate-path "DashboardCard" [_ dashcard]
  [(serdes.base/infer-self-path "Dashboard" (db/select-one 'Dashboard :id (:dashboard_id dashcard)))
   (serdes.base/infer-self-path "DashboardCard" dashcard)])

(defmethod serdes.base/extract-one "DashboardCard"
  [_model-name _opts dashcard]
  (-> (serdes.base/extract-one-basics "DashboardCard" dashcard)
      (update :card_id      serdes.util/export-fk 'Card)
      (update :dashboard_id serdes.util/export-fk 'Dashboard)))

(defmethod serdes.base/load-xform "DashboardCard"
  [dashcard]
  (-> (serdes.base/load-xform-basics dashcard)
      (update :card_id      serdes.util/import-fk 'Card)
      (update :dashboard_id serdes.util/import-fk 'Dashboard)))
