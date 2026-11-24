(ns metabase.notification.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.query :as mdb.query]
   [metabase.notification.db :as notification.db]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- partitioned!
  "Call `f` with every partition size of the app DB set to `size`."
  [size f]
  (with-redefs [mdb.query/select-partition-size size
                mdb/select-partition-size       size
                mdb/delete-partition-size       size
                mdb/update-partition-size       size]
    (f)))

(defn- email-handler
  [email]
  {:channel_type :channel/email
   :recipients   [{:type :notification-recipient/raw-value, :details {:value email}}]})

(deftest recipient-filters-over-partitions-match-single-statement-test
  (notification.tu/with-card-notification [n1 {:handlers [(email-handler "one@example.com")]}]
    (notification.tu/with-card-notification [n2 {:handlers [(email-handler "two@example.com")]}]
      (notification.tu/with-card-notification [n3 {:handlers [(email-handler "three@example.com")]}]
        (let [notification-ids (set (map :id [n1 n2 n3]))
              handler-ids      (into #{} (mapcat #(map :id (:handlers %))) [n1 n2 n3])
              read-all         (fn []
                                 {:count (notification.db/admin-notifications-count {:recipient_notification_ids notification-ids})
                                  :email (notification.db/handler-notification-ids-for-email "nobody@example.com" handler-ids)})]
          (is (= {:count 3, :email notification-ids} (read-all)))
          (is (= (read-all) (partitioned! 2 read-all)))
          (is (< (t2/with-call-count [calls] (read-all) (calls))
                 (t2/with-call-count [calls] (partitioned! 2 read-all) (calls)))))))))
