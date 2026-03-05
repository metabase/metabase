(ns metabase-enterprise.metabot-v3.tools.create-alert-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-alert
    :as metabot-v3.tools.create-alert]
   [metabase.channel.settings :as channel.settings]
   [metabase.test :as mt]))

(defn- alert-data [card-id]
  {:card-id        card-id
   :send-condition :has_result
   :slack-channel  "data-team"
   :schedule       {:frequency :daily
                    :hour      9}})

(def ^:private fake-channels
  {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})

(deftest create-alert-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [invoke-tool #(mt/with-current-user (mt/user->id :rasta)
                           (metabot-v3.tools.create-alert/create-alert %))
            base-data   (alert-data card-id)]
        (with-redefs [channel.settings/slack-configured? (constantly true)
                      channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
          (testing "Slack alert can be created"
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

(deftest create-alert-validation-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (let [invoke-tool #(mt/with-current-user (mt/user->id :rasta)
                         (metabot-v3.tools.create-alert/create-alert %))
          base-data   (alert-data card-id)]
      (with-redefs [channel.settings/slack-configured? (constantly true)
                    channel.settings/slack-cached-channels-and-usernames (constantly fake-channels)]
        (testing "Return an error message if the card-id is invalid"
          (is (= {:error "invalid card_id"}
                 (invoke-tool (update base-data :card-id str)))))
        (testing "Return an error message if the card cannot be found"
          (is (= {:error "no saved question with this card_id found"}
                 (invoke-tool (update base-data :card-id + 100)))))
        (testing "Slack alert requires slack-channel"
          (is (= {:error "slack_channel is required"}
                 (invoke-tool (dissoc base-data :slack-channel)))))
        (testing "Invalid send-condition returns an error"
          (is (= {:error "unsupported send_condition: always"}
                 (invoke-tool (assoc base-data :send-condition :always)))))
        (testing "Invalid send-once returns an error"
          (is (= {:error "send_once must be a boolean"}
                 (invoke-tool (assoc base-data :send-once "true")))))))))

(deftest create-alert-channel-not-configured-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (let [invoke-tool #(mt/with-current-user (mt/user->id :rasta)
                         (metabot-v3.tools.create-alert/create-alert %))
          base-data   (alert-data card-id)]
      (testing "Slack alert fails when Slack is not configured"
        (with-redefs [channel.settings/slack-configured? (constantly false)]
          (is (= {:error "slack is not configured. Ask an admin to set up slack notifications in Metabase settings."}
                 (invoke-tool base-data)))))
      (testing "Slack alert fails when channel does not exist"
        (with-redefs [channel.settings/slack-configured? (constantly true)
                      channel.settings/slack-cached-channels-and-usernames (constantly {:channels []})]
          (is (= {:error "no slack channel found with this name"}
                 (invoke-tool (assoc base-data :slack-channel "no-such-channel")))))))))
