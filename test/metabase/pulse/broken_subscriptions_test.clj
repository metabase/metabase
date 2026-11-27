(ns metabase.pulse.broken-subscriptions-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.email.messages :as messages]
   [metabase.events.test-util :as events.tu]
   [metabase.permissions.util :as perms-util]
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
              (models.pulse/update-pulses! [{:id bad-pulse-id :archived true}])
              (is (true? (:archived (models.pulse/retrieve-pulse bad-pulse-id)))))))))))

(deftest handle-broken-subscriptions-returns-what-it-archived-test
  (testing "returns what it archived, counting active destinations of enabled channels, and less of unreadable ones"
    (mt/with-fake-inbox
      (mt/with-temp [:model/User                  {former-id :id}     {:is_active false}
                     :model/Channel               {webhook-id :id}    {:type    :channel/http
                                                                       :details {:url         "https://example.com/hook"
                                                                                 :auth-method "none"}}
                     :model/Dashboard             {dash-id :id}       {:name       "Sales"
                                                                       :parameters [{:id   "kept"
                                                                                     :name "Kept"
                                                                                     :slug "kept"
                                                                                     :type "category"}]}
                     :model/Pulse                 {removed-id :id}    {:name         "Removed filter"
                                                                       :dashboard_id dash-id
                                                                       :creator_id   (mt/user->id :rasta)
                                                                       ;; Saved before the filter was renamed "Gone".
                                                                       :parameters   [{:id    "gone"
                                                                                       :name  "Old name"
                                                                                       :value ["secret"]}]}
                     :model/PulseChannel          {channel-id :id}    {:channel_type :email
                                                                       :pulse_id     removed-id
                                                                       :details      {:emails ["outside@example.com"]}
                                                                       :enabled      true}
                     :model/PulseChannelRecipient _                   {:pulse_channel_id channel-id
                                                                       :user_id          (mt/user->id :crowberto)}
                     ;; A deactivated user gets no email, so isn't counted.
                     :model/PulseChannelRecipient _                   {:pulse_channel_id channel-id
                                                                       :user_id          former-id}
                     :model/Pulse                 {stale-id :id}      {:name         "Stale filter"
                                                                       :dashboard_id dash-id
                                                                       :creator_id   (mt/user->id :rasta)
                                                                       :parameters   [{:id    "stale"
                                                                                       :name  "Stale"
                                                                                       :value ["x"]}]}
                     :model/PulseChannel          _                   {:channel_type :http
                                                                       :pulse_id     stale-id
                                                                       :channel_id   webhook-id
                                                                       :enabled      true}
                     ;; Neither of these delivers: one is disabled, and the webhook has no channel.
                     :model/PulseChannel          _                   {:channel_type :slack
                                                                       :pulse_id     stale-id
                                                                       :details      {:channel "#sales"}
                                                                       :enabled      false}
                     :model/PulseChannel          _                   {:channel_type :http
                                                                       :pulse_id     removed-id
                                                                       :enabled      true}
                     ;; Missing one filter from before the update and one the update removed.
                     :model/Pulse                 {mixed-id :id}      {:name         "Mixed"
                                                                       :dashboard_id dash-id
                                                                       :creator_id   (mt/user->id :rasta)
                                                                       :parameters   [{:id    "stale"
                                                                                       :name  "Stale"
                                                                                       :value ["x"]}
                                                                                      {:id    "gone"
                                                                                       :name  "Gone"
                                                                                       :value ["y"]}]}
                     :model/PulseChannel          _                   {:channel_type :slack
                                                                       :pulse_id     mixed-id
                                                                       :details      {:channel "#sales"}
                                                                       :enabled      true}
                     ;; Rasta neither created this one nor receives it, so can't read it.
                     :model/Pulse                 {unreadable-id :id} {:name         "Someone else's"
                                                                       :dashboard_id dash-id
                                                                       :creator_id   (mt/user->id :crowberto)
                                                                       :parameters   [{:id    "gone"
                                                                                       :name  "Gone"
                                                                                       :value ["z"]}]}
                     :model/PulseChannel          _                   {:channel_type :slack
                                                                       :pulse_id     unreadable-id
                                                                       :details      {:channel "#private"}
                                                                       :enabled      true}]
        (is (= [{:id              removed-id
                 :creator-name    "Rasta Toucan"
                 :parameters      [{:id "gone", :name "Gone"}]
                 :channels        [:email]
                 :recipient-count 2
                 :already-broken? false
                 :readable?       true}
                {:id              stale-id
                 :creator-name    "Rasta Toucan"
                 :parameters      [{:id "stale", :name "Stale"}]
                 :channels        [:http]
                 :recipient-count 1
                 :already-broken? true
                 :readable?       true}
                {:id              mixed-id
                 :creator-name    "Rasta Toucan"
                 :parameters      [{:id "gone", :name "Gone"}]
                 :channels        [:slack]
                 :recipient-count 1
                 :already-broken? false
                 :readable?       true}
                {:readable? false}]
               (mt/with-current-user (mt/user->id :rasta)
                 (pulse.broken-subscriptions/handle-broken-subscriptions!
                  dash-id
                  {"kept" {:id "kept", :name "Kept"}, "gone" {:id "gone", :name "Gone"}}))))
        (is (= #{removed-id stale-id mixed-id unreadable-id}
               (t2/select-pks-set :model/Pulse :dashboard_id dash-id :archived true)))))))

(deftest sandboxed-user-recipient-count-test
  (testing "a sandboxed user's count leaves out the other users the read path hides from them"
    (mt/with-fake-inbox
      (mt/with-temp [:model/Dashboard             {dash-id :id}    {:name "Sales"}
                     :model/Pulse                 {pulse-id :id}   {:dashboard_id dash-id
                                                                    :creator_id   (mt/user->id :rasta)
                                                                    :parameters   [{:id "gone", :name "Gone"}]}
                     :model/PulseChannel          {channel-id :id} {:channel_type :email
                                                                    :pulse_id     pulse-id
                                                                    :details      {:emails ["outside@example.com"]}
                                                                    :enabled      true}
                     :model/PulseChannelRecipient _                {:pulse_channel_id channel-id
                                                                    :user_id          (mt/user->id :rasta)}
                     :model/PulseChannelRecipient _                {:pulse_channel_id channel-id
                                                                    :user_id          (mt/user->id :crowberto)}]
        (is (=? [{:id pulse-id, :readable? true, :recipient-count 2}]
                (mt/with-current-user (mt/user->id :rasta)
                  (mt/with-dynamic-fn-redefs [perms-util/sandboxed-or-impersonated-user? (constantly true)]
                    (pulse.broken-subscriptions/handle-broken-subscriptions! dash-id {"gone" {:id "gone"}})))))))))

(defn- insert-broken-subscriptions!
  "Insert `n` subscriptions of the Dashboard `dashboard-id` created by `creator-id`, each with the filter `gone`, an
  email channel for the Users `user-ids` and a Slack channel, and return their ids."
  [n creator-id dashboard-id user-ids]
  (let [pulse-ids   (t2/insert-returning-pks! :model/Pulse
                                              (for [_ (range n)]
                                                (merge (mt/with-temp-defaults :model/Pulse)
                                                       {:creator_id   creator-id
                                                        :dashboard_id dashboard-id
                                                        :parameters   [{:id "gone", :name "Gone", :value ["x"]}]})))
        channel-ids (t2/insert-returning-pks! :model/PulseChannel
                                              (for [pulse-id pulse-ids]
                                                (merge (mt/with-temp-defaults :model/PulseChannel)
                                                       {:pulse_id     pulse-id
                                                        :channel_type :email
                                                        :details      {:emails ["outside@example.com"]}
                                                        :enabled      true})))]
    (t2/insert! :model/PulseChannel
                (for [pulse-id pulse-ids]
                  (merge (mt/with-temp-defaults :model/PulseChannel)
                         {:pulse_id     pulse-id
                          :channel_type :slack
                          :details      {:channel "#sales"}
                          :enabled      true})))
    (t2/insert! :model/PulseChannelRecipient
                (for [channel-id channel-ids
                      user-id    user-ids]
                  {:pulse_channel_id channel-id :user_id user-id}))
    pulse-ids))

(deftest handle-broken-subscriptions-statement-count-test
  (testing "handling broken subscriptions runs as many statements for 10 subscriptions as for 40, and reports each of them"
    (mt/with-fake-inbox
      (mt/with-model-cleanup [:model/Pulse]
        (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Sales"}]
          (let [rasta-id  (mt/user->id :rasta)
                user-ids  [rasta-id (mt/user->id :crowberto)]
                handle!   (fn []
                            (mt/with-current-user rasta-id
                              (pulse.broken-subscriptions/handle-broken-subscriptions! dash-id {"gone" {:id "gone", :name "Gone"}})))
                count-of  (fn [n]
                            (let [ids      (insert-broken-subscriptions! n rasta-id dash-id user-ids)
                                  archived (atom nil)
                                  stmts    (events.tu/real-statement-count! #(reset! archived (handle!)))]
                              {:ids ids, :archived @archived, :count stmts}))
                _         (count-of 2)
                small     (count-of 10)
                large     (count-of 40)]
            (is (= (:count small) (:count large)))
            (doseq [{:keys [ids archived]} [small large]]
              (is (= (set ids) (set (map :id archived))))
              (is (every? (fn [{:keys [readable? channels recipient-count creator-name]}]
                            (and readable?
                                 (= [:email :slack] channels)
                                 (= 4 recipient-count)
                                 (= "Rasta Toucan" creator-name)))
                          archived))
              (is (= (set ids) (t2/select-pks-set :model/Pulse :id [:in ids] :archived true))))))))))

(deftest handle-broken-subscriptions-unreadable-test
  (testing "a subscription the user cannot read is archived and only counted, among readable ones"
    (mt/with-fake-inbox
      (mt/with-model-cleanup [:model/Pulse]
        (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Sales"}]
          (let [readable   (insert-broken-subscriptions! 3 (mt/user->id :rasta) dash-id [(mt/user->id :rasta)])
                unreadable (insert-broken-subscriptions! 1 (mt/user->id :crowberto) dash-id [(mt/user->id :crowberto)])
                archived   (mt/with-current-user (mt/user->id :rasta)
                             (pulse.broken-subscriptions/handle-broken-subscriptions! dash-id {"gone" {:id "gone", :name "Gone"}}))
                by-id      (into {} (map (juxt :id identity)) archived)]
            (doseq [id readable]
              (is (=? {:readable? true :creator-name "Rasta Toucan" :channels [:email :slack] :recipient-count 3}
                      (by-id id))))
            (is (= (repeat (count unreadable) {:readable? false})
                   (remove :readable? archived)))))))))

(deftest notification-waits-for-commit-test
  (testing "handle-broken-subscriptions! sends its notifications only once the surrounding transaction commits"
    (let [param {:id "_SOURCE_PARAM_ID_" :name "Source" :slug "source" :type :string/=}]
      ;; with-temp's own transaction would never commit, so nothing would ever be sent
      (mt/test-helpers-set-global-values!
        (mt/with-temp
          [:model/Card          {card-id :id}     {}
           :model/Dashboard     {dash-id :id}     {:parameters [param]}
           :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id}
           :model/Pulse         {pulse-id :id}    {:dashboard_id dash-id
                                                   :creator_id   (mt/user->id :trashbird)
                                                   :parameters   [(assoc param :value ["Twitter"])]}
           :model/PulseCard     _                 {:pulse_id pulse-id :card_id card-id :dashboard_card_id dashcard-id}]
          (let [sent   (atom [])
                break! (fn []
                         (t2/update! :model/Dashboard :id dash-id {:parameters []})
                         (mt/with-current-user (mt/user->id :rasta)
                           (pulse.broken-subscriptions/handle-broken-subscriptions! dash-id {(:id param) param})))]
            ;; Sending at the point it is scheduled shows a send made too early, which a background thread could
            ;; deliver after any check.
            (mt/with-dynamic-fn-redefs [pulse.broken-subscriptions/send-in-background!      (fn [f] (f))
                                        messages/send-broken-subscription-notification! (fn [{:keys [pulse-id]}]
                                                                                          (swap! sent conj pulse-id))]
              (testing "rolled back: the subscription stays active and nobody is notified"
                (is (thrown-with-msg? Exception #"later step failed"
                                      (t2/with-transaction [_conn]
                                        (break!)
                                        (throw (ex-info "later step failed" {})))))
                (is (false? (t2/select-one-fn :archived :model/Pulse :id pulse-id)))
                (is (= [] @sent)))
              (testing "committed: the subscription is archived and its creators are notified after the commit"
                (t2/with-transaction [_conn]
                  (break!)
                  (is (= [] @sent)))
                (is (true? (t2/select-one-fn :archived :model/Pulse :id pulse-id)))
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
          (let [sent (atom [])]
            (mt/with-dynamic-fn-redefs [pulse.broken-subscriptions/send-in-background!      (fn [f] (f))
                                        messages/send-broken-subscription-notification! (fn [{:keys [pulse-id]}]
                                                                                          (if (= pulse-id first-id)
                                                                                            (throw (ex-info "template failed" {}))
                                                                                            (swap! sent conj pulse-id)))]
              (mt/with-log-messages-for-level [messages [metabase.pulse.broken-subscriptions :error]]
                (t2/with-transaction [_conn]
                  (t2/update! :model/Dashboard :id dash-id {:parameters []})
                  (mt/with-current-user (mt/user->id :rasta)
                    (pulse.broken-subscriptions/handle-broken-subscriptions! dash-id {(:id param) param})))
                (is (= [second-id] @sent))
                (is (=? [{:level   :error
                          :message (format "Failed to notify the owners of broken subscription %d on dashboard %d"
                                           first-id dash-id)
                          :e       #(= "template failed" (ex-message %))}]
                        (messages)))))))))))
