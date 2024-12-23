(ns metabase.notification.seed-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.notification.seed :as notification.seed]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- nullify-timestamp
  [data]
  (walk/postwalk
   (fn [x]
     (if (map? x)
       ;; do not nullify id because it's supposed to be the same as well
       (-> x
           (m/update-existing :created_at (constantly nil))
           (m/update-existing :updated_at (constantly nil)))
       x))
   data))

(deftest seed-notification!-is-idempotent
  (mt/with-empty-h2-app-db
    (let [get-notifications-data #(-> (t2/select :model/Notification)
                                      (#'notification.seed/hydrate-notification)
                                      nullify-timestamp)
          default-notifications-cnt (count @@#'notification.seed/default-notifications)]
      (testing "seed the first time will insert all default notifications"
        (is (= {:create default-notifications-cnt}
               (notification.seed/seed-notification!))))
      (let [before (get-notifications-data)]
        (testing "skip all since none of the notifications were changed"
          (is (= {:skip 3}
                 (notification.seed/seed-notification!))))
        (testing "it equals to the data before "
          (is (= before (get-notifications-data))))))))

(deftest sync-notification!-test
  (let [internal-id       (mt/random-name)
        template-name     (mt/random-name)
        test-notification {:internal_id   internal-id
                           :active        true
                           :payload_type  :notification/system-event
                           :subscriptions [{:type       :notification-subscription/system-event
                                            :event_name :event/user-invited}]
                           :handlers      [{:active       true
                                            :channel_type :channel/metabase-test
                                            :channel_id   nil
                                            :template     {:name         template-name
                                                           :channel_type :channel/metabase-test}
                                            :recipients   []}]}]
    (mt/with-model-cleanup [:model/Notification]
      (is (= :create (#'notification.seed/sync-notification! test-notification)))
      (testing "skip if the notification is unchanged"
        (is (= :skip (#'notification.seed/sync-notification! test-notification))))
      (let [notification-id (t2/select-one-pk :model/Notification :internal_id internal-id)
            template-id     (t2/select-one-pk :model/ChannelTemplate :name template-name)]
        (testing "If the notification is changed, delete the old one and replace it with a new one"
          (is (= :replace (#'notification.seed/sync-notification! (assoc test-notification :active false))))
          (testing "both notification and template are deleted"
            (is (false? (t2/exists? :model/Notification :id notification-id)))
            (is (false? (t2/exists? :model/ChannelTemplate :id template-id)))))))))

(def ^:private test-notification
  {:internal_id   "metabase-testing"
   :active        true
   :payload_type  :notification/system-event
   :subscriptions [{:type       :notification-subscription/system-event
                    :event_name :event/user-invited}]
   :handlers      [{:active       true
                    :channel_type :channel/email
                    :channel_id   nil
                    :template     {:name         "Template name"
                                   :channel_type :channel/metabase-test}
                    :recipients   [{:type    :notification-recipient/user
                                    :user_id 1}]}]})

(deftest action-test
  (let [check-change (fn [new-notification]
                       (#'notification.seed/action test-notification new-notification))]
    (testing ":skip if nothing changed"
      (is (= :skip (check-change test-notification))))
    (testing ":replace if notification.active changes"
      (is (= :replace (check-change (update test-notification :active not)))))
    (testing ":replace if notification.subscriptions changes"
      (is (= :replace (check-change (assoc-in test-notification [:subscriptions 0 :event_name] :event/user-uninvited)))))
    (testing ":replace if template changed"
      (is (= :replace (check-change (assoc-in test-notification [:handlers 0 :template :name] "new name")))))
    (testing ":replace if handlers.active changed"
      (is (= :replace (check-change (assoc-in test-notification [:handlers 0 :active] not)))))
    (testing ":replace if recipients changed"
      (is (= :replace (check-change (update-in test-notification [:handlers 0 :recipients] conj {:type :notification-recipient/user :user_id 2})))))))
