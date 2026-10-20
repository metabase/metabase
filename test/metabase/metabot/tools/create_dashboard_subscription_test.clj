(ns metabase.metabot.tools.create-dashboard-subscription-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.create-alert :as tools.create-alert]
   [metabase.metabot.tools.create-dashboard-subscription :as tools.create-dashboard-subscription]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- subscribe
  "Call the Slack profile's `create_dashboard_subscription` the way the Slack agent loop does, from the
  conversation `channel-id`, and return the outcome."
  [args channel-id]
  (tools.runtime/invoke (tools.core/entries
                         [tools.create-dashboard-subscription/slackbot-create-dashboard-subscription-tool])
                        {:profile-id  :slackbot
                         :metabot     nil
                         :user-scope  api-scope/unrestricted
                         :tool-names  #{"create_dashboard_subscription" "search"}
                         :memory-atom (atom {:context (cond-> {} channel-id (assoc :slack_channel_id channel-id))})}
                        "create_dashboard_subscription"
                        args))

(deftest subscribes-the-current-conversation-test
  (mt/with-model-cleanup [:model/Pulse]
    (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                  (constantly true)
                                channel.settings/slack-cached-channels-and-usernames
                                (constantly {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Sales"}
                       :model/Card          {card-id :id} {}
                       :model/DashboardCard _             {:dashboard_id dash-id :card_id card-id}]
          (let [{:keys [output error]} (subscribe {:dashboard_id dash-id :schedule {:frequency "daily" :hour 9}}
                                                  "C123")
                pulse                  (t2/select-one :model/Pulse :dashboard_id dash-id)]
            (is (nil? error))
            (is (= (str "Created subscription " (:id pulse) " to dashboard \"Sales\" (id " dash-id
                        "), posting to #data-team.")
                   output))
            (is (=? [{:channel_type :slack :details {:channel "#data-team"}}]
                    (t2/select :model/PulseChannel :pulse_id (:id pulse))))))))))

(deftest ^:parallel outside-slack-test
  (testing "the destination is the conversation that the request came from, so outside Slack there is none"
    (is (= {:class        :unrecoverable
            :code         ::tools.create-alert/not-in-slack
            :user-message "This can only be set up from a Slack conversation."}
           (:error (subscribe {:dashboard_id 1 :schedule {:frequency "daily" :hour 9}} nil))))))
