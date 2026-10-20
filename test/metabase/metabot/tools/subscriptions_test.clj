(ns metabase.metabot.tools.subscriptions-test
  "Tests for the Chat profile's `create_dashboard_subscription`, and the subscription code that it shares with the
  Slack profile's."
  (:require
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.create-alert :as tools.create-alert]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.metabot.tools.subscriptions :as agent-subscriptions]
   [metabase.pulse.api :as pulse.api]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private fake-channels
  {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})

(defn- subscribe
  "Call the Chat profile's `create_dashboard_subscription` the way the agent loop does, and return the outcome."
  [args]
  (tools.runtime/invoke (tools.core/entries [agent-subscriptions/create-dashboard-subscription-tool])
                        {:profile-id :internal
                         :metabot    nil
                         :user-scope api-scope/unrestricted
                         :tool-names #{"create_dashboard_subscription" "search"}}
                        "create_dashboard_subscription"
                        args))

(defn- daily [dashboard-id slack-channel]
  {:dashboard_id dashboard-id :slack_channel slack-channel :schedule {:frequency "daily" :hour 9}})

(deftest ^:parallel arguments-test
  (testing "a day_of_week outside the listed days is rejected at argument validation"
    (is (=? #"Invalid tool arguments: `schedule` .*should be either \"sunday\".*"
            (test-util/tool-boundary-error "create_dashboard_subscription"
                                           #'agent-subscriptions/create-dashboard-subscription-tool
                                           {:dashboard_id  1
                                            :slack_channel "data-team"
                                            :schedule      {:frequency "weekly" :day_of_week "mo" :hour 9}}))))
  (testing "Slack is the only delivery, so the channel is required"
    (is (= "Invalid tool arguments: `slack_channel` is required."
           (test-util/tool-boundary-error "create_dashboard_subscription"
                                          #'agent-subscriptions/create-dashboard-subscription-tool
                                          {:dashboard_id 1 :schedule {:frequency "daily" :hour 9}})))))

(deftest subscribes-a-slack-channel-test
  (mt/with-model-cleanup [:model/Pulse]
    (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                  (constantly true)
                                channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Sales"}
                       :model/Card          {card-id :id} {}
                       :model/DashboardCard _             {:dashboard_id dash-id :card_id card-id}]
          (let [{:keys [output error]} (subscribe (assoc (daily dash-id "#data-team")
                                                         :schedule {:frequency    "monthly"
                                                                    :day_of_month "last-sunday"
                                                                    :hour         7}))
                pulse                  (t2/select-one :model/Pulse :dashboard_id dash-id)]
            (is (nil? error))
            (testing "the model reads what it created"
              (is (= (str "Created subscription " (:id pulse) " to dashboard \"Sales\" (id " dash-id
                          "), posting to #data-team.")
                     output)))
            (testing "and it posts to that channel on the requested schedule"
              (is (=? [{:channel_type   :slack
                        :details        {:channel "#data-team"}
                        :schedule_type  :monthly
                        :schedule_hour  7
                        :schedule_day   "sun"
                        :schedule_frame :last}]
                      (t2/select :model/PulseChannel :pulse_id (:id pulse)))))))))))

(deftest unknown-slack-channel-test
  (testing "a channel that Metabase has never seen is for the model to sort out with the user"
    (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                  (constantly true)
                                channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Dashboard {dash-id :id} {}]
          (is (= {:output (str "Metabase can't post to \"data team\": it isn't a Slack channel or user that "
                               "Metabase knows about. Metabase knows public channels, private channels that the "
                               "Metabase app has been added to, and users. A channel created in the last few hours "
                               "may not be there yet.\n"
                               "Ask the user for the channel's exact name, as it appears in Slack.")
                  :error  {:class :recoverable :code ::agent-subscriptions/unknown-slack-channel}}
                 (subscribe (daily dash-id "data team")))))))))

(deftest slack-not-connected-test
  (mt/with-dynamic-fn-redefs [channel.settings/slack-configured? (constantly false)]
    (mt/with-current-user (mt/user->id :crowberto)
      (is (= {:class        :unrecoverable
              :code         ::tools.create-alert/slack-not-configured
              :user-message "Slack isn't connected to Metabase. An admin can connect it in Admin settings."}
             (:error (subscribe (daily 1 "data-team"))))))))

(deftest a-dashboard-it-cannot-read-is-not-found-test
  (testing "the model gets the same answer for a dashboard that is missing and one that the user can't read"
    (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                  (constantly true)
                                channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Dashboard {dash-id :id} {}]
          (mt/with-current-user (mt/user->id :rasta)
            (doseq [id [dash-id Integer/MAX_VALUE]]
              (is (= {:output (str "Dashboard " id " was not found. It may not exist, or you may not have access "
                                   "to it.\nCall `search` to find the entity you want and use an id from the results.")
                      :error  {:class :recoverable :code ::recoverable.common/not-found}}
                     (subscribe (daily id "data-team")))))))))))

(deftest refused-subscription-test
  (testing "a user who can see the dashboard but may not subscribe to it is told why, in words safe for a channel"
    (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                  (constantly true)
                                channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
      (mt/with-temp [:model/Collection    collection    {}
                     :model/Dashboard     {dash-id :id} {}
                     :model/Card          {card-id :id} {:collection_id (:id collection)}
                     :model/DashboardCard _             {:dashboard_id dash-id :card_id card-id}]
        (testing "because a question on it is hidden from them"
          (mt/with-non-admin-groups-no-collection-perms collection
            (mt/with-current-user (mt/user->id :rasta)
              (is (= {:class        :unrecoverable
                      :code         ::agent-subscriptions/dashboard-cards-not-readable
                      :user-message (str "You can't subscribe to this dashboard, because you don't have access to "
                                         "every question on it.")}
                     (:error (subscribe (daily dash-id "data-team"))))))))
        (testing "because Metabase refuses to create it"
          (mt/with-dynamic-fn-redefs [pulse.api/create-pulse-with-perm-checks!
                                      (fn [& _] (throw (ex-info "You don't have permissions to do that."
                                                                {:status-code 403})))]
            (mt/with-current-user (mt/user->id :crowberto)
              (is (= {:class        :unrecoverable
                      :code         ::agent-subscriptions/no-subscription-permission
                      :user-message "You don't have permission to create a subscription for this dashboard."}
                     (:error (subscribe (daily dash-id "data-team"))))))))))))
