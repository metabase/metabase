(ns metabase.metabot.tools.create-alert-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.create-alert :as tools.create-alert]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.notification.api :as notification.api]
   [metabase.notification.models :as models.notification]
   [metabase.test :as mt]))

(def ^:private fake-channels
  {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})

(defmacro ^:private with-slack-channels [& body]
  `(mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                  (constantly true)
                               channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
     ~@body))

(defn- create-alert
  "Run `create_alert` through the Slack agent loop and return its result.
  The call comes from Slack conversation `channel-id`."
  ([args] (create-alert args "C123"))
  ([args channel-id]
   (tools.runtime/invoke (tools.core/entries [tools.create-alert/create-alert-tool])
                         {:profile-id  :slackbot
                          :metabot     nil
                          :user-scope  api-scope/unrestricted
                          :tool-names  #{"create_alert" "search"}
                          :memory-atom (atom {:context (cond-> {} channel-id (assoc :slack_channel_id channel-id))})}
                         "create_alert"
                         args)))

(defn- daily-alert [card-id]
  {:card_id card-id :send_condition "has_result" :schedule {:frequency "daily" :hour 9}})

(deftest creates-an-alert-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp [:model/Card {card-id :id} {:name "Revenue"}]
      (with-slack-channels
        (mt/with-current-user (mt/user->id :rasta)
          (let [{:keys [output error]} (create-alert (assoc (daily-alert card-id)
                                                            :send_condition "goal_above"
                                                            :send_once      true))
                [alert]                (models.notification/notifications-for-card card-id)]
            (is (nil? error))
            (testing "it posts to the conversation that asked for it, when its condition is met"
              (is (=? {:payload  {:card_id card-id :send_condition :goal_above :send_once true}
                       :handlers [{:channel_type :channel/slack
                                   :recipients   [{:details {:value "#data-team"}}]}]}
                      alert)))
            (testing "the result names the alert that was created"
              (is (= (str "Created alert " (:id alert) " on question \"Revenue\" (ID " card-id
                          "), posting to #data-team.")
                     output)))))))))

(deftest a-card-it-cannot-read-is-not-found-test
  (testing "the model gets the same answer for a card that is missing and one that the user can't read"
    (with-slack-channels
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Card {card-id :id} {}]
          (mt/with-current-user (mt/user->id :rasta)
            (doseq [id [card-id Integer/MAX_VALUE]]
              (is (= {:output (str "Card " id " was not found. It may not exist, or you may not have access to it.\n"
                                   "Call `search` to find the entity you want and use an id from the results.")
                      :error  {:class :recoverable :code ::recoverable.common/not-found}}
                     (create-alert (daily-alert id)))))))))))

(deftest slack-problems-end-the-turn-test
  (testing "only the user or an admin can fix these, so the turn ends with a message that names no channel"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (mt/with-current-user (mt/user->id :rasta)
        (with-slack-channels
          (testing "outside of Slack"
            (is (= {:class        :unrecoverable
                    :code         ::tools.create-alert/not-in-slack
                    :user-message "This can only be set up from a Slack conversation."}
                   (:error (create-alert (daily-alert card-id) nil)))))
          (testing "a DM cannot receive alerts"
            (is (= {:class        :unrecoverable
                    :code         ::tools.create-alert/unknown-slack-conversation
                    :user-message (str "Metabase can't send alerts or subscriptions to this conversation. "
                                       "It can send them to public channels and to private channels that the "
                                       "Metabase app has been added to. A channel created in the last few hours "
                                       "may not be available yet.")}
                   (:error (create-alert (daily-alert card-id) "D0123"))))))
        (testing "Slack must be connected"
          (mt/with-dynamic-fn-redefs [channel.settings/slack-configured? (constantly false)]
            (is (= {:class        :unrecoverable
                    :code         ::tools.create-alert/slack-not-configured
                    :user-message "Slack isn't connected to Metabase. An admin can connect it in Admin settings."}
                   (:error (create-alert (daily-alert card-id)))))))))))

(deftest refused-alert-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (with-slack-channels
      (mt/with-current-user (mt/user->id :rasta)
        (testing "a user who may not create alerts is told so"
          (mt/with-dynamic-fn-redefs [notification.api/create-notification!
                                      (fn [_] (throw (ex-info "You don't have permissions to do that."
                                                              {:status-code 403})))]
            (is (= {:class        :unrecoverable
                    :code         ::tools.create-alert/no-alert-permission
                    :user-message "You don't have permission to create alerts."}
                   (:error (create-alert (daily-alert card-id)))))))
        (testing "any other failure stays an internal error"
          (mt/with-dynamic-fn-redefs [notification.api/create-notification! (fn [_] (throw (ex-info "boom" {})))]
            (is (= {:class :unrecoverable :code :internal}
                   (:error (create-alert (daily-alert card-id)))))))))))
