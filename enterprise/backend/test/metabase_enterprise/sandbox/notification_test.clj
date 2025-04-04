(ns metabase-enterprise.sandbox.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]))

(deftest sandboxed-alert-test
  (testing "Alerts should get sent with the row-level restrictions of the User that created them."
    (met/with-gtaps! {:gtaps      {:venues {:query      (mt/mbql-query venues)
                                            :remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
                      :attributes {"cat" 50}}
      (notification.tu/with-card-notification
        [notification {:card     {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                       :handlers [@notification.tu/default-email-handler]}]
        (let [send-alert-by-user! (fn [user-kw]
                                    (-> (assoc notification :creator_id (mt/user->id user-kw))
                                        notification.payload/payload
                                        :card_part
                                        :result
                                        :data
                                        :rows))]

          (is (= [[100]]
                 (send-alert-by-user! :crowberto)))
          (is (= [[10]]
                 (send-alert-by-user! :rasta))))))))
