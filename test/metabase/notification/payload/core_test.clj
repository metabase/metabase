(ns metabase.notification.payload.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.core :as notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.util.match :as match]))

(set! *warn-on-reflection* true)

(deftest lib-metadata-stripped-from-payload-test
  (testing "lib/metadata keys are stripped from the realized notification payload"
    (notification.tu/with-card-notification
      [notification {}]
      (let [payload (notification/notification-payload notification)]
        (match/match-all payload
          {:lib/metadata _} (is false (str "No :lib/metadata should survive in the notification payload " &match)))))))
