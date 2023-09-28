(ns metabase.events.audit-log-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.events.audit-log :as events.audit-log]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models
    :refer [Activity Card Dashboard DashboardCard Metric Pulse Segment]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(comment events.audit-log/keep-me)

(defn- event
  ([topic]
   (event topic nil))

  ([topic model-id]
   (t2/select-one [:model/AuditLog :topic :user_id :model :model_id :details]
                  :topic    topic
                  :model_id model-id
                  {:order-by [[:id :desc]]})))

(defn- activity
  ([topic]
   (activity topic nil))

  ([topic model-id]
   (t2/select-one [:model/Activity :topic :user_id :model :model_id :database_id :table_id :details]
                  :topic    topic
                  :model_id model-id
                  {:order-by [[:id :desc]]})))

(deftest card-create-test
  (testing :card-create
    (mt/with-model-cleanup [:model/AuditLog]
      (mt/with-test-user :rasta
        (t2.with-temp/with-temp [Card card {:name "My Cool Card"}]
          (is (= card
                 (events/publish-event! :event/card-create card)))
          (is (partial=
               {:topic    :card-create
                :user_id  (mt/user->id :rasta)
                :model    "Card"
                :model_id (:id card)
                :details  {:name "My Cool Card", :description nil, :database_id nil, :table_id nil}}
               (event "card-create" (:id card)))))))))

(deftest card-create-nested-query-test
  (testing :card-create
    (testing "when I save a Card that uses a NESTED query, is the activity recorded? :D"
      (mt/with-temp [Card card-1 {:name          "My Cool Card"
                                  :dataset_query {:database (mt/id)
                                                  :type     :query
                                                  :query    {:source-table (mt/id :venues)}}}
                     Card card-2 {:name          "My Cool NESTED Card"
                                  :dataset_query {:database lib.schema.id/saved-questions-virtual-database-id
                                                  :type     :query
                                                  :query    {:source-table (str "card__" (u/the-id card-1))}}}]
        (mt/with-model-cleanup [:model/AuditLog]
          (mt/with-test-user :rasta
            (is (= card-2
                   (events/publish-event! :event/card-create card-2)))
            (is (partial=
                 {:topic    :card-create
                  :user_id  (mt/user->id :rasta)
                  :model    "Card"
                  :model_id (:id card-2)
                  :details  {:name        "My Cool NESTED Card"
                             :description nil
                             :database_id (mt/id)
                             :table_id    (mt/id :venues)}}
                 (event "card-create" (:id card-2))))))))))

(deftest card-update-event-test
  (testing :card-update
    (doseq [dataset? [false true]]
      (testing (if dataset? "Dataset" "Card")
        (t2.with-temp/with-temp [Card card {:name "My Cool Card" :dataset dataset?}]
          (mt/with-model-cleanup [:model/AuditLog]
           (mt/with-test-user :rasta
             (is (= card
                    (events/publish-event! :event/card-update card)))
             (is (partial=
                  {:topic    :card-update
                   :user_id  (mt/user->id :rasta)
                   :model    "Card"
                   :model_id (:id card)
                   :details  (cond-> {:name        "My Cool Card"
                                      :description nil
                                      :table_id    nil
                                      :database_id nil}
                               dataset? (assoc :model? true))}
                  (event "card-update" (:id card)))))))))))

(deftest card-delete-event-test
  (testing :card-delete
    (doseq [dataset? [false true]]
      (testing (if dataset? "Dataset" "Card")
        (t2.with-temp/with-temp [Card card {:name "My Cool Card", :dataset dataset?}]
          (mt/with-model-cleanup [:model/AuditLog]
            (mt/with-test-user :rasta
              (is (= card
                     (events/publish-event! :event/card-delete card)))
              (is (partial=
                   {:topic    :card-delete
                    :user_id  (mt/user->id :rasta)
                    :model    "Card"
                    :model_id (:id card)
                    :details  (cond-> {:name "My Cool Card", :description nil}
                                dataset? (assoc :model? true))}
                   (event "card-delete" (:id card)))))))))))

(deftest dashboard-create-event-test
  (testing :dashboard-create
    (t2.with-temp/with-temp [Dashboard dashboard {:name "My Cool Dashboard"}]
      (mt/with-model-cleanup [:model/AuditLog]
        (mt/with-test-user :rasta
          (is (= dashboard
                 (events/publish-event! :event/dashboard-create dashboard)))
          (is (partial=
               {:topic    :dashboard-create
                :user_id  (mt/user->id :rasta)
                :model    "Dashboard"
                :model_id (:id dashboard)
                :details  {:name "My Cool Dashboard", :description nil}}
               (event "dashboard-create" (:id dashboard)))))))))

(deftest dashboard-delete-event-test
  (testing :dashboard-delete
    (t2.with-temp/with-temp [Dashboard dashboard {:name "My Cool Dashboard"}]
      (mt/with-model-cleanup [:model/AuditLog]
        (mt/with-test-user :rasta
          (is (= dashboard
                 (events/publish-event! :event/dashboard-delete dashboard)))
          (is (partial=
               {:topic    :dashboard-delete
                :user_id  (mt/user->id :rasta)
                :model    "Dashboard"
                :model_id (:id dashboard)
                :details  {:name "My Cool Dashboard", :description nil}}
               (event "dashboard-delete" (:id dashboard)))))))))

(deftest dashboard-add-cards-event-test
  (testing :dashboard-add-cards
    (mt/with-temp [Dashboard     dashboard {:name "My Cool Dashboard"}
                   Card          card {}
                   DashboardCard dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]
      (mt/with-model-cleanup [:model/AuditLog]
        (mt/with-test-user :rasta
         (let [event {:id        (:id dashboard)
                      :actor_id  (mt/user->id :rasta)
                      :dashcards [dashcard]}]
           (is (= event
                  (events/publish-event! :event/dashboard-add-cards event))))
         (is (partial=
              {:topic    :dashboard-add-cards
               :user_id  (mt/user->id :rasta)
               :model    "Dashboard"
               :model_id (:id dashboard)
               :details  {:name        "My Cool Dashboard"
                          :description nil
                          :dashcards   [{:description (:description card)
                                         :name        (:name card)
                                         :id          (:id dashcard)
                                         :card_id     (:id card)}]}}
              (event "dashboard-add-cards" (:id dashboard)))))))))

(deftest dashboard-remove-cards-event-test
  (testing :dashboard-remove-cards
    (mt/with-temp [Dashboard     dashboard {:name "My Cool Dashboard"}
                   Card          card {}
                   DashboardCard dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]
      (mt/with-model-cleanup [:model/AuditLog]
        (mt/with-test-user :rasta
          (let [event {:id        (:id dashboard)
                       :actor_id  (mt/user->id :rasta)
                       :dashcards [dashcard]}]
            (is (= event
                   (events/publish-event! :event/dashboard-remove-cards event))))
          (is (partial=
               {:topic       :dashboard-remove-cards
                :user_id     (mt/user->id :rasta)
                :model       "Dashboard"
                :model_id    (:id dashboard)
                :details     {:name        "My Cool Dashboard"
                              :description nil
                              :dashcards   [{:description (:description card)
                                             :name        (:name card)
                                             :id          (:id dashcard)
                                             :card_id     (:id card)}]}}
               (event "dashboard-remove-cards" (:id dashboard)))))))))

(deftest install-event-test
  (testing :install
    (mt/with-model-cleanup [Activity]
      (is (= {}
             (events/publish-event! :event/install {})))
      (is (= {:topic       :install
              :user_id     nil
              :model       "install"
              :model_id    nil
              :database_id nil
              :table_id    nil
              :details     {}}
             (activity "install"))))))

(deftest metric-create-event-test
  (testing :metric-create
    (t2.with-temp/with-temp [Metric metric {:table_id (mt/id :venues)}]
      (mt/with-model-cleanup [Activity]
        (mt/with-test-user :rasta
          (is (= metric
                 (events/publish-event! :event/metric-create metric)))
          (is (= {:topic       :metric-create
                  :user_id     (mt/user->id :rasta)
                  :model       "Metric"
                  :model_id    (:id metric)
                  :details     {:name        (:name metric)
                                :description (:description metric)
                                :database_id (mt/id)
                                :table_id    (mt/id :venues)}}
                 (event "metric-create" (:id metric)))))))))

(deftest metric-update-event-test
  (testing :metric-update
    (t2.with-temp/with-temp [Metric metric {:table_id (mt/id :venues)}]
      (mt/with-model-cleanup [Activity]
        (mt/with-test-user :rasta
         (let [event (-> (assoc metric
                                :actor_id         (mt/user->id :rasta)
                                :revision_message "update this mofo")
                         ;; doing this specifically to ensure :actor_id is utilized
                         (dissoc :creator_id))]
           (is (= event
                  (events/publish-event! :event/metric-update event))))
         (is (= {:topic       :metric-update
                 :user_id     (mt/user->id :rasta)
                 :model       "Metric"
                 :model_id    (:id metric)
                 :details     {:name             (:name metric)
                               :description      (:description metric)
                               :revision_message "update this mofo"
                               :database_id (mt/id)
                               :table_id    (mt/id :venues)}}
                (event "metric-update" (:id metric)))))))))

(deftest metric-delete-event-test
  (testing :metric-delete
    (t2.with-temp/with-temp [Metric metric {:table_id (mt/id :venues)}]
      (mt/with-model-cleanup [Activity]
        (mt/with-test-user :rasta
         (let [event (assoc metric
                            :actor_id         (mt/user->id :rasta)
                            :revision_message "deleted")]
           (is (= event
                  (events/publish-event! :event/metric-delete event))))
         (is (= {:topic       :metric-delete
                 :user_id     (mt/user->id :rasta)
                 :model       "Metric"
                 :model_id    (:id metric)
                 :details     {:name             (:name metric)
                               :description      (:description metric)
                               :revision_message "deleted"
                               :database_id (mt/id)
                               :table_id    (mt/id :venues)}}
                (event "metric-delete" (:id metric)))))))))

(deftest pulse-create-event-test
  (testing :pulse-create
    (t2.with-temp/with-temp [Pulse pulse]
      (mt/with-model-cleanup [Activity]
        (mt/with-test-user :rasta
         (is (= pulse
                (events/publish-event! :event/pulse-create pulse)))
         (is (= {:topic       :pulse-create
                 :user_id     (mt/user->id :rasta)
                 :model       "Pulse"
                 :model_id    (:id pulse)
                 :details     {:name (:name pulse)}}
                (event "pulse-create" (:id pulse)))))))))

(deftest pulse-delete-event-test
  (testing :pulse-delete
    (t2.with-temp/with-temp [Pulse pulse]
      (mt/with-model-cleanup [Activity]
        (mt/with-test-user :rasta
         (is (= pulse
                (events/publish-event! :event/pulse-delete pulse)))
         (is (= {:topic       :pulse-delete
                 :user_id     (mt/user->id :rasta)
                 :model       "Pulse"
                 :model_id    (:id pulse)
                 :details     {:name (:name pulse)}}
                (event "pulse-delete" (:id pulse)))))))))

(deftest segment-create-event-test
  (testing :segment-create
    (t2.with-temp/with-temp [Segment segment]
      (mt/with-model-cleanup [Activity]
        (mt/with-test-user :rasta
         (is (= segment
                 (events/publish-event! :event/segment-create segment)))
         (is (= {:topic       :segment-create
                 :user_id     (mt/user->id :rasta)
                 :model       "Segment"
                 :model_id    (:id segment)
                 :details     {:name        (:name segment)
                               :description (:description segment)
                               :database_id (mt/id)
                               :table_id    (mt/id :checkins)}}
                (event "segment-create" (:id segment)))))))))

(deftest segment-update-event-test
  (testing :segment-update
    (t2.with-temp/with-temp [Segment segment]
      (mt/with-model-cleanup [Activity]
        (mt/with-test-user :rasta
         (let [event (-> segment
                         (assoc :actor_id         (mt/user->id :rasta)
                                :revision_message "update this mofo")
                         ;; doing this specifically to ensure :actor_id is utilized
                         (dissoc :creator_id))]
           (is (= event
                  (events/publish-event! :event/segment-update event))))
         (is (= {:topic       :segment-update
                 :user_id     (mt/user->id :rasta)
                 :model       "Segment"
                 :model_id    (:id segment)
                 :details     {:name             (:name segment)
                               :description      (:description segment)
                               :revision_message "update this mofo"
                               :database_id (mt/id)
                               :table_id    (mt/id :checkins)}}
                (event "segment-update" (:id segment)))))))))

(deftest segment-delete-event-test
  (testing :segment-delete
    (t2.with-temp/with-temp [Segment segment]
      (mt/with-model-cleanup [Activity]
        (mt/with-test-user :rasta
         (let [event (assoc segment
                              :actor_id         (mt/user->id :rasta)
                              :revision_message "deleted")]
           (is (= event
                  (events/publish-event! :event/segment-delete event))))
         (is (= {:topic       :segment-delete
                 :user_id     (mt/user->id :rasta)
                 :model       "Segment"
                 :model_id    (:id segment)
                 :details     {:name             (:name segment)
                               :description      (:description segment)
                               :revision_message "deleted"
                               :database_id (mt/id)
                               :table_id    (mt/id :checkins)}}
                (event "segment-delete" (:id segment)))))))))

(deftest user-joined-event-test
  (testing :user-joined
    ;; TODO - what's the difference between `user-login` / `user-joined`?
    (mt/with-model-cleanup [Activity]
      (let [event {:user-id (mt/user->id :rasta)}]
        (is (= event
               (events/publish-event! :event/user-joined event))))
      (is (= {:topic       :user-joined
              :user_id     (mt/user->id :rasta)
              :model       "User"
              :model_id    (mt/user->id :rasta)
              :details     {}}
             (event "user-joined" (mt/user->id :rasta)))))))

(deftest user-update-event-test
 (testing :event/user-update
  (mt/with-model-cleanup [Activity]
    (let [event {:updater (mt/user->id :rasta)
                 :changes {:id        (mt/user->id :lucky)
                           :last_name "Charms"}}]
      (is (= event (events/publish-event! :event/user-update event))))
    (is (= {:model_id (mt/user->id :lucky)
            :user_id  (mt/user->id :rasta)
            :details  {:updater (mt/user->id :rasta) :changes {:id        (mt/user->id :lucky)
                                                               :last_name "Charms"}}
            :topic    :user-update
            :model    "User"}
     (event :user-update (mt/user->id :lucky)))))))

(deftest user-deactivated-event-test
 (testing :event/user-deactivated
  (mt/with-model-cleanup [Activity]
    (let [event {:deactivator      (mt/user->id :rasta)
                 :deactivated-user {:id         (mt/user->id :lucky)
                                    :first_name "Lucky"
                                    :last_name  "Toucan"}}]
    (is (= event (events/publish-event! :event/user-deactivated event))))
    (is (= {:model_id (mt/user->id :lucky)
            :user_id  (mt/user->id :rasta)
            :details
            {:deactivator      (mt/user->id :rasta)
             :deactivated-user {:id (mt/user->id :lucky)
                                :first_name "Lucky"
                                :last_name "Toucan"}}
            :topic    :user-deactivated
            :model    "User"}
     (event :user-deactivated (mt/user->id :lucky)))))))
