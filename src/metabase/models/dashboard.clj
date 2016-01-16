(ns metabase.models.dashboard
  (:require [clojure.data :refer [diff]]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [dashboard-card :refer [DashboardCard]]
                             [interface :as i]
                             [revision :as revision]
                             [user :refer [User]])
            [metabase.models.revision.diff :refer [build-sentence]]
            [metabase.util :as u]))

(i/defentity Dashboard :report_dashboard)

(defn ordered-cards
  "Return the `DashboardCards` associated with DASHBOARD, in the order they were created."
  {:hydrate :ordered_cards, :arglists '([dashboard])}
  [{:keys [id]}]
  (sel :many DashboardCard, :dashboard_id id, (k/order :created_at :asc)))

(defn- pre-cascade-delete [{:keys [id]}]
  (cascade-delete 'Revision :model "Dashboard" :model_id id)
  (cascade-delete DashboardCard :dashboard_id id))


(extend (class Dashboard)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped?       (constantly true)
          :can-read?          i/publicly-readable?
          :can-write?         i/publicly-writeable?
          :pre-cascade-delete pre-cascade-delete}))


;;; ## ---------------------------------------- REVISIONS ----------------------------------------


(defn- serialize-instance [_ id dashboard]
  (-> dashboard
      (select-keys [:description :name :public_perms])
      (assoc :cards (for [card (ordered-cards dashboard)]
                      (select-keys card [:sizeX :sizeY :row :col :id :card_id])))))

(defn- revert-to-revision [_ dashboard-id serialized-dashboard]
  ;; Update the dashboard description / name / permissions
  (m/mapply upd Dashboard dashboard-id (dissoc serialized-dashboard :cards))
  ;; Now update the cards as needed
  (let [serialized-cards    (:cards serialized-dashboard)
        id->serialized-card (zipmap (map :id serialized-cards) serialized-cards)
        current-cards       (sel :many :fields [DashboardCard :sizeX :sizeY :row :col :id :card_id], :dashboard_id dashboard-id)
        id->current-card    (zipmap (map :id current-cards) current-cards)
        all-dashcard-ids    (concat (map :id serialized-cards)
                                    (map :id current-cards))]
    (doseq [dashcard-id all-dashcard-ids]
      (let [serialized-card (id->serialized-card dashcard-id)
            current-card    (id->current-card dashcard-id)]
        (cond
          ;; If card is in current-cards but not serialized-cards then we need to delete it
          (not serialized-card) (del DashboardCard :id dashcard-id)

          ;; If card is in serialized-cards but not current-cards we need to add it
          (not current-card) (m/mapply ins DashboardCard :dashboard_id dashboard-id, serialized-card)

          ;; If card is in both we need to change :sizeX, :sizeY, :row, and :col to match serialized-card as needed
          :else (let [[_ changes] (diff current-card serialized-card)]
                  (m/mapply upd DashboardCard dashcard-id changes))))))

  serialized-dashboard)

(defn- describe-diff [_ dashboard₁ dashboard₂]
  (when dashboard₁
    (let [[removals changes] (diff dashboard₁ dashboard₂)]
      (->> [(when (:name changes)
              (format "renamed it from \"%s\" to \"%s\"" (:name dashboard₁) (:name dashboard₂)))
            (when (:description changes)
              (format "changed the description from \"%s\" to \"%s\"" (:description dashboard₁) (:description dashboard₂)))
            (when (:public_perms changes)
              (if (zero? (:public_perms dashboard₂))
                "made it private"
                "made it public")) ; TODO - are both 1 and 2 "public" now ?
            (when (or (:cards changes) (:cards removals))
              (let [num-cards₁ (count (:cards dashboard₁))
                    num-cards₂ (count (:cards dashboard₂))]
                (cond
                  (< num-cards₁ num-cards₂) "added a card"
                  (> num-cards₁ num-cards₂) "removed a card"
                  :else                     "rearranged the cards")))]
           (filter identity)
           build-sentence))))


(extend (class Dashboard)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped?       (constantly true)
          :types              (constantly {:description :clob})
          :can-read?          i/publicly-readable?
          :can-write?         i/publicly-writeable?
          :pre-cascade-delete pre-cascade-delete})

  revision/IRevisioned
  {:serialize-instance serialize-instance
   :revert-to-revision revert-to-revision
   :diff-map           revision/default-diff-map
   :diff-str           describe-diff
   :describe-diff      describe-diff})


(u/require-dox-in-this-namespace)
