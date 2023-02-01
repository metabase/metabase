(ns metabase.models.dashboard-card
  (:require
   [clojure.set :as set]
   [metabase.db.query :as mdb.query]
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
   [metabase.util.date-2 :as u.date]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]
   [toucan.hydrate :refer [hydrate]]
   [toucan.models :as models]))

(models/defmodel DashboardCard :report_dashboardcard)

(doto DashboardCard
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

(declare series)

;;; Return the set of permissions required to `read-or-write` this DashboardCard. If `:card` and `:series` are already
;;; hydrated this method doesn't need to make any DB calls.
(defmethod mi/perms-objects-set DashboardCard
  [dashcard read-or-write]
  (let [card   (or (:card dashcard)
                   (db/select-one [Card :dataset_query] :id (u/the-id (:card_id dashcard))))
        series (or (:series dashcard)
                   (series dashcard))]
    (apply set/union (mi/perms-objects-set card read-or-write) (for [series-card series]
                                                                 (mi/perms-objects-set series-card read-or-write)))))

(defn- pre-insert [dashcard]
  (let [defaults {:parameter_mappings     []
                  :visualization_settings {}}]
    (merge defaults dashcard)))

(mi/define-methods
 DashboardCard
 {:properties (constantly {::mi/timestamped? true
                           ::mi/entity-id    true})
  :types      (constantly {:parameter_mappings     :parameters-list
                           :visualization_settings :visualization-settings})
  :pre-insert pre-insert})

(defmethod serdes.hash/identity-hash-fields DashboardCard
  [_dashboard-card]
  [(serdes.hash/hydrated-hash :card "<none>") ; :card is optional, eg. text cards
   (comp serdes.hash/identity-hash
         #(db/select-one 'Dashboard :id %)
         :dashboard_id)
   :visualization_settings
   :row :col
   :created_at])


;;; --------------------------------------------------- HYDRATION ----------------------------------------------------

(defn dashboard
  "Return the Dashboard associated with the DashboardCard."
  [{:keys [dashboard_id]}]
  {:pre [(integer? dashboard_id)]}
  (db/select-one 'Dashboard, :id dashboard_id))

(mi/define-simple-hydration-method series
  :series
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
  (-> (db/select-one DashboardCard :id id)
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
  (mdb.query/query {:select    [:newcard.*]
                    :from      [[:report_dashboardcard :dashcard]]
                    :left-join [[:dashboardcard_series :dashcardseries]
                                [:= :dashcard.id :dashcardseries.dashboardcard_id]
                                [:report_card :newcard]
                                [:= :dashcardseries.card_id :newcard.id]]
                    :where     [:and
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
   (s/optional-key :action_id)              (s/maybe su/IntGreaterThanZero)
   (s/optional-key :parameter_mappings)     (s/maybe [su/Map])
   (s/optional-key :visualization_settings) (s/maybe su/Map)
   ;; series is a sequence of IDs of additional cards after the first to include as "additional serieses"
   (s/optional-key :series)                 (s/maybe [su/IntGreaterThanZero])
   s/Keyword                                s/Any})

(s/defn update-dashboard-card!
  "Update an existing DashboardCard including all DashboardCardSeries.
   Returns the updated DashboardCard or throws an Exception."
  [{:keys [id card_id action_id parameter_mappings visualization_settings] :as dashboard-card} :- DashboardCardUpdates]
  (let [{:keys [size_x size_y row col series]} (merge {:series []} dashboard-card)]
    (db/transaction
     ;; update the dashcard itself (positional attributes)
     (when (and size_x size_y row col)
       (db/update-non-nil-keys! DashboardCard id
                                (cond->
                                  {:action_id              action_id
                                   :size_x                 size_x
                                   :size_y                 size_y
                                   :row                    row
                                   :col                    col
                                   :parameter_mappings     parameter_mappings
                                   :visualization_settings visualization_settings}
                                  ;; Allow changing card for actions
                                  ;; This is to preserve the existing behavior of questions and card_id
                                  ;; I don't know why card_id couldn't be changed for questions though.
                                  action_id (assoc :card_id card_id))))
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
   (s/optional-key :action_id)              (s/maybe su/IntGreaterThanZero)
   ;; TODO - use ParamMapping. Breaks too many tests right now tho
   (s/optional-key :parameter_mappings)     (s/maybe [#_ParamMapping su/Map])
   (s/optional-key :visualization_settings) (s/maybe su/Map)
   ;; TODO - make the rest of the options explicit instead of just allowing whatever for other keys
   s/Keyword                                s/Any})

(s/defn create-dashboard-card!
  "Create a new DashboardCard by inserting it into the database along with all associated pieces of data such as
   DashboardCardSeries. Returns the newly created DashboardCard or throws an Exception."
  [dashboard-card :- NewDashboardCard]
  (let [{:keys [dashboard_id card_id action_id parameter_mappings visualization_settings size_x size_y row col series]
         :or   {series []}} dashboard-card]
    (db/transaction
     (let [dashboard-card (db/insert! DashboardCard
                                      :dashboard_id           dashboard_id
                                      :card_id                card_id
                                      :action_id              action_id
                                      :size_x                 size_x
                                      :size_y                 size_y
                                      :row                    row
                                      :col                    col
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
;; DashboardCards are not serialized as their own, separate entities. They are inlined onto their parent Dashboards.
;; However, we can reuse some of the serdes machinery (especially load-one!) by implementing a few serdes methods.
(defmethod serdes.base/serdes-generate-path "DashboardCard" [_ dashcard]
  [(serdes.base/infer-self-path "Dashboard" (db/select-one 'Dashboard :id (:dashboard_id dashcard)))
   (serdes.base/infer-self-path "DashboardCard" dashcard)])

(defmethod serdes.base/load-xform "DashboardCard"
  [dashcard]
  (-> dashcard
      (dissoc :serdes/meta)
      (update :card_id                serdes.util/import-fk 'Card)
      (update :action_id              serdes.util/import-fk 'Action)
      (update :dashboard_id           serdes.util/import-fk 'Dashboard)
      (update :created_at             #(if (string? %) (u.date/parse %) %))
      (update :parameter_mappings     serdes.util/import-parameter-mappings)
      (update :visualization_settings serdes.util/import-visualization-settings)))
