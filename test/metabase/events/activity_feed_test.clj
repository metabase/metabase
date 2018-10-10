(ns metabase.events.activity-feed-test
  (:require [expectations :refer [expect]]
            [metabase.events.activity-feed :refer :all]
            [metabase.models
             [activity :refer [Activity]]
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]]
            [metabase.test.data :as data :refer :all]
            [metabase.test.data.users :refer [user->id]]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- do-with-temp-activities [f]
  (db/delete! Activity)                  ; Not 100% sure this is neccessary anymore
  (try (f)
       (finally (db/delete! Activity))))

(defmacro with-temp-activities
  "Clear all activies, execute BODY; clear all activies again, then return the results of BODY."
  [& body]
  `(do-with-temp-activities (fn [] ~@body)))


;; `:card-create` event
(expect
  {:topic       :card-create
   :user_id     (user->id :rasta)
   :model       "card"
   :database_id nil
   :table_id    nil
   :details     {:name "My Cool Card", :description nil}}
  (tt/with-temp Card [card {:name "My Cool Card"}]
    (with-temp-activities
      (process-activity-event! {:topic :card-create, :item card})
      (db/select-one [Activity :topic :user_id :model :database_id :table_id :details]
        :topic    "card-create"
        :model_id (:id card)))))

;; when I save a Card that uses a NESTED query, is the activity recorded? :D
(expect
  {:topic       :card-create
   :user_id     (user->id :rasta)
   :model       "card"
   :database_id (data/id)
   :table_id    (data/id :venues)
   :details     {:name "My Cool NESTED Card", :description nil}}
  (tt/with-temp* [Card [card-1 {:name          "My Cool Card"
                                :dataset_query {:database (data/id)
                                                :type     :query
                                                :query    {:source-table (data/id :venues)}}}]
                  Card [card-2 {:name          "My Cool NESTED Card"
                                :dataset_query {:database metabase.models.database/virtual-id
                                                :type     :query
                                                :query    {:source-table (str "card__" (u/get-id card-1))}}}]]
    (with-temp-activities
      (process-activity-event! {:topic :card-create, :item card-2})
      (db/select-one [Activity :topic :user_id :model :database_id :table_id :details]
        :topic    "card-create"
        :model_id (:id card-2)))))


;; `:card-update` event
(expect
  {:topic       :card-update
   :user_id     (user->id :rasta)
   :model       "card"
   :database_id nil
   :table_id    nil
   :details     {:name "My Cool Card", :description nil}}
  (tt/with-temp Card [card {:name "My Cool Card"}]
    (with-temp-activities
      (process-activity-event! {:topic :card-update, :item card})
      (db/select-one [Activity :topic :user_id :model :database_id :table_id :details]
        :topic    "card-update"
        :model_id (:id card)))))


;; `:card-delete` event
(expect
  {:topic       :card-delete
   :user_id     (user->id :rasta)
   :model       "card"
   :database_id nil
   :table_id    nil
   :details     {:name "My Cool Card", :description nil}}
  (tt/with-temp Card [card {:name "My Cool Card"}]
    (with-temp-activities
      (process-activity-event! {:topic :card-delete, :item card})
      (db/select-one [Activity :topic :user_id :model :database_id :table_id :details]
        :topic    "card-delete"
        :model_id (:id card)))))


;; `:dashboard-create` event
(expect
  {:topic       :dashboard-create
   :user_id     (user->id :rasta)
   :model       "dashboard"
   :database_id nil
   :table_id    nil
   :details     {:name "My Cool Dashboard", :description nil}}
  (tt/with-temp Dashboard [dashboard {:name "My Cool Dashboard"}]
    (with-temp-activities
      (process-activity-event! {:topic :dashboard-create, :item dashboard})
      (db/select-one [Activity :topic :user_id :model :database_id :table_id :details]
        :topic    "dashboard-create"
        :model_id (:id dashboard)))))


;; `:dashboard-delete` event
(expect
  {:topic       :dashboard-delete
   :user_id     (user->id :rasta)
   :model       "dashboard"
   :database_id nil
   :table_id    nil
   :details     {:name "My Cool Dashboard", :description nil}}
  (tt/with-temp Dashboard [dashboard {:name "My Cool Dashboard"}]
    (with-temp-activities
      (process-activity-event! {:topic :dashboard-delete, :item dashboard})
      (db/select-one [Activity :topic :user_id :model :database_id :table_id :details]
        :topic    "dashboard-delete"
        :model_id (:id dashboard)))))


;; `:dashboard-add-cards` event
(tt/expect-with-temp [Dashboard     [dashboard {:name "My Cool Dashboard"}]
                      Card          [card]
                      DashboardCard [dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]]
  {:topic       :dashboard-add-cards
   :user_id     (user->id :rasta)
   :model       "dashboard"
   :model_id    (:id dashboard)
   :database_id nil
   :table_id    nil
   :details     {:name         "My Cool Dashboard"
                 :description  nil
                 :dashcards    [{:description  (:description card)
                                 :name         (:name card)
                                 :id           (:id dashcard)
                                 :card_id      (:id card)}]}}
  (with-temp-activities
    (process-activity-event! {:topic :dashboard-add-cards
                             :item  {:id        (:id dashboard)
                                     :actor_id  (user->id :rasta)
                                     :dashcards [dashcard]}})
    (db/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
      :topic    "dashboard-add-cards"
      :model_id (:id dashboard))))


;; `:dashboard-remove-cards` event
(tt/expect-with-temp [Dashboard     [dashboard {:name "My Cool Dashboard"}]
                      Card          [card]
                      DashboardCard [dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]]
  {:topic       :dashboard-remove-cards
   :user_id     (user->id :rasta)
   :model       "dashboard"
   :model_id    (:id dashboard)
   :database_id nil
   :table_id    nil
   :details     {:name         "My Cool Dashboard"
                 :description  nil
                 :dashcards    [{:description  (:description card)
                                 :name         (:name card)
                                 :id           (:id dashcard)
                                 :card_id      (:id card)}]}}
  (with-temp-activities
    (process-activity-event! {:topic :dashboard-remove-cards
                             :item  {:id        (:id dashboard)
                                     :actor_id  (user->id :rasta)
                                     :dashcards [dashcard]}})
    (db/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
      :topic    "dashboard-remove-cards"
      :model_id (:id dashboard))))


;; `:install` event
(expect
  {:topic    :install
   :user_id  nil
   :model    "install"
   :model_id nil
   :details  {}}
  (with-temp-activities
    (process-activity-event! {:topic :install, :item {}})
    (db/select-one [Activity :topic :user_id :model :model_id :details], :topic "install")))


;; `:metric-create`
(tt/expect-with-temp [Metric [metric {:table_id (id :venues)}]]
  {:topic       :metric-create
   :user_id     (user->id :rasta)
   :model       "metric"
   :model_id    (:id metric)
   :database_id (id)
   :table_id    (id :venues)
   :details     {:name        (:name metric)
                 :description (:description metric)}}
  (with-temp-activities
    (process-activity-event! {:topic :metric-create, :item metric})
    (db/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
      :topic    "metric-create"
      :model_id (:id metric))))


;; `:metric-update`
(tt/expect-with-temp [Metric [metric {:table_id (id :venues)}]]
  {:topic       :metric-update
   :user_id     (user->id :rasta)
   :model       "metric"
   :model_id    (:id metric)
   :database_id (id)
   :table_id    (id :venues)
   :details     {:name             (:name metric)
                 :description      (:description metric)
                 :revision_message "update this mofo"}}
  (with-temp-activities
    (process-activity-event! {:topic :metric-update, :item (-> (assoc metric
                                                                :actor_id         (user->id :rasta)
                                                                :revision_message "update this mofo")
                                                              ;; doing this specifically to ensure :actor_id is utilized
                                                              (dissoc :creator_id))})
    (db/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
      :topic    "metric-update"
      :model_id (:id metric))))


;; `:metric-delete`
(tt/expect-with-temp [Metric [metric {:table_id (id :venues)}]]
  {:topic       :metric-delete
   :user_id     (user->id :rasta)
   :model       "metric"
   :model_id    (:id metric)
   :database_id (id)
   :table_id    (id :venues)
   :details     {:name             (:name metric)
                 :description      (:description metric)
                 :revision_message "deleted"}}
  (with-temp-activities
    (process-activity-event! {:topic :metric-delete, :item (assoc metric
                                                            :actor_id         (user->id :rasta)
                                                            :revision_message "deleted")})
    (db/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
      :topic    "metric-delete"
      :model_id (:id metric))))


;; `:pulse-create` event
(tt/expect-with-temp [Pulse [pulse]]
  {:topic       :pulse-create
   :user_id     (user->id :rasta)
   :model       "pulse"
   :model_id    (:id pulse)
   :database_id nil
   :table_id    nil
   :details     {:name (:name pulse)}}
  (with-temp-activities
    (process-activity-event! {:topic :pulse-create, :item pulse})
    (db/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
      :topic    "pulse-create"
      :model_id (:id pulse))))


;; `:pulse-delete` event
(tt/expect-with-temp [Pulse [pulse]]
  {:topic       :pulse-delete
   :user_id     (user->id :rasta)
   :model       "pulse"
   :model_id    (:id pulse)
   :database_id nil
   :table_id    nil
   :details     {:name (:name pulse)}}
  (with-temp-activities
    (process-activity-event! {:topic :pulse-delete, :item pulse})
    (db/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
      :topic    "pulse-delete"
      :model_id (:id pulse))))


;; `:segment-create`
(tt/expect-with-temp [Segment [segment]]
  {:topic       :segment-create
   :user_id     (user->id :rasta)
   :model       "segment"
   :model_id    (:id segment)
   :database_id (id)
   :table_id    (id :checkins)
   :details     {:name        (:name segment)
                 :description (:description segment)}}
  (with-temp-activities
    (process-activity-event! {:topic :segment-create, :item segment})
    (db/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
      :topic    "segment-create"
      :model_id (:id segment))))


;; `:segment-update`
(tt/expect-with-temp [Segment [segment]]
  {:topic       :segment-update
   :user_id     (user->id :rasta)
   :model       "segment"
   :model_id    (:id segment)
   :database_id (id)
   :table_id    (id :checkins)
   :details     {:name             (:name segment)
                 :description      (:description segment)
                 :revision_message "update this mofo"}}
  (with-temp-activities
    (process-activity-event! {:topic :segment-update, :item (-> segment
                                                               (assoc :actor_id         (user->id :rasta)
                                                                      :revision_message "update this mofo")
                                                               ;; doing this specifically to ensure :actor_id is utilized
                                                               (dissoc :creator_id))})
    (db/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
      :topic    "segment-update"
      :model_id (:id segment))))


;; `:segment-delete`
(tt/expect-with-temp [Segment [segment]]
  {:topic       :segment-delete
   :user_id     (user->id :rasta)
   :model       "segment"
   :model_id    (:id segment)
   :database_id (id)
   :table_id    (id :checkins)
   :details     {:name             (:name segment)
                 :description      (:description segment)
                 :revision_message "deleted"}}
  (with-temp-activities
    (process-activity-event! {:topic :segment-delete, :item (assoc segment
                                                             :actor_id         (user->id :rasta)
                                                             :revision_message "deleted")})
    (db/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
      :topic    "segment-delete"
      :model_id (:id segment))))


;; `:user-login` event
;; TODO - what's the difference between `user-login` / `user-joined`?
(expect
  {:topic       :user-joined
   :user_id     (user->id :rasta)
   :model       "user"
   :model_id    (user->id :rasta)
   :details     {}}
  (with-temp-activities
    (process-activity-event! {:topic :user-login
                              :item  {:user_id     (user->id :rasta)
                                      :session_id  (str (java.util.UUID/randomUUID))
                                      :first_login true}})
    (db/select-one [Activity :topic :user_id :model :model_id :details], :topic "user-joined")))
