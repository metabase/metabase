(ns metabase.notification.payload.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.test :as mt]))

(deftest default-context-test
  (testing "you shouldn't delete or rename these fields without 100% sure that it's not referenced
           in any channel_template.details or notification_recipient.details"
    (mt/with-additional-premium-features #{:whitelabel}
      (mt/with-temporary-setting-values
        [application-name   "Metabase Test"
         application-colors {:brand "#509EE3"}
         site-name          "Metabase Test"
         site-url           "https://metabase.com"
         admin-email        "ngoc@metabase.com"]
        (is (= {:payload_type :notification/system-event
                :payload      {:event_info  {:foo :bar}
                               :event_topic :event/user-joined
                               :custom      {}}
                :context     {:application_name     "Metabase Test"
                              :application_color    "#509EE3"
                              :application_logo_url "http://static.metabase.com/email_logo.png"
                              :site_name            "Metabase Test"
                              :site_url             "https://metabase.com"
                              :admin_email          "ngoc@metabase.com"
                              :style                {:button true}}
                :creator     nil}
               (-> (notification.payload/notification-payload {:payload_type :notification/system-event
                                                               :payload      {:event_topic :event/user-joined
                                                                              :event_info {:foo :bar}}})
                   (update-in [:context :style :button] string?))))))))
