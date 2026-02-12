(ns metabase-enterprise.metabot-v3.tools.create-alert-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-alert
    :as metabot-v3.tools.create-alert]
   [metabase.channel.settings :as channel.settings]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]))

(defn- alert-data [card-id email]
  {:card-id        card-id
   :send-condition :has_result
   :channel-type   :email
   :email          email
   :schedule       {:frequency :daily
                    :hour      9}})

(def ^:private fake-channels
  {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})

(deftest create-email-alert-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp [:model/User {:keys [email] user-id :id} {:email "alert-test@example.com"}
                   :model/Card {card-id :id} {}]
      (let [invoke-tool #(mt/with-current-user user-id
                           (metabot-v3.tools.create-alert/create-alert %))
            base-data   (alert-data card-id email)]
        (with-redefs [channel.settings/email-configured? (constantly true)]
          (testing "Email alert can be created"
            (is (= {:output "success"}
                   (invoke-tool base-data))))
          (testing "Alert with goal_above send-condition can be created"
            (is (= {:output "success"}
                   (invoke-tool (assoc base-data :send-condition :goal_above)))))
          (testing "Alert with goal_below send-condition can be created"
            (is (= {:output "success"}
                   (invoke-tool (assoc base-data :send-condition :goal_below)))))
          (testing "Alert with send-once can be created"
            (is (= {:output "success"}
                   (invoke-tool (assoc base-data :send-once true))))))))))

(deftest create-slack-alert-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [invoke-tool #(mt/with-current-user (mt/user->id :rasta)
                           (metabot-v3.tools.create-alert/create-alert %))]
        (with-redefs [channel.settings/slack-configured? (constantly true)
                      channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
          (testing "Slack alert can be created"
            (is (= {:output "success"}
                   (invoke-tool {:card-id        card-id
                                 :send-condition :has_result
                                 :channel-type   :slack
                                 :slack-channel  "data-team"
                                 :schedule       {:frequency :daily
                                                  :hour      9}})))))))))

(deftest create-alert-validation-test
  (mt/with-temp [:model/User {:keys [email] user-id :id} {:email "alert-test@example.com"}
                 :model/Card {card-id :id} {}]
    (let [invoke-tool #(mt/with-current-user user-id
                         (metabot-v3.tools.create-alert/create-alert %))
          base-data   (alert-data card-id email)]
      (with-redefs [channel.settings/email-configured? (constantly true)
                    channel.settings/slack-configured? (constantly true)
                    channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
        (testing "Return an error message if the card-id is invalid"
          (is (= {:error "invalid card_id"}
                 (invoke-tool (update base-data :card-id str)))))
        (testing "Return an error message if the card cannot be found"
          (is (= {:error "no saved question with this card_id found"}
                 (invoke-tool (update base-data :card-id + 100)))))
        (testing "Return an error message if the user cannot be found"
          (is (= {:error "no user with this email found"}
                 (invoke-tool (update base-data :email str "nosuchuser@example.com")))))
        (testing "Email alert requires email"
          (is (= {:error "email is required when channel_type is email"}
                 (invoke-tool (dissoc base-data :email)))))
        (testing "Slack alert requires slack-channel"
          (is (= {:error "slack_channel is required when channel_type is slack"}
                 (invoke-tool {:card-id        card-id
                               :send-condition :has_result
                               :channel-type   :slack
                               :schedule       {:frequency :daily
                                                :hour      9}}))))
        (testing "Invalid channel-type returns an error"
          (is (= {:error "unsupported channel_type: sms"}
                 (invoke-tool (assoc base-data :channel-type :sms)))))
        (testing "Invalid send-condition returns an error"
          (is (= {:error "unsupported send_condition: always"}
                 (invoke-tool (assoc base-data :send-condition :always)))))
        (testing "Invalid send-once returns an error"
          (is (= {:error "send_once must be a boolean"}
                 (invoke-tool (assoc base-data :send-once "true")))))))))

(deftest create-alert-channel-not-configured-test
  (mt/with-temp [:model/User {:keys [email] user-id :id} {:email "alert-test@example.com"}
                 :model/Card {card-id :id} {}]
    (let [invoke-tool #(mt/with-current-user user-id
                         (metabot-v3.tools.create-alert/create-alert %))
          base-data   (alert-data card-id email)]
      (testing "Email alert fails when email is not configured"
        (with-redefs [channel.settings/email-configured? (constantly false)]
          (is (= {:error "email is not configured. Ask an admin to set up email in Metabase settings."}
                 (invoke-tool base-data)))))
      (testing "Slack alert fails when Slack is not configured"
        (with-redefs [channel.settings/slack-configured? (constantly false)]
          (is (= {:error "slack is not configured. Ask an admin to set up slack notifications in Metabase settings."}
                 (invoke-tool {:card-id        card-id
                               :send-condition :has_result
                               :channel-type   :slack
                               :slack-channel  "data-team"
                               :schedule       {:frequency :daily
                                                :hour      9}})))))
      (testing "Slack alert fails when channel does not exist"
        (with-redefs [channel.settings/slack-configured? (constantly true)
                      channel.settings/slack-cached-channels-and-usernames (constantly {:channels []})]
          (is (= {:error "no slack channel found with this name"}
                 (invoke-tool {:card-id        card-id
                               :send-condition :has_result
                               :channel-type   :slack
                               :slack-channel  "no-such-channel"
                               :schedule       {:frequency :daily
                                                :hour      9}}))))))))
