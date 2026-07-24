(ns metabase.product-notifications.sync-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.product-notifications.core :as product-notifications]
   [metabase.product-notifications.fetch :as fetch]
   [metabase.product-notifications.models.product-notification]
   [metabase.product-notifications.models.product-notification-dismissal]
   [metabase.product-notifications.settings :refer [product-notifications-last-synced-at]]
   [metabase.product-notifications.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- feed-notification
  [id title]
  {:id             id
   :schema_version 1
   :title          title
   :content        (str "Content for " title)
   :conditions     {:audience   "all_users"
                    :deployment "any"
                    :edition    "any"
                    :starts_at  "2026-01-01T00:00:00Z"
                    :ends_at    "2027-01-01T00:00:00Z"}})

(defn- normalize
  [& notifications]
  (product-notifications/normalize-feed {:notifications (vec notifications)}))

(deftest reconciliation-test
  (mt/with-model-cleanup [:model/ProductNotificationDismissal :model/ProductNotification]
    (testing "inserts supported rows and preserves complete-feed order"
      (sync/sync-notifications!
       (product-notifications/normalize-feed
        {:notifications [(feed-notification "first" "First")
                         (assoc (feed-notification "unsupported" "Unsupported") :schema_version 2)
                         (feed-notification "third" "Third")]}))
      (is (= [["first" 0] ["third" 2]]
             (t2/select-fn-vec (juxt :notification_id :position)
                               :model/ProductNotification
                               {:order-by [[:position :asc]]}))))
    (testing "retires missing rows without deleting notification or dismissal state"
      (let [notification-id (t2/select-one-pk :model/ProductNotification :notification_id "first")]
        (t2/insert! :model/ProductNotificationDismissal
                    {:product_notification_id notification-id
                     :user_id                 (mt/user->id :rasta)})
        (sync/sync-notifications! (normalize (feed-notification "third" "Third")))
        (let [first-row (t2/select-one :model/ProductNotification :notification_id "first")]
          (is (false? (:active first-row)))
          (is (some? (:retired_at first-row)))
          (is (t2/exists? :model/ProductNotificationDismissal
                          :product_notification_id notification-id
                          :user_id (mt/user->id :rasta)))))
      (testing "reactivates the same row and keeps its dismissals"
        (let [before-id (t2/select-one-pk :model/ProductNotification :notification_id "first")]
          (sync/sync-notifications!
           (normalize (feed-notification "first" "First")
                      (feed-notification "third" "Third")))
          (let [first-row (t2/select-one :model/ProductNotification :notification_id "first")]
            (is (= before-id (:id first-row)))
            (is (true? (:active first-row)))
            (is (nil? (:retired_at first-row)))
            (is (t2/exists? :model/ProductNotificationDismissal
                            :product_notification_id before-id
                            :user_id (mt/user->id :rasta)))))))
    (testing "an unsupported representation retires an existing supported ID"
      (sync/sync-notifications!
       (normalize (feed-notification "will-be-unsupported" "Old")))
      (sync/sync-notifications!
       (product-notifications/normalize-feed
        {:notifications [(assoc (feed-notification "will-be-unsupported" "Ignored")
                                :schema_version 2)]}))
      (is (false? (:active
                   (t2/select-one :model/ProductNotification
                                  :notification_id "will-be-unsupported")))))))

(deftest immutable-id-rejects-complete-sync-test
  (mt/with-model-cleanup [:model/ProductNotificationDismissal :model/ProductNotification]
    (sync/sync-notifications!
     (normalize (feed-notification "existing" "Original")))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"new ID"
         (sync/sync-notifications!
          (normalize (feed-notification "existing" "Changed")
                     (feed-notification "new" "New")))))
    (is (= "Original"
           (t2/select-one-fn :title :model/ProductNotification
                             :notification_id "existing")))
    (is (not (t2/exists? :model/ProductNotification :notification_id "new")))))

(deftest last-synced-setting-follows-committed-sync-test
  (mt/with-model-cleanup [:model/ProductNotificationDismissal :model/ProductNotification]
    (mt/with-temporary-setting-values [product-notifications-last-synced-at nil]
      (mt/with-dynamic-fn-redefs
        [fetch/fetch-feed (constantly (normalize (feed-notification "new" "New")))]
        (sync/sync-from-source!)
        (is (some? (product-notifications-last-synced-at)))))
    (let [previous (t/offset-date-time "2026-01-01T00:00:00Z")]
      (mt/with-temporary-setting-values [product-notifications-last-synced-at previous]
        (mt/with-dynamic-fn-redefs
          [fetch/fetch-feed (fn [] (throw (ex-info "broken feed" {})))]
          (is (thrown? clojure.lang.ExceptionInfo (sync/sync-from-source!)))
          (is (= (t/instant previous)
                 (t/instant (product-notifications-last-synced-at)))))))))
