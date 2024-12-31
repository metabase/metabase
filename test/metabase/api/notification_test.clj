(ns metabase.api.notification-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.models.permissions-group :as perms-group]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest get-notication-card-test
  (mt/with-temp [:model/Channel {chn-id :id} notification.tu/default-can-connect-channel
                 :model/ChannelTemplate {tmpl-id :id} notification.tu/channel-template-email-with-handlebars-body]
    (notification.tu/with-card-notification
      [notification {:card              {:dataset_query (mt/mbql-query users)}
                     :notification_card {:creator_id (mt/user->id :crowberto)}
                     :subscriptions     [{:type          :notification-subscription/cron
                                          :cron_schedule "0 0 0 * * ?"}
                                         {:type          :notification-subscription/cron
                                          :cron_schedule "1 1 1 * * ?"}]
                     :handlers          [{:channel_type notification.tu/test-channel-type
                                          :channel_id   chn-id
                                          :active       false}
                                         {:channel_type :channel/email
                                          :recipients   [{:type    :notification-recipient/user
                                                          :user_id (mt/user->id :crowberto)}]
                                          :template_id  tmpl-id}]}]
      (let [notification-id (:id notification)]
        (testing "hydrate creator, payload, subscriptions, handlers"
          (is (=? {:id            notification-id
                   :creator_id    (mt/user->id :crowberto)
                   :creator       {:email "crowberto@metabase.com"}
                   :payload_type  "notification/card"
                   :payload       {:card_id (-> notification :payload :card_id)}
                   :subscriptions [{:notification_id notification-id
                                    :type            "notification-subscription/cron"
                                    :cron_schedule   "0 0 0 * * ?"}
                                   {:notification_id notification-id
                                    :type            "notification-subscription/cron"
                                    :cron_schedule   "1 1 1 * * ?"}]
                   :handlers      [{:template_id     nil
                                    :channel_type    "channel/metabase-test"
                                    :channel         {:id chn-id}
                                    :channel_id      chn-id
                                    :notification_id notification-id
                                    :active          false}
                                   {:template_id  tmpl-id
                                    :channel_type "channel/email"
                                    :channel      nil
                                    :template     {:id tmpl-id}
                                    :recipients   [{:type    "notification-recipient/user"
                                                    :details nil
                                                    :user_id (mt/user->id :crowberto)
                                                    :user    {:email "crowberto@metabase.com"}}]
                                    :channel_id nil
                                    :notification_id notification-id
                                    :active true}]}
                  (mt/user-http-request :crowberto :get 200 (format "notification/%d" notification-id)))))))))

(deftest get-notification-error-test
  (testing "require auth"
    (is (= "Unauthenticated" (mt/client :get 401 "notification/1"))))
  (testing "404 on unknown notification"
    (is (= "Not found."
           (mt/user-http-request :crowberto :get (format "notification/%d" Integer/MAX_VALUE))))))

(deftest create-simple-card-notification-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp [:model/Card {card-id :id} {}]
      (testing "card notification with 1 subscription and 2 handlers"
        (let [notification {:payload_type  "notification/card"
                            :active        true
                            :creator_id    (mt/user->id :crowberto)
                            :payload       {:card_id        card-id
                                            :send_condition "goal_above"
                                            :send_once      true}
                            :subscriptions [{:type          "notification-subscription/cron"
                                             :cron_schedule "0 0 0 * * ?"}]
                            :handlers      [{:channel_type "channel/email"
                                             :recipients   [{:type    "notification-recipient/user"
                                                             :user_id (mt/user->id :crowberto)}]}]}]
          (is (=? (assoc notification :id (mt/malli=? int?))
                  (mt/user-http-request :crowberto :post 200 "notification" notification)))))

      (testing "card notification with no subscriptions and handler is ok"
        (let [notification {:payload_type  "notification/card"
                            :active        true
                            :creator_id    (mt/user->id :crowberto)
                            :payload       {:card_id card-id}}]
          (is (=? (assoc notification :id (mt/malli=? int?))
                  (mt/user-http-request :crowberto :post 200 "notification" notification))))))))

(deftest create-notification-error-test
  (testing "require auth"
    (is (= "Unauthenticated" (mt/client :post 401 "notification"))))

  (testing "card notification requires a card_id"
    (is (=? {:specific-errors {:body {:payload {:card_id ["missing required key, received: nil"]}}}}
            (mt/user-http-request :crowberto :post 400 "notification" {:creator_id   (mt/user->id :crowberto)
                                                                       :payload      {}
                                                                       :payload_type "notification/card"}))))

  (mt/with-temp [:model/Card {card-id :id}]
    (testing "creator id is not required"
      (is (some? (mt/user-http-request :crowberto :post 200 "notification" {:payload      {:card_id card-id}
                                                                            :payload_type "notification/card"}))))
    (testing "automatically override creator_id to current user"
      (is (= (mt/user->id :crowberto)
             (-> (mt/user-http-request :crowberto :post 200 "notification" {:creator_id   (mt/user->id :rasta)
                                                                            :payload      {:card_id card-id}
                                                                            :payload_type "notification/card"})
                 :creator_id))))))

(defn- update-cron-subscription
  [{:keys [subscriptions] :as notification} new-schedule]
  (assert (= 1 (count subscriptions)))
  (assoc notification :subscriptions [(assoc (first subscriptions) :cron_schedule new-schedule)]))

(deftest update-notification-test
  (mt/with-temp [:model/ChannelTemplate {tmpl-id :id} notification.tu/channel-template-email-with-handlebars-body]
    (notification.tu/with-card-notification
      [notification {:card              {:dataset_query (mt/mbql-query users)}
                     :notification_card {:creator_id (mt/user->id :crowberto)}
                     :subscriptions     [{:type          :notification-subscription/cron
                                          :cron_schedule "0 0 0 * * ?"}]
                     :handlers          [{:channel_type :channel/email
                                          :recipients   [{:type    :notification-recipient/user
                                                          :user_id (mt/user->id :crowberto)}
                                                         {:type    :notification-recipient/raw-value
                                                          :details {:value "ngoc@metabase.com"}}]
                                          :template_id  tmpl-id}]}]
      (let [notification        (atom notification)
            notification-id     (:id @notification)
            update-notification (fn [new-notification]
                                  (reset! notification
                                          (mt/user-http-request :crowberto :put 200
                                                                (format "notification/%d" notification-id)
                                                                new-notification)))]
        (testing "can update subscription schedule"
          (is (=? [{:type          "notification-subscription/cron"
                    :cron_schedule "1 1 1 * * ?"}]
                  (:subscriptions (update-notification (update-cron-subscription @notification "1 1 1 * * ?"))))))

        (testing "can update payload info"
          (is (= "has_result" (get-in @notification [:payload :send_condition])))
          (is (=? {:send_condition "goal_above"}
                  (:payload (update-notification (assoc-in @notification [:payload :send_condition] "goal_above"))))))

        (testing "can add add a new recipient and modify the existing one"
          (let [existing-email-handler  (->> @notification :handlers (m/find-first #(= "channel/email" (:channel_type %))))
                existing-user-recipient (m/find-first #(= "notification-recipient/user" (:type %))
                                                      (:recipients existing-email-handler))
                new-recipients          [(assoc existing-user-recipient :user_id (mt/user->id :rasta))
                                         {:id                      -1
                                          :type                    :notification-recipient/group
                                          :notification_handler_id (:id existing-email-handler)
                                          :permissions_group_id    (:id (perms-group/admin))}]
                new-handlers            [(assoc existing-email-handler :recipients new-recipients)]]
            (is (=? [{:type                "notification-recipient/group"
                      :permissions_group_id (:id (perms-group/admin))}
                     {:type    "notification-recipient/user"
                      :user_id (mt/user->id :rasta)}]
                    (->> (update-notification (assoc @notification :handlers new-handlers))
                         :handlers (m/find-first #(= "channel/email" (:channel_type %))) :recipients (#(sort-by :type %)))))
            (testing "can remove all recipients"
              (is (= []
                     (->> (update-notification (assoc @notification :handlers [(assoc existing-email-handler :recipients [])]))
                          :handlers (m/find-first #(= "channel/email" (:channel_type %))) :recipients))))))

        (testing "can add new handler"
          (let [new-handler {:id              -1
                             :notification_id notification-id
                             :channel_type    :channel/slack
                             :recipients      [{:id      -1
                                                :type    :notification-recipient/user
                                                :user_id (mt/user->id :rasta)}]}
                new-handlers (conj (:handlers @notification) new-handler)]
            (is (=? {:channel_type "channel/slack"
                     :recipients   [{:type    "notification-recipient/user"
                                     :user_id (mt/user->id :rasta)}]}
                    (->> (update-notification (assoc @notification :handlers new-handlers))
                         :handlers (m/find-first #(= "channel/slack" (:channel_type %))))))))))))

(deftest update-notification-error-test
  (testing "require auth"
    (is (= "Unauthenticated" (mt/client :put 401 "notification/1"))))

  (testing "404 on unknown notification"
    (is (= "Not found."
           (mt/user-http-request :crowberto :put (format "notification/%d" Integer/MAX_VALUE)
                                 {:creator_id   (mt/user->id :crowberto)
                                  :payload      {:card_id 1}
                                  :payload_type "notification/card"}))))
  (testing "400 on invalid payload"
    (is (=? {:specific-errors {:body {:payload {:card_id ["missing required key, received: nil"]}}}}
            (mt/user-http-request :crowberto :put 400 "notification/1" {:creator_id   (mt/user->id :crowberto)
                                                                        :payload      {}
                                                                        :payload_type "notification/card"})))))

(deftest send-notification-by-id-api-test
  (mt/with-temp [:model/Channel {http-channel-id :id} {:type    :channel/http
                                                       :details {:url         "https://metabase.com/testhttp"
                                                                 :auth-method "none"}}]
    (notification.tu/with-channel-fixtures [:channel/email :channel/slack]
      (notification.tu/with-card-notification
        [notification {:handlers [{:channel_type :channel/email
                                   :recipients   [{:type    :notification-recipient/user
                                                   :user_id (mt/user->id :crowberto)}]}
                                  {:channel_type :channel/slack
                                   :recipients   [{:type    :notification-recipient/raw-value
                                                   :details {:value "#general"}}]}
                                  {:channel_type :channel/http
                                   :channel_id   http-channel-id}]}]
        ;; this test only check that channel will send, the content are tested in [[metabase.notification.payload.impl.card-test]]
        (testing "send to all handlers"
          (is (=? {:channel/email [{:message    (mt/malli=? some?)
                                    :recipients ["crowberto@metabase.com"]}]
                   :channel/slack [{:attachments (mt/malli=? some?)
                                    :channel-id  "#general"}]
                   :channel/http [{:body (mt/malli=? some?)}]}
                  (notification.tu/with-captured-channel-send!
                    (mt/user-http-request :crowberto :post 204 (format "notification/%d/send" (:id notification)))))))

        (testing "select handlers"
          (let [handler-ids (->> (:handlers notification)
                                 (filter (comp #{:channel/slack :channel/http} :channel_type))
                                 (map :id))]
            (is (=? #{:channel/slack :channel/http}
                    (set (keys (notification.tu/with-captured-channel-send!
                                 (mt/user-http-request :crowberto :post 204 (format "notification/%d/send" (:id notification))
                                                       {:handler_ids handler-ids}))))))))))))

(defn- strip-keys
  [x to-remove-keys]
  (walk/postwalk
   (fn [x]
     (if (map? x)
       (apply dissoc x to-remove-keys)
       x))
   x))

(deftest send-unsaved-notification-api-test
  (mt/with-temp [:model/Channel {http-channel-id :id} {:type    :channel/http
                                                       :details {:url         "https://metabase.com/testhttp"
                                                                 :auth-method "none"}}]
    (notification.tu/with-channel-fixtures [:channel/email :channel/slack]
      (notification.tu/with-card-notification
        [notification {:handlers [{:channel_type :channel/email
                                   :recipients   [{:type    :notification-recipient/user
                                                   :user_id (mt/user->id :crowberto)}]}
                                  {:channel_type :channel/slack
                                   :recipients   [{:type    :notification-recipient/raw-value
                                                   :details {:value "#general"}}]}
                                  {:channel_type :channel/http
                                   :channel_id   http-channel-id}]}]
        ;; this test only check that channel will send, the content are tested in [[metabase.notification.payload.impl.card-test]]
        (testing "send to all handlers"
          (is (=? {:channel/email [{:message    (mt/malli=? some?)
                                    :recipients ["crowberto@metabase.com"]}]
                   :channel/slack [{:attachments (mt/malli=? some?)
                                    :channel-id  "#general"}]
                   :channel/http  [{:body (mt/malli=? some?)}]}
                  (notification.tu/with-captured-channel-send!
                    (mt/user-http-request :crowberto :post 204 "notification/send" (strip-keys notification [:id :created_at :updated_at]))))))))))
