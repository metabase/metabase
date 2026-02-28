(ns metabase.notification.payload.core-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.notification.core :as notification]
   [metabase.notification.test-util :as notification.tu]))

(set! *warn-on-reflection* true)

(deftest lib-metadata-stripped-from-payload-test
  (testing "lib/metadata keys are stripped from the realized notification payload"
    (notification.tu/with-card-notification
      [notification {}]
      (let [payload (notification/notification-payload notification)]
        (walk/prewalk
         (fn [x]
           (when (map? x)
             (is (not (contains? x :lib/metadata))
                 "No :lib/metadata should survive in the notification payload"))
           x)
         payload)))))
