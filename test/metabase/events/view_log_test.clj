(ns metabase.events.view-log-test
  (:require [metabase.events.view-log :refer :all]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [user :refer [User]]
             [view-log :refer [ViewLog]]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; `:card-create` event
(tt/expect-with-temp [User [user]
                      Card [card {:creator_id (:id user)}]]
  {:user_id  (:id user)
   :model    "card"
   :model_id (:id card)}
  (do
    (process-view-count-event {:topic :card-create
                               :item  card})
    (db/select-one [ViewLog :user_id :model :model_id], :user_id (:id user))))

;; `:card-read` event
(tt/expect-with-temp [User [user]
                      Card [card {:creator_id (:id user)}]]
  {:user_id     (:id user)
   :model       "card"
   :model_id    (:id card)}
  (do
    (process-view-count-event {:topic :card-read
                               :item  card})
    (db/select-one [ViewLog :user_id :model :model_id], :user_id (:id user))))

;; `:dashboard-read` event
(tt/expect-with-temp [User      [user]
                      Dashboard [dashboard {:creator_id (:id user)}]]
  {:user_id     (:id user)
   :model       "dashboard"
   :model_id    (:id dashboard)}
  (do
    (process-view-count-event {:topic :dashboard-read
                               :item  dashboard})
    (db/select-one [ViewLog :user_id :model :model_id], :user_id (:id user))))
