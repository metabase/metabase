(ns metabase-enterprise.metabot-v3.tools.create-dashboard-subscription-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription
    :as metabot-v3.tools.create-dashboard-subscription]
   [metabase.channel.settings :as channel.settings]
   [metabase.test :as mt]))

(deftest create-dashboard-subscription-test
  (mt/with-model-cleanup [:model/Pulse]
    (mt/with-temp [:model/User          {:keys [email] user-id :id} {:email "email@example.com"}
                   :model/Collection    {collection-id :id} {}
                   :model/Dashboard     {dashboard-id :id} {:collection_id collection-id}
                   :model/Card          {card-id-0 :id} {}
                   :model/DashboardTab  {dashboard-tab-id-0 :id} {:dashboard_id dashboard-id
                                                                  :position 0}
                   :model/DashboardCard _normal-dashcard-0 {:dashboard_id dashboard-id
                                                            :card_id card-id-0
                                                            :dashboard_tab_id dashboard-tab-id-0
                                                            :row 1
                                                            :col 0}
                   :model/Card          {card-id-1 :id} {}
                   :model/DashboardTab  {dashboard-tab-id-1 :id} {:dashboard_id dashboard-id
                                                                  :position 1}
                   :model/DashboardCard _normal-dashcard-1 {:dashboard_id dashboard-id
                                                            :card_id card-id-1
                                                            :dashboard_tab_id dashboard-tab-id-1
                                                            :row 2
                                                            :col 3}
                   :model/DashboardCard _cardless-dashcard {:dashboard_id dashboard-id
                                                            :dashboard_tab_id dashboard-tab-id-0
                                                            :row 0
                                                            :col 0}]
      (let [invoke-tool #(mt/with-current-user user-id
                           (metabot-v3.tools.create-dashboard-subscription/create-dashboard-subscription %))
            base-data {:dashboard-id dashboard-id
                       :email email
                       :schedule {:frequency "monthly"
                                  :day-of-month "last-sunday"
                                  :hour 7}}
            fake-channels {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]}]
        (with-redefs [channel.settings/email-configured? (constantly true)
                      channel.settings/slack-configured? (constantly true)
                      channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
          (testing "Email subscription can be created"
            (is (= {:output "success"}
                   (invoke-tool base-data))))
          (testing "Email subscription can be created with explicit channel-type"
            (is (= {:output "success"}
                   (invoke-tool (assoc base-data :channel-type :email)))))
          (testing "Return an error message if the user cannot be found"
            (is (= {:error "no user with this email found"}
                   (invoke-tool (update base-data :email str ".hu")))))
          (testing "Return an error message if the dashboard-id is invalid"
            (is (= {:error "invalid dashboard_id"}
                   (invoke-tool (update base-data :dashboard-id str)))))
          (testing "Return an error message if the dashboard cannot be found"
            (is (= {:error "no dashboard with this dashboard_id found"}
                   (invoke-tool (update base-data :dashboard-id -)))))
          (testing "Slack subscription can be created"
            (is (= {:output "success"}
                   (invoke-tool {:dashboard-id dashboard-id
                                 :channel-type :slack
                                 :slack-channel "data-team"
                                 :schedule {:frequency :daily
                                            :hour 9}}))))
          (testing "Slack subscription requires slack-channel"
            (is (= {:error "slack_channel is required when channel_type is slack"}
                   (invoke-tool {:dashboard-id dashboard-id
                                 :channel-type :slack
                                 :schedule {:frequency :daily
                                            :hour 9}})))))
        (testing "Email subscription fails when email is not configured"
          (with-redefs [channel.settings/email-configured? (constantly false)]
            (is (= {:error "email is not configured. Ask an admin to set up email in Metabase settings."}
                   (invoke-tool base-data)))))
        (testing "Slack subscription fails when Slack is not configured"
          (with-redefs [channel.settings/slack-configured? (constantly false)]
            (is (= {:error "slack is not configured. Ask an admin to connect slack in Metabase settings."}
                   (invoke-tool {:dashboard-id dashboard-id
                                 :channel-type :slack
                                 :slack-channel "data-team"
                                 :schedule {:frequency :daily
                                            :hour 9}})))))
        (testing "Slack subscription fails when channel does not exist"
          (with-redefs [channel.settings/slack-configured? (constantly true)
                        channel.settings/slack-cached-channels-and-usernames (constantly {:channels []})]
            (is (= {:error "no slack channel found with this name"}
                   (invoke-tool {:dashboard-id dashboard-id
                                 :channel-type :slack
                                 :slack-channel "no-such-channel"
                                 :schedule {:frequency :daily
                                            :hour 9}})))))))))
