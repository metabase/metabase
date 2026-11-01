(ns metabase.pulse.broken-subscriptions-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.email.messages :as messages]
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

(deftest notification-waits-for-commit-test
  (testing "handle-broken-subscriptions! sends its notifications only once the surrounding transaction commits"
    (let [param {:id "_SOURCE_PARAM_ID_" :name "Source" :slug "source" :type :string/=}]
      (mt/test-helpers-set-global-values!
        (mt/with-temp
          [:model/Card          {card-id :id}          {}
           :model/Dashboard     {dash-id :id}          {:parameters [param]}
           :model/DashboardCard {dashcard-id :id}      {:dashboard_id dash-id :card_id card-id}
           :model/Pulse         {pulse-id :id}         {:dashboard_id dash-id
                                                        :creator_id   (mt/user->id :trashbird)
                                                        :parameters   [(assoc param :value ["Twitter"])]}
           :model/PulseCard     _                      {:pulse_id pulse-id :card_id card-id :dashboard_card_id dashcard-id}]
          (let [sent   (atom [])
                done   (promise)
                break! (fn []
                         (t2/update! :model/Dashboard :id dash-id {:parameters []})
                         (pulse.broken-subscriptions/handle-broken-subscriptions! dash-id {(:id param) param}))]
            (mt/with-dynamic-fn-redefs [messages/send-broken-subscription-notification!
                                        (fn [{:keys [pulse-id]}]
                                          (swap! sent conj pulse-id)
                                          (deliver done true))]
              (testing "rolled back: the subscription stays active and nobody is notified"
                (is (thrown-with-msg? Exception #"later step failed"
                                      (t2/with-transaction [_conn]
                                        (break!)
                                        (throw (ex-info "later step failed" {})))))
                (is (false? (t2/select-one-fn :archived :model/Pulse :id pulse-id)))
                (is (= [] @sent)))
              (testing "committed: the subscription is archived and its creators are notified"
                (t2/with-transaction [_conn]
                  (break!))
                (is (true? (t2/select-one-fn :archived :model/Pulse :id pulse-id)))
                (is (true? (deref done 10000 false)))
                (is (= [pulse-id] @sent))))))))))

(deftest notification-failure-does-not-stop-the-rest-test
  (testing "a notification that throws is logged, and the remaining ones still go out"
    (let [param {:id "_SOURCE_PARAM_ID_" :name "Source" :slug "source" :type :string/=}]
      (mt/test-helpers-set-global-values!
        (mt/with-temp
          [:model/Card          {card-id :id}     {}
           :model/Dashboard     {dash-id :id}     {:parameters [param]}
           :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id}
           :model/Pulse         {first-id :id}    {:dashboard_id dash-id
                                                   :creator_id   (mt/user->id :trashbird)
                                                   :parameters   [(assoc param :value ["Twitter"])]}
           :model/PulseCard     _                 {:pulse_id first-id :card_id card-id :dashboard_card_id dashcard-id}
           :model/Pulse         {second-id :id}   {:dashboard_id dash-id
                                                   :creator_id   (mt/user->id :trashbird)
                                                   :parameters   [(assoc param :value ["Facebook"])]}
           :model/PulseCard     _                 {:pulse_id second-id :card_id card-id :dashboard_card_id dashcard-id}]
          (let [sent (atom [])
                done (promise)]
            (mt/with-dynamic-fn-redefs [messages/send-broken-subscription-notification!
                                        (fn [{:keys [pulse-id]}]
                                          (if (= pulse-id first-id)
                                            (throw (ex-info "template failed" {}))
                                            (do (swap! sent conj pulse-id)
                                                (deliver done true))))]
              (t2/with-transaction [_conn]
                (t2/update! :model/Dashboard :id dash-id {:parameters []})
                (pulse.broken-subscriptions/handle-broken-subscriptions! dash-id {(:id param) param}))
              (is (true? (deref done 10000 false)))
              (is (= [second-id] @sent)))))))))
