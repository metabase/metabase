(ns metabase.events.revision-test
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.events.revision :refer :all]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [revision :refer [Revision revisions]]
                             [revision-test :refer [with-fake-card]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [expect-eval-actual-first with-temp random-name]]
            [metabase.test-setup :refer :all]))

(defn- create-test-card []
  (let [rand-name (random-name)]
    (db/ins Card
      :name                   rand-name
      :description            rand-name
      :public_perms           2
      :display                "table"
      :dataset_query          {}
      :visualization_settings {}
      :creator_id             (user->id :crowberto))))

(defn- create-test-dashboard []
  (let [rand-name (random-name)]
    (db/ins Dashboard
      :name                   rand-name
      :description            rand-name
      :public_perms           2
      :creator_id             (user->id :crowberto))))

;; :card-create
(expect-let [{card-id :id :as card} (create-test-card)]
  {:model        "Card"
   :model_id     card-id
   :user_id      (user->id :crowberto)
   :is_reversion false
   :is_creation  true}
  (do
    (process-revision-event {:topic :card-create
                             :item  card})
    (-> (db/sel :one Revision :model "Card" :model_id card-id)
        (select-keys [:model :model_id :user_id :is_reversion :is_creation]))))

;; :card-update
(expect-let [{card-id :id :as card} (create-test-card)]
  {:model        "Card"
   :model_id     card-id
   :user_id      (user->id :crowberto)
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :card-update
                             :item  card})
    (-> (db/sel :one Revision :model "Card" :model_id card-id)
        (select-keys [:model :model_id :user_id :is_reversion :is_creation]))))

;; :dashboard-create
(expect-let [{dashboard-id :id :as dashboard} (create-test-dashboard)]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :crowberto)
   :is_reversion false
   :is_creation  true}
  (do
    (process-revision-event {:topic :dashboard-create
                             :item  dashboard})
    (-> (db/sel :one Revision :model "Dashboard" :model_id dashboard-id)
        (select-keys [:model :model_id :user_id :is_reversion :is_creation]))))

;; :dashboard-update
(expect-let [{dashboard-id :id :as dashboard} (create-test-dashboard)]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :crowberto)
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :dashboard-update
                             :item  dashboard})
    (-> (db/sel :one Revision :model "Dashboard" :model_id dashboard-id)
        (select-keys [:model :model_id :user_id :is_reversion :is_creation]))))

;; :dashboard-add-cards
(expect-let [{dashboard-id :id} (create-test-dashboard)
             {card-id :id}      (create-test-card)
             dashcard           (db/ins DashboardCard :card_id card-id :dashboard_id dashboard-id)]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :crowberto)
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :dashboard-add-cards
                             :item  {:id       dashboard-id
                                     :actor_id (user->id :crowberto)
                                     :dashcards [dashcard]}})
    (-> (db/sel :one Revision :model "Dashboard" :model_id dashboard-id)
        (select-keys [:model :model_id :user_id :is_reversion :is_creation]))))

;; :dashboard-remove-cards
(expect-let [{dashboard-id :id} (create-test-dashboard)
             {card-id :id}      (create-test-card)
             dashcard           (db/ins DashboardCard :card_id card-id :dashboard_id dashboard-id)
             _                  (db/del DashboardCard :id (:id dashcard))]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :crowberto)
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :dashboard-remove-cards
                             :item  {:id       dashboard-id
                                     :actor_id (user->id :crowberto)
                                     :dashcards [dashcard]}})
    (-> (db/sel :one Revision :model "Dashboard" :model_id dashboard-id)
        (select-keys [:model :model_id :user_id :is_reversion :is_creation]))))

;; :dashboard-reposition-cards
(expect-let [{dashboard-id :id} (create-test-dashboard)
             {card-id :id}      (create-test-card)
             dashcard           (db/ins DashboardCard :card_id card-id :dashboard_id dashboard-id)]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :crowberto)
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :dashboard-reeposition-cards
                             :item  {:id       dashboard-id
                                     :actor_id (user->id :crowberto)
                                     :dashcards [(assoc dashcard :sizeX 4)]}})
    (-> (db/sel :one Revision :model "Dashboard" :model_id dashboard-id)
        (select-keys [:model :model_id :user_id :is_reversion :is_creation]))))
