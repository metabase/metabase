(ns metabase.product-notifications.api-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.product-notifications.init]
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
             :audience        :all_users
             :deployment      :any
             :edition         :any
             :starts_at       (t/minus now (t/days 1))
             :ends_at         (t/plus now (t/days 1))
             :position        position
             :active          true
             :last_seen_at    now}
            overrides))))

(deftest list-and-dismiss-product-notifications-test
  (mt/with-temporary-setting-values [version.settings/check-for-updates true]
    (mt/with-model-cleanup [:model/ProductNotificationDismissal :model/ProductNotification]
      (insert-notification! "second" 1 {:icon "star"})
      (insert-notification! "first" 0)
      (insert-notification! "admins" 2 {:audience :admins})
      (testing "returns the first eligible undismissed notification by default"
        (is (= [{:id      "first"
                 :title   "Title first"
                 :content "Content first"}]
               (mt/user-http-request :rasta :get 200 "product-notifications"))))
      (testing "include_all returns all eligible notifications in feed order"
        (is (= ["first" "second"]
               (mapv :id
                     (mt/user-http-request :rasta :get 200
                                           "product-notifications?include_all=true")))))
      (testing "dismissal is idempotent and scoped to the current user"
        (is (nil? (mt/user-http-request :rasta :post 204
                                        "product-notifications/first/dismiss")))
        (is (nil? (mt/user-http-request :rasta :post 204
                                        "product-notifications/first/dismiss")))
        (is (= ["second"]
               (mapv :id
                     (mt/user-http-request :rasta :get 200
                                           "product-notifications?include_all=true"))))
        (is (= ["first" "second" "admins"]
               (mapv :id
                     (mt/user-http-request :crowberto :get 200
                                           "product-notifications?include_all=true")))))
      (testing "a person cannot dismiss a notification that is ineligible for them"
        (is (= "Not found."
               (mt/user-http-request :rasta :post 404
                                     "product-notifications/admins/dismiss")))))))

(deftest disabled-update-checks-hide-persisted-notifications-test
  (mt/with-model-cleanup [:model/ProductNotificationDismissal :model/ProductNotification]
    (insert-notification! "hidden" 0)
    (mt/with-temporary-setting-values [version.settings/check-for-updates false]
      (is (= [] (mt/user-http-request :rasta :get 200 "product-notifications"))))))
