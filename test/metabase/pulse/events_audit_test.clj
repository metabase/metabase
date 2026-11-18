(ns metabase.pulse.events-audit-test
  "The audit rows that the writes of a subscription record: what a user does records, the upkeep that follows does not."
  (:require
   [clojure.test :refer :all]
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

(def ^:private email-channel
  {:channel_type  "email"
   :schedule_type "daily"
   :schedule_hour 12
   :enabled       true
   :recipients    []})

(defn- rows-since [before]
  (t2/select [:model/AuditLog :topic :model :model_id :user_id :details] :id [:> before] {:order-by [[:id :asc]]}))

(deftest pulse-writes-record-one-row-each-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Card {card-id :id} {:name "Subscribed card"}
                   :model/Dashboard {dashboard-id :id} {:name "Dashboard"}]
      (mt/with-model-cleanup [:model/Pulse]
        (let [cards   [{:id card-id :include_csv false :include_xls false :dashboard_card_id nil}]
              rasta   (mt/user->id :rasta)
              before  (max-id)
              pulse   (mt/user-http-request :rasta :post 200 "pulse"
                                            {:name "Subscription" :dashboard_id dashboard-id :cards cards
                                             :channels [email-channel]})
              pulse-id (:id pulse)]
          (testing "creating a subscription stores subscription-create only"
            (is (=? [{:topic :subscription-create :model "Pulse" :model_id pulse-id :user_id rasta
                      :details {:archived false :name "Subscription" :dashboard_id dashboard-id :parameters []
                                :channel ["email"] :schedule ["daily"] :recipients [[]]}}]
                    (rows-since before))))
          (testing "changing the pulse, its channels and their recipients stores one row"
            (let [before (max-id)]
              (mt/user-http-request :rasta :put 200 (str "pulse/" pulse-id)
                                    {:name "Renamed"
                                     :channels [(assoc email-channel :schedule_hour 8
                                                       :recipients [{:id (mt/user->id :crowberto)}])]})
              (is (=? [{:topic :subscription-update :model "Pulse" :model_id pulse-id :user_id rasta
                        :details {:name "Renamed" :channel ["email"] :schedule ["daily"]}}]
                      (rows-since before)))))
          (testing "changing only the channels stores one row"
            (let [before (max-id)]
              (mt/user-http-request :rasta :put 200 (str "pulse/" pulse-id)
                                    {:channels [(assoc email-channel :schedule_hour 9
                                                       :recipients [{:id (mt/user->id :crowberto)}])]})
              (is (= [:subscription-update] (map :topic (rows-since before))))))
          (testing "changing only the recipients stores one row"
            (let [before (max-id)]
              (mt/user-http-request :rasta :put 200 (str "pulse/" pulse-id)
                                    {:channels [(assoc email-channel :schedule_hour 9
                                                       :recipients [{:id (mt/user->id :rasta)}])]})
              (is (= [:subscription-update] (map :topic (rows-since before))))))
          (testing "archiving stores one row"
            (let [before (max-id)]
              (mt/user-http-request :rasta :put 200 (str "pulse/" pulse-id) {:archived true})
              (is (= [:subscription-update] (map :topic (rows-since before)))))))))))

(deftest creating-legacy-pulse-records-pulse-create-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Card {card-id :id} {:name "Pulsed card"}]
      (mt/with-model-cleanup [:model/Pulse]
        (let [before (max-id)
              pulse  (mt/user-http-request :rasta :post 200 "pulse"
                                           {:name "Legacy" :cards [{:id card-id :include_csv false :include_xls false
                                                                    :dashboard_card_id nil}]
                                            :channels [email-channel] :skip_if_empty false})]
          (is (=? [{:topic :pulse-create :model "Pulse" :model_id (:id pulse) :user_id (mt/user->id :rasta)}]
                  (rows-since before))))))))

(deftest updating-subscription-records-subscription-update-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/Card {card-id :id} {:name "Subscribed card"}
                   :model/Dashboard {dashboard-id :id} {:name "Dashboard"}
                   :model/Pulse {pulse-id :id} {:dashboard_id dashboard-id :name "Dashboard" :creator_id (mt/user->id :rasta)}
                   :model/PulseCard _ {:pulse_id pulse-id :card_id card-id :position 0}
                   :model/PulseChannel _ {:pulse_id pulse-id :channel_type :email :schedule_type :daily :schedule_hour 1}]
      (let [before (max-id)]
        (mt/user-http-request :rasta :put 200 (str "pulse/" pulse-id) {:name "Renamed"})
        (is (=? [{:topic :subscription-update :model "Pulse" :model_id pulse-id :user_id (mt/user->id :rasta)
                  :details {:name "Renamed" :dashboard_id dashboard-id :channel ["email"]}}]
                (rows-since before)))))))

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

(deftest leaving-subscription-records-nothing-test
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
