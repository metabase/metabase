(ns metabase-enterprise.representations.v0.pulse-test
  (:require
   [clj-yaml.core :as yaml]
   [clojure.test :refer :all]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest representation-type-test
  (mt/with-temp [:model/Pulse pulse {}]
    (is (= :pulse (v0-common/representation-type pulse)))))

(deftest export-pulse-with-cards-and-channels-test
  (mt/with-temp [:model/Card card {:name "Test Card"}
                 :model/Pulse pulse {:name "Test Pulse"
                                     :skip_if_empty true
                                     :archived false}
                 :model/PulseCard _pulse-card {:pulse_id (:id pulse)
                                               :card_id (:id card)
                                               :position 0
                                               :include_csv false
                                               :include_xls false}
                 :model/PulseChannel pulse-channel {:pulse_id (:id pulse)
                                                    :channel_type "email"
                                                    :enabled true
                                                    :schedule_type "daily"
                                                    :schedule_hour 9
                                                    :details {:emails ["test@example.com"]}}
                 :model/User user {:email "recipient@example.com"
                                   :first_name "Test"
                                   :last_name "User"}
                 :model/PulseChannelRecipient _recipient {:pulse_channel_id (:id pulse-channel)
                                                          :user_id (:id user)}]
    (let [exported (export/export-entity pulse)
          imported (import/yaml->toucan exported nil)]
      (testing "exported pulse validates against schema"
        (let [yaml-str (yaml/generate-string exported)
              rep (yaml/parse-string yaml-str)]
          (is (rep-read/parse rep))))
      (testing "exporting a pulse works"
        (is (= :pulse (:type exported)))
        (is (= :v0 (:version exported)))
        (is (= "Test Pulse" (:display_name exported)))
        (is (true? (:skip_if_empty exported)))
        (is (= false (:archived exported)))
        (is (= 1 (count (:cards exported))))
        (is (= 1 (count (:channels exported))))
        (let [exported-card (first (:cards exported))
              exported-channel (first (:channels exported))]
          (is (= (:id card) (:card_id exported-card)))
          (is (= 0 (:position exported-card)))
          (is (= "email" (:channel_type exported-channel)))
          (is (true? (:enabled exported-channel)))
          (is (= "daily" (:schedule_type exported-channel)))
          (is (= 9 (:schedule_hour exported-channel)))))
      (testing "importing an exported pulse back works"
        (is (= "Test Pulse" (:name imported)))
        (is (true? (:skip_if_empty imported)))
        (is (= false (:archived imported)))
        (is (= 1 (count (:cards imported))))
        (is (= 1 (count (:channels imported)))))
      (testing "inserting and updating an exported pulse works"
        (let [inserted-pulse (import/insert! exported nil)
              inserted-id (:id inserted-pulse)
              fetched-pulse (t2/select-one :model/Pulse :id inserted-id)
              fetched-cards (t2/select :model/PulseCard :pulse_id inserted-id)
              fetched-channels (t2/hydrate (t2/select :model/PulseChannel :pulse_id inserted-id) :recipients)]
          (is (= (assoc fetched-pulse :cards fetched-cards :channels fetched-channels)
                 inserted-pulse))
          (let [new-cards [(assoc (first (:cards exported)) :include_csv true)]
                new-pulse (-> exported
                              (assoc :display_name "Updated Pulse Name")
                              (assoc :cards new-cards))
                updated-pulse (import/update! new-pulse inserted-id nil)
                updated-fetched (t2/select-one :model/Pulse :id inserted-id)
                updated-cards (t2/select :model/PulseCard :pulse_id inserted-id)
                updated-channels (t2/hydrate (t2/select :model/PulseChannel :pulse_id inserted-id) :recipients)]
            (is (= "Updated Pulse Name" (:name updated-fetched)))
            (is (= (assoc updated-fetched :cards updated-cards :channels updated-channels)
                   updated-pulse)))
          (t2/delete! :model/Pulse :id inserted-id))))))

(deftest export-dashboard-subscription-test
  (mt/with-temp [:model/Dashboard dashboard {:name "Test Dashboard"}
                 :model/Card card {:name "Dashboard Card"}
                 :model/DashboardCard dashboard-card {:dashboard_id (:id dashboard)
                                                      :card_id (:id card)}
                 :model/Pulse pulse {:name "Dashboard Subscription"
                                     :dashboard_id (:id dashboard)
                                     :skip_if_empty false
                                     :archived false}
                 :model/PulseCard _pulse-card {:pulse_id (:id pulse)
                                               :card_id (:id card)
                                               :dashboard_card_id (:id dashboard-card)
                                               :position 0}
                 :model/PulseChannel _pulse-channel {:pulse_id (:id pulse)
                                                     :channel_type "slack"
                                                     :enabled true
                                                     :schedule_type "weekly"
                                                     :schedule_day "monday"
                                                     :schedule_hour 10
                                                     :details {:channel "#general"}}]
    (let [exported (export/export-entity pulse)]
      (testing "exported dashboard subscription has dashboard reference"
        (is (= :pulse (:type exported)))
        (is (= (:id dashboard) (:dashboard_id exported)))
        (is (= 1 (count (:cards exported))))
        (is (= (:id dashboard-card) (:dashboard_card_id (first (:cards exported)))))
        (is (= 1 (count (:channels exported))))
        (let [exported-channel (first (:channels exported))]
          (is (= "slack" (:channel_type exported-channel)))
          (is (= "weekly" (:schedule_type exported-channel)))
          (is (= "monday" (:schedule_day exported-channel)))
          (is (= 10 (:schedule_hour exported-channel))))))))
