(ns metabase.models.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.channel-test :as api.channel-test]
   [metabase.models.notification :as models.notification]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;; ------------------------------------------------------------------------------------------------;;
;;                                      Life cycle test                                            ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest notification-type-test
  (mt/with-model-cleanup [:model/Notification]
    (testing "success path"
      (let [noti-id (t2/insert-returning-pk! :model/Notification {:payload_type :notification/system-event
                                                                  :created_at   :%now
                                                                  :updated_at   :%now})]
        (is (some? (t2/select-one :model/Notification noti-id)))))

    (testing "failed if payload_type is invalid"
      (is (thrown-with-msg? Exception #"Invalid value :notification/not-existed\. Must be one of .*"
                            (t2/insert! :model/Notification {:payload_type :notification/not-existed}))))))

(deftest notification-subscription-type-test
  (mt/with-temp [:model/Notification {noti-id :id} {}]
    (testing "success path"
      (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                             :event_name      :event/card-create
                                                                             :notification_id noti-id})]
        (is (some? (t2/select-one :model/NotificationSubscription sub-id)))))

    (testing "failed if type is invalid"
      (is (thrown-with-msg? Exception #"Invalid value :notification-subscription/not-existed\. Must be one of .*"
                            (t2/insert! :model/NotificationSubscription {:type           :notification-subscription/not-existed
                                                                         :event_name     :event/card-create
                                                                         :notification_id noti-id}))))))

(deftest notification-subscription-event-name-test
  (mt/with-temp [:model/Notification {noti-id :id} {}]
    (testing "success path"
      (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                             :event_name      (first (descendants :metabase/event))
                                                                             :notification_id noti-id})]
        (is (some? (t2/select-one :model/NotificationSubscription sub-id)))))

    (testing "failed if type is invalid"
      (is (thrown-with-msg? Exception #"Must be a namespaced keyword under :event, got: :user-join"
                            (t2/insert! :model/NotificationSubscription {:type           :notification-subscription/system-event
                                                                         :event_name     :user-join
                                                                         :notification_id noti-id}))))))

(def default-system-event-notification
  {:payload_type :notification/system-event
   :active       true})

(def default-user-invited-subscription
  {:type       :notification-subscription/system-event
   :event_name :event/user-invited})

(def default-card-created-subscription
  {:type       :notification-subscription/system-event
   :event_name :event/card-create})

(deftest create-notification!+hydration-keys-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp [:model/Channel         chn-1   (assoc api.channel-test/default-test-channel :name "Channel 1")
                   :model/Channel         chn-2   (assoc api.channel-test/default-test-channel :name "Channel 2")
                   :model/ChannelTemplate tmpl-1 {:channel_type (:type chn-1)
                                                  :name         "My Template"}]
      (testing "create a notification with 2 subscriptions with 2 handlers that has 2 recipients"
        (let [noti (models.notification/create-notification!
                    default-system-event-notification
                    [default-user-invited-subscription
                     default-card-created-subscription]
                    [{:channel_type (:type chn-1)
                      :channel_id   (:id chn-1)
                      :template_id  (:id tmpl-1)
                      :recipients   [{:type     :notification-recipient/user
                                      :user_id  (mt/user->id :rasta)}
                                     {:type                 :notification-recipient/group
                                      :permissions_group_id (:id (perms-group/all-users))}]}
                     {:channel_type (:type chn-1)
                      :channel_id   (:id chn-2)
                      :recipients   [{:type     :notification-recipient/user
                                      :user_id  (mt/user->id :crowberto)}
                                     {:type     :notification-recipient/group
                                      :permissions_group_id (:id (perms-group/admin))}]}])]
          (is (=? {:id            (:id noti)
                   :payload_type  :notification/system-event
                   :active        true
                   :subscriptions [default-user-invited-subscription
                                   default-card-created-subscription]
                   :handlers      [{:channel_type (:type chn-1)
                                    :channel_id   (:id chn-1)
                                    :channel      {:id (:id chn-1)
                                                   :name "Channel 1"}
                                    :template_id  (:id tmpl-1)
                                    :template     {:id (:id tmpl-1)
                                                   :name "My Template"}
                                    :recipients   [{:type     :notification-recipient/user
                                                    :user_id  (mt/user->id :rasta)}
                                                   {:type                 :notification-recipient/group
                                                    :permissions_group_id (:id (perms-group/all-users))}]}
                                   {:channel_type (:type chn-2)
                                    :channel_id   (:id chn-2)
                                    :channel      {:id   (:id chn-2)
                                                   :name "Channel 2"}
                                    :template_id  nil
                                    :template     nil
                                    :recipients   [{:type     :notification-recipient/user
                                                    :user_id  (mt/user->id :crowberto)}
                                                   {:type     :notification-recipient/group
                                                    :permissions_group_id (:id (perms-group/admin))}]}]}
                  (t2/hydrate (t2/select-one :model/Notification (:id noti))
                              :subscriptions
                              [:handlers :recipients :channel :template]))))))))

(deftest delete-template-set-null-on-existing-handlers-test
  (testing "if a channel template is deleted, then set null on existing notification_handler"
    (mt/with-temp [:model/Channel         chn-1   (assoc api.channel-test/default-test-channel :name "Channel 1")
                   :model/ChannelTemplate tmpl-1 {:channel_type (:type chn-1)}]
      (let [noti (models.notification/create-notification!
                  default-system-event-notification
                  [default-user-invited-subscription]
                  [{:channel_type (:type chn-1)
                    :channel_id   (:id chn-1)
                    :template_id  (:id tmpl-1)
                    :recipients   [{:type     :notification-recipient/user
                                    :user_id  (mt/user->id :rasta)}]}])]
        (t2/delete! :model/ChannelTemplate (:id tmpl-1))
        (is (=? {:template_id nil} (t2/select-one :model/NotificationHandler :notification_id (:id noti))))))))

(deftest cross-check-channel-type-and-template-type-test
  (testing "can't create a handler with a template that has different channel type"
    (mt/with-temp [:model/Channel         chn-1  {:type    :channel/slack}
                   :model/ChannelTemplate tmpl-1 {:channel_type :channel/email}]
      (is (thrown-with-msg? Exception #"Channel type and template type mismatch"
                            (t2/insert! :model/NotificationHandler {:channel_type :channel/slack
                                                                    :channel_id   (:id chn-1)
                                                                    :template_id  (:id tmpl-1)})))))

  (testing "can't update a handler with a template that has different channel type"
    (mt/with-temp [:model/ChannelTemplate     email-tmpl {:channel_type :channel/email}
                   :model/ChannelTemplate     slack-tmpl {:channel_type :channel/slack}
                   :model/Notification        noti       {}
                   :model/NotificationHandler handler    {:channel_type    :channel/slack
                                                          :notification_id (:id noti)
                                                          :template_id     (:id slack-tmpl)}]
      (is (thrown-with-msg? Exception #"Channel type and template type mismatch"
                            (t2/update! :model/NotificationHandler (:id handler) {:template_id (:id email-tmpl)}))))))
