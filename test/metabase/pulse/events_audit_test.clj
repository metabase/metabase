(ns metabase.pulse.events-audit-test
  "The audit rows that the writes of a subscription record: what a user does records, the upkeep that follows does not."
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(defn- max-id []
  (or (:id (t2/query-one {:select [[:%max.id :id]] :from [:audit_log]})) 0))

(defn- topics-since [before]
  (mapv (juxt :topic :model :model_id)
        (t2/select [:model/AuditLog :topic :model :model_id] :id [:> before] {:order-by [[:id :asc]]})))

(deftest creating-subscription-records-subscription-create-only-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Card card {:name "Subscribed card"}]
      (mt/with-model-cleanup [:model/Pulse]
        (let [before (max-id)
              pulse  (mt/with-current-user (mt/user->id :rasta)
                       (models.pulse/create-pulse! [(models.pulse/card->ref card)]
                                                   [{:channel_type :email :schedule_type :daily :schedule_hour 18
                                                     :enabled true :recipients [{:email "foo@example.com"}]}]
                                                   {:name "Subscription" :creator_id (mt/user->id :rasta)
                                                    :skip_if_empty false}))]
          (is (= [[:subscription-create "Pulse" (:id pulse)]] (topics-since before))))))))

(deftest renaming-or-moving-dashboard-records-no-subscription-update-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Dashboard"}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dashboard-id :card_id card-id}
                   :model/Collection {collection-id :id} {}
                   :model/Pulse {pulse-id :id} {:dashboard_id dashboard-id :name "Dashboard" :creator_id (mt/user->id :rasta)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id :position 0}
                   :model/PulseChannel _ {:pulse_id pulse-id :channel_type :email :schedule_type :daily :schedule_hour 8}]
      (let [before (max-id)]
        (mt/user-http-request :crowberto :put 200 (str "dashboard/" dashboard-id) {:name "Renamed"})
        (mt/user-http-request :crowberto :put 200 (str "dashboard/" dashboard-id) {:collection_id collection-id})
        (testing "the subscription follows the dashboard"
          (is (= "Renamed" (t2/select-one-fn :name :model/Pulse :id pulse-id)))
          (is (= collection-id (t2/select-one-fn :collection_id :model/Pulse :id pulse-id))))
        (testing "the dashboard is the only thing recorded as updated"
          (is (= [] (filter (comp #{:subscription-update} first) (topics-since before)))))))))

(deftest leaving-a-subscription-records-nothing-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Pulse {pulse-id :id} {:name "Subscription"}
                   :model/PulseChannel {channel-id :id} {:pulse_id pulse-id :channel_type :email
                                                         :schedule_type :daily :schedule_hour 1}
                   :model/PulseChannelRecipient _ {:pulse_channel_id channel-id :user_id (mt/user->id :rasta)}
                   :model/User {user-id :id} {}
                   :model/PulseChannelRecipient _ {:pulse_channel_id channel-id :user_id user-id}]
      (testing "unsubscribing oneself"
        (let [before (max-id)]
          (mt/user-http-request :rasta :delete 204 (str "pulse/" pulse-id "/subscription"))
          (is (= [] (topics-since before)))))
      (testing "deactivating a user who is a recipient"
        (let [before (max-id)]
          (mt/user-http-request :crowberto :delete 200 (str "user/" user-id))
          (is (= [[:user-deactivated "User" user-id]] (topics-since before))))))))
