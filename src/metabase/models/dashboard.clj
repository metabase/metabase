(ns metabase.models.dashboard
  (:require (clojure [data :refer [diff]]
                     [string :as s])
            [korma.core :refer :all, :exclude [defentity update]]
            [medley.core :as m]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [dashboard-card :refer [DashboardCard]]
                             [interface :refer :all]
                             [revision :refer [IRevisioned]]
                             [user :refer [User]])
            [metabase.models.revision.diff :refer [build-sentence]]
            [metabase.util :as u]))

(defrecord DashboardInstance []
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite DashboardInstance :read :public-perms, :write :public-perms)


(defentity Dashboard
  [(table :report_dashboard)
   timestamped]

  (post-select [_ {:keys [id creator_id description] :as dash}]
    (-> dash
        (assoc :creator       (delay (User creator_id))
               :description   (u/jdbc-clob->str description)
               :ordered_cards (delay (sel :many DashboardCard :dashboard_id id (order :created_at :asc))))
        map->DashboardInstance))

  (pre-cascade-delete [_ {:keys [id]}]
    (cascade-delete DashboardCard :dashboard_id id)))

(extend-ICanReadWrite DashboardEntity :read :public-perms, :write :public-perms)

(defn- serialize-instance [_ id {:keys [ordered_cards], :as dashboard}]
  (-> dashboard
      (select-keys [:description :name :public_perms])
      (assoc :cards (for [card @ordered_cards]
                      (select-keys card [:sizeX :sizeY :row :col :id :card_id])))))

(defn- revert-to-revision [_ dashboard-id serialized-dashboard]
  ;; Update the dashboard description / name / permissions

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
         build-sentence)))

(extend DashboardEntity
  IRevisioned
  {:serialize-instance serialize-instance
   :revert-to-revision revert-to-revision
   :describe-diff      describe-diff})
