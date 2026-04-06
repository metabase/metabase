(ns metabase.metabot.tools.subscriptions-test
  "Tests for the create_dashboard_subscription agent tool wrapper."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.tools.subscriptions :as agent-subscriptions]
   [metabase.test :as mt]))

;;; ------------------------------------------ schema / metadata tests -----------------------------------------------

(deftest create-dashboard-subscription-tool-schema-test
  (let [m (meta #'agent-subscriptions/create-dashboard-subscription-tool)]
    (testing "tool has correct :tool-name"
      (is (= "create_dashboard_subscription" (:tool-name m))))

    (testing "tool var has expected metadata"
      (is (some? (:schema m)))
      (is (string? (:doc m))))))

;;; --------------------------------------- integration tests (with-temp) -------------------------------------------

(deftest create-dashboard-subscription-happy-path-test
  (testing "valid dashboard, valid user email, valid schedule → success"
    (let [captured-args (atom nil)]
      (with-redefs [agent-subscriptions/create-dashboard-subscription
                    (fn [args] (reset! captured-args args) {:output "success"})]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Test Dashboard"}]
            (let [email  (:email (mt/fetch-user :crowberto))
                  result (agent-subscriptions/create-dashboard-subscription-tool
                          {:dashboard_id dash-id
                           :email        email
                           :schedule     {:frequency "daily" :hour 9}})]
              (is (= "success" (:output result)))
              (is (= email (:email @captured-args)))
              (is (= dash-id (:dashboard-id @captured-args))))))))))

(deftest create-dashboard-subscription-invalid-dashboard-id-test
  (testing "nonexistent dashboard_id → error about missing dashboard"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [result (agent-subscriptions/create-dashboard-subscription-tool
                    {:dashboard_id 0
                     :email        "nobody@example.com"
                     :schedule     {:frequency "daily"}})]
        ;; dashboard_id 0 is int but won't match any dashboard
        (is (string? (:error result)))))))

(deftest create-dashboard-subscription-unknown-email-test
  (testing "unknown email → 'no user with this email found'"
    (with-redefs [agent-subscriptions/create-dashboard-subscription
                  (fn [{:keys [email]}]
                    (if (= email "nonexistent-user@example.com")
                      {:output "no user with this email found"}
                      {:output "success"}))]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Test Dashboard"}]
          (let [result (agent-subscriptions/create-dashboard-subscription-tool
                        {:dashboard_id dash-id
                         :email        "nonexistent-user@example.com"
                         :schedule     {:frequency "daily" :hour 9}})]
            (is (= "no user with this email found" (:output result)))))))))

(deftest create-dashboard-subscription-nonexistent-dashboard-test
  (testing "nonexistent dashboard → 404 or error message"
    (with-redefs [agent-subscriptions/create-dashboard-subscription
                  (fn [{:keys [dashboard-id]}]
                    (if (= dashboard-id 999999)
                      {:output "no dashboard with this dashboard_id found"}
                      {:output "success"}))]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (agent-subscriptions/create-dashboard-subscription-tool
                      {:dashboard_id 999999
                       :email        (:email (mt/fetch-user :crowberto))
                       :schedule     {:frequency "daily" :hour 9}})]
          (is (= "no dashboard with this dashboard_id found" (:output result))))))))

(deftest create-dashboard-subscription-schedule-keywords-test
  (testing "schedule keywords are converted from snake_case to kebab-case"
    (let [captured-args (atom nil)]
      (with-redefs [agent-subscriptions/create-dashboard-subscription
                    (fn [args] (reset! captured-args args) {:output "success"})]
        (mt/with-current-user (mt/user->id :crowberto)
          (agent-subscriptions/create-dashboard-subscription-tool
           {:dashboard_id 1
            :email        "test@example.com"
            :schedule     {:frequency    "weekly"
                           :hour         9
                           :day_of_week  "monday"
                           :day_of_month "first-mon"}}))
        (let [{:keys [schedule]} @captured-args]
          (is (= :weekly (:frequency schedule)))
          (is (= :monday (:day-of-week schedule)))
          (is (= :first-mon (:day-of-month schedule)))
          (is (= 9 (:hour schedule)))
          ;; snake_case keys should be absent
          (is (nil? (:day_of_week schedule)))
          (is (nil? (:day_of_month schedule))))))))

;;; ---------------------------------------- Slack integration tests --------------------------------------------------

(deftest create-dashboard-subscription-slack-happy-path-test
  (testing "valid dashboard, Slack channel, daily schedule → success"
    (mt/with-model-cleanup [:model/Pulse]
      (with-redefs [channel.settings/slack-configured?                       (constantly true)
                    channel.settings/slack-cached-channels-and-usernames
                    (constantly {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/Dashboard     {dash-id :id}  {:name "Test Dashboard"}
                         :model/Card          {card-id :id}  {}
                         :model/DashboardCard _               {:dashboard_id dash-id
                                                               :card_id      card-id
                                                               :row          0
                                                               :col          0}]
            (let [result (agent-subscriptions/create-dashboard-subscription-tool
                          {:dashboard_id  dash-id
                           :slack_channel "data-team"
                           :schedule      {:frequency "daily" :hour 9}})]
              (is (= {:output "success"} result)))))))))

(deftest create-dashboard-subscription-slack-monthly-schedule-test
  (testing "Slack subscription with monthly schedule → success"
    (mt/with-model-cleanup [:model/Pulse]
      (with-redefs [channel.settings/slack-configured?                       (constantly true)
                    channel.settings/slack-cached-channels-and-usernames
                    (constantly {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/Dashboard     {dash-id :id}  {:name "Test Dashboard"}
                         :model/Card          {card-id :id}  {}
                         :model/DashboardCard _               {:dashboard_id dash-id
                                                               :card_id      card-id
                                                               :row          0
                                                               :col          0}]
            (let [result (agent-subscriptions/create-dashboard-subscription-tool
                          {:dashboard_id  dash-id
                           :slack_channel "data-team"
                           :schedule      {:frequency    "monthly"
                                           :day_of_month "last-sunday"
                                           :hour         7}})]
              (is (= {:output "success"} result)))))))))

(deftest create-dashboard-subscription-slack-required-test
  (testing "empty slack_channel → error"
    (with-redefs [channel.settings/slack-configured? (constantly true)]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Test Dashboard"}]
          (let [result (agent-subscriptions/create-dashboard-subscription-tool
                        {:dashboard_id  dash-id
                         :slack_channel ""
                         :schedule      {:frequency "daily" :hour 9}})]
            (is (= {:error "slack_channel is required"} result))))))))

(deftest create-dashboard-subscription-slack-not-configured-test
  (testing "Slack not configured → error"
    (with-redefs [channel.settings/slack-configured? (constantly false)]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Test Dashboard"}]
          (let [result (agent-subscriptions/create-dashboard-subscription-tool
                        {:dashboard_id  dash-id
                         :slack_channel "data-team"
                         :schedule      {:frequency "daily" :hour 9}})]
            (is (= {:error "slack is not configured. Ask an admin to connect slack in Metabase settings."}
                   result))))))))

(deftest create-dashboard-subscription-slack-channel-not-found-test
  (testing "nonexistent Slack channel → error"
    (with-redefs [channel.settings/slack-configured?                       (constantly true)
                  channel.settings/slack-cached-channels-and-usernames (constantly {:channels []})]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Dashboard     {dash-id :id}  {:name "Test Dashboard"}
                       :model/Card          {card-id :id}  {}
                       :model/DashboardCard _               {:dashboard_id dash-id
                                                             :card_id      card-id
                                                             :row          0
                                                             :col          0}]
          (let [result (agent-subscriptions/create-dashboard-subscription-tool
                        {:dashboard_id  dash-id
                         :slack_channel "no-such-channel"
                         :schedule      {:frequency "daily" :hour 9}})]
            (is (= {:error "no slack channel found with this name"} result))))))))
