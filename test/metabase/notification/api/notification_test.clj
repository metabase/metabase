(ns metabase.notification.api.notification-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.channel.email.internal :as email.internal]
   [metabase.collections.models.collection :as collection]
   [metabase.notification.core :as notification]
   [metabase.notification.models :as models.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections :notifications))

(deftest get-notification-card-test
  (mt/with-temp [:model/Channel {chn-id :id} notification.tu/default-can-connect-channel
                 :model/ChannelTemplate {tmpl-id :id} notification.tu/channel-template-email-with-handlebars-body]
    (notification.tu/with-card-notification
      [notification {:card              {:dataset_query (mt/mbql-query users)}
                     :notification_card {:creator_id (mt/user->id :crowberto)}
                     :subscriptions     [{:type          :notification-subscription/cron
                                          :cron_schedule "0 0 0 * * ?"
                                          :ui_display_type :cron/builder}
                                         {:type          :notification-subscription/cron
                                          :cron_schedule "1 1 1 * * ?"
                                          :ui_display_type :cron/raw}]
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
                   :payload       {:card_id (-> notification :payload :card_id)
                                   :card    {:id (-> notification :payload :card_id)}}
                   :subscriptions [{:notification_id notification-id
                                    :type            "notification-subscription/cron"
                                    :cron_schedule   "0 0 0 * * ?"
                                    :ui_display_type "cron/builder"}
                                   {:notification_id notification-id
                                    :type            "notification-subscription/cron"
                                    :cron_schedule   "1 1 1 * * ?"
                                    :ui_display_type "cron/raw"}]
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
                                             :cron_schedule "0 0 0 * * ?"
                                             :ui_display_type "cron/raw"}]
                            :handlers      [{:channel_type "channel/email"
                                             :recipients   [{:type    "notification-recipient/user"
                                                             :user_id (mt/user->id :crowberto)}]}]}]
          (is (=? (assoc notification :id (mt/malli=? int?))
                  (mt/user-http-request :crowberto :post 200 "notification" notification)))))

      (testing "card notification with no subscriptions and handler is ok"
        (let [notification {:payload_type  "notification/card"
                            :active        true
                            :creator_id    (mt/user->id :crowberto)
                            :payload       {:card_id card-id
                                            :send_condition "has_result"}
                            :subscriptions [{:type          "notification-subscription/cron"
                                             :cron_schedule "0 0 0 * * ?"
                                             :ui_display_type "cron/raw"}]
                            :handlers      [{:channel_type "channel/email"
                                             :recipients   [{:type    "notification-recipient/user"
                                                             :user_id (mt/user->id :crowberto)}]}]}]
          (is (=? (assoc notification :id (mt/malli=? int?))
                  (mt/user-http-request :crowberto :post 200 "notification" notification))))))))

(defn do-with-send-messages-sync!
  [f]
  (mt/with-dynamic-fn-redefs [email.internal/send-email! (fn [& args]
                                                           (apply @#'email.internal/send-email-sync! args))]
    (f)))

(defmacro with-send-messages-sync!
  [& body]
  `(do-with-send-messages-sync! (fn [] ~@body)))

(deftest create-notification-send-you-were-added-email-test
  (mt/with-model-cleanup [:model/Notification]
    (notification.tu/with-channel-fixtures [:channel/email]
      (mt/with-temp [:model/Card {card-id :id} {:name "My Card"}]
        (doseq [[send_condition expected_text] [["has_result" "whenever this question has any results"]
                                                ["goal_above" "when this question meets its goal"]
                                                ["goal_below" "when this question goes below its goal"]]]
          (let [notification {:payload_type  "notification/card"
                              :active        true
                              :payload       {:card_id card-id
                                              :send_condition send_condition}
                              :creator_id    (mt/user->id :crowberto)
                              :handlers      [{:channel_type :channel/email
                                               :recipients   [{:type    :notification-recipient/user
                                                               :user_id (mt/user->id :rasta)}
                                                              {:type    :notification-recipient/user
                                                               :user_id (mt/user->id :crowberto)}
                                                              {:type    :notification-recipient/raw-value
                                                               :details {:value "ngoc@metabase.com"}}]}]}
                [added-email confirmation-email] (sort-by :subject
                                                          (notification.tu/with-mock-inbox-email!
                                                            (with-send-messages-sync!
                                                              (mt/user-http-request :crowberto :post 200 "notification" notification))))
                a-card-url (format "<a href=\".*/question/%d\">My Card</a>." card-id)]
            (testing (format "send email with %s condition" send_condition)
              (testing "recipients will get you were added to a card email"
                (is (=? {:bcc     #{"rasta@metabase.com" "ngoc@metabase.com"}
                         :subject "Crowberto Corv added you to an alert"
                         :body    [{a-card-url true
                                    expected_text true}]}
                        (mt/summarize-multipart-single-email added-email
                                                             (re-pattern a-card-url)
                                                             (re-pattern expected_text)))))
              (testing "creator will get confirmation email"
                (is (=? {:to      #{"crowberto@metabase.com"}
                         :subject "You set up an alert"
                         :body    [{a-card-url true
                                    expected_text true}]}
                        (mt/summarize-multipart-single-email confirmation-email
                                                             (re-pattern a-card-url)
                                                             (re-pattern expected_text))))))))))))

(deftest create-notification-audit-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [notification {:payload_type  "notification/card"
                            :active        true
                            :payload       {:card_id card-id}
                            :subscriptions [{:type          "notification-subscription/cron"
                                             :cron_schedule "0 0 0 * * ?"}]
                            :handlers      [{:channel_type "channel/email"
                                             :recipients   [{:type    "notification-recipient/user"
                                                             :user_id  (mt/user->id :rasta)}]}]}]
          (testing "creating a notification publishes an event/notification-create event"
            (let [created-notification (mt/user-http-request :crowberto :post 200 "notification" notification)]
              (is (=? {:topic :notification-create
                       :user_id (mt/user->id :crowberto)
                       :model "Notification"
                       :model_id (:id created-notification)
                       :details {:id            (:id created-notification)
                                 :active        true
                                 :creator_id    (mt/user->id :crowberto)
                                 :payload_id    (mt/malli=? int?)
                                 :payload_type  "notification/card"
                                 :subscriptions [{:notification_id (:id created-notification)
                                                  :type "notification-subscription/cron"
                                                  :event_name nil
                                                  :cron_schedule "0 0 0 * * ?"}]
                                 :handlers [{:recipients [{:id (mt/malli=? int?)
                                                           :type "notification-recipient/user"
                                                           :user_id (mt/user->id :rasta)
                                                           :permissions_group_id nil
                                                           :details nil}]}]}}
                      (mt/latest-audit-log-entry))))))))))

(deftest create-notification-error-test
  (testing "require auth"
    (is (= "Unauthenticated" (mt/client :post 401 "notification"))))

  (testing "card notification requires a card_id"
    (is (=? {:specific-errors {:payload {:card_id ["missing required key, received: nil"]}}}
            (mt/user-http-request :crowberto :post 400 "notification" {:payload      {}
                                                                       :payload_type "notification/card"}))))

  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp [:model/Card {card-id :id}]
      (testing "creator id is not required"
        (is (some? (mt/user-http-request :crowberto :post 200 "notification" {:payload      {:card_id card-id}
                                                                              :payload_type "notification/card"}))))
      (testing "automatically override creator_id to current user"
        (is (= (mt/user->id :crowberto)
               (-> (mt/user-http-request :crowberto :post 200 "notification" {:creator_id   (mt/user->id :rasta)
                                                                              :payload      {:card_id card-id}
                                                                              :payload_type "notification/card"})
                   :creator_id)))))))

(deftest notification-with-custom-template-test
  (mt/with-model-cleanup [:model/Notification]
    (testing "can create a notification with a template"
      (let [template     (-> notification.tu/channel-template-email-with-handlebars-body
                             (update :channel_type u/qualified-name)
                             (update-in [:details :type] u/qualified-name))
            notification (mt/user-http-request :crowberto :post 200 "notification"
                                               {:payload_type  :notification/testing
                                                :creator_id    (mt/user->id :crowberto)
                                                :handlers      [(assoc @notification.tu/default-email-handler
                                                                       :template notification.tu/channel-template-email-with-handlebars-body)]})
            created-template (-> notification :handlers first :template)]
        (is (=? template created-template))
        (testing "and can update the template"
          (let [updated-notification (mt/user-http-request :crowberto :put 200 (format "notification/%d" (:id notification))
                                                           (update notification :handlers (fn [[handler]]
                                                                                            [(assoc-in handler [:template :name] "New Name")])))
                updated-template    (-> updated-notification :handlers first :template)]
            (is (=? (-> created-template
                        (assoc :name "New Name")
                        (dissoc :updated_at :created_at))
                    (dissoc updated-template :updated_at :created_at)))))

        (testing "can delete the template"
          (mt/user-http-request :crowberto :put 200 (format "notification/%d" (:id notification))
                                (update notification :handlers (fn [[handler]]
                                                                 [(dissoc handler :template)])))
          (is (false? (t2/exists? :model/ChannelTemplate (:id created-template)))))

        (testing "and re-create it again"
          (let [notification       (mt/user-http-request :crowberto :put 200 (format "notification/%d" (:id notification))
                                                         (update notification :handlers (fn [[handler]]
                                                                                          [(assoc handler
                                                                                                  :template template
                                                                                                  :template_id nil)])))
                recreated-template (-> notification :handlers first :template)]
            (is (=? template recreated-template))))))))

(defn- update-cron-subscription
  [{:keys [subscriptions] :as notification} new-schedule ui-display-type]
  (assert (= 1 (count subscriptions)))
  (assoc notification :subscriptions [(assoc (first subscriptions)
                                             :cron_schedule new-schedule
                                             :ui_display_type ui-display-type)]))

(deftest update-notification-test
  (mt/with-temp [:model/ChannelTemplate {tmpl-id :id} notification.tu/channel-template-email-with-handlebars-body]
    (notification.tu/with-card-notification
      [notification {:card              {:dataset_query (mt/mbql-query users)}
                     :notification_card {:creator_id (mt/user->id :crowberto)}
                     :subscriptions     [{:type          :notification-subscription/cron
                                          :cron_schedule "0 0 0 * * ?"
                                          :ui_display_type :cron/raw}]
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
                    :cron_schedule "1 1 1 * * ?"
                    :ui_display_type "cron/builder"}]
                  (:subscriptions (update-notification (update-cron-subscription @notification "1 1 1 * * ?" "cron/builder"))))))

        (testing "can update payload info"
          (is (= "has_result" (get-in @notification [:payload :send_condition])))
          (is (=? {:send_condition "goal_above"}
                  (:payload (update-notification (assoc-in @notification [:payload :send_condition] "goal_above"))))))

        (testing "can add add a new recipient and modify the existing one"
          (let [existing-email-handler  (->> @notification :handlers (m/find-first #(= "channel/email" (:channel_type %))))
                existing-user-recipient (m/find-first #(= "notification-recipient/user" (:type %))
                                                      (:recipients existing-email-handler))
                new-recipients          [(assoc existing-user-recipient :user_id (mt/user->id :rasta))
                                         {:type                    :notification-recipient/group
                                          :notification_handler_id (:id existing-email-handler)
                                          :permissions_group_id    (:id (perms/admin-group))}]
                new-handlers            [(assoc existing-email-handler :recipients new-recipients)]]
            (is (=? [{:type                "notification-recipient/group"
                      :permissions_group_id (:id (perms/admin-group))}
                     {:type    "notification-recipient/user"
                      :user_id (mt/user->id :rasta)}]
                    (->> (update-notification (assoc @notification :handlers new-handlers))
                         :handlers (m/find-first #(= "channel/email" (:channel_type %))) :recipients (#(sort-by :type %)))))
            (testing "can remove all recipients"
              (is (= []
                     (->> (update-notification (assoc @notification :handlers [(assoc existing-email-handler :recipients [])]))
                          :handlers (m/find-first #(= "channel/email" (:channel_type %))) :recipients))))))

        (testing "can add new handler"
          (let [new-handler {:notification_id notification-id
                             :channel_type    :channel/slack
                             :recipients      [{:type    :notification-recipient/user
                                                :user_id (mt/user->id :rasta)}]}
                new-handlers (conj (:handlers @notification) new-handler)]
            (is (=? {:channel_type "channel/slack"
                     :recipients   [{:type    "notification-recipient/user"
                                     :user_id (mt/user->id :rasta)}]}
                    (->> (update-notification (assoc @notification :handlers new-handlers))
                         :handlers (m/find-first #(= "channel/slack" (:channel_type %))))))))))))

(deftest update-notification-audit-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-premium-features #{:audit-app}
      (notification.tu/with-card-notification
        [notification {:notification {:creator_id (mt/user->id :rasta)}
                       :handlers     [{:channel_type "channel/email"
                                       :recipients   [{:type    :notification-recipient/user
                                                       :user_id (mt/user->id :lucky)}]}]}]
        (mt/user-http-request
         :crowberto :put 200
         (format "notification/%d" (:id notification))
         (assoc notification :active false
                :subscriptions [{:id            -1
                                 :notification_id (:id notification)
                                 :type          "notification-subscription/cron"
                                 :cron_schedule "0 0 0 * * ?"}]))
        (testing "updating a notification publishes an event/notification-update event"
          (is (= {:topic :notification-update
                  :user_id (mt/user->id :crowberto)
                  :model "Notification"
                  :model_id (:id notification)
                  :details {:previous {:subscriptions []
                                       :active true}
                            :new      {:subscriptions [{:notification_id (:id notification)
                                                        :type "notification-subscription/cron"
                                                        :event_name nil
                                                        :cron_schedule "0 0 0 * * ?"
                                                        :ui_display_type nil}]
                                       :active false}}}
                 (mt/latest-audit-log-entry))))))))

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
    (is (=? {:specific-errors {:payload {:card_id ["missing required key, received: nil"]}}}
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
                   :channel/slack [{:blocks  (mt/malli=? some?)
                                    :channel "#general"}]
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

(deftest send-unsaved-notification-api-test
  (mt/with-temp [:model/Channel {http-channel-id :id} {:type    :channel/http
                                                       :details {:url         "https://metabase.com/testhttp"
                                                                 :auth-method "none"}}
                 :model/Card    {card-id :id}         {:dataset_query (mt/mbql-query products {:aggregation [[:count]]
                                                                                               :breakout    [$category]})}]
    (notification.tu/with-channel-fixtures [:channel/email :channel/slack]
      (testing "send to all handlers"
        (is (=? {:channel/email [{:message    (mt/malli=? some?)
                                  :recipients ["crowberto@metabase.com"]}]
                 :channel/slack [{:blocks  (mt/malli=? some?)
                                  :channel "#general"}]
                 :channel/http  [{:body (mt/malli=? some?)}]}
                (notification.tu/with-captured-channel-send!
                  (mt/user-http-request :crowberto :post 204 "notification/send"
                                        {:handlers [{:channel_type :channel/email
                                                     :recipients   [{:type    :notification-recipient/user
                                                                     :user_id (mt/user->id :crowberto)}]}
                                                    {:channel_type :channel/slack
                                                     :recipients   [{:type    :notification-recipient/raw-value
                                                                     :details {:value "#general"}}]}
                                                    {:channel_type :channel/http
                                                     :channel_id   http-channel-id}]
                                         :payload_type :notification/card
                                         :payload      {:card_id card-id
                                                        :send_condition :has_result
                                                        :send_once false}
                                         :subscriptions [{:type          :notification-subscription/cron
                                                          :cron_schedule "0 0 0 * * ?"}]}))))))

    (testing "links disabled/enabled based on x-metabase-client header"
      (let [notification-body {:handlers [{:channel_type :channel/email
                                           :recipients   [{:type    :notification-recipient/user
                                                           :user_id (mt/user->id :crowberto)}]}]
                               :payload_type :notification/card
                               :payload      {:card_id card-id
                                              :send_condition :has_result
                                              :send_once false}
                               :subscriptions [{:type          :notification-subscription/cron
                                                :cron_schedule "0 0 0 * * ?"}]}
            has-link? (fn [client-header]
                        (->> (notification.tu/with-captured-channel-send!
                               (if client-header
                                 (mt/user-http-request :crowberto :post 204 "notification/send"
                                                       {:request-options {:headers
                                                                          {"x-metabase-client" client-header}}}
                                                       notification-body)
                                 (mt/user-http-request :crowberto :post 204 "notification/send"
                                                       notification-body)))
                             :channel/email first :message first :content
                             (re-find #"href=")
                             (= "href=")))]
        (testing "x-metabase-client header is embedding-sdk-react (modular embedding SDK): result email has no links"
          (is (false? (has-link? "embedding-sdk-react"))))
        (testing "x-metabase-client header is embedding-simple (modular embedding): result email has no links"
          (is (false? (has-link? "embedding-simple"))))
        (testing "no x-metabase-client header: result email has links"
          (is (true? (has-link? nil))))))))

(deftest get-notification-permissions-test
  (mt/with-temp
    [:model/User {third-user-id :id} {:is_superuser false}]
    (notification.tu/with-card-notification
      [notification {:notification {:creator_id (mt/user->id :rasta)}
                     :handlers     [{:channel_type "channel/email"
                                     :recipients   [{:type    :notification-recipient/user
                                                     :user_id (mt/user->id :lucky)}]}]}]
      (let [get-notification (fn [user-or-id expected-status]
                               (mt/user-http-request user-or-id :get expected-status (format "notification/%d" (:id notification))))]
        (testing "admin can view"
          (get-notification :crowberto 200))

        (testing "creator can view"
          (get-notification :rasta 200))

        (testing "recipient can view"
          (get-notification :lucky 200))

        (testing "other than that no one can view"
          (get-notification third-user-id 403))))))

(deftest get-system-event-permissions-test
  (notification.tu/with-system-event-notification!
    [notification {:event :mb-test/permissions
                   :notification {:creator_id (mt/user->id :rasta)}}]
    (let [get-notification (fn [user-or-id expected-status]
                             (mt/user-http-request user-or-id :get expected-status (format "notification/%d" (:id notification))))]
      (testing "admin can view"
        (get-notification :crowberto 200))

      (testing "creator can view"
        (get-notification :rasta 200))

      (testing "other than that no one can view"
        (get-notification :lucky 403)))))

(defmacro ^:private with-disabled-subscriptions-permissions!
  [& body]
  `(try
     (perms/revoke-application-permissions! (perms/all-users-group) :subscription)
     ~@body
     (finally
       (perms/grant-application-permissions! (perms/all-users-group) :subscription))))

(deftest create-card-notification-permissions-test
  (mt/with-model-cleanup [:model/Notification]
    (binding [collection/*allow-deleting-personal-collections* true]
      (with-disabled-subscriptions-permissions!
        (mt/with-user-in-groups [group {:name "test notification perm"}
                                 user  [group]]
          (mt/with-temp
            [:model/Collection {collection-id :id} {:personal_owner_id (:id user)}
             :model/Card       {card-id :id}       {:collection_id collection-id}]
            (let [create-notification! (fn [user-or-id expected-status]
                                         (mt/user-http-request user-or-id :post expected-status "notification"
                                                               {:payload_type "notification/card"
                                                                :creator_id   (mt/user->id :rasta)
                                                                :payload      {:card_id card-id}}))]
              (mt/with-premium-features #{}
                (testing "admin can create"
                  (create-notification! :crowberto 200))

                (testing "users who can view the card can create"
                  (create-notification! user 200))

                (testing "normal users can't create"
                  (create-notification! :rasta 403))

                (mt/when-ee-evailable
                 (mt/with-premium-features #{:advanced-permissions}
                   (testing "with advanced-permissions enabled"
                     (testing "cannot create if they don't have subscriptions permissions enabled"
                       (create-notification! user 403)
                       (create-notification! :rasta 403))

                     (testing "can create if they have subscriptions permissions enabled"
                       (perms/grant-application-permissions! group :subscription)
                       (create-notification! user 200)
                       (create-notification! :rasta 403)))))))))))))

(deftest update-card-notification-permissions-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-user-in-groups [group {:name "test notification perm"}
                             user  [group]]
      (notification.tu/with-card-notification
        [notification {:card         {:collection_id (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :rasta))}
                       :notification {:creator_id (mt/user->id :rasta)}}]
        (let [update!                     (fn [user-or-id expected-status]
                                            (mt/user-http-request user-or-id :put expected-status (format "notification/%d" (:id notification))
                                                                  (assoc notification :updated_at (t/offset-date-time))))
              change-notification-creator (fn [user-id]
                                            ;; :model/Notification prevents updating creator_id, so we need to use table
                                            ;; name
                                            (t2/update! :notification (:id notification) {:creator_id user-id}))
              move-card-collection        (fn [user-id]
                                            (t2/update! :model/Card (-> notification :payload :card_id)
                                                        {:collection_id (t2/select-one-pk :model/Collection :personal_owner_id user-id)}))]
          (mt/with-premium-features #{}
            (testing "admin can update"
              (update! :crowberto 200))

            (testing "owner can update"
              (update! :rasta 200))

            (testing "owner can't no longer update if they can't view the card"
              (try
                ;; card is moved to crowberto's collection
                (move-card-collection (mt/user->id :crowberto))
                (update! :rasta 403)
                (finally
                  ;; move it back
                  (move-card-collection (mt/user->id :rasta)))))

            (testing "other than that noone can update"
              (update! :lucky 403))

            (mt/when-ee-evailable
             ;; change notification's creator to user for easy of testing
             (with-disabled-subscriptions-permissions!
               (try
                 (change-notification-creator (:id user))
                 (move-card-collection (:id user))
                 (mt/with-premium-features #{:advanced-permissions}
                   (testing "owners won't be able to update without subscription permissions"
                     (perms/revoke-application-permissions! (perms/all-users-group) :subscription)
                     (perms/revoke-application-permissions! group :subscription)
                     (update! (:id user) 403))
                   (testing "owners can update with subscription permissions"
                     (perms/grant-application-permissions! group :subscription)
                     (update! (:id user) 200)
                     (testing "but no longer able to update of they can't view the card"
                       (try
                         ;; card is moved to crowberto's collection
                         (move-card-collection (mt/user->id :crowberto))
                         (update! :rasta 403)
                         (finally
                           ;; move it back
                           (move-card-collection (mt/user->id :rasta)))))))
                 (finally
                   (change-notification-creator (mt/user->id :rasta))
                   (move-card-collection (mt/user->id :rasta))))))))))))

(deftest send-saved-notification-permissions-test
  (mt/with-temp [:model/User {third-user-id :id} {:is_superuser false}]
    (notification.tu/with-card-notification
      [notification {:notification {:creator_id (mt/user->id :rasta)}
                     :handlers     [{:channel_type "channel/email"
                                     :recipients   [{:type    :notification-recipient/user
                                                     :user_id (mt/user->id :lucky)}]}]}]
      (let [send-notification (fn [user-or-id expected-status]
                                (mt/user-http-request user-or-id :get expected-status (format "notification/%d" (:id notification))))]
        (testing "admin can send"
          (send-notification :crowberto 200))

        (testing "creator can send"
          (send-notification :rasta 200))

        (testing "recipient can send"
          (send-notification :lucky 200))

        (testing "other than that no one can send"
          (send-notification third-user-id 403))))))

(deftest send-unsaved-notification-permissions-test
  (mt/with-model-cleanup [:model/Notification]
    (binding [collection/*allow-deleting-personal-collections* true]
      (mt/with-user-in-groups [group {:name "test notification perm"}
                               user  [group]]
        (mt/with-temp
          [:model/Collection {collection-id :id} {:personal_owner_id (:id user)}
           :model/Card {card-id :id} {:collection_id collection-id}]
          (let [create-notification! (fn [user-or-id expected-status]
                                       (with-redefs [notification/send-notification! (fn [& _args] :done)]
                                         (mt/user-http-request user-or-id :post expected-status "notification/send"
                                                               {:payload_type  "notification/card"
                                                                :creator_id    (mt/user->id :rasta)
                                                                :handlers      []
                                                                :subscriptions []
                                                                :payload       {:card_id card-id}})))]
            (mt/with-premium-features #{}
              (testing "admin can send"
                (create-notification! :crowberto 200))

              (testing "users who can view the card can send"
                (create-notification! (:id user) 200))

              (testing "normal users can't send"
                (create-notification! :rasta 403))

              (mt/when-ee-evailable
               (with-disabled-subscriptions-permissions!
                 (mt/with-premium-features #{:advanced-permissions}
                   (testing "when advanced subscription permissions is enabled and users can read the card"
                     (testing "can't send if don't have subscription permissions"
                       (perms/revoke-application-permissions! group :subscription)
                       (create-notification! (:id user) 403))

                     (testing "can send if advanced-permissions is enabled"
                       (perms/grant-application-permissions! group :subscription)
                       (create-notification! (:id user) 200)))))))))))))

(deftest list-notifications-basic-test
  (testing "GET /api/notification"
    (mt/with-model-cleanup [:model/Notification]
      (notification.tu/with-card-notification [{rasta-noti-1 :id} {:notification {:creator_id (mt/user->id :rasta)}
                                                                   :handlers     [{:channel_type "channel/email"
                                                                                   :recipients   [{:type    :notification-recipient/user
                                                                                                   :user_id (mt/user->id :lucky)}]}]}]
        (notification.tu/with-card-notification [{crowberto-noti-1 :id} {:notification {:creator_id (mt/user->id :crowberto)
                                                                                        :active true}}]
          (notification.tu/with-card-notification [{rasta-noti-2 :id} {:notification {:creator_id (mt/user->id :rasta)
                                                                                      :active false}}]
            (letfn [(get-notification-ids [user & params]
                      (->> (apply mt/user-http-request user :get 200 "notification" params)
                           (map :id)
                           (filter #{rasta-noti-1 crowberto-noti-1 rasta-noti-2})
                           set))]

              (testing "returns all active notifications by default"
                (is (= #{rasta-noti-1 crowberto-noti-1}
                       (get-notification-ids :crowberto))))

              (testing "include inactive notifications"
                (is (= #{rasta-noti-1 crowberto-noti-1 rasta-noti-2}
                       (get-notification-ids :crowberto :include_inactive true)))))))))))

(deftest list-notifications-creator-filter-test
  (testing "GET /api/notification with creator_id filter"
    (mt/with-model-cleanup [:model/Notification]
      (notification.tu/with-card-notification [{rasta-noti :id} {:notification {:creator_id (mt/user->id :rasta)}
                                                                 :handlers     [{:channel_type "channel/email"
                                                                                 :recipients   [{:type    :notification-recipient/user
                                                                                                 :user_id (mt/user->id :lucky)}]}]}]
        (letfn [(get-notification-ids [user & params]
                  (->> (apply mt/user-http-request user :get 200 "notification" params)
                       (map :id)
                       (filter #{rasta-noti})
                       set))]

          (testing "admin can view"
            (is (= #{rasta-noti}
                   (get-notification-ids :crowberto :creator_id (mt/user->id :rasta)))))

          (testing "creators can view notifications they created"
            (is (= #{rasta-noti}
                   (get-notification-ids :rasta :creator_id (mt/user->id :rasta)))))

          (testing "recipients can view"
            (is (= #{rasta-noti}
                   (get-notification-ids :lucky :creator_id (mt/user->id :rasta)))))

          (testing "other than that no one can view"
            (mt/with-temp [:model/User {third-user-id :id} {:is_superuser false}]
              (is (= #{}
                     (get-notification-ids third-user-id :creator_id (mt/user->id :rasta))))))

          (testing "non-existent creator id returns empty set"
            (is (= #{}
                   (get-notification-ids :crowberto :creator_id Integer/MAX_VALUE)))))))))

(deftest list-notifications-recipient-filter-test
  (testing "GET /api/notification with recipient_id filter"
    (mt/with-model-cleanup [:model/Notification]
      (notification.tu/with-card-notification [{rasta-noti :id} {:notification {:creator_id (mt/user->id :rasta)}
                                                                 :handlers     [{:channel_type "channel/email"
                                                                                 :recipients   [{:type    :notification-recipient/user
                                                                                                 :user_id (mt/user->id :lucky)}]}]}]
        (letfn [(get-notification-ids [user & params]
                  (->> (apply mt/user-http-request user :get 200 "notification" params)
                       (map :id)
                       (filter #{rasta-noti})
                       set))]

          (testing "admin can view"
            (is (= #{rasta-noti}
                   (get-notification-ids :crowberto :recipient_id (mt/user->id :lucky)))))

          (testing "recipients can view notifications they receive"
            (is (= #{rasta-noti}
                   (get-notification-ids :lucky :recipient_id (mt/user->id :lucky)))))

          (testing "creators can view"
            (is (= #{rasta-noti}
                   (get-notification-ids :rasta :recipient_id (mt/user->id :lucky)))))

          (testing "other than that no one can view"
            (mt/with-temp [:model/User {third-user-id :id} {:is_superuser false}]
              (is (= #{}
                     (get-notification-ids third-user-id :recipient_id (mt/user->id :lucky))))))

          (testing "non-existent recipient id returns empty set"
            (is (= #{}
                   (get-notification-ids :crowberto :recipient_id Integer/MAX_VALUE)))))))))

(deftest list-notifications-creator-or-recipient-id-filter-test
  (testing "GET /api/notification with :creator_or_recipient_id filter"
    (mt/with-model-cleanup [:model/Notification]
      (notification.tu/with-card-notification [{rasta-noti :id} {:notification {:creator_id (mt/user->id :rasta)}
                                                                 :handlers     [{:channel_type "channel/email"
                                                                                 :recipients   [{:type    :notification-recipient/user
                                                                                                 :user_id (mt/user->id :lucky)}
                                                                                                {:type    :notification-recipient/user
                                                                                                 :user_id (mt/user->id :rasta)}]}]}]
        (notification.tu/with-card-notification [{lucky-noti :id} {:notification {:creator_id (mt/user->id :lucky)}
                                                                   :handlers     [{:channel_type "channel/email"
                                                                                   :recipients   [{:type    :notification-recipient/user
                                                                                                   :user_id (mt/user->id :rasta)}]}]}]

          (letfn [(get-notification-ids [user & params]
                    (->> (apply mt/user-http-request user :get 200 "notification" params)
                         (map :id)
                         (filter #{rasta-noti lucky-noti})
                         sort))]

            (testing "return notifications where user is either creator or recipient"
              (is (= (sort [rasta-noti lucky-noti])
                     (get-notification-ids :crowberto :creator_or_recipient_id (mt/user->id :rasta)))))))))))

(deftest list-notifications-card-filter-test
  (testing "GET /api/notification with card_id filter"
    (mt/with-model-cleanup [:model/Notification]
      (notification.tu/with-card-notification [{rasta-noti :id} {:notification {:creator_id (mt/user->id :rasta)}
                                                                 :handlers     [{:channel_type "channel/email"
                                                                                 :recipients   [{:type    :notification-recipient/user
                                                                                                 :user_id (mt/user->id :lucky)}]}]}]
        (let [card-id (-> (t2/select-one :model/Notification rasta-noti)
                          models.notification/hydrate-notification
                          :payload
                          :card_id)]
          (letfn [(get-notification-ids [user & params]
                    (->> (apply mt/user-http-request user :get 200 "notification" params)
                         (map :id)
                         (filter #{rasta-noti})
                         set))]

            (testing "admin can view"
              (is (= #{rasta-noti}
                     (get-notification-ids :crowberto :card_id card-id))))

            (testing "creators can view notifications with their cards"
              (is (= #{rasta-noti}
                     (get-notification-ids :rasta :card_id card-id))))

            (testing "recipients can view"
              (is (= #{rasta-noti}
                     (get-notification-ids :lucky :card_id card-id))))

            (testing "other than that no one can view"
              (mt/with-temp [:model/User {third-user-id :id} {:is_superuser false}]
                (is (= #{}
                       (get-notification-ids third-user-id :card_id card-id)))))

            (testing "non-existent card id returns empty set"
              (is (= #{}
                     (get-notification-ids :crowberto :card_id Integer/MAX_VALUE))))))))))

(deftest list-notifications-combined-filters-test
  (testing "GET /api/notification with multiple filters"
    (mt/with-model-cleanup [:model/Notification]
      (notification.tu/with-card-notification [{rasta-noti :id} {:notification {:creator_id (mt/user->id :rasta)}
                                                                 :handlers     [{:channel_type "channel/email"
                                                                                 :recipients   [{:type    :notification-recipient/user
                                                                                                 :user_id (mt/user->id :lucky)}]}]}]
        (let [card-id (-> (t2/select-one :model/Notification rasta-noti)
                          models.notification/hydrate-notification
                          :payload
                          :card_id)]
          (letfn [(get-notification-ids [user & params]
                    (->> (apply mt/user-http-request user :get 200 "notification" params)
                         (map :id)
                         (filter #{rasta-noti})
                         set))]

            (testing "can filter by creator_id and recipient_id"
              (is (= #{rasta-noti}
                     (get-notification-ids :crowberto
                                           :creator_id (mt/user->id :rasta)
                                           :recipient_id (mt/user->id :lucky)))))

            (testing "can filter by creator_id and card_id"
              (is (= #{rasta-noti}
                     (get-notification-ids :crowberto
                                           :creator_id (mt/user->id :rasta)
                                           :card_id card-id))))

            (testing "can filter by recipient_id and card_id"
              (is (= #{rasta-noti}
                     (get-notification-ids :crowberto
                                           :recipient_id (mt/user->id :lucky)
                                           :card_id card-id))))

            (testing "can filter by all three"
              (is (= #{rasta-noti}
                     (get-notification-ids :crowberto
                                           :creator_id (mt/user->id :rasta)
                                           :recipient_id (mt/user->id :lucky)
                                           :card_id card-id))))

            (testing "returns empty set when any filter doesn't match"
              (is (= #{}
                     (get-notification-ids :crowberto
                                           :creator_id (mt/user->id :rasta)
                                           :recipient_id Integer/MAX_VALUE
                                           :card_id card-id))))))))))

(deftest unsubscribe-notification-test
  (mt/with-model-cleanup [:model/Notification]
    (let [unsbuscribe     (fn [user status thunk]
                            (notification.tu/with-card-notification
                              [{noti-id :id} {:notification {:creator_id (mt/user->id :crowberto)}
                                              :handlers     [{:channel_type "channel/email"
                                                              :recipients   [{:type    :notification-recipient/user
                                                                              :user_id (mt/user->id :crowberto)}
                                                                             {:type    :notification-recipient/user
                                                                              :user_id (mt/user->id :lucky)}]}]}]
                              (mt/user-http-request user :post status (format "notification/%d/unsubscribe" noti-id))
                              (thunk (models.notification/hydrate-notification (t2/select-one :model/Notification noti-id)))))
          email-recipients (fn [notification]
                             (->> notification :handlers (m/find-first #(= :channel/email (:channel_type %))) :recipients))]
      (testing "creator can unsubscribe themselves"
        (unsbuscribe
         :crowberto 204
         (fn [noti]
           (is (=?
                [{:type    :notification-recipient/user
                  :user_id (mt/user->id :lucky)}]
                (email-recipients noti))))))

      (testing "recipient can unsubscribe themselves"
        (unsbuscribe
         :lucky 204
         (fn [noti]
           (is (=?
                [{:type    :notification-recipient/user
                  :user_id (mt/user->id :crowberto)}]
                (email-recipients noti))))))

      (testing "other than that no one can unsubscribe"
        (unsbuscribe
         :rasta 403
         (fn [noti]
           (is (=?
                [{:type    :notification-recipient/user
                  :user_id (mt/user->id :crowberto)}
                 {:type    :notification-recipient/user
                  :user_id (mt/user->id :lucky)}]
                (email-recipients noti)))))))))

(deftest unsubscribe-notification-only-current-notification-test
  (testing "test that unsubscribe will only unsubscribe from the specified notification"
    (notification.tu/with-channel-fixtures [:channel/email]
      (mt/with-model-cleanup [:model/Notification]
        (let [email-recipients (fn [noti-id]
                                 (->> (t2/select-one :model/Notification noti-id)
                                      models.notification/hydrate-notification
                                      :handlers
                                      (m/find-first #(= :channel/email (:channel_type %)))
                                      :recipients))]
          (notification.tu/with-card-notification [{noti-1 :id} {:notification {:creator_id (mt/user->id :rasta)}
                                                                 :handlers     [{:channel_type "channel/email"
                                                                                 :recipients   [{:type    :notification-recipient/user
                                                                                                 :user_id (mt/user->id :lucky)}]}]}]
            (notification.tu/with-card-notification [{noti-2 :id} {:notification {:creator_id (mt/user->id :rasta)}
                                                                   :handlers     [{:channel_type "channel/email"
                                                                                   :recipients   [{:type    :notification-recipient/user
                                                                                                   :user_id (mt/user->id :lucky)}]}]}]
              ;; Unsubscribe from first notification
              (mt/user-http-request :lucky :post 204 (format "notification/%d/unsubscribe" noti-1))

              ;; Check first notification has no recipients
              ;; First notification should have no recipients
              (is (empty? (email-recipients noti-1)))
              ;; Second notification should still have lucky as recipient
              (is (=? [{:type    :notification-recipient/user
                        :user_id (mt/user->id :lucky)}]
                      (email-recipients noti-2))))))))))

(deftest unsubscribe-receive-email-test
  (testing "test that unsubscribe will not receive email"
    (mt/with-model-cleanup [:model/Notification]
      (notification.tu/with-channel-fixtures [:channel/email]
        (notification.tu/with-card-notification [{noti-1 :id
                                                  :as notification} {:notification {:creator_id (mt/user->id :rasta)}
                                                                     :card         {:name "My Card"}
                                                                     :handlers     [{:channel_type "channel/email"
                                                                                     :recipients   [{:type    :notification-recipient/user
                                                                                                     :user_id (mt/user->id :lucky)}]}]}]
          (let [[email] (notification.tu/with-mock-inbox-email!
                          (with-send-messages-sync!
                            (mt/user-http-request :lucky :post 204 (format "notification/%d/unsubscribe" noti-1))))
                a-href (format "<a href=\"https://testmb.com/question/%d\">My Card</a>."
                               (-> notification :payload :card_id))]
            (testing "sends unsubscribe confirmation email"
              (is (=? {:bcc     #{"lucky@metabase.com"}
                       :subject "You unsubscribed from an alert"
                       :body    [{"You’re no longer receiving alerts about" true
                                  a-href                                    true}]}
                      (mt/summarize-multipart-single-email email
                                                           #"You’re no longer receiving alerts about"
                                                           (re-pattern a-href)))))))))))

(deftest unsubscribe-notification-audit-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-premium-features #{:audit-app}
      (notification.tu/with-card-notification
        [notification {:notification {:creator_id (mt/user->id :rasta)}
                       :handlers     [{:channel_type "channel/email"
                                       :recipients   [{:type    :notification-recipient/user
                                                       :user_id (mt/user->id :lucky)}]}]}]
        (mt/user-http-request :lucky :post 204 (format "notification/%d/unsubscribe" (:id notification)))
        (testing "unsubscribing from a notification publishes an event/notification-unsubscribe event"
          (is (= {:topic    :notification-unsubscribe
                  :user_id  (mt/user->id :lucky)
                  :model    "Notification"
                  :model_id (:id notification)
                  :details  {}}
                 (mt/latest-audit-log-entry))))))))

(deftest notify-notification-updates-email-test
  (testing "notify-notification-updates! sends appropriate emails based on notification changes"
    (mt/with-model-cleanup [:model/Notification]
      (notification.tu/with-channel-fixtures [:channel/email]
        (let [base-notification {:notification {:creator_id (mt/user->id :crowberto)}
                                 :card         {:name "Test Card"}
                                 :handlers     [{:channel_type "channel/email"
                                                 :recipients   [{:type    :notification-recipient/user
                                                                 :user_id  (mt/user->id :rasta)}
                                                                {:type    :notification-recipient/raw-value
                                                                 :details {:value "test@metabase.com"}}]}]}
              make-card-url-tag (fn [notification]
                                  (format "<a href=\".*/question/%d\">Test Card</a>."
                                          (-> notification :payload :card_id)))
              update-notification! (fn [noti-id notification updates]
                                     (notification.tu/with-mock-inbox-email!
                                       (with-send-messages-sync!
                                         (mt/user-http-request :crowberto :put 200
                                                               (format "notification/%d" noti-id)
                                                               (merge notification updates)))))
              check-email (fn [& {:keys [email expected-bcc expected-subject card-url-tag]}]
                            (is (=? {:bcc     expected-bcc
                                     :subject expected-subject
                                     :body    [{card-url-tag true}]}
                                    (mt/summarize-multipart-single-email email (re-pattern card-url-tag)))))]

          (testing "when notification is archived (active -> inactive)"
            (notification.tu/with-card-notification
              [{noti-id :id :as notification} base-notification]
              (let [[email] (update-notification! noti-id notification {:active false})
                    card-url-tag (make-card-url-tag notification)]
                (check-email :email email
                             :expected-bcc #{"rasta@metabase.com" "test@metabase.com"}
                             :expected-subject "You’ve been unsubscribed from an alert"
                             :card-url-tag card-url-tag))))

          (testing "when notification is unarchived (inactive -> active)"
            (notification.tu/with-card-notification
              [{noti-id :id :as notification} (assoc-in base-notification [:notification :active] false)]
              (let [[email] (update-notification! noti-id notification {:active true})
                    card-url-tag (make-card-url-tag notification)]
                (check-email :email email
                             :expected-bcc #{"rasta@metabase.com" "test@metabase.com"}
                             :expected-subject "Crowberto Corv added you to an alert"
                             :card-url-tag card-url-tag))))

          (testing "when recipients are modified"
            (notification.tu/with-card-notification
              [{noti-id :id :as notification} base-notification]
              (let [handler-id (->> notification :handlers (m/find-first #(= :channel/email (:channel_type %))) :id)
                    updated-recipients [{:notification_handler_id handler-id
                                         :type                    :notification-recipient/user
                                         :user_id                 (mt/user->id :lucky)}
                                        {:notification_handler_id handler-id
                                         :type                    :notification-recipient/raw-value
                                         :details                 {:value "new@metabase.com"}}]
                    [removed-email added-email] (update-notification! noti-id notification
                                                                      (assoc-in notification [:handlers 0 :recipients] updated-recipients))
                    card-url-tag (make-card-url-tag notification)]

                (testing "sends unsubscribe email to removed recipients"
                  (check-email :email removed-email
                               :expected-bcc #{"rasta@metabase.com" "test@metabase.com"}
                               :expected-subject "You’ve been unsubscribed from an alert"
                               :card-url-tag card-url-tag))

                (testing "sends subscription email to new recipients"
                  (check-email :email added-email
                               :expected-bcc #{"lucky@metabase.com" "new@metabase.com"}
                               :expected-subject "Crowberto Corv added you to an alert"
                               :card-url-tag card-url-tag)))))

          (testing "no emails sent when recipients haven't changed"
            (notification.tu/with-card-notification
              [{noti-id :id :as notification} base-notification]
              (let [emails (update-notification! noti-id notification
                                                 (assoc-in notification [:payload :send_condition] "goal_above"))]
                (is (empty? emails))))))))))

(deftest validate-email-domains-test
  (mt/when-ee-evailable
   (mt/with-premium-features #{:email-allow-list}
     (mt/with-model-cleanup [:model/Notification]
       (mt/with-temporary-setting-values [subscription-allowed-domains "example.com"]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders {:limit 1})}]
           (let [notification {:payload_type  "notification/card"
                               :creator_id    (mt/user->id :crowberto)
                               :payload       {:card_id card-id
                                               :send_condition "has_result"}}
                 failed-handlers [{:channel_type "channel/email"
                                   :recipients   [{:type    "notification-recipient/raw-value"
                                                   :details {:value "ngoc@metabase.com"}}
                                                  {:type    "notification-recipient/raw-value"
                                                   :details {:value "ngoc@metaba.be"}}]}]
                 success-handlers [{:channel_type "channel/email"
                                    :recipients   [{:type    "notification-recipient/raw-value"
                                                    :details {:value "ngoc@example.com"}}]}]]
             (testing "on creation"
               (testing "fail if recipients does not match allowed domains"
                 (is (= "The following email addresses are not allowed: ngoc@metabase.com, ngoc@metaba.be"
                        (mt/user-http-request :crowberto :post 403 "notification" (assoc notification :handlers failed-handlers)))))

               (testing "success if recipients matches allowed domains"
                 (mt/user-http-request :crowberto :post 200 "notification" (assoc notification :handlers success-handlers))))

             (testing "on update"
               (notification.tu/with-card-notification [notification {}]
                 (testing "fail if recipients does not match allowed domains"
                   (is (= "The following email addresses are not allowed: ngoc@metabase.com, ngoc@metaba.be"
                          (mt/user-http-request :crowberto :put 403 (format "notification/%d" (:id notification))
                                                (assoc notification :handlers failed-handlers)))))

                 (testing "success if recipients matches allowed domains"
                   (mt/user-http-request :crowberto :put 200 (format "notification/%d" (:id notification))
                                         (assoc notification :handlers success-handlers)))))

             (testing "on send test"
               (testing "fail if recipients does not match allowed domains"
                 (is (= "The following email addresses are not allowed: ngoc@metabase.com, ngoc@metaba.be"
                        (mt/user-http-request :crowberto :post 403 "notification/send"
                                              (assoc notification :handlers failed-handlers)))))
               (testing "success if recipients matches allowed domains"
                 (mt/user-http-request :crowberto :post 204 "notification/send"
                                       (assoc notification :handlers success-handlers)))))))))))
