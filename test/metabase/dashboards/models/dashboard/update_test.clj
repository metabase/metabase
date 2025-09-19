(ns metabase.dashboards.models.dashboard.update-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.models.dashboard.update :as dashboard.update]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.test :as mt]))

(deftest broken-subscription-data-logic-test
  (testing "Ensure underlying logic of fixing broken pulses works (#30100)"
    (let [{param-id :id :as param} {:name "Source"
                                    :slug "source"
                                    :id   "_SOURCE_PARAM_ID_"
                                    :type :string/=}]
      (mt/with-temp
        [:model/Card {card-id :id} {:name          "Native card"
                                    :database_id   (mt/id)
                                    :dataset_query {:database (mt/id)
                                                    :type     :query
                                                    :query    {:source-table (mt/id :people)}}
                                    :type          :model}
         :model/Dashboard {dash-id :id} {:name "My Awesome Dashboard"}
         :model/DashboardCard {dash-card-id :id} {:dashboard_id dash-id
                                                  :card_id      card-id}
         ;; Broken pulse
         :model/Pulse {bad-pulse-id :id
                       :as          bad-pulse} {:name         "Bad Pulse"
                       :dashboard_id dash-id
                       :creator_id   (mt/user->id :trashbird)
                       :parameters   [(assoc param :value ["Twitter", "Facebook"])]}
         :model/PulseCard _ {:pulse_id          bad-pulse-id
                             :card_id           card-id
                             :dashboard_card_id dash-card-id}
         :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                     :pulse_id     bad-pulse-id
                                                     :enabled      true}
         :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                         :user_id          (mt/user->id :rasta)}
         :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                         :user_id          (mt/user->id :crowberto)}
         ;; Broken slack pulse
         :model/Pulse {bad-slack-pulse-id :id} {:name         "Bad Slack Pulse"
                                                :dashboard_id dash-id
                                                :creator_id   (mt/user->id :trashbird)
                                                :parameters   [(assoc param :value ["LinkedIn"])]}
         :model/PulseCard _ {:pulse_id          bad-slack-pulse-id
                             :card_id           card-id
                             :dashboard_card_id dash-card-id}
         :model/PulseChannel _ {:channel_type :slack
                                :pulse_id     bad-slack-pulse-id
                                :details      {:channel "#my-channel"}
                                :enabled      true}
         ;; Non broken pulse
         :model/Pulse {good-pulse-id :id} {:name         "Good Pulse"
                                           :dashboard_id dash-id
                                           :creator_id   (mt/user->id :trashbird)}
         :model/PulseCard _ {:pulse_id          good-pulse-id
                             :card_id           card-id
                             :dashboard_card_id dash-card-id}
         :model/PulseChannel {good-pulse-channel-id :id} {:channel_type :email
                                                          :pulse_id     good-pulse-id
                                                          :enabled      true}
         :model/PulseChannelRecipient _ {:pulse_channel_id good-pulse-channel-id
                                         :user_id          (mt/user->id :rasta)}
         :model/PulseChannelRecipient _ {:pulse_channel_id good-pulse-channel-id
                                         :user_id          (mt/user->id :crowberto)}]
        (testing "We can identify the broken parameter ids"
          (is (=? [{:archived     false
                    :name         "Bad Pulse"
                    :creator_id   (mt/user->id :trashbird)
                    :id           bad-pulse-id
                    :parameters
                    [{:name "Source" :slug "source" :id "_SOURCE_PARAM_ID_" :type "string/=" :value ["Twitter" "Facebook"]}]
                    :dashboard_id dash-id}
                   {:archived     false
                    :name         "Bad Slack Pulse"
                    :creator_id   (mt/user->id :trashbird)
                    :id           bad-slack-pulse-id
                    :parameters   [{:name  "Source"
                                    :slug  "source"
                                    :id    "_SOURCE_PARAM_ID_"
                                    :type  "string/="
                                    :value ["LinkedIn"]}],
                    :dashboard_id dash-id}]
                  (#'dashboard.update/broken-pulses dash-id {param-id param}))))
        (testing "We can gather all needed data regarding broken params"
          (let [bad-pulses    (mapv
                               #(update % :affected-users (partial sort-by :email))
                               (#'dashboard.update/broken-subscription-data dash-id {param-id param}))
                bad-pulse-ids (set (map :pulse-id bad-pulses))]
            (testing "We only detect the bad pulse and not the good one"
              (is (true? (contains? bad-pulse-ids bad-pulse-id)))
              (is (false? (contains? bad-pulse-ids good-pulse-id))))
            (is (=? [{:pulse-creator     {:email "trashbird@metabase.com"}
                      :dashboard-creator {:email "rasta@metabase.com"}
                      :pulse-id          bad-pulse-id
                      :pulse-name        "Bad Pulse"
                      :dashboard-id      dash-id
                      :bad-parameters    [{:name "Source" :value ["Twitter" "Facebook"]}]
                      :dashboard-name    "My Awesome Dashboard"
                      :affected-users    [{:notification-type :email
                                           :recipient         "Crowberto Corv"}
                                          {:notification-type :email
                                           :recipient         "Rasta Toucan"}]}
                     {:pulse-creator     {:email "trashbird@metabase.com"}
                      :affected-users    [{:notification-type :slack
                                           :recipient         "#my-channel"}]
                      :dashboard-creator {:email "rasta@metabase.com"}
                      :pulse-id          bad-slack-pulse-id
                      :pulse-name        "Bad Slack Pulse"
                      :dashboard-id      dash-id
                      :bad-parameters    [{:name  "Source"
                                           :slug  "source"
                                           :id    "_SOURCE_PARAM_ID_"
                                           :type  "string/="
                                           :value ["LinkedIn"]}]
                      :dashboard-name    "My Awesome Dashboard"}]
                    bad-pulses))))
        (testing "Pulse can be archived"
          (testing "Pulse starts as unarchived"
            (is (false? (:archived bad-pulse))))
          (testing "Pulse is now archived"
            (is (true? (:archived (models.pulse/update-pulse! {:id bad-pulse-id :archived true}))))))))))
