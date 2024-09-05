(ns metabase.models.notification-test
  (:require
   [cheshire.core :as json]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.audit :as audit]
   [metabase.config :as config]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models.card :as card]
   [metabase.models.interface :as mi]
   [metabase.models.parameter-card :as parameter-card]
   [metabase.models.revision :as revision]
   [metabase.models.serialization :as serdes]
   [metabase.query-processor.card-test :as qp.card-test]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

;; ------------------------------------------------------------------------------------------------;;
;;                                      Life cycle test                                            ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest notification-type-test
  (mt/with-model-cleanup [:model/Notification]
    (testing "success path"
      (let [noti-id (t2/insert-returning-pk! :model/Notification {:payload_type :notification/system-event
                                                                  :created_at   :%now
                                                                  :updated_at   :%now})]
        (is (some? (t2/select-one :model/Notification noti-id)))))

    (testing "failed if payload_type is invalid"
      (is (thrown-with-msg? Exception #"Invalid value :notification/not-existed\. Must be one of .*"
                            (t2/insert! :model/Notification {:payload_type :notification/not-existed}))))))


(deftest notification-subscription-type-test
  (mt/with-temp [:model/Notification {noti-id :id} {}]
    (testing "success path"
      (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/event
                                                                             :event_name      :event/card-create
                                                                             :notification_id noti-id})]
        (is (some? (t2/select-one :model/NotificationSubscription sub-id)))))

    (testing "failed if type is invalid"
      (is (thrown-with-msg? Exception #"Invalid value :notification-subscription/not-existed\. Must be one of .*"
                            (t2/insert! :model/NotificationSubscription {:type           :notification-subscription/not-existed
                                                                         :event_name     :event/card-create
                                                                         :notification_id noti-id}))))))



(deftest notification-subscription-event-name-test
  (mt/with-temp [:model/Notification {noti-id :id} {}]
    (testing "success path"
      (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/event
                                                                             :event_name      (first (descendants :metabase/event))
                                                                             :notification_id noti-id})]
        (is (some? (t2/select-one :model/NotificationSubscription sub-id)))))

    (testing "failed if type is invalid"
      (is (thrown-with-msg? Exception #"Invalid value :event/not-existed\. Must be one of .*"
                            (t2/insert! :model/NotificationSubscription {:type           :notification-subscription/event
                                                                         :event_name     :event/not-existed
                                                                         :notification_id noti-id}))))))
