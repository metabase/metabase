(ns metabase.events.view-log-test
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.events.view-log :refer :all]
            (metabase.models [user :refer [User]]
                             [view-log :refer [ViewLog]])
            [metabase.test.data :refer :all]
            [metabase.test.util :refer [expect-eval-actual-first random-name]]
            [metabase.test-setup :refer :all]))


(defn- create-test-user []
  (let [rand-name (random-name)]
    (db/ins User
      :email      (str rand-name "@metabase.com")
      :first_name rand-name
      :last_name  rand-name
      :password   rand-name)))


;; `:card-create` event
(expect-let [{user-id :id} (create-test-user)
             card          {:id 1234
                            :creator_id user-id}]
  {:user_id     user-id
   :model       "card"
   :model_id    (:id card)}
  (do
    (process-view-count-event {:topic :card-create
                               :item  card})
    (-> (db/sel :one ViewLog :user_id user-id)
        (select-keys [:user_id :model :model_id]))))

;; `:card-read` event
(expect-let [{user-id :id} (create-test-user)
             card          {:id 1234
                            :actor_id user-id}]
  {:user_id     user-id
   :model       "card"
   :model_id    (:id card)}
  (do
    (process-view-count-event {:topic :card-read
                               :item  card})
    (-> (db/sel :one ViewLog :user_id user-id)
        (select-keys [:user_id :model :model_id]))))

;; `:dashboard-read` event
(expect-let [{user-id :id} (create-test-user)
             dashboard     {:id 1234
                            :actor_id user-id}]
  {:user_id     user-id
   :model       "dashboard"
   :model_id    (:id dashboard)}
  (do
    (process-view-count-event {:topic :dashboard-read
                               :item  dashboard})
    (-> (db/sel :one ViewLog :user_id user-id)
        (select-keys [:user_id :model :model_id]))))
