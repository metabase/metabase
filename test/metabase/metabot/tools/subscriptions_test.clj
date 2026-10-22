(ns metabase.metabot.tools.subscriptions-test
  "Tests for the create_dashboard_subscription agent tool wrapper."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools.subscriptions :as agent-subscriptions]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
      (mt/with-dynamic-fn-redefs [agent-subscriptions/create-dashboard-subscription
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
                     :schedule     {:frequency "daily" :hour 9}})]
        ;; dashboard_id 0 is int but won't match any dashboard
        (is (string? (:output result)))))))

(deftest create-dashboard-subscription-unknown-email-test
  (testing "unknown email → 'no user with this email found'"
    (mt/with-dynamic-fn-redefs [agent-subscriptions/create-dashboard-subscription
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
    (mt/with-dynamic-fn-redefs [agent-subscriptions/create-dashboard-subscription
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

(deftest ^:parallel create-dashboard-subscription-unknown-day-of-week-test
  (testing "a day_of_week outside the listed days is rejected at argument validation"
    (is (=? #"Invalid tool arguments: `schedule` .*should be either \"sunday\".*"
            (test-util/tool-boundary-error "create_dashboard_subscription"
                                           #'agent-subscriptions/create-dashboard-subscription-tool
                                           {:dashboard_id  1
                                            :slack_channel "data-team"
                                            :schedule      {:frequency "weekly" :day_of_week "mo" :hour 9}})))))

;;; ---------------------------------------- Slack integration tests --------------------------------------------------

(deftest create-dashboard-subscription-slack-happy-path-test
  (testing "valid dashboard, Slack channel, daily schedule → success"
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                       (constantly true)
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
  (testing "Slack subscription with monthly schedule → success, stored with the requested schedule"
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                       (constantly true)
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
              (is (= {:output "success"} result))
              (is (=? [{:schedule_type  :monthly
                        :schedule_hour  7
                        :schedule_day   "sun"
                        :schedule_frame :last}]
                      (t2/select :model/PulseChannel :pulse_id (t2/select-one-pk :model/Pulse :dashboard_id dash-id)))))))))))

(deftest create-dashboard-subscription-slack-required-test
  (testing "empty slack_channel → error"
    (mt/with-dynamic-fn-redefs [channel.settings/slack-configured? (constantly true)]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Test Dashboard"}]
          (let [result (agent-subscriptions/create-dashboard-subscription-tool
                        {:dashboard_id  dash-id
                         :slack_channel ""
                         :schedule      {:frequency "daily" :hour 9}})]
            (is (= {:output "slack_channel is required"} result))))))))

(deftest create-dashboard-subscription-slack-not-configured-test
  (testing "Slack not configured → error"
    (mt/with-dynamic-fn-redefs [channel.settings/slack-configured? (constantly false)]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Test Dashboard"}]
          (let [result (agent-subscriptions/create-dashboard-subscription-tool
                        {:dashboard_id  dash-id
                         :slack_channel "data-team"
                         :schedule      {:frequency "daily" :hour 9}})]
            (is (= {:output "slack is not configured. Ask an admin to connect slack in Metabase settings."}
                   result))))))))

(deftest create-dashboard-subscription-slack-channel-not-found-test
  (testing "nonexistent Slack channel → error"
    (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                       (constantly true)
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
            (is (= {:output "no slack channel found with this name"} result))))))))

(deftest create-dashboard-subscription-tool-errors-test
  (let [subscribe! #(agent-subscriptions/create-dashboard-subscription-tool
                     {:dashboard_id  %
                      :slack_channel "data-team"
                      :schedule      {:frequency "daily" :hour 9}})]
    (testing "a dashboard the user can't read goes back to the agent as output"
      (mt/with-dynamic-fn-redefs [channel.settings/slack-configured? (constantly true)]
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Dashboard {dash-id :id} {}]
            (mt/with-current-user (mt/user->id :rasta)
              (is (= "You don't have permissions to do that."
                     (:output (subscribe! dash-id)))))))))
    (testing "an unexpected error propagates to the agent loop"
      (mt/with-dynamic-fn-redefs [agent-subscriptions/create-dashboard-subscription
                                  (fn [_] (throw (ex-info "boom" {})))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom" (subscribe! 1)))))))
