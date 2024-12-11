(ns metabase.notification.payload.impl.card-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.models.notification :as models.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.public-settings :as public-settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.urls :as urls]
   [toucan2.core :as t2]
   [metabase.notification.core :as notification]))

(use-fixtures
 :each
 (fn [thunk]
   (binding [notification/*default-options* {:notification/sync? true}]
     (thunk))))

(deftest basic-card-notification-test
  (notification.tu/with-notification-testing-setup!
    (notification.tu/with-card-notification
      [notification {:handlers [{:channel_type :channel/email
                                 :recipients   [{:type    :notification-recipient/user
                                                 :user_id (t2/select-one-pk :model/User)}]}]}]
      (notification/send-notification! notification)
      #_(notification.tu/with-captured-channel-send!
          (notification/send-notification! notification)))))
