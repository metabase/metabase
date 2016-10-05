(ns metabase.models.dashboard
  (:require [clojure.data :refer [diff]]
            (metabase [db :as db]
                      [events :as events])
            (metabase.models [card :as card]
                             [dashboard-card :refer [DashboardCard], :as dashboard-card]
                             [hydrate :refer [hydrate]]
                             [interface :as i]
                             [permissions :as perms]
                             [revision :as revision])
            [metabase.models.revision.diff :refer [build-sentence]]
            [metabase.util :as u]))


;;; ---------------------------------------- Perms Checking ----------------------------------------

(defn- dashcards->cards [dashcards]
  (when (seq dashcards)
    (for [dashcard dashcards
          card     (cons (:card dashcard) (:series dashcard))]
      card)))

(defn- can-read? [dashboard]
  ;; if Dashboard is already hydrated no need to do it a second time
  (let [cards (or (dashcards->cards (:ordered_cards dashboard))
                  (dashcards->cards (-> (db/select [DashboardCard :id :card_id], :dashboard_id (u/get-id dashboard))
                                        (hydrate :card :series))))]
    (or (empty? cards)
        (some i/can-read? cards))))


;;; ---------------------------------------- Entity & Lifecycle ----------------------------------------

(defn- pre-cascade-delete [dashboard]
  (db/cascade-delete! 'Revision :model "Dashboard" :model_id (u/get-id dashboard))
  (db/cascade-delete! DashboardCard :dashboard_id (u/get-id dashboard)))

(defn- pre-insert [dashboard]
  (let [defaults {:parameters   []}]
    (merge defaults dashboard)))


(i/defentity Dashboard :report_dashboard)

(u/strict-extend (class Dashboard)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped?       (constantly true)
          :types              (constantly {:description :clob, :parameters :json})
          :can-read?          can-read?
          :can-write?         can-read?
          :pre-cascade-delete pre-cascade-delete
          :pre-insert         pre-insert}))


;;; ---------------------------------------- Hydration ----------------------------------------

(defn ordered-cards
  "Return the `DashboardCards` associated with DASHBOARD, in the order they were created."
  {:hydrate :ordered_cards}
  [dashboard]
  (db/select DashboardCard, :dashboard_id (u/get-id dashboard), {:order-by [[:created_at :asc]]}))


;;; ## ---------------------------------------- PERSISTENCE FUNCTIONS ----------------------------------------

(defn create-dashboard!
  "Create a `Dashboard`"
  [{:keys [name description parameters], :as dashboard} user-id]
  {:pre [(map? dashboard)
         (u/maybe? u/sequence-of-maps? parameters)
         (integer? user-id)]}
  (->> (db/insert! Dashboard
         :name        name
         :description description
         :parameters  (or parameters [])
         :creator_id  user-id)
       (events/publish-event :dashboard-create)))

(defn update-dashboard!
  "Update a `Dashboard`"
  [{:keys [id name description parameters caveats points_of_interest show_in_getting_started], :as dashboard} user-id]
  {:pre [(map? dashboard)
         (integer? id)
         (u/maybe? u/sequence-of-maps? parameters)
         (integer? user-id)]}
  (db/update-non-nil-keys! Dashboard id
    :description             description
    :name                    name
    :parameters              parameters
    :caveats                 caveats
    :points_of_interest      points_of_interest
    :show_in_getting_started show_in_getting_started)
  (u/prog1 (Dashboard id)
    (events/publish-event :dashboard-update (assoc <> :actor_id user-id))))


;;; ## ---------------------------------------- REVISIONS ----------------------------------------

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
