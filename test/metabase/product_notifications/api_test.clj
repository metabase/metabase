(ns metabase.product-notifications.api-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.product-notifications.init]
   [metabase.product-notifications.service :as service]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.version.settings :as version.settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- insert-notification!
  [notification-id position & [overrides]]
  (let [now (t/offset-date-time)]
    (t2/insert-returning-instance!
     :model/ProductNotification
     (merge {:notification_id notification-id
             :schema_version  1
             :title           (str "Title " notification-id)
             :content         (str "Content " notification-id)
             :evaluation_options
             {:audience   "all_users"
              :deployment "any"
              :edition    "any"
              :starts_at  (str (t/minus now (t/days 1)))
              :ends_at    (str (t/plus now (t/days 1)))}
             :position        position
             :active          true
             :last_seen_at    now}
            overrides))))

(deftest list-product-notifications-test
  (mt/with-model-cleanup [:model/ProductNotificationDismissal :model/ProductNotification]
    (insert-notification! "second" 1 {:icon "star"})
    (insert-notification! "first" 0)
    (insert-notification! "admins" 2 {:evaluation_options
                                      {:audience   "admins"
                                       :deployment "any"
                                       :edition    "any"
                                       :starts_at  "2026-01-01T00:00:00Z"
                                       :ends_at    "2099-01-01T00:00:00Z"}})
    (is (= [{:id      "first"
             :title   "Title first"
             :content "Content first"}
            {:id      "second"
             :title   "Title second"
             :content "Content second"
             :icon    "star"}]
           (mt/user-http-request :rasta :get 200 "product-notifications")))
    (is (= ["first" "second" "admins"]
           (mapv :id (mt/user-http-request :crowberto :get 200 "product-notifications"))))))

(deftest dismiss-product-notification-test
  (mt/with-model-cleanup [:model/ProductNotificationDismissal :model/ProductNotification]
    (insert-notification! "first" 0)
    (is (nil? (mt/user-http-request :rasta :post 204 "product-notifications/first/dismiss")))
    (is (nil? (mt/user-http-request :rasta :post 204 "product-notifications/first/dismiss")))
    (is (= [] (mt/user-http-request :rasta :get 200 "product-notifications")))
    (is (= ["first"]
           (mapv :id (mt/user-http-request :crowberto :get 200 "product-notifications"))))))

(deftest concurrent-dismissals-create-one-row-test
  (mt/with-model-cleanup [:model/ProductNotificationDismissal :model/ProductNotification]
    (insert-notification! "concurrent" 0)
    (let [user-id (mt/user->id :rasta)]
      (is (every? true?
                  (mt/repeat-concurrently
                   5
                   #(service/dismiss! "concurrent" user-id false))))
      (is (= 1 (t2/count :model/ProductNotificationDismissal
                         :user_id user-id))))))

(deftest update-check-setting-does-not-control-product-notifications-test
  (mt/with-model-cleanup [:model/ProductNotificationDismissal :model/ProductNotification]
    (insert-notification! "visible" 0)
    (mt/with-temporary-setting-values [version.settings/check-for-updates false]
      (is (= ["visible"]
             (mapv :id (mt/user-http-request :rasta :get 200 "product-notifications"))))
      (is (nil? (mt/user-http-request :rasta :post 204
                                      "product-notifications/visible/dismiss"))))))

(deftest ineligible-product-notification-cannot-be-dismissed-test
  (mt/with-model-cleanup [:model/ProductNotificationDismissal :model/ProductNotification]
    (let [now (t/offset-date-time)]
      (insert-notification! "admins" 0 {:evaluation_options
                                        {:audience   "admins"
                                         :deployment "any"
                                         :edition    "any"
                                         :starts_at  "2026-01-01T00:00:00Z"
                                         :ends_at    "2099-01-01T00:00:00Z"}})
      (insert-notification! "inactive" 1 {:active false})
      (insert-notification! "expired" 2 {:evaluation_options
                                         {:audience   "all_users"
                                          :deployment "any"
                                          :edition    "any"
                                          :starts_at  "2026-01-01T00:00:00Z"
                                          :ends_at    (str (t/minus now (t/days 1)))}})
      (doseq [notification-id ["missing" "admins" "inactive" "expired"]]
        (is (= "Not found."
               (mt/user-http-request :rasta :post 404
                                     (str "product-notifications/" notification-id "/dismiss"))))))))

(deftest deleting-user-cascades-product-notification-dismissals-test
  (mt/with-model-cleanup [:model/ProductNotificationDismissal :model/ProductNotification]
    (mt/with-temp [:model/User user]
      (let [notification (insert-notification! "cascade" 0)]
        (t2/insert! :model/ProductNotificationDismissal
                    {:product_notification_id (:id notification)
                     :user_id                 (:id user)})
        (t2/delete! :model/User (:id user))
        (is (not (t2/exists? :model/ProductNotificationDismissal
                             :product_notification_id (:id notification)
                             :user_id (:id user))))))))
