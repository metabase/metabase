(ns metabase.notification.system-event-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.models.notification :as models.notification]
   [metabase.test :as mt]))

(deftest system-event-e2e-test
  (testing "a system event that sends to an email channel with a custom template to an user recipient"
    (mt/with-model-cleanup [:model/Notification]
      (mt/with-temp [:model/ChannelTemplate tmpl {:channel_type :channel/email
                                                  :details      {:subject "Welcome {{event-info.object.first_name}} to {{settings.site-name}}"
                                                                 :body    "Hello {{event-info.object.first_name}}! Welcome to {{settings.site-name}}!"}}]
        (let [rasta (mt/fetch-user :rasta)]
          (models.notification/create-notification!
           {:payload_type :notification/system-event}
           [{:type       :notification-subscription/system-event
             :event_name :event/user-invited}]
           [{:channel_type :channel/email
             :template_id  (:id tmpl)
             :recipients   [{:type    :notification-recipient/user
                             :user_id (mt/user->id :crowberto)}
                            {:type    :notification-recipient/user
                             :user_id (mt/user->id :lucky)}]}])
          (mt/with-temporary-setting-values
            [site-name "Metabase Test"]
            (mt/with-fake-inbox
              (events/publish-event! :event/user-invited {:object rasta})
              (let [email {:from    "notifications@metabase.com",
                           :subject "Welcome Rasta to Metabase Test"
                           :body    [{:type    "text/html; charset=utf-8"
                                      :content "Hello Rasta! Welcome to Metabase Test!"}]}]
                (is (=? {"crowberto@metabase.com" [email]
                         "lucky@metabase.com"     [email]}
                        @mt/inbox))))))))))
