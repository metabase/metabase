(ns metabase.notification.seed-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.notification.seed :as notification.seed]
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

(deftest truncate-then-seed-notification!-is-idempotent
  (let [get-notifications-data #(-> (t2/select :model/Notification)
                                    (t2/hydrate [:handlers :channel :template :recipients])
                                    nullify-timestamp)]
    (notification.seed/truncate-then-seed-notification!)
    (let [before (get-notifications-data)]
      (notification.seed/truncate-then-seed-notification!)
      (is (= before (get-notifications-data))))))
