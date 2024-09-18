(ns metabase.models.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.channel-test :as api.channel-test]
   [metabase.models.notification :as models.notification]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;; ------------------------------------------------------------------------------------------------;;
;;                                      Life cycle test                                            ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest notification-type-test
  (mt/with-model-cleanup [:model/Notification]
    (testing "success if :payload_type is supported"
      (is (some? (t2/select-one
                  :model/Notification
                  (t2/insert-returning-pk! :model/Notification {:payload_type :notification/system-event
                                                                :created_at   :%now
                                                                :updated_at   :%now})))))

    (testing "failed if payload_type is invalid"
      (is (thrown-with-msg? Exception #"Invalid value :notification/not-existed\. Must be one of .*"
                            (t2/insert! :model/Notification {:payload_type :notification/not-existed}))))))

(deftest notification-subscription-type-test
  (mt/with-temp [:model/Notification {n-id :id} {}]
    (testing "success path"
      (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                             :event_name      :event/card-create
                                                                             :notification_id n-id})]
        (is (some? (t2/select-one :model/NotificationSubscription sub-id)))))

    (testing "failed if type is invalid"
      (is (thrown-with-msg? Exception #"Invalid value :notification-subscription/not-existed\. Must be one of .*"
                            (t2/insert! :model/NotificationSubscription {:type           :notification-subscription/not-existed
                                                                         :event_name     :event/card-create
                                                                         :notification_id n-id}))))))

(deftest notification-subscription-event-name-test
  (mt/with-temp [:model/Notification {n-id :id} {}]
    (testing "success path"
      (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                             :event_name      (first (descendants :metabase/event))
                                                                             :notification_id n-id})]
        (is (some? (t2/select-one :model/NotificationSubscription sub-id)))))

    (testing "failed if type is invalid"
      (is (thrown-with-msg? Exception #"Must be a namespaced keyword under :event, got: :user-join"
                            (t2/insert! :model/NotificationSubscription {:type           :notification-subscription/system-event
                                                                         :event_name     :user-join
                                                                         :notification_id n-id}))))))

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
    (mt/with-temp [:model/Channel         chn-1        (assoc api.channel-test/default-test-channel :name "Channel 1")
                   :model/Channel         chn-2        (assoc api.channel-test/default-test-channel :name "Channel 2")
                   :model/ChannelTemplate tmpl         {:channel_type (:type chn-1)
                                                        :name         "My Template"}
                   :model/PermissionsGroup group       {:name "Rasta and Lucky"}
                   :model/PermissionsGroupMembership _ {:group_id (:id group)
                                                        :user_id  (mt/user->id :rasta)}
                   :model/PermissionsGroupMembership _ {:group_id (:id group)
                                                        :user_id (mt/user->id :lucky)}]
      (testing "create a notification with 2 subscriptions with 2 handlers that has 2 recipients"
        (let [noti (models.notification/create-notification!
                    default-system-event-notification
                    [default-user-invited-subscription
                     default-card-created-subscription]
                    [{:channel_type (:type chn-1)
                      :channel_id   (:id chn-1)
                      :template_id  (:id tmpl)
                      :recipients   [{:type     :notification-recipient/user
                                      :user_id  (mt/user->id :rasta)}
                                     {:type                 :notification-recipient/group
                                      :permissions_group_id (:id group)}]}
                     {:channel_type (:type chn-1)
                      :channel_id   (:id chn-2)
                      :recipients   [{:type     :notification-recipient/user
                                      :user_id  (mt/user->id :crowberto)}]}])]

          (testing "hydrate subscriptions"
            (is (=? [default-user-invited-subscription
                     default-card-created-subscription]
                    (:subscriptions (t2/hydrate noti :subscriptions)))))

          (testing "hydrate handlers"
            (is (=? [{:channel_type (:type chn-1)
                      :channel_id   (:id chn-1)
                      :template_id  (:id tmpl)}
                     {:channel_type (:type chn-2)
                      :channel_id   (:id chn-2)
                      :template_id  nil}]
                    (:handlers (t2/hydrate noti :handlers)))))

          (let [noti-handler (t2/select-one :model/NotificationHandler :channel_id (:id chn-1) :template_id (:id tmpl))]
            (testing "hydrate template + channel"
              (is (=? {:channel_type (:type chn-1)
                       :channel_id   (:id chn-1)
                       :channel      {:id (:id chn-1)
                                      :name "Channel 1"}
                       :template_id  (:id tmpl)
                       :template     {:id (:id tmpl)
                                      :name "My Template"}}
                      (t2/hydrate noti-handler :template :channel))))

            (testing "hydrate recipients will also hydrate users and members of groups"
              (is (=? [{:type     :notification-recipient/user
                        :user_id  (mt/user->id :rasta)
                        :user     {:id    (mt/user->id :rasta)
                                   :email "rasta@metabase.com"}}
                       {:type                 :notification-recipient/group
                        :permissions_group_id (:id group)
                        :permissions_group    {:name "Rasta and Lucky"
                                               :members [{:id    (mt/user->id :lucky)
                                                          :email "lucky@metabase.com"}
                                                         {:id    (mt/user->id :rasta)
                                                          :email "rasta@metabase.com"}]}}]
                      (:recipients (t2/hydrate noti-handler :recipients)))))))))))

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

(deftest notification-recipient-types-test
  (mt/with-temp [:model/Notification        {n-id :id}       {}
                 :model/NotificationHandler {handler-id :id} {:notification_id n-id
                                                              :channel_type    :channel/email}]
    (let [insert! (fn [info]
                    (t2/insert-returning-instance! :model/NotificationRecipient
                                                   (merge {:notification_handler_id handler-id}
                                                          info)))]
      (testing "notifciation-recipient/user"
        (testing "success with user_id"
          (is (some? (insert! {:type :notification-recipient/user
                               :user_id (mt/user->id :rasta)}))))

        (testing "fail without user_id"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type :notification-recipient/user}))))
        (testing "fail if has group_id"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type                 :notification-recipient/user
                                          :user_id              (mt/user->id :rasta)
                                          :permissions_group_id 1}))))
        (testing "fail if has details"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type    :notification-recipient/user
                                          :user_id (mt/user->id :rasta)
                                          :details {:something :new}})))))
      (testing "notifciation-recipient/group"
        (testing "success with group_id"
          (is (some? (insert! {:type                 :notification-recipient/group
                               :permissions_group_id (t2/select-one-pk :model/PermissionsGroup)}))))

        (testing "fail without group_id"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type :notification-recipient/group}))))
        (testing "fail if has user_id"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type                 :notification-recipient/group
                                          :permissions_group_id (t2/select-one-pk :model/PermissionsGroup)
                                          :user_id              1}))))
        (testing "fail if has details"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type                 :notification-recipient/group
                                          :permissions_group_id (t2/select-one-pk :model/PermissionsGroup)
                                          :details              {:something :new}})))))
      (testing "notifciation-recipient/external-email"
        (testing "success with email"
          (is (some? (insert! {:type    :notification-recipient/external-email
                               :details {:email "ngoc@metabase.com"}}))))

        (testing "fail if details does not match schema"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type    :notification-recipient/external-email
                                          :details {:email     "ngoc@metabase.com"
                                                    :not-email true}}))))
        (testing "fail without email"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type :notification-recipient/external-email}))))
        (testing "if has user_id"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type    :notification-recipient/external-email
                                          :user_id 1
                                          :details {:email "ngoc@metabase.com"}}))))
        (testing "if has permissions_group_id"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type                 :notification-recipient/external-email
                                          :permissions_group_id 1
                                          :details              {:email "ngoc@metabase.com"}}))))))))
