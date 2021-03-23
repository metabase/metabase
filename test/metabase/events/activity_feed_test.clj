(ns metabase.events.activity-feed-test
  (:require [clojure.test :refer :all]
            [metabase.events.activity-feed :as events.activity-feed]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models :refer [Activity Card Dashboard DashboardCard Metric Pulse Segment]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- activity
  ([topic]
   (activity topic nil))

  ([topic model-id]
   (mt/derecordize
    (db/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
      :topic    topic
      :model_id model-id
      {:order-by [[:id :desc]]}))))

(deftest card-create-test
  (testing :card-create
    (mt/with-temp Card [card {:name "My Cool Card"}]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :card-create, :item card})
        (is (= {:topic       :card-create
                :user_id     (mt/user->id :rasta)
                :model       "card"
                :model_id    (:id card)
                :database_id nil
                :table_id    nil
                :details     {:name "My Cool Card", :description nil}}
               (activity "card-create" (:id card))))))

    (testing "when I save a Card that uses a NESTED query, is the activity recorded? :D"
      (mt/with-temp* [Card [card-1 {:name          "My Cool Card"
                                    :dataset_query {:database (mt/id)
                                                    :type     :query
                                                    :query    {:source-table (mt/id :venues)}}}]
                      Card [card-2 {:name          "My Cool NESTED Card"
                                    :dataset_query {:database mbql.s/saved-questions-virtual-database-id
                                                    :type     :query
                                                    :query    {:source-table (str "card__" (u/the-id card-1))}}}]]
        (mt/with-model-cleanup [Activity]
          (events.activity-feed/process-activity-event! {:topic :card-create, :item card-2})
          (is (= {:topic       :card-create
                  :user_id     (mt/user->id :rasta)
                  :model       "card"
                  :model_id    (:id card-2)
                  :database_id (mt/id)
                  :table_id    (mt/id :venues)
                  :details     {:name "My Cool NESTED Card", :description nil}}
                 (activity "card-create" (:id card-2)))))))))

(deftest card-update-event-test
  (testing :card-update
    (mt/with-temp Card [card {:name "My Cool Card"}]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :card-update, :item card})
        (is (= {:topic       :card-update
                :user_id     (mt/user->id :rasta)
                :model       "card"
                :model_id    (:id card)
                :database_id nil
                :table_id    nil
                :details     {:name "My Cool Card", :description nil}}
               (activity "card-update" (:id card))))))))

(deftest card-delete-event-test
  (testing :card-delete
    (mt/with-temp Card [card {:name "My Cool Card"}]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :card-delete, :item card})
        (is (= {:topic       :card-delete
                :user_id     (mt/user->id :rasta)
                :model       "card"
                :model_id (:id card)
                :database_id nil
                :table_id    nil
                :details     {:name "My Cool Card", :description nil}}
               (activity "card-delete" (:id card))))))))

(deftest dashboard-create-event-test
  (testing :dashboard-create
    (mt/with-temp Dashboard [dashboard {:name "My Cool Dashboard"}]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :dashboard-create, :item dashboard})
        (is (= {:topic       :dashboard-create
                :user_id     (mt/user->id :rasta)
                :model       "dashboard"
                :model_id    (:id dashboard)
                :database_id nil
                :table_id    nil
                :details     {:name "My Cool Dashboard", :description nil}}
               (activity "dashboard-create" (:id dashboard))))))))

(deftest dashboard-delete-event-test
  (testing :dashboard-delete
    (mt/with-temp Dashboard [dashboard {:name "My Cool Dashboard"}]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :dashboard-delete, :item dashboard})
        (is (= {:topic       :dashboard-delete
                :user_id     (mt/user->id :rasta)
                :model       "dashboard"
                :model_id    (:id dashboard)
                :database_id nil
                :table_id    nil
                :details     {:name "My Cool Dashboard", :description nil}}
               (activity "dashboard-delete" (:id dashboard))))))))

(deftest dashboard-add-cards-event-test
  (testing :dashboard-add-cards
    (mt/with-temp* [Dashboard     [dashboard {:name "My Cool Dashboard"}]
                    Card          [card]
                    DashboardCard [dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :dashboard-add-cards
                                                       :item  {:id        (:id dashboard)
                                                               :actor_id  (mt/user->id :rasta)
                                                               :dashcards [dashcard]}})
        (is (= {:topic       :dashboard-add-cards
                :user_id     (mt/user->id :rasta)
                :model       "dashboard"
                :model_id    (:id dashboard)
                :database_id nil
                :table_id    nil
                :details     {:name        "My Cool Dashboard"
                              :description nil
                              :dashcards   [{:description (:description card)
                                             :name        (:name card)
                                             :id          (:id dashcard)
                                             :card_id     (:id card)}]}}
               (activity "dashboard-add-cards" (:id dashboard))))))))

(deftest dashboard-remove-cards-event-test
  (testing :dashboard-remove-cards
    (mt/with-temp* [Dashboard     [dashboard {:name "My Cool Dashboard"}]
                    Card          [card]
                    DashboardCard [dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :dashboard-remove-cards
                                                       :item  {:id        (:id dashboard)
                                                               :actor_id  (mt/user->id :rasta)
                                                               :dashcards [dashcard]}})
        (is (= {:topic       :dashboard-remove-cards
                :user_id     (mt/user->id :rasta)
                :model       "dashboard"
                :model_id    (:id dashboard)
                :database_id nil
                :table_id    nil
                :details     {:name        "My Cool Dashboard"
                              :description nil
                              :dashcards   [{:description (:description card)
                                             :name        (:name card)
                                             :id          (:id dashcard)
                                             :card_id     (:id card)}]}}
               (activity "dashboard-remove-cards" (:id dashboard))))))))

(deftest install-event-test
  (testing :install
    (mt/with-model-cleanup [Activity]
      (events.activity-feed/process-activity-event! {:topic :install, :item {}})
      (is (= {:topic       :install
              :user_id     nil
              :database_id nil
              :table_id    nil
              :model       "install"
              :model_id    nil
              :details     {}}
             (activity "install"))))))

(deftest metric-create-event-test
  (testing :metric-create
    (mt/with-temp Metric [metric {:table_id (mt/id :venues)}]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :metric-create, :item metric})
        (is (= {:topic       :metric-create
                :user_id     (mt/user->id :rasta)
                :model       "metric"
                :model_id    (:id metric)
                :database_id (mt/id)
                :table_id    (mt/id :venues)
                :details     {:name        (:name metric)
                              :description (:description metric)}}
               (activity "metric-create" (:id metric))))))))

(deftest metric-update-event-test
  (testing :metric-update
    (mt/with-temp Metric [metric {:table_id (mt/id :venues)}]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :metric-update, :item (-> (assoc metric
                                                                                               :actor_id         (mt/user->id :rasta)
                                                                                               :revision_message "update this mofo")
                                                                                        ;; doing this specifically to ensure :actor_id is utilized
                                                                                        (dissoc :creator_id))})
        (is (= {:topic       :metric-update
                :user_id     (mt/user->id :rasta)
                :model       "metric"
                :model_id    (:id metric)
                :database_id (mt/id)
                :table_id    (mt/id :venues)
                :details     {:name             (:name metric)
                              :description      (:description metric)
                              :revision_message "update this mofo"}}
               (activity "metric-update" (:id metric))))))))

(deftest metric-delete-event-test
  (testing :metric-delete
    (mt/with-temp Metric [metric {:table_id (mt/id :venues)}]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :metric-delete, :item (assoc metric
                                                                                           :actor_id         (mt/user->id :rasta)
                                                                                           :revision_message "deleted")})
        (is (= {:topic       :metric-delete
                :user_id     (mt/user->id :rasta)
                :model       "metric"
                :model_id    (:id metric)
                :database_id (mt/id)
                :table_id    (mt/id :venues)
                :details     {:name             (:name metric)
                              :description      (:description metric)
                              :revision_message "deleted"}}
               (activity "metric-delete" (:id metric))))))))

(deftest pulse-create-event-test
  (testing :pulse-create
    (mt/with-temp Pulse [pulse]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :pulse-create, :item pulse})
        (is (= {:topic       :pulse-create
                :user_id     (mt/user->id :rasta)
                :model       "pulse"
                :model_id    (:id pulse)
                :database_id nil
                :table_id    nil
                :details     {:name (:name pulse)}}
               (activity "pulse-create" (:id pulse))))))))

(deftest pulse-delete-event-test
  (testing :pulse-delete
    (mt/with-temp Pulse [pulse]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :pulse-delete, :item pulse})
        (is (= {:topic       :pulse-delete
                :user_id     (mt/user->id :rasta)
                :model       "pulse"
                :model_id    (:id pulse)
                :database_id nil
                :table_id    nil
                :details     {:name (:name pulse)}}
               (activity "pulse-delete" (:id pulse))))))))

(deftest segment-create-event-test
  (testing :segment-create
    (mt/with-temp Segment [segment]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :segment-create, :item segment})
        (is (= {:topic       :segment-create
                :user_id     (mt/user->id :rasta)
                :model       "segment"
                :model_id    (:id segment)
                :database_id (mt/id)
                :table_id    (mt/id :checkins)
                :details     {:name        (:name segment)
                              :description (:description segment)}}
               (activity "segment-create" (:id segment))))))))

(deftest segment-update-event-test
  (testing :segment-update
    (mt/with-temp Segment [segment]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :segment-update, :item (-> segment
                                                                                         (assoc :actor_id         (mt/user->id :rasta)
                                                                                                :revision_message "update this mofo")
                                                                                         ;; doing this specifically to ensure :actor_id is utilized
                                                                                         (dissoc :creator_id))})
        (is (= {:topic       :segment-update
                :user_id     (mt/user->id :rasta)
                :model       "segment"
                :model_id    (:id segment)
                :database_id (mt/id)
                :table_id    (mt/id :checkins)
                :details     {:name             (:name segment)
                              :description      (:description segment)
                              :revision_message "update this mofo"}}
               (activity "segment-update" (:id segment))))))))

(deftest segment-delete-event-test
  (testing :segment-delete
    (mt/with-temp Segment [segment]
      (mt/with-model-cleanup [Activity]
        (events.activity-feed/process-activity-event! {:topic :segment-delete
                                                       :item (assoc segment
                                                                    :actor_id         (mt/user->id :rasta)
                                                                    :revision_message "deleted")})
        (is (= {:topic       :segment-delete
                :user_id     (mt/user->id :rasta)
                :model       "segment"
                :model_id    (:id segment)
                :database_id (mt/id)
                :table_id    (mt/id :checkins)
                :details     {:name             (:name segment)
                              :description      (:description segment)
                              :revision_message "deleted"}}
               (activity "segment-delete" (:id segment))))))))

(deftest user-login-event-test
  (testing :user-login
    ;; TODO - what's the difference between `user-login` / `user-joined`?
    (mt/with-model-cleanup [Activity]
      (events.activity-feed/process-activity-event! {:topic :user-login
                                                     :item  {:user_id     (mt/user->id :rasta)
                                                             :session_id  (str (java.util.UUID/randomUUID))
                                                             :first_login true}})
      (is (= {:topic       :user-joined
              :user_id     (mt/user->id :rasta)
              :model       "user"
              :model_id    (mt/user->id :rasta)
              :database_id nil
              :table_id    nil
              :details     {}}
             (activity "user-joined" (mt/user->id :rasta)))))))
