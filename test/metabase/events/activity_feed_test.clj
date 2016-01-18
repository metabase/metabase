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
                             [metric :refer [Metric]]
                             [pulse :refer [Pulse]]
                             [segment :refer [Segment]]
                             [session :refer [Session]]
                             [table :refer [Table]]
                             [user :refer [User]])
            [metabase.test.data :refer :all]
            [metabase.test.util :refer [expect-eval-actual-first with-temp random-name]]
            [metabase.test-setup :refer :all]))


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
                    :dashboard_id (:id dashboard))
        pulse     (db/ins Pulse
                    :creator_id   (:id user)
                    :name         rand-name
                    :public_perms 2)
        database  (db/ins Database
                    :name      "Activity Database"
                    :engine    :yeehaw
                    :details   {}
                    :is_sample false)
        table     (db/ins Table
                    :name   "Activity Table"
                    :db_id  (:id database)
                    :active true)
        segment   (db/ins Segment
                    :creator_id  (:id user)
                    :table_id    (:id table)
                    :name        "Activity Segment"
                    :description "Something worth reading"
                    :definition  {:a "b"})
        metric   (db/ins Metric
                    :creator_id  (:id user)
                    :table_id    (:id table)
                    :name        "Activity Metric"
                    :description "Whoot!"
                    :definition  {:a "b"})]
    {:card      card
     :dashboard dashboard
     :dashcard  dashcard
     :database  database
     :metric    metric
     :pulse     pulse
     :segment   segment
     :session   {:id rand-name}
     :table     table
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

;; `:metric-create`
(expect-let [{:keys [database table metric user]} (create-test-objects)]
  {:topic       :metric-create
   :user_id     (:id user)
   :model       "metric"
   :model_id    (:id metric)
   :database_id (:id database)
   :table_id    (:id table)
   :details     {:name        (:name metric)
                 :description (:description metric)}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :metric-create
                             :item  metric})
    (-> (db/sel :one Activity :topic "metric-create")
        (select-keys [:topic :user_id :model :model_id :database_id :table_id :details]))))

;; `:metric-update`
(expect-let [{:keys [database table metric user]} (create-test-objects)]
  {:topic       :metric-update
   :user_id     (:id user)
   :model       "metric"
   :model_id    (:id metric)
   :database_id (:id database)
   :table_id    (:id table)
   :details     {:name             (:name metric)
                 :description      (:description metric)
                 :revision_message "update this mofo"}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :metric-update
                             :item  (-> metric
                                        (assoc :actor_id         (:id user)
                                               :revision_message "update this mofo")
                                        ;; doing this specifically to ensure :actor_id is utilized
                                        (dissoc :creator_id))})
    (-> (db/sel :one Activity :topic "metric-update")
        (select-keys [:topic :user_id :model :model_id :database_id :table_id :details]))))

;; `:metric-delete`
(expect-let [{:keys [database table metric user]} (create-test-objects)]
  {:topic       :metric-delete
   :user_id     (:id user)
   :model       "metric"
   :model_id    (:id metric)
   :database_id (:id database)
   :table_id    (:id table)
   :details     {:name             (:name metric)
                 :description      (:description metric)
                 :revision_message "deleted"}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :metric-delete
                             :item  (assoc metric :actor_id         (:id user)
                                                   :revision_message "deleted")})
    (-> (db/sel :one Activity :topic "metric-delete")
        (select-keys [:topic :user_id :model :model_id :database_id :table_id :details]))))

;; `:pulse-create` event
(expect-let [{:keys [pulse user]} (create-test-objects)]
  {:topic       :pulse-create
   :user_id     (:id user)
   :model       "pulse"
   :model_id    (:id pulse)
   :database_id nil
   :table_id    nil
   :details     {:name         (:name pulse)
                 :public_perms (:public_perms pulse)}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :pulse-create
                             :item  pulse})
    (-> (db/sel :one Activity :topic "pulse-create")
        (select-keys [:topic :user_id :model :model_id :database_id :table_id :details]))))

;; `:pulse-delete` event
(expect-let [{:keys [pulse user]} (create-test-objects)]
  {:topic       :pulse-delete
   :user_id     (:id user)
   :model       "pulse"
   :model_id    (:id pulse)
   :database_id nil
   :table_id    nil
   :details     {:name         (:name pulse)
                 :public_perms (:public_perms pulse)}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :pulse-delete
                             :item  pulse})
    (-> (db/sel :one Activity :topic "pulse-delete")
        (select-keys [:topic :user_id :model :model_id :database_id :table_id :details]))))

;; `:segment-create`
(expect-let [{:keys [database table segment user]} (create-test-objects)]
  {:topic       :segment-create
   :user_id     (:id user)
   :model       "segment"
   :model_id    (:id segment)
   :database_id (:id database)
   :table_id    (:id table)
   :details     {:name        (:name segment)
                 :description (:description segment)}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :segment-create
                             :item  segment})
    (-> (db/sel :one Activity :topic "segment-create")
        (select-keys [:topic :user_id :model :model_id :database_id :table_id :details]))))

;; `:segment-update`
(expect-let [{:keys [database table segment user]} (create-test-objects)]
  {:topic       :segment-update
   :user_id     (:id user)
   :model       "segment"
   :model_id    (:id segment)
   :database_id (:id database)
   :table_id    (:id table)
   :details     {:name             (:name segment)
                 :description      (:description segment)
                 :revision_message "update this mofo"}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :segment-update
                             :item  (-> segment
                                        (assoc :actor_id         (:id user)
                                               :revision_message "update this mofo")
                                        ;; doing this specifically to ensure :actor_id is utilized
                                        (dissoc :creator_id))})
    (-> (db/sel :one Activity :topic "segment-update")
        (select-keys [:topic :user_id :model :model_id :database_id :table_id :details]))))

;; `:segment-delete`
(expect-let [{:keys [database table segment user]} (create-test-objects)]
  {:topic       :segment-delete
   :user_id     (:id user)
   :model       "segment"
   :model_id    (:id segment)
   :database_id (:id database)
   :table_id    (:id table)
   :details     {:name             (:name segment)
                 :description      (:description segment)
                 :revision_message "deleted"}}
  (do
    (k/delete Activity)
    (process-activity-event {:topic :segment-delete
                             :item  (assoc segment :actor_id         (:id user)
                                                   :revision_message "deleted")})
    (-> (db/sel :one Activity :topic "segment-delete")
        (select-keys [:topic :user_id :model :model_id :database_id :table_id :details]))))

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
