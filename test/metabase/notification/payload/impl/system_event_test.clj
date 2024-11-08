(ns metabase.notification.payload.impl.system-event-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.models.notification :as models.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.public-settings :as public-settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.urls :as urls]
   [toucan2.core :as t2]))

(use-fixtures
  :once
  (fixtures/initialize :test-users-personal-collections :web-server :plugins))

(defn- publish-user-invited-event!
  [user invitor from-setup?]
  (events/publish-event! :event/user-invited {:object  (assoc user
                                                              :is_from_setup from-setup?
                                                              :invite_method "email")
                                              :details {:invitor invitor}}))

(deftest system-event-e2e-test
  (testing "a system event that sends to an email channel with a custom template to an user recipient"
    (notification.tu/with-notification-testing-setup
      (mt/with-temp [:model/ChannelTemplate tmpl {:channel_type :channel/email
                                                  :details      {:type    :email/handlebars-text
                                                                 :subject "Welcome {{payload.event_info.object.first_name}} to {{context.site_name}}"
                                                                 :body    "Hello {{payload.event_info.object.first_name}}! Welcome to {{context.site_name}}!"}}
                     :model/User             {user-id :id} {:email "ngoc@metabase.com"}
                     :model/PermissionsGroup {group-id :id} {:name "Avengers"}
                     :model/PermissionsGroupMembership _ {:group_id group-id
                                                          :user_id user-id}]
        (let [rasta (mt/fetch-user :rasta)]
          (models.notification/create-notification!
           {:payload_type :notification/system-event}
           [{:type       :notification-subscription/system-event
             :event_name :event/user-invited}]
           [{:channel_type :channel/email
             :template_id  (:id tmpl)
             :recipients   [{:type    :notification-recipient/user
                             :user_id (mt/user->id :crowberto)}
                            {:type                 :notification-recipient/group
                             :permissions_group_id group-id}
                            {:type    :notification-recipient/external-email
                             :details {:email "hi@metabase.com"}}]}])
          (mt/with-temporary-setting-values
            [site-name "Metabase Test"]
            (mt/with-fake-inbox
              (publish-user-invited-event! rasta {:first_name "Ngoc" :email "ngoc@metabase.com"} false)
              (let [email {:from    "notifications@metabase.com",
                           :subject "Welcome Rasta to Metabase Test"
                           :body    [{:type    "text/html; charset=utf-8"
                                      :content "Hello Rasta! Welcome to Metabase Test!"}]}]
                (is (=? {"crowberto@metabase.com" [email]
                         "ngoc@metabase.com"      [email]
                         "hi@metabase.com"        [email]}
                        @mt/inbox))))))))))

(deftest system-event-resouce-template-test
  (testing "a system event that sends to an email channel with a custom template to an user recipient"
    (notification.tu/with-notification-testing-setup
      (mt/with-temp [:model/ChannelTemplate tmpl {:channel_type :channel/email
                                                  :details      {:type    :email/handlebars-resource
                                                                 :subject "Welcome {{payload.event_info.object.first_name}} to {{context.site_name}}"
                                                                 :path    "notification/channel_template/hello_world.hbs"}}
                     :model/User             {user-id :id} {:email "ngoc@metabase.com"}
                     :model/PermissionsGroup {group-id :id} {:name "Avengers"}
                     :model/PermissionsGroupMembership _ {:group_id group-id
                                                          :user_id user-id}]
        (let [rasta (mt/fetch-user :rasta)]
          (models.notification/create-notification!
           {:payload_type :notification/system-event}
           [{:type       :notification-subscription/system-event
             :event_name :event/user-invited}]
           [{:channel_type :channel/email
             :template_id  (:id tmpl)
             :recipients   [{:type    :notification-recipient/user
                             :user_id (mt/user->id :crowberto)}
                            {:type                 :notification-recipient/group
                             :permissions_group_id group-id}
                            {:type    :notification-recipient/external-email
                             :details {:email "hi@metabase.com"}}]}])
          (mt/with-temporary-setting-values
            [site-name "Metabase Test"]
            (mt/with-fake-inbox
              (publish-user-invited-event! rasta {:first_name "Ngoc" :email "ngoc@metabase.com"} false)
              (let [email {:from    "notifications@metabase.com",
                           :subject "Welcome Rasta to Metabase Test"
                           :body    [{:type    "text/html; charset=utf-8"
                                      :content "Hello Rasta! Welcome to Metabase Test!\n"}]}]
                (is (=? {"crowberto@metabase.com" [email]
                         "ngoc@metabase.com"      [email]
                         "hi@metabase.com"        [email]}
                        @mt/inbox))))))))))

(deftest user-invited-event-send-email-test
  (testing "publish an :user-invited event will send an email"
    (doseq [from-setup? [true false]]
      (testing (format "from %s page" (if from-setup? "setup" "invite"))
        (is (= {:channel/email 1}
               (update-vals (notification.tu/with-captured-channel-send!
                              (publish-user-invited-event! (t2/select-one :model/User)
                                                           {:first_name "Ngoc"
                                                            :email      "ngoc@metabase.com"}
                                                           from-setup?))
                            count)))))))

(deftest user-invited-email-content-test
  (let [check (fn [sent-from-setup? expected-subject regexes]
                (let [email (mt/with-temporary-setting-values
                              [site-url  "https://metabase.com"
                               site-name "SuperStar"]
                              (-> (notification.tu/with-captured-channel-send!
                                    (publish-user-invited-event! (t2/select-one :model/User :email "crowberto@metabase.com")
                                                                 {:first_name "Ngoc" :email "ngoc@metabase.com"}
                                                                 sent-from-setup?))
                                  :channel/email first))]
                  (is (= {:recipients     #{"crowberto@metabase.com"}
                          :message-type   :attachments
                          :subject        expected-subject
                          :message        [(zipmap (map str regexes) (repeat true))]
                          :recipient-type :cc}
                         (apply mt/summarize-multipart-single-email email regexes)))))]
    (testing "sent from invite page"
      (check false
             "You're invited to join SuperStar's Metabase"
             [#"Crowberto's happiness and productivity over time"
              #"Ngoc wants you to join them on Metabase"
              #"<a[^>]*href=\"https?://metabase\.com/auth/reset_password/.*#new\"[^>]*>Join now</a>"])

      (testing "with sso enabled"
        (with-redefs [public-settings/sso-enabled? (constantly true)
                      public-settings/enable-password-login (constantly false)]
          (check false
                 "You're invited to join SuperStar's Metabase"
                 [#"<a[^>]*href=\"https?://metabase\.com/auth/login\"[^>]*>Join now</a>"]))))

    (testing "subject is translated"
      (mt/with-mock-i18n-bundles! {"es" {:messages {"You''re invited to join {0}''s {1}"
                                                    "Estás invitado a unirte al {0} de {1}"}}}
        (mt/with-temporary-setting-values [site-locale "es"]
          (check false "Estás invitado a unirte al SuperStar de Metabase" []))))

    (testing "sent from setup page"
      (check true
             "You're invited to join SuperStar's Metabase"
             [#"Crowberto's happiness and productivity over time"
              #"Ngoc could use your help setting up Metabase"
              #"<a[^>]*href=\"https?://metabase\.com/auth/reset_password/.*#new\"[^>]*>"]))))

(deftest alert-create-email-test
  (mt/with-temp [:model/Card card {:name "A Card"}]
    (mt/with-temporary-setting-values [site-url "https://metabase.com"]
      (let [rasta (mt/fetch-user :rasta)
            check (fn [alert-condition condition-regex]
                    (let [regexes [#"This is just a confirmation"
                                   (re-pattern (format "<a href=\"%s\"*>%s</a>" (urls/card-url (:id card)) (:name card)))
                                   condition-regex]
                          email   (-> (notification.tu/with-captured-channel-send!
                                        (events/publish-event! :event/alert-create {:object (t2/instance :model/Pulse
                                                                                                         (merge {:name "A Pulse"
                                                                                                                 :card card}
                                                                                                                alert-condition))
                                                                                    :user-id (:id rasta)}))
                                      :channel/email
                                      first)]
                      (is (= {:recipients     #{(:email rasta)}
                              :message-type   :attachments
                              :subject        "You set up an alert"
                              :message        [(zipmap (map str regexes) (repeat true))]
                              :recipient-type :cc}
                             (apply mt/summarize-multipart-single-email email regexes)))))]

        (doseq [[alert-condition condition-regex]
                [[{:alert_condition "rows"}
                  #"This alert will be sent whenever this question has any results"]
                 [{:alert_condition "goal"
                   :alert_above_goal true}
                  #"This alert will be sent when this question meets its goal"]
                 [{:alert_condition "goal"
                   :alert_above_goal false}
                  #"This alert will be sent when this question goes below its goal"]]]
          (check alert-condition condition-regex))))))

(deftest slack-error-token-email-test
  (let [check (fn [recipients regexes]
                (let [email (mt/with-temporary-setting-values
                              [site-url  "https://metabase.com"]
                              (-> (notification.tu/with-captured-channel-send!
                                    (events/publish-event! :event/slack-token-invalid {}))
                                  :channel/email
                                  first))]
                  (is (= {:recipients     recipients
                          :message-type   :attachments
                          :subject        "Your Slack connection stopped working"
                          :message        [(zipmap (map str regexes) (repeat true))]
                          :recipient-type :cc}
                         (apply mt/summarize-multipart-single-email email regexes)))))
        admin-emails (t2/select-fn-set :email :model/User :is_superuser true)]
    (testing "send to admins with a link to setting page"
      (check admin-emails [#"Your Slack connection stopped working"
                           #"<a[^>]*href=\"https?://metabase\.com/admin/settings/slack\"[^>]*>Go to settings</a>"]))

    (mt/with-temporary-setting-values
      [admin-email "it@metabase.com"]
      (check (conj admin-emails "it@metabase.com") []))))
