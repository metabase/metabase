(ns metabase.api.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.test-util :as notification.tu]
   [metabase.sync.sync-metadata]
   [metabase.test :as mt]))

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
        (is (=?
             {:id            notification-id
              :creator_id    (mt/user->id :crowberto)
              :creator       {:email "crowberto@metabase.com"}
              :payload_type  "notification/card"
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
             (mt/user-http-request :crowberto :get (format "notification/%d" notification-id))))))))
