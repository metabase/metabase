(ns metabase.metabot.tools.create-dashboard-subscription-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.create-alert :as tools.create-alert]
   [metabase.metabot.tools.create-dashboard-subscription :as tools.create-dashboard-subscription]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private fake-channels
  {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})

(def ^:private daily-schedule {:frequency "daily" :hour 9})

(defn- subscribe
  "Run `create_dashboard_subscription` through the Slack agent loop and return its result.
  The call comes from Slack conversation `channel-id`."
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
                                channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "Sales"}
                       :model/Card          {card-id :id} {}
                       :model/DashboardCard _             {:dashboard_id dash-id :card_id card-id}]
          (let [{:keys [output error]} (subscribe {:dashboard_id dash-id :schedule daily-schedule}
                                                  "C123")
                pulse                  (t2/select-one :model/Pulse :dashboard_id dash-id)]
            (is (nil? error))
            (is (= (str "Created subscription " (:id pulse) " to dashboard \"Sales\" (ID " dash-id
                        "), posting to #data-team.")
                   output))
            (is (=? [{:channel_type :slack :details {:channel "#data-team"}}]
                    (t2/select :model/PulseChannel :pulse_id (:id pulse))))))))))

(deftest ^:parallel outside-slack-test
  (testing "a subscription requires a Slack conversation as its destination"
    (is (= {:class        :unrecoverable
            :code         ::tools.create-alert/not-in-slack
            :user-message "This can only be set up from a Slack conversation."}
           (:error (subscribe {:dashboard_id 1 :schedule daily-schedule} nil))))))

(deftest view-only-collection-access-is-enough-test
  (testing "a user who can only view the dashboard's collection can subscribe to the dashboard"
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                  (constantly true)
                                  channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
        (mt/with-temp [:model/Collection    {coll-id :id :as coll} {}
                       :model/Card          {card-id :id}          {:collection_id coll-id}
                       :model/Dashboard     {dash-id :id}          {:name "Sales" :collection_id coll-id}
                       :model/DashboardCard _                      {:dashboard_id dash-id :card_id card-id}]
          (mt/with-non-admin-groups-no-collection-perms coll
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (mt/with-current-user (mt/user->id :rasta)
              (let [{:keys [output error]} (subscribe {:dashboard_id dash-id :schedule daily-schedule} "C123")
                    pulse                  (t2/select-one :model/Pulse :dashboard_id dash-id)]
                (is (nil? error))
                (is (= (str "Created subscription " (:id pulse) " to dashboard \"Sales\" (ID " dash-id
                            "), posting to #data-team.")
                       output))
                (testing "the subscription belongs to the dashboard's collection and has no pin position"
                  (is (=? {:collection_id coll-id :collection_position nil} pulse)))))))))))

(deftest subscription-keeps-dashboard-pins-test
  (testing "a subscription to a pinned dashboard moves no pinned item in its collection"
    (mt/with-model-cleanup [:model/Pulse]
      (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                  (constantly true)
                                  channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/Collection    {coll-id :id} {}
                         :model/Card          {below :id}   {:collection_id coll-id :collection_position 1}
                         :model/Dashboard     {dash-id :id} {:collection_id coll-id :collection_position 2}
                         :model/Card          {above :id}   {:collection_id coll-id :collection_position 3}
                         :model/DashboardCard _             {:dashboard_id dash-id :card_id below}]
            (is (nil? (:error (subscribe {:dashboard_id dash-id :schedule daily-schedule} "C123"))))
            (is (= {:below 1 :dashboard 2 :above 3 :pulse nil}
                   {:below     (t2/select-one-fn :collection_position :model/Card :id below)
                    :dashboard (t2/select-one-fn :collection_position :model/Dashboard :id dash-id)
                    :above     (t2/select-one-fn :collection_position :model/Card :id above)
                    :pulse     (t2/select-one-fn :collection_position :model/Pulse :dashboard_id dash-id)}))))))))
