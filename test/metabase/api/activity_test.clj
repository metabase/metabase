(ns metabase.api.activity-test
  "Tests for /api/activity endpoints."
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.http-client :refer :all]
            (metabase.models [activity :refer [Activity]]
                             [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [view-log :refer [ViewLog]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [match-$ expect-eval-actual-first random-name with-temp]]
            [metabase.util :as u]))

;; GET /

; Things we are testing for:
;  1. ordered by timestamp DESC
;  2. :user and :model_exists are hydrated

; NOTE: timestamp matching was being a real PITA so I cheated a bit.  ideally we'd fix that
(expect-let [_         (k/delete Activity)
             activity1 (db/ins Activity
                         :topic     "install"
                         :details   {}
                         :timestamp (u/->Timestamp "2015-09-09T12:13:14.888Z"))
             activity2 (db/ins Activity
                         :topic     "dashboard-create"
                         :user_id   (user->id :crowberto)
                         :model     "dashboard"
                         :model_id  1234
                         :details   {:description  "Because I can!"
                                     :name         "Bwahahaha"
                                     :public_perms 2}
                         :timestamp (u/->Timestamp "2015-09-10T18:53:01.632Z"))
             activity3 (db/ins Activity
                         :topic     "user-joined"
                         :user_id   (user->id :rasta)
                         :model     "user"
                         :details   {}
                         :timestamp (u/->Timestamp "2015-09-10T05:33:43.641Z"))]
  [(match-$ (db/sel :one Activity :id (:id activity2))
     {:id           $
      :topic        "dashboard-create"
      :user_id      $
      :user         (match-$ (fetch-user :crowberto)
                      {:id           (user->id :crowberto)
                       :email        $
                       :date_joined  $
                       :first_name   $
                       :last_name    $
                       :last_login   $
                       :is_superuser $
                       :common_name  $})
      :model        $
      :model_id     $
      :model_exists false
      :database_id  nil
      :database     nil
      :table_id     nil
      :table        nil
      :custom_id    nil
      :details      $})
   (match-$ (db/sel :one Activity :id (:id activity3))
     {:id           $
      :topic        "user-joined"
      :user_id      $
      :user         (match-$ (fetch-user :rasta)
                      {:id           (user->id :rasta)
                       :email        $
                       :date_joined  $
                       :first_name   $
                       :last_name    $
                       :last_login   $
                       :is_superuser $
                       :common_name  $})
      :model        $
      :model_id     $
      :model_exists nil
      :database_id  nil
      :database     nil
      :table_id     nil
      :table        nil
      :custom_id    nil
      :details      $})
   (match-$ (db/sel :one Activity :id (:id activity1))
     {:id           $
      :topic        "install"
      :user_id      nil
      :user         nil
      :model        $
      :model_id     $
      :model_exists nil
      :database_id  nil
      :database     nil
      :table_id     nil
      :table        nil
      :custom_id    nil
      :details      $})]
  (->> ((user->client :crowberto) :get 200 "activity")
       (map #(dissoc % :timestamp))))


;; GET /recent_views

; Things we are testing for:
;  1. ordering is sorted by most recent
;  2. results are filtered to current user
;  3. `:model_object` is hydrated in each result
;  4. we filter out entries where `:model_object` is nil (object doesn't exist)

(defn- create-card []
  (db/ins Card
    :name                   "rand-name"
    :creator_id             (user->id :crowberto)
    :public_perms           2
    :display                "table"
    :dataset_query          {}
    :visualization_settings {}))

(defn- create-dash []
  (db/ins Dashboard
    :name         "rand-name"
    :description  "rand-name"
    :creator_id   (user->id :crowberto)
    :public_perms 2))

(expect-let [card1 (create-card)
             dash1 (create-dash)
             card2 (create-card)]
  [{:cnt      1
    :user_id  (user->id :crowberto)
    :model    "card"
    :model_id (:id card1)
    :model_object {:id          (:id card1)
                   :name        (:name card1)
                   :description (:description card1)
                   :display     (name (:display card1))}}
   {:cnt      1
    :user_id  (user->id :crowberto)
    :model    "dashboard"
    :model_id (:id dash1)
    :model_object {:id          (:id dash1)
                   :name        (:name dash1)
                   :description (:description dash1)}}
   {:cnt      1
    :user_id  (user->id :crowberto)
    :model    "card"
    :model_id (:id card2)
    :model_object {:id          (:id card2)
                   :name        (:name card2)
                   :description (:description card2)
                   :display     (name (:display card2))}}]
  (let [create-view (fn [user model model-id]
                      (db/ins ViewLog
                        :user_id  user
                        :model    model
                        :model_id model-id
                        :timestamp (u/new-sql-timestamp))
                      ;; we sleep a bit to ensure no events have the same timestamp
                      ;; sadly, MySQL doesn't support milliseconds so we have to wait a second
                      ;; otherwise our records are out of order and this test fails :(
                      (Thread/sleep 1000))]
    (do
      (create-view (user->id :crowberto) "card" (:id card2))
      (create-view (user->id :crowberto) "dashboard" (:id dash1))
      (create-view (user->id :crowberto) "card" (:id card1))
      (create-view (user->id :crowberto) "card" 36478)
      (create-view (user->id :rasta) "card" (:id card1))
      (->> ((user->client :crowberto) :get 200 "activity/recent_views")
           (map #(dissoc % :max_ts))))))
