(ns metabase.events.activity-feed-test
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.events.activity-feed :refer :all]
            (metabase.models [activity :refer [Activity]]
                             [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [database :refer [Database]]
                             [session :refer [Session]]
                             [user :refer [User]])
            [metabase.test.data :refer :all]
            [metabase.test.util :refer [expect-eval-actual-first with-temp random-name]]
            [metabase.test-setup :refer :all]))

;; TODO - we can simplify the cleanup work we do by using the :in-context :expectations-options
;;        the only downside is that it then runs the annotated function on ALL tests :/


(defn- create-test-objects
  "Simple helper function which creates a series of test objects for use in the tests"
  []
  (let [rand-name (random-name)
        user      (db/ins User
                    :email      (str rand-name "@metabase.com")
                    :first_name rand-name
                    :last_name  rand-name
                    :password   rand-name)
        ;; i don't know why, but the below `ins` doesn't return an object :(
        session   (db/ins Session
                    :id      rand-name
                    :user_id (:id user))
        dashboard (db/ins Dashboard
                    :name         rand-name
                    :description  rand-name
                    :creator_id   (:id user)
                    :public_perms 2)
        card      (db/ins Card
                    :name                   rand-name
                    :creator_id             (:id user)
                    :public_perms           2
                    :display                "table"
                    :dataset_query          {:database (id)
                                             :type     :query
                                             :query    {:source_table (id :categories)}}
                    :visualization_settings {})
        dashcard  (db/ins DashboardCard
                    :card_id      (:id card)
                    :dashboard_id (:id dashboard))]
    {:card      card
     :dashboard dashboard
     :dashcard  dashcard
     :session   {:id rand-name}
     :user      user}))


;; `:card-create` event
(expect-let [{:keys [card dashboard dashcard user]} (create-test-objects)]
  {:topic       :card-create
   :user_id     (:id user)
   :model       "card"
   :model_id    (:id card)
   :database_id (id)
   :table_id    (id :categories)
   :details     {:description  (:description card)
                 :name         (:name card)
                 :public_perms (:public_perms card)}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :card-create
                             :item  card})
    (-> (db/sel :one Activity :topic "card-create")
        (select-keys [:topic :user_id :model :model_id :database_id :table_id :details]))))

;; `:card-update` event
(expect-let [{:keys [card dashboard dashcard user]} (create-test-objects)]
  {:topic       :card-update
   :user_id     (:id user)
   :model       "card"
   :model_id    (:id card)
   :database_id (id)
   :table_id    (id :categories)
   :details     {:description  (:description card)
                 :name         (:name card)
                 :public_perms (:public_perms card)}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :card-update
                             :item  card})
    (-> (db/sel :one Activity :topic "card-update")
        (select-keys [:topic :user_id :model :model_id :database_id :table_id :details]))))

;; `:card-delete` event
(expect-let [{:keys [card dashboard dashcard user]} (create-test-objects)]
  {:topic       :card-delete
   :user_id     (:id user)
   :model       "card"
   :model_id    (:id card)
   :database_id (id)
   :table_id    (id :categories)
   :details     {:description  (:description card)
                 :name         (:name card)
                 :public_perms (:public_perms card)}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :card-delete
                             :item  card})
    (-> (db/sel :one Activity :topic "card-delete")
        (select-keys [:topic :user_id :model :model_id :database_id :table_id :details]))))

;; `:dashboard-create` event
(expect-let [{:keys [card dashboard dashcard user]} (create-test-objects)]
  {:topic       :dashboard-create
   :user_id     (:id user)
   :model       "dashboard"
   :model_id    (:id dashboard)
   :details     {:description  (:description dashboard)
                 :name         (:name dashboard)
                 :public_perms (:public_perms dashboard)}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :dashboard-create
                             :item  dashboard})
    (-> (db/sel :one Activity :topic "dashboard-create")
        (select-keys [:topic :user_id :model :model_id :details]))))

;; `:dashboard-delete` event
(expect-let [{:keys [card dashboard dashcard user]} (create-test-objects)]
  {:topic       :dashboard-delete
   :user_id     (:id user)
   :model       "dashboard"
   :model_id    (:id dashboard)
   :details     {:description  (:description dashboard)
                 :name         (:name dashboard)
                 :public_perms (:public_perms dashboard)}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :dashboard-delete
                             :item  dashboard})
    (-> (db/sel :one Activity :topic "dashboard-delete")
        (select-keys [:topic :user_id :model :model_id :details]))))

;; `:dashboard-add-cards` event
(expect-let [{:keys [card dashboard dashcard user]} (create-test-objects)]
  {:topic       :dashboard-add-cards
   :user_id     (:id user)
   :model       "dashboard"
   :model_id    (:id dashboard)
   :details     {:description  (:description dashboard)
                 :name         (:name dashboard)
                 :public_perms (:public_perms dashboard)
                 :dashcards    [{:description  (:description card)
                                 :name         (:name card)
                                 :public_perms (:public_perms card)
                                 :id           (:id dashcard)
                                 :card_id      (:id card)}]}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :dashboard-add-cards
                             :item  {:id (:id dashboard) :actor_id (:id user) :dashcards [dashcard]}})
    (-> (db/sel :one Activity :topic "dashboard-add-cards")
        (select-keys [:topic :user_id :model :model_id :details]))))

;; `:dashboard-remove-cards` event
(expect-let [{:keys [card dashboard dashcard user]} (create-test-objects)]
  {:topic       :dashboard-remove-cards
   :user_id     (:id user)
   :model       "dashboard"
   :model_id    (:id dashboard)
   :details     {:description  (:description dashboard)
                 :name         (:name dashboard)
                 :public_perms (:public_perms dashboard)
                 :dashcards    [{:description  (:description card)
                                 :name         (:name card)
                                 :public_perms (:public_perms card)
                                 :id           (:id dashcard)
                                 :card_id      (:id card)}]}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :dashboard-remove-cards
                             :item  {:id (:id dashboard) :actor_id (:id user) :dashcards [dashcard]}})
    (-> (db/sel :one Activity :topic "dashboard-remove-cards")
        (select-keys [:topic :user_id :model :model_id :details]))))

;; `:database-sync-*` events
;(expect
;  [1
;   {:topic       :database-sync
;    :user_id     nil
;    :model       "database"
;    :model_id    (id)
;    :database_id (id)
;    :custom_id   "abc"
;    :details     {:status      "started"
;                  :name        (:name (db))
;                  :description (:description (db))
;                  :engine      (name (:engine (db)))}}
;   {:topic       :database-sync
;    :user_id     nil
;    :model       "database"
;    :model_id    (id)
;    :database_id (id)
;    :custom_id   "abc"
;    :details     {:status       "completed"
;                  :running_time 0
;                  :name         (:name (db))
;                  :description  (:description (db))
;                  :engine       (name (:engine (db)))}}]
;  (do
;    (k/delete Activity)
;    (let [_            (process-activity-event {:topic :database-sync-begin
;                                                :item  {:database_id (id) :custom_id "abc"}})
;          activity1    (-> (db/sel :one Activity :topic "database-sync")
;                           (select-keys [:topic :user_id :model :model_id :database_id :custom_id :details]))
;          _            (process-activity-event {:topic :database-sync-end
;                                                :item  {:database_id (id) :custom_id "abc"}})
;          activity2    (-> (db/sel :one Activity :topic "database-sync")
;                           (select-keys [:topic :user_id :model :model_id :database_id :custom_id :details])
;                           (assoc-in [:details :running_time] 0))
;          activity-cnt (:cnt (first (k/select Activity (k/aggregate (count :*) :cnt) (k/where {:topic "database-sync"}))))]
;      [activity-cnt
;       activity1
;       activity2])))

;; `:install` event
(expect
  {:topic       :install
   :user_id     nil
   :model       "install"
   :model_id    nil
   :details     {}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :install
                             :item  {}})
    (-> (db/sel :one Activity :topic "install")
        (select-keys [:topic :user_id :model :model_id :details]))))

;; `:user-login` event
(expect-let [{{user-id :id} :user {session-id :id :as session} :session} (create-test-objects)]
  {:topic       :user-joined
   :user_id     user-id
   :model       "user"
   :model_id    user-id
   :details     {}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :user-login
                             :item  {:user_id    user-id
                                     :session_id session-id}})
    (-> (db/sel :one Activity :topic "user-joined")
        (select-keys [:topic :user_id :model :model_id :details]))))
