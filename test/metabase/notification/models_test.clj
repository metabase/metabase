(ns metabase.notification.models-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.notification.models-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.channel.rest.api.channel-test :as api.channel-test]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.notification.models :as models.notification]
   [metabase.notification.task.send :as task.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.queries.models.card :as queries.card]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(def ^:private per-part-update-growth
  "The statements the update of a Notification adds for each of the 4 parts between 2 and 6: at most the before-update
  SELECT and UPDATE of a template and of its handler, 4 for each part."
  16)

(def ^:private per-row-update-growth
  "The statements an update of one more row adds: the model's before-update SELECT and its UPDATE, 2 for each of the 4
  rows between 2 and 6."
  8)


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
                  :id (t2/insert-returning-pk! :model/Notification {:payload_type :notification/system-event})))))
    (testing "failed if payload_type is invalid"
      (is (thrown-with-msg? Exception #"Value does not match schema*"
                            (t2/insert! :model/Notification {:payload_type :notification/not-existed}))))))

(deftest disallow-update-notification-type-test
  (testing "can't change notification payload"
    (mt/with-temp [:model/Notification {noti-id :id} default-system-event-notification]
      (is (thrown-with-msg?
           java.lang.Exception
           #"Update payload_type is not allowed."
           (t2/update! :model/Notification :id noti-id {:payload_type :notification/card
                                                        :payload_id   1337
                                                        :creator_id   (mt/user->id :crowberto)})))))
  (testing "can't change payload id"
    (mt/with-temp [:model/Notification {noti-id :id} {:payload_type :notification/card
                                                      :payload_id   1337
                                                      :creator_id   (mt/user->id :crowberto)}]
      (is (thrown-with-msg?
           java.lang.Exception
           #"Update payload_id is not allowed."
           (t2/update! :model/Notification :id noti-id {:payload_id 1338})))))
  (testing "superusers can change creator_id"
    (mt/with-temp [:model/Notification {noti-id :id} {:payload_type :notification/card
                                                      :payload_id   1337
                                                      :creator_id   (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (t2/update! :model/Notification :id noti-id {:creator_id (mt/user->id :rasta)}))
      (is (= (mt/user->id :rasta)
             (t2/select-one-fn :creator_id :model/Notification :id noti-id)))))
  (testing "a plain update with no current user can change creator_id"
    (mt/with-temp [:model/Notification {noti-id :id} {:payload_type :notification/card
                                                      :payload_id   1337
                                                      :creator_id   (mt/user->id :crowberto)}]
      (t2/update! :model/Notification :id noti-id {:creator_id (mt/user->id :lucky)})
      (is (= (mt/user->id :lucky)
             (t2/select-one-fn :creator_id :model/Notification :id noti-id))))))

(deftest update-check-creator-id-test
  (notification.tu/with-card-notification
    [{noti-id :id} {:notification {:creator_id (mt/user->id :rasta)}}]
    (let [noti     (models.notification/hydrate-notification (t2/select-one :model/Notification :id noti-id))
          reassign {:creator_id (mt/user->id :lucky)}]
      (testing "non-superusers cannot reassign creator_id, not even the creator"
        (mt/with-current-user (mt/user->id :rasta)
          (is (thrown-with-msg? Exception #"You don't have permissions to do that."
                                (api/update-check noti reassign)))))
      (testing "superusers can reassign creator_id"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (api/update-check noti reassign))))
      (testing "echoing the unchanged creator_id is allowed for the creator"
        (mt/with-current-user (mt/user->id :rasta)
          (is (api/update-check noti {:creator_id (mt/user->id :rasta)})))))))

(deftest subscription-schema-checks-cron-schedule-test
  (let [subscription {:type :notification-subscription/cron :notification_id 1}]
    (is (mr/validate ::models.notification/NotificationSubscription (assoc subscription :cron_schedule "0 * * * * ? *")))
    (is (not (mr/validate ::models.notification/NotificationSubscription (assoc subscription :cron_schedule "not a cron"))))))

(deftest delete-notification-clean-up-payload-test
  (testing "cleanup :model/NotificationCard on delete"
    (notification.tu/with-card-notification [notification {}]
      (let [notification-card-id (-> notification :payload :id)]
        (testing "sanity check"
          (is (t2/exists? :model/NotificationCard :id notification-card-id)))
        (testing "delete notification will delete notification card"
          (models.notification/delete-notifications! [(:id notification)])
          (is (not (t2/exists? :model/NotificationCard :id notification-card-id))))))))

(deftest delete-card-cleans-up-notifications-test
  (testing "deleting a card should remove all associated notifications, both active and inactive"
    (notification.tu/with-notification-cleanup!
      (mt/with-temp [:model/Card {card-id :id} {:name          "alert cleanup test card"
                                                :dataset_query (mt/mbql-query products {:aggregation [[:count]]})}]
        (let [[active-notification]   (models.notification/create-notifications! [{:payload_type :notification/card
                                                                                   :payload      {:card_id card-id}
                                                                                   :creator_id   (mt/user->id :crowberto)
                                                                                   :subscriptions []
                                                                                   :handlers []}])
              inactive-notification (first (models.notification/create-notifications! [{:payload_type :notification/card
                                                                                        :payload      {:card_id card-id}
                                                                                        :active       false
                                                                                        :creator_id   (mt/user->id :crowberto)
                                                                                        :subscriptions []
                                                                                        :handlers []}]))]
          (testing "sanity: both notifications and notification cards exist"
            (is (t2/exists? :model/Notification :id (:id active-notification)))
            (is (t2/exists? :model/Notification :id (:id inactive-notification)))
            (is (= 2 (t2/count :model/NotificationCard :card_id card-id))))
          (queries.card/delete-cards! [card-id])
          (testing "both notifications should be removed when the card is deleted"
            (is (not (t2/exists? :model/Notification :id (:id active-notification))))
            (is (not (t2/exists? :model/Notification :id (:id inactive-notification)))))
          (testing "notification card payloads should also be removed"
            (is (not (t2/exists? :model/NotificationCard :card_id card-id)))))))))

(deftest notification-subscription-type-test
  (mt/with-temp [:model/Notification {n-id :id} {}]
    (testing "success path"
      (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                             :event_name      :event/card-create
                                                                             :notification_id n-id})]
        (is (some? (t2/select-one :model/NotificationSubscription :id sub-id)))))
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
                                        (events/descendants :metabase/event)))
            sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                             :event_name      random-event
                                                                             :notification_id n-id})]
        (is (some? (t2/select-one :model/NotificationSubscription :id sub-id)))))
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
        (let [[noti] (models.notification/create-notifications! [(assoc default-system-event-notification :subscriptions [default-user-invited-subscription
                                                                                                                          default-card-created-subscription] :handlers [{:channel_type (:type chn-1)
                                                                                                                                                                         :channel_id   (:id chn-1)
                                                                                                                                                                         :template_id  (:id tmpl)
                                                                                                                                                                         :recipients   [{:type     :notification-recipient/user
                                                                                                                                                                                         :user_id  (mt/user->id :rasta)}
                                                                                                                                                                                        {:type                 :notification-recipient/group
                                                                                                                                                                                         :permissions_group_id (:id group)}]}
                                                                                                                                                                        {:channel_type (:type chn-1)
                                                                                                                                                                         :channel_id   (:id chn-2)
                                                                                                                                                                         :recipients   [{:type     :notification-recipient/user
                                                                                                                                                                                         :user_id  (mt/user->id :crowberto)}]}])])]
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
        (let [[noti] (models.notification/create-notifications! [(assoc default-system-event-notification :subscriptions [default-user-invited-subscription] :handlers [{:channel_type (:type chn-1)
                                                                                                                                                                         :channel_id   (:id chn-1)
                                                                                                                                                                         :template_id  (:id tmpl-1)
                                                                                                                                                                         :recipients   [{:type     :notification-recipient/user
                                                                                                                                                                                         :user_id  (mt/user->id :rasta)}]}])])]
          (t2/delete! :model/ChannelTemplate :id (:id tmpl-1))
          (is (=? {:template_id nil} (t2/select-one :model/NotificationHandler :notification_id (:id noti)))))))))

(deftest cross-check-channel-type-and-template-type-test
  (testing "can't create a handler with a template that has different channel type"
    (mt/with-temp [:model/Channel         chn-1  {:type    :channel/slack
                                                  :details {:channel "#general"}}
                   :model/ChannelTemplate tmpl-1 notification.tu/channel-template-email-with-handlebars-body]
      (is (thrown-with-msg? Exception #"Channel type and template type mismatch"
                            (first (models.notification/create-notifications! [{:payload_type :notification/testing :active true
                                                                                :subscriptions []
                                                                                :handlers [{:channel_type :channel/slack
                                                                                            :channel_id   (:id chn-1)
                                                                                            :template_id  (:id tmpl-1)
                                                                                            :recipients   []}]}]))))))
  (testing "can't update a handler with a template that has different channel type"
    (mt/with-temp [:model/ChannelTemplate     slack-tmpl {:channel_type :channel/slack}
                   :model/Notification        noti       {}
                   :model/NotificationHandler handler    {:channel_type    :channel/slack
                                                          :notification_id (:id noti)
                                                          :template_id     (:id slack-tmpl)}]
      (is (thrown-with-msg? Exception #"Channel type and template type mismatch"
                            (let [existing (models.notification/hydrate-notification noti)]
                              (models.notification/update-notification!
                               (:id existing)
                               (assoc existing :handlers [(-> (first (:handlers existing))
                                                              (dissoc :channel)
                                                              (assoc :id (:id handler)
                                                                     :channel_type :channel/email))]))))))))

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

(defn- set-subscriptions!
  "Replace the subscriptions of the notification `noti-id` with `subscriptions` through its update."
  [noti-id subscriptions]
  (let [existing (models.notification/hydrate-notification (t2/select-one :model/Notification :id noti-id))]
    (models.notification/update-notification! noti-id (assoc existing :subscriptions subscriptions) {:notifications [existing]})))

(defn- create-cron-subscription!
  "Add a cron subscription to the notification `noti-id` through its update and return its id."
  [noti-id cron-schedule]
  (let [existing (models.notification/hydrate-notification (t2/select-one :model/Notification :id noti-id))
        known    (into #{} (map :id) (:subscriptions existing))]
    (set-subscriptions! noti-id (conj (vec (:subscriptions existing))
                                      {:type          :notification-subscription/cron
                                       :cron_schedule cron-schedule}))
    (first (remove known (t2/select-pks-vec :model/NotificationSubscription :notification_id noti-id)))))

(deftest update-subscription-trigger-test
  (mt/with-temp-scheduler!
    (task/init! ::task.notification/SendNotifications)
    (mt/with-temp [:model/Notification {noti-id :id}]
      (testing "a trigger is created when create a notification subscription"
        (let [sub-id (create-cron-subscription! noti-id "0 * * * * ? *")]
          (is (= [(notification.tu/subscription->trigger-info
                   sub-id
                   "0 * * * * ? *")]
                 (notification.tu/send-notification-triggers sub-id)))
          (testing "update trigger when cron schedule is changed"
            (set-subscriptions! noti-id [{:id sub-id :type :notification-subscription/cron :cron_schedule "1 * * * * ? *"}])
            (is (= [(notification.tu/subscription->trigger-info
                     sub-id
                     "1 * * * * ? *")]
                   (notification.tu/send-notification-triggers sub-id))))
          (testing "delete the trigger when type changes"
            (set-subscriptions! noti-id [{:id            sub-id
                                          :type          :notification-subscription/system-event
                                          :cron_schedule nil
                                          :event_name    :event/card-create}])
            (is (empty? (notification.tu/send-notification-triggers sub-id))))))
      (testing "delete the trigger when delete subscription"
        (let [sub-id (create-cron-subscription! noti-id "0 * * * * ? *")]
          (is (not-empty (notification.tu/send-notification-triggers sub-id)))
          (set-subscriptions! noti-id [])
          (is (empty? (notification.tu/send-notification-triggers sub-id)))))
      (testing "delete notification will delete all subscription triggers"
        (let [sub-id (create-cron-subscription! noti-id "0 * * * * ? *")]
          (is (not-empty (notification.tu/send-notification-triggers sub-id)))
          (models.notification/delete-notifications! [noti-id])
          (is (empty? (notification.tu/send-notification-triggers sub-id))))))))

(deftest subscription-trigger-timezone-is-report-timezone-test
  (mt/with-temporary-setting-values [report-timezone "Asia/Ho_Chi_Minh"]
    (mt/with-temp-scheduler!
      (task/init! ::task.notification/SendNotifications)
      (mt/with-temp [:model/Notification {noti-id :id}]
        (testing "trigger timezone is report timezone"
          (let [sub-id (create-cron-subscription! noti-id "0 * * * * ? *")]
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
        (models.notification/update-notifications! [{:id id :active false}])
        (is (empty? (notification.tu/notification-triggers id))))
      (testing "activate notification should restore triggers"
        (models.notification/update-notifications! [{:id id :active true}])
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

(defn- notification-rows
  "`n` Notification rows that differ in what they hold: a Card or a system event payload, a cron or a system event
  subscription, an email handler with a template of its own and users and raw values as recipients, or a Slack handler
  on a Channel."
  [n card-id channel-id]
  (mapv (fn [i]
          (if (even? i)
            {:payload_type  :notification/card
             :active        true
             :creator_id    (mt/user->id :crowberto)
             :payload       {:card_id card-id :send_condition :has_result :send_once false}
             :subscriptions [{:type          :notification-subscription/cron
                              :cron_schedule "0 0 8 * * ? *"}]
             :handlers      [{:channel_type :channel/email
                              :template     (assoc notification.tu/channel-template-email-with-handlebars-body
                                                   :name (mt/random-name))
                              :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :rasta)}
                                             {:type    :notification-recipient/raw-value
                                              :details {:value "ngoc@metabase.com"}}]}]}
            {:payload_type  :notification/system-event
             :active        true
             :subscriptions [default-user-invited-subscription default-card-created-subscription]
             :handlers      [{:channel_type :channel/slack
                              :channel_id   channel-id
                              :recipients   [{:type    :notification-recipient/raw-value
                                              :details {:value "#general"}}]}
                             {:channel_type :channel/email
                              :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :lucky)}]}]}))
        (range n)))

(defn- do-with-notification-rows!
  "Call `f` with a function of `n` Notification rows, a Card and a Channel, in a scheduler and with the rows it creates
  cleaned up."
  [f]
  (mt/with-temp-scheduler!
    (task/init! ::task.notification/SendNotifications)
    (mt/with-temp [:model/Card    {card-id :id}    {}
                   :model/Channel {channel-id :id} notification.tu/default-can-connect-channel]
      (mt/with-model-cleanup [:model/Notification :model/NotificationCard :model/NotificationSubscription
                              :model/NotificationHandler :model/NotificationRecipient :model/ChannelTemplate]
        (f (fn [n] (notification-rows n card-id channel-id)) card-id channel-id)))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (do-with-notification-rows!
   (fn [rows _card-id _channel-id]
     (testing "creating Notifications with parts of every kind"
       (let [counted (fn [n] (events.tu/statement-count! #(models.notification/create-notifications! (rows n))))]
         (counted 2)
         (is (= (counted 2) (counted 6)))))
     (testing "updating Notifications, some of them already inactive"
       (let [counted (fn [n]
                       (let [ids (mapv :id (models.notification/create-notifications! (rows n)))]
                         (models.notification/update-notifications! (mapv (fn [row-id] (assoc {:active false} :id row-id)) (vec (take-nth 2 ids))))
                         (events.tu/statement-count! #(models.notification/update-notifications! (mapv (fn [row-id] (assoc {:active false} :id row-id)) ids)))))]
         (counted 2)
         (is (<= (counted 6) (+ (counted 2) per-row-update-growth)))))
     (testing "reactivating Notifications, some of them already active"
       (let [counted (fn [n]
                       (let [ids (mapv :id (models.notification/create-notifications! (rows n)))]
                         (models.notification/update-notifications! (mapv (fn [row-id] (assoc {:active false} :id row-id)) ids))
                         (models.notification/update-notifications! (mapv (fn [row-id] (assoc {:active true} :id row-id)) (vec (take-nth 2 ids))))
                         (events.tu/statement-count! #(models.notification/update-notifications! (mapv (fn [row-id] (assoc {:active true} :id row-id)) ids)))))]
         (counted 2)
         (is (<= (counted 6) (+ (counted 2) per-row-update-growth)))))
     (testing "deleting Notifications"
       (let [counted (fn [n]
                       (let [ids (mapv :id (models.notification/create-notifications! (rows n)))]
                         (events.tu/statement-count! #(models.notification/delete-notifications! ids))))]
         (counted 2)
         (is (= (counted 2) (counted 6)))))
     (testing "deleting NotificationRecipients"
       (let [counted (fn [n]
                       (let [ids (mapv :id (models.notification/create-notifications! (rows n)))
                             recipient-ids (t2/select-pks-vec :model/NotificationRecipient
                                                              :notification_handler_id [:in (t2/select-pks-vec :model/NotificationHandler
                                                                                                               :notification_id [:in ids])])]
                         (events.tu/statement-count! #(models.notification/delete-notification-recipients! recipient-ids))))]
         (counted 2)
         (is (= (counted 2) (counted 6)))))
     (testing "deleting the NotificationRecipients of Users"
       (let [counted (fn [n]
                       (models.notification/create-notifications! (rows n))
                       (events.tu/statement-count! #(models.notification/delete-notification-recipients-for-users!
                                                     [(mt/user->id :rasta) (mt/user->id :lucky)])))]
         (counted 2)
         (is (= (counted 2) (counted 6))))))))

(deftest update-notification-statement-counts-do-not-grow-with-parts-test
  (do-with-notification-rows!
   (fn [_rows card-id channel-id]
     (let [slack-handler (fn [i]
                           {:channel_type :channel/slack
                            :channel_id   channel-id
                            :recipients   [{:type    :notification-recipient/raw-value
                                            :details {:value (str "#channel-" i)}}]})
           email-handler (fn [_i]
                           {:channel_type :channel/email
                            :template     (assoc notification.tu/channel-template-email-with-handlebars-body
                                                 :name (mt/random-name))
                            :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :rasta)}]})
           cron          (fn [expression] {:type :notification-subscription/cron :cron_schedule expression})
           without-channels (fn [handlers] (mapv #(dissoc % :channel) handlers))
           counted       (fn [handler change n]
                           (let [[created] (models.notification/create-notifications!
                                            [{:payload_type  :notification/card
                                              :active        true
                                              :creator_id    (mt/user->id :crowberto)
                                              :payload       {:card_id card-id :send_condition :has_result :send_once false}
                                              :subscriptions (vec (repeat n (cron "0 0 8 * * ? *")))
                                              :handlers      (mapv handler (range n))}])
                                 existing  (models.notification/hydrate-notification created)]
                             (events.tu/statement-count! #(models.notification/update-notification! (:id existing) (change existing n) {:notifications [existing]}))))]
       (doseq [[part-kind handler change]
               [["removing subscriptions" slack-handler
                 (fn [existing _n] (assoc existing :subscriptions []))]
                ["adding subscriptions" slack-handler
                 (fn [existing n] (update existing :subscriptions into (repeat n (cron "0 0 10 * * ? *"))))]
                ["changing subscriptions" slack-handler
                 (fn [existing _n] (update existing :subscriptions (fn [subscriptions] (mapv #(assoc % :cron_schedule "0 0 9 * * ? *") subscriptions))))]
                ["adding handlers with recipients" slack-handler
                 (fn [existing n] (update existing :handlers (fn [handlers] (into (without-channels handlers) (map slack-handler (range n n))))))]
                ["changing handlers" slack-handler
                 (fn [existing _n] (update existing :handlers (fn [handlers] (mapv #(assoc % :active false) (without-channels handlers)))))]
                ["adding a recipient to each handler" slack-handler
                 (fn [existing _n]
                   (update existing :handlers
                           (fn [handlers]
                             (mapv (fn [handler i]
                                     (update handler :recipients conj {:type    :notification-recipient/raw-value
                                                                       :details {:value (str "#extra-" i)}}))
                                   (without-channels handlers) (range)))))]
                ["changing the recipient of each handler" slack-handler
                 (fn [existing _n]
                   (update existing :handlers
                           (fn [handlers]
                             (mapv (fn [handler]
                                     (update handler :recipients (fn [recipients] (mapv #(assoc-in % [:details :value] "#changed") recipients))))
                                   (without-channels handlers)))))]
                ["changing the template of each handler" email-handler
                 (fn [existing _n]
                   (update existing :handlers
                           (fn [handlers]
                             (mapv (fn [handler] (assoc-in handler [:template :name] "Renamed template"))
                                   (without-channels handlers)))))]
                ["removing handlers" slack-handler
                 (fn [existing _n] (assoc existing :handlers []))]]]
         (testing part-kind
           (counted handler change 1)
           (is (<= (counted handler change 3) (+ (counted handler change 1) (quot per-part-update-growth 2))))
           (is (<= (counted handler change 6) (+ (counted handler change 2) per-part-update-growth)))))))))

(deftest create-notifications-reports-the-first-invalid-row-test
  (do-with-notification-rows!
   (fn [rows _card-id _channel-id]
     (let [[first-row second-row] (rows 2)
           bad-subscription (assoc first-row :subscriptions [{:type :notification-subscription/cron :cron_schedule "not a cron"}])
           bad-template     (update-in second-row [:handlers 0] #(-> % (dissoc :template) (assoc :template_id Integer/MAX_VALUE)))
           message-of       (fn [rows]
                              (try (models.notification/create-notifications! rows)
                                   nil
                                   (catch clojure.lang.ExceptionInfo e (ex-message e))))
           subscription-message (message-of [bad-subscription])
           template-message     (message-of [bad-template])]
       (is (string? subscription-message))
       (is (string? template-message))
       (is (not= subscription-message template-message))
       (testing "the message is the one of the first invalid row, whatever the kind of its error"
         (is (= subscription-message (message-of [bad-subscription bad-template])))
         (is (= template-message (message-of [bad-template bad-subscription])))
         (is (= template-message (message-of [second-row bad-template bad-subscription]))))
       (testing "nothing is written"
         (let [before (t2/count :model/Notification)]
           (message-of [first-row bad-template bad-subscription])
           (is (= before (t2/count :model/Notification)))))))))
