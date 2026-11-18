(ns metabase.pulse.broken-subscriptions-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.broken-subscriptions :as pulse.broken-subscriptions]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest broken-subscription-data-logic-test
  (testing "Ensure underlying logic of fixing broken pulses works (#30100)"
    (let [{param-id :id :as param} {:name "Source"
                                    :slug "source"
                                    :id   "_SOURCE_PARAM_ID_"
                                    :type :string/=}]
      (mt/dataset test-data
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
                      [{:name "Source" :slug "source" :id "_SOURCE_PARAM_ID_" :type :string/= :value ["Twitter" "Facebook"]}]
                      :dashboard_id dash-id}
                     {:archived     false
                      :name         "Bad Slack Pulse"
                      :creator_id   (mt/user->id :trashbird)
                      :id           bad-slack-pulse-id
                      :parameters   [{:name  "Source"
                                      :slug  "source"
                                      :id    "_SOURCE_PARAM_ID_"
                                      :type  :string/=
                                      :value ["LinkedIn"]}],
                      :dashboard_id dash-id}]
                    ;; `broken-pulses` doesn't order its results, so sort them for a stable comparison
                    (sort-by :id (#'pulse.broken-subscriptions/broken-pulses dash-id {param-id param})))))
          (testing "We can gather all needed data regarding broken params"
            (let [bad-pulses    (mapv
                                 #(update % :affected-users (partial sort-by :email))
                                 (sort-by :pulse-id (#'pulse.broken-subscriptions/broken-subscription-data dash-id {param-id param})))
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
                                             :type  :string/=
                                             :value ["LinkedIn"]}]
                        :dashboard-name    "My Awesome Dashboard"}]
                      bad-pulses))))
          (testing "Pulse can be archived"
            (testing "Pulse starts as unarchived"
              (is (false? (:archived bad-pulse))))
            (testing "Pulse is now archived"
              (is (true? (:archived (models.pulse/update-pulse! {:id bad-pulse-id :archived true})))))))))))

(deftest handle-broken-subscriptions-returns-what-it-archived-test
  (testing "the handler archives each broken subscription and returns what a caller may report about it, counting
            the active destinations of enabled channels"
    (mt/with-fake-inbox
      (mt/with-temp [:model/User                {former-id :id}    {:is_active false}
                     :model/Channel             {webhook-id :id}   {:type    :channel/http
                                                                    :details {:url         "https://example.com/hook"
                                                                              :auth-method "none"}}
                     :model/Dashboard           {dash-id :id}      {:name       "Sales"
                                                                    :parameters [{:id "kept", :name "Kept", :slug "kept"
                                                                                  :type "category"}]}
                     :model/Pulse               {removed-id :id}   {:name         "Removed filter"
                                                                    :dashboard_id dash-id
                                                                    :creator_id   (mt/user->id :rasta)
                                                                    :parameters   [{:id "gone", :name "Gone"
                                                                                    :value ["secret"]}]}
                     :model/PulseChannel        {channel-id :id}   {:channel_type :email
                                                                    :pulse_id     removed-id
                                                                    :details      {:emails ["outside@example.com"]}
                                                                    :enabled      true}
                     :model/PulseChannelRecipient _                {:pulse_channel_id channel-id
                                                                    :user_id          (mt/user->id :crowberto)}
                     ;; A deactivated user gets no email, so isn't counted.
                     :model/PulseChannelRecipient _                {:pulse_channel_id channel-id
                                                                    :user_id          former-id}
                     :model/Pulse               {stale-id :id}     {:name         "Stale filter"
                                                                    :dashboard_id dash-id
                                                                    :creator_id   (mt/user->id :rasta)
                                                                    :parameters   [{:id "stale", :name "Stale"
                                                                                    :value ["x"]}]}
                     :model/PulseChannel        _                  {:channel_type :http
                                                                    :pulse_id     stale-id
                                                                    :channel_id   webhook-id
                                                                    :enabled      true}
                     ;; Neither of these delivers: one is disabled, and the webhook has no channel.
                     :model/PulseChannel        _                  {:channel_type :slack
                                                                    :pulse_id     stale-id
                                                                    :details      {:channel "#sales"}
                                                                    :enabled      false}
                     :model/PulseChannel        _                  {:channel_type :http
                                                                    :pulse_id     removed-id
                                                                    :enabled      true}]
        (is (= [{:id              removed-id
                 :creator-name    "Rasta Toucan"
                 :parameters      [{:id "gone", :name "Gone"}]
                 :channels        [:email]
                 :recipient-count 2
                 :already-broken? false
                 :readable?       true}
                {:id              stale-id
                 :creator-name    "Rasta Toucan"
                 :parameters      [{:id "stale", :name "Stale"}]
                 :channels        [:http]
                 :recipient-count 1
                 :already-broken? true
                 :readable?       true}]
               (sort-by :id (mt/with-current-user (mt/user->id :rasta)
                              (pulse.broken-subscriptions/handle-broken-subscriptions!
                               dash-id
                               {"kept" {:id "kept"}, "gone" {:id "gone"}})))))
        (is (= #{removed-id stale-id}
               (t2/select-pks-set :model/Pulse :dashboard_id dash-id :archived true)))))))
