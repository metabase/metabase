(ns metabase.models.dashboard
  (:require [clojure
             [data :refer [diff]]
             [set :as set]]
            [clojure.tools.logging :as log]
            [metabase
             [events :as events]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.api.card :as card.api]
            [metabase.models
             [card :as card :refer [Card]]
             [dashboard-card :as dashboard-card :refer [DashboardCard]]
             [field-values :as field-values]
             [interface :as i]
             [params :as params]
             [revision :as revision]]
            [metabase.models.revision.diff :refer [build-sentence]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]
             [models :as models]]))

;;; ------------------------------------------------- Perms Checking -------------------------------------------------

(defn- dashcards->cards [dashcards]
  (when (seq dashcards)
    (for [dashcard dashcards
          :when    (:card dashcard) ; skip over ones that are cardless, e.g. text-only DashCards
          card     (cons (:card dashcard) (:series dashcard))]
      card)))

(defn- can-read? [{public-uuid :public_uuid, :as dashboard}]
  (or
   ;; if the Dashboard is shared publicly then there is simply no need to check permissions for it because people
   ;; can see it already!!!
   (and (public-settings/enable-public-sharing)
        (some? public-uuid))
   ;; if Dashboard is already hydrated no need to do it a second time
   (let [cards (or (dashcards->cards (:ordered_cards dashboard))
                   (dashcards->cards (-> (db/select [DashboardCard :id :card_id]
                                           :dashboard_id (u/get-id dashboard)
                                           :card_id      [:not= nil]) ; skip text-only Cards
                                         (hydrate [:card :in_public_dashboard] :series))))]
     (or (empty? cards)
         (some i/can-read? cards)))))


;;; --------------------------------------------------- Hydration ----------------------------------------------------

(defn ordered-cards
  "Return the `DashboardCards` associated with DASHBOARD, in the order they were created."
  {:hydrate :ordered_cards}
  [dashboard-or-id]
  (db/do-post-select DashboardCard
    (db/query {:select    [:dashcard.*]
               :from      [[DashboardCard :dashcard]]
               :left-join [[Card :card] [:= :dashcard.card_id :card.id]]
               :where     [:and
                           [:= :dashcard.dashboard_id (u/get-id dashboard-or-id)]
                           [:or
                            [:= :card.archived false]
                            [:= :card.archived nil]]] ; e.g. DashCards with no corresponding Card, e.g. text Cards
               :order-by  [[:dashcard.created_at :asc]]})))


;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel Dashboard :report_dashboard)


(defn- pre-delete [dashboard]
  (db/delete! 'Revision :model "Dashboard" :model_id (u/get-id dashboard))
  (db/delete! DashboardCard :dashboard_id (u/get-id dashboard)))

(defn- pre-insert [dashboard]
  (let [defaults {:parameters []}]
    (merge defaults dashboard)))


(u/strict-extend (class Dashboard)
  models/IModel
  (merge models/IModelDefaults
         {:properties  (constantly {:timestamped? true})
          :types       (constantly {:description :clob, :parameters :json, :embedding_params :json})
          :pre-delete  pre-delete
          :pre-insert  pre-insert
          :post-select public-settings/remove-public-uuid-if-public-sharing-is-disabled})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?  can-read?
          :can-write? can-read?}))


;;; --------------------------------------------------- Revisions ----------------------------------------------------

(defn serialize-dashboard
  "Serialize a `Dashboard` for use in a `Revision`."
  [dashboard]
  (-> dashboard
      (select-keys [:description :name])
      (assoc :cards (vec (for [dashboard-card (ordered-cards dashboard)]
                           (-> (select-keys dashboard-card [:sizeX :sizeY :row :col :id :card_id])
                               (assoc :series (mapv :id (dashboard-card/series dashboard-card)))))))))

(defn- revert-dashboard!
  "Revert a `Dashboard` to the state defined by SERIALIZED-DASHBOARD."
  [dashboard-id user-id serialized-dashboard]
  ;; Update the dashboard description / name / permissions
  (db/update! Dashboard dashboard-id, (dissoc serialized-dashboard :cards))
  ;; Now update the cards as needed
  (let [serialized-cards    (:cards serialized-dashboard)
        id->serialized-card (zipmap (map :id serialized-cards) serialized-cards)
        current-cards       (db/select [DashboardCard :sizeX :sizeY :row :col :id :card_id], :dashboard_id dashboard-id)
        id->current-card    (zipmap (map :id current-cards) current-cards)
        all-dashcard-ids    (concat (map :id serialized-cards)
                                    (map :id current-cards))]
    (doseq [dashcard-id all-dashcard-ids]
      (let [serialized-card (id->serialized-card dashcard-id)
            current-card    (id->current-card dashcard-id)]
        (cond
          ;; If card is in current-cards but not serialized-cards then we need to delete it
          (not serialized-card) (dashboard-card/delete-dashboard-card! current-card user-id)

          ;; If card is in serialized-cards but not current-cards we need to add it
          (not current-card) (dashboard-card/create-dashboard-card! (assoc serialized-card
                                                                      :dashboard_id dashboard-id
                                                                      :creator_id   user-id))

          ;; If card is in both we need to change :sizeX, :sizeY, :row, and :col to match serialized-card as needed
          :else (dashboard-card/update-dashboard-card! serialized-card)))))

  serialized-dashboard)

(defn diff-dashboards-str
  "Describe the difference between 2 `Dashboard` instances."
  [dashboard₁ dashboard₂]
  (when dashboard₁
    (let [[removals changes]  (diff dashboard₁ dashboard₂)
          check-series-change (fn [idx card-changes]
                                (when (and (:series card-changes)
                                           (get-in dashboard₁ [:cards idx :card_id]))
                                  (let [num-series₁ (count (get-in dashboard₁ [:cards idx :series]))
                                        num-series₂ (count (get-in dashboard₂ [:cards idx :series]))]
                                    (cond
                                      (< num-series₁ num-series₂) (format "added some series to card %d" (get-in dashboard₁ [:cards idx :card_id]))
                                      (> num-series₁ num-series₂) (format "removed some series from card %d" (get-in dashboard₁ [:cards idx :card_id]))
                                      :else                       (format "modified the series on card %d" (get-in dashboard₁ [:cards idx :card_id]))))))]
      (-> [(when (:name changes)
             (format "renamed it from \"%s\" to \"%s\"" (:name dashboard₁) (:name dashboard₂)))
           (when (:description changes)
             (cond
               (nil? (:description dashboard₁)) "added a description"
               (nil? (:description dashboard₂)) "removed the description"
               :else (format "changed the description from \"%s\" to \"%s\"" (:description dashboard₁) (:description dashboard₂))))
           (when (or (:cards changes) (:cards removals))
             (let [num-cards₁  (count (:cards dashboard₁))
                   num-cards₂  (count (:cards dashboard₂))]
               (cond
                 (< num-cards₁ num-cards₂) "added a card"
                 (> num-cards₁ num-cards₂) "removed a card"
                 :else                     "rearranged the cards")))]
          (concat (map-indexed check-series-change (:cards changes)))
          (->> (filter identity)
               build-sentence)))))

(u/strict-extend (class Dashboard)
  revision/IRevisioned
  (merge revision/IRevisionedDefaults
         {:serialize-instance  (fn [_ _ dashboard] (serialize-dashboard dashboard))
          :revert-to-revision! (u/drop-first-arg revert-dashboard!)
          :diff-str            (u/drop-first-arg diff-dashboards-str)}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 OTHER CRUD FNS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- dashboard-id->param-field-ids
  "Get the set of Field IDs referenced by the parameters in this Dashboard."
  [dashboard-or-id]
  (let [dash (Dashboard (u/get-id dashboard-or-id))]
    (params/dashboard->param-field-ids (hydrate dash [:ordered_cards :card]))))


(defn- update-field-values-for-on-demand-dbs!
  "If the parameters have changed since last time this dashboard was saved, we need to update the FieldValues
   for any Fields that belong to an 'On-Demand' synced DB."
  [dashboard-or-id old-param-field-ids new-param-field-ids]
  (when (and (seq new-param-field-ids)
             (not= old-param-field-ids new-param-field-ids))
    (let [newly-added-param-field-ids (set/difference new-param-field-ids old-param-field-ids)]
      (log/info "Referenced Fields in Dashboard params have changed: Was:" old-param-field-ids
                "Is Now:" new-param-field-ids
                "Newly Added:" newly-added-param-field-ids)
      (field-values/update-field-values-for-on-demand-dbs! newly-added-param-field-ids))))


(defn add-dashcard!
  "Add a Card to a Dashboard.
   This function is provided for convenience and also makes sure various cleanup steps are performed when finished,
   for example updating FieldValues for On-Demand DBs.
   Returns newly created DashboardCard."
  {:style/indent 2}
  [dashboard-or-id card-or-id-or-nil & [dashcard-options]]
  (let [old-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)
        dashboard-card      (-> (assoc dashcard-options
                                  :dashboard_id (u/get-id dashboard-or-id)
                                  :card_id      (when card-or-id-or-nil (u/get-id card-or-id-or-nil)))
                                ;; if :series info gets passed in make sure we pass it along as a sequence of IDs
                                (update :series #(filter identity (map u/get-id %))))]
    (u/prog1 (dashboard-card/create-dashboard-card! dashboard-card)
      (let [new-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)]
        (update-field-values-for-on-demand-dbs! dashboard-or-id old-param-field-ids new-param-field-ids)))))

(defn update-dashcards!
  "Update the DASHCARDS belonging to DASHBOARD-OR-ID.
   This function is provided as a convenience instead of doing this yourself; it also makes sure various cleanup steps
   are performed when finished, for example updating FieldValues for On-Demand DBs.
   Returns `nil`."
  {:style/indent 1}
  [dashboard-or-id dashcards]
  (let [old-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)
        dashcard-ids        (db/select-ids DashboardCard, :dashboard_id (u/get-id dashboard-or-id))]
    (doseq [{dashcard-id :id, :as dashboard-card} dashcards]
      ;; ensure the dashcard we are updating is part of the given dashboard
      (when (contains? dashcard-ids dashcard-id)
        (dashboard-card/update-dashboard-card! (update dashboard-card :series #(filter identity (map :id %))))))
    (let [new-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)]
      (update-field-values-for-on-demand-dbs! dashboard-or-id old-param-field-ids new-param-field-ids))))

(defn- save-card!
  [card]
  (when (:dataset_query card)
    (db/insert! 'Card
      (-> card
          (update :result_metadata #(or % (-> card
                                              :dataset_query
                                              card.api/result-metadata-for-query)))
          (dissoc :id)))))

(defn save-transient-dashboard!
  "Save a denormalized description of dashboard."
  [dashboard]
  (let [dashcards (:ordered_cards dashboard)
        dashboard (db/insert! Dashboard
                    (dissoc dashboard :ordered_cards :rule :related))]
    (doseq [dashcard dashcards]
      (let [card     (some->> dashcard :card save-card!)
            series   (some->> dashcard :series (map save-card!))
            dashcard (-> dashcard
                         (dissoc :card :id :card_id)
                         (update :parameter_mappings
                                 (partial map #(assoc % :card_id (:id card))))
                         (assoc :series series))]
        (doseq [card (concat series (some-> card vector))]
          (events/publish-event! :card-create card)
          (hydrate card :creator :dashboard_count :labels :can_write :collection))
        (add-dashcard! dashboard card dashcard)))
    dashboard))
