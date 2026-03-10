(ns metabase.notification.models-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.api.channel-test :as api.channel-test]
   [metabase.notification.models :as models.notification]
   [metabase.notification.task.send :as task.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :web-server))

(def default-system-event-notification
  {:payload_type :notification/system-event
   :active       true})

(def default-user-invited-subscription
  {:type       :notification-subscription/system-event
   :event_name :event/user-invited})

(def default-card-created-subscription
  {:type       :notification-subscription/system-event
   :event_name :event/card-create})

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
      (is (thrown-with-msg? Exception #"Value does not match schema*"
                            (t2/insert! :model/Notification {:payload_type :notification/not-existed}))))))

(deftest disallow-update-notification-type-test
  (testing "can't change notification payload"
    (mt/with-temp [:model/Notification {noti-id :id} default-system-event-notification]
      (is (thrown-with-msg?
           java.lang.Exception
           #"Update payload_type is not allowed."
           (t2/update! :model/Notification noti-id {:payload_type :notification/card
                                                    :payload_id   1337
                                                    :creator_id   (mt/user->id :crowberto)})))))
  (testing "can't change payload id"
    (mt/with-temp [:model/Notification {noti-id :id} {:payload_type :notification/card
                                                      :payload_id   1337
                                                      :creator_id   (mt/user->id :crowberto)}]
      (is (thrown-with-msg?
           java.lang.Exception
           #"Update payload_id is not allowed."
           (t2/update! :model/Notification noti-id {:payload_id 1338})))))

  (testing "can't change creator id"
    (mt/with-temp [:model/Notification {noti-id :id} {:payload_type :notification/card
                                                      :payload_id   1337
                                                      :creator_id   (mt/user->id :crowberto)}]
      (is (thrown-with-msg?
           java.lang.Exception
           #"Update creator_id is not allowed."
           (t2/update! :model/Notification noti-id {:creator_id (mt/user->id :rasta)}))))))

(deftest delete-notification-clean-up-payload-test
  (testing "cleanup :model/NotificationCard on delete"
    (notification.tu/with-card-notification [notification {}]
      (let [notification-card-id (-> notification :payload :id)]
        (testing "sanity check"
          (is (t2/exists? :model/NotificationCard notification-card-id)))
        (testing "delete notification will delete notification card"
          (t2/delete! :model/Notification (:id notification))
          (is (not (t2/exists? :model/NotificationCard notification-card-id))))))))

(deftest notification-subscription-type-test
  (mt/with-temp [:model/Notification {n-id :id} {}]
    (testing "success path"
      (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                             :event_name      :event/card-create
                                                                             :notification_id n-id})]
        (is (some? (t2/select-one :model/NotificationSubscription sub-id)))))

    (testing "fail if type is system event but event-name is nil"
      (is (thrown-with-msg? Exception #"Value does not match schema"
                            (t2/insert! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                         :notification_id n-id}))))
    (testing "fail if type is cron but cron_schedule is nil"
      (is (thrown-with-msg? Exception #"Value does not match schema"
                            (t2/insert! :model/NotificationSubscription {:type            :notification-subscription/cron
                                                                         :notification_id n-id}))))
    (testing "fail if type is system event but has cron_schedule"
      (is (thrown-with-msg? Exception #"Value does not match schema"
                            (t2/insert! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                         :event_name      :event/card-create
                                                                         :cron_schedule   "0 * * * * ? *"
                                                                         :notification_id n-id}))))))

(deftest notification-subscription-event-name-test
  (mt/with-temp [:model/Notification {n-id :id} {}]
    (testing "success path"
      ;; we derive other keywords into this hierarchy
      ;; like ::api-events, :metabase.audit-app.events.audit-log/remote-sync-event, etc. This was non-deterministic
      ;; for a long time
      (let [random-event (first (filter (comp #{"event"} namespace)
                                        (descendants :metabase/event)))
            sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                             :event_name      random-event
                                                                             :notification_id n-id})]
        (is (some? (t2/select-one :model/NotificationSubscription sub-id)))))

    (testing "failed if type is invalid"
      (is (thrown-with-msg? Exception #"Must be a namespaced keyword under :event, got: :user-join"
                            (t2/insert! :model/NotificationSubscription {:type           :notification-subscription/system-event
                                                                         :event_name     :user-join
                                                                         :notification_id n-id}))))))

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
                      (:recipients (t2/hydrate noti-handler [:recipients :recipients-detail])))))))))))

(deftest delete-template-set-null-on-existing-handlers-test
  (testing "if a channel template is deleted, then set null on existing notification_handler"
    (mt/with-model-cleanup [:model/Notification]
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
          (is (=? {:template_id nil} (t2/select-one :model/NotificationHandler :notification_id (:id noti)))))))))

(deftest cross-check-channel-type-and-template-type-test
  (testing "can't create a handler with a template that has different channel type"
    (mt/with-temp [:model/Channel         chn-1  {:type    :channel/slack}
                   :model/ChannelTemplate tmpl-1 notification.tu/channel-template-email-with-handlebars-body]
      (is (thrown-with-msg? Exception #"Channel type and template type mismatch"
                            (t2/insert! :model/NotificationHandler {:channel_type :channel/slack
                                                                    :channel_id   (:id chn-1)
                                                                    :template_id  (:id tmpl-1)})))))

  (testing "can't update a handler with a template that has different channel type"
    (mt/with-temp [:model/ChannelTemplate     email-tmpl notification.tu/channel-template-email-with-handlebars-body
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
      (testing "notifciation-recipient/raw-value"
        (testing "success with value"
          (is (some? (insert! {:type    :notification-recipient/raw-value
                               :details {:value "ngoc@metabase.com"}}))))

        (testing "fail if details does not match schema"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type    :notification-recipient/raw-value
                                          :details {:value "ngoc@metabase.com"
                                                    :extra true}}))))
        (testing "fail without value"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type :notification-recipient/raw-value}))))
        (testing "if has user_id"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type    :notification-recipient/raw-value
                                          :user_id 1
                                          :details {:value "ngoc@metabase.com"}}))))
        (testing "if has permissions_group_id"
          (is (thrown-with-msg? Exception #"Value does not match schema"
                                (insert! {:type                 :notification-recipient/raw-value
                                          :permissions_group_id 1
                                          :details              {:value "ngoc@metabase.com"}}))))))))

(deftest update-subscription-trigger-test
  (mt/with-temp-scheduler!
    (task/init! ::task.notification/SendNotifications)
    (mt/with-temp [:model/Notification {noti-id :id}]
      (testing "a trigger is created when create a notification subscription"
        (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/cron
                                                                               :cron_schedule   "0 * * * * ? *"
                                                                               :notification_id noti-id})]
          (is (= [(notification.tu/subscription->trigger-info
                   sub-id
                   "0 * * * * ? *")]
                 (notification.tu/send-notification-triggers sub-id)))
          (testing "update trigger when cron schedule is changed"
            (t2/update! :model/NotificationSubscription sub-id {:cron_schedule "1 * * * * ? *"})
            (is (= [(notification.tu/subscription->trigger-info
                     sub-id
                     "1 * * * * ? *")]
                   (notification.tu/send-notification-triggers sub-id))))

          (testing "delete the trigger when type changes"
            (t2/update! :model/NotificationSubscription sub-id {:type :notification-subscription/system-event
                                                                :cron_schedule nil
                                                                :event_name :event/card-create})
            (is (empty? (notification.tu/send-notification-triggers sub-id))))))

      (testing "delete the trigger when delete subscription"
        (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/cron
                                                                               :cron_schedule   "0 * * * * ? *"
                                                                               :notification_id noti-id})]
          (is (not-empty (notification.tu/send-notification-triggers sub-id)))
          (t2/delete! :model/NotificationSubscription sub-id)
          (is (empty? (notification.tu/send-notification-triggers sub-id)))))

      (testing "delete notification will delete all subscription triggers"
        (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/cron
                                                                               :cron_schedule   "0 * * * * ? *"
                                                                               :notification_id noti-id})]
          (is (not-empty (notification.tu/send-notification-triggers sub-id)))
          (t2/delete! :model/Notification noti-id)
          (is (empty? (notification.tu/send-notification-triggers sub-id))))))))

(deftest subscription-trigger-timezone-is-report-timezone-test
  (mt/with-temp-scheduler!
    (task/init! ::task.notification/SendNotifications)
    (mt/with-temporary-setting-values [report-timezone "Asia/Ho_Chi_Minh"]
      (mt/with-temp [:model/Notification {noti-id :id}]
        (testing "trigger timezone is report timezone"
          (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/cron
                                                                                 :cron_schedule   "0 * * * * ? *"
                                                                                 :notification_id noti-id})]
            (is (= [(notification.tu/subscription->trigger-info
                     sub-id
                     "0 * * * * ? *"
                     "Asia/Ho_Chi_Minh")]
                   (notification.tu/send-notification-triggers sub-id)))))))))

(deftest archive-notification-triggers-test
  (mt/with-temp-scheduler!
    (task/init! ::task.notification/SendNotifications)
    (notification.tu/with-temp-notification
      [{id :id} {:notification  {:active true :payload_type :notification/testing}
                 :subscriptions [{:type          :notification-subscription/cron
                                  :cron_schedule "0 * * * * ? *"}
                                 {:type          :notification-subscription/cron
                                  :cron_schedule "1 * * * * ? *"}]}]
      (testing "sanity check that it has a trigger to begin with"
        (is (= 2 (count (notification.tu/notification-triggers id)))))

      (testing "disabled notification should remove triggers"
        (t2/update! :model/Notification id {:active false})
        (is (empty? (notification.tu/notification-triggers id))))

      (testing "activate notification should restore triggers"
        (t2/update! :model/Notification id {:active true})
        (is (= 2 (count (notification.tu/notification-triggers id))))))))

(deftest v-alerts-schedule-type-test
  (mt/when-ee-evailable
   (testing "schedule types"
     (doseq [[schedule-type cron-schedule ui-display-type]
             [["by the minute" "0 * * * * ? *"    :cron/builder] ;; every minute
              ["by the minute" "0 0/10 * * * ? *" :cron/builder] ;; every 10 minutes
              ["hourly"        "0 8 * * * ? *"    :cron/builder] ;; every hour
              ["daily"         "0 0 2 * * ? *"    :cron/builder] ;; every day
              ["custom"        "0 0 0/4 * * ? *"   :cron/raw]     ;; every 4 hours starting at midnight #60427
              ["monthly"       "0 0 8 1 * ? *"    :cron/builder] ;; every first day of the month
              ["custom"        "0 * * * * ? *"    :cron/raw]]]
       (notification.tu/with-card-notification
         [notification {:subscriptions [{:type            :notification-subscription/cron
                                         :cron_schedule   cron-schedule
                                         :ui_display_type ui-display-type}]}]
         (let [get-schedule-type (fn []
                                   (:schedule_type (t2/select-one :v_alerts :entity_id (:id notification))))]
           (testing (str schedule-type " schedule with cron " cron-schedule "result" (t2/select-one :v_alerts :entity_id (:id notification)))
             (is (= schedule-type (get-schedule-type))))))))))
