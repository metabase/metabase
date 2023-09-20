(ns metabase.models.audit-log-test
  (:require [clojure.test :refer :all]
            [metabase.models.audit-log :as audit-log]
            [metabase.test :as mt]
            [toucan2.core :as t2]
            [toucan2.tools.with-temp :as t2.with-temp]))

(derive :event/test-event :metabase/event)

(deftest basic-record-event-test
  (mt/with-model-cleanup [:model/AuditLog]
    (mt/with-test-user :rasta
      (testing "Test that `record-event!` succesfully records basic card events"
        (t2.with-temp/with-temp [:model/Card {card-id :id :as card} {:name "Test card"}]
          (audit-log/record-event! :event/card-create card)
          ;; Not an exhaustive match since we're mainly testing that the event is recorded
          (is (partial=
               {:topic    :card-create
                :user_id  (mt/user->id :rasta)
                :model    "Card"
                :model_id card-id
                :details  {:name "Test card"}}
               (t2/select-one :model/AuditLog :model_id card-id)))))

      (testing "Test that `record-event!` succesfully records basic card events with the user, model, and model ID specified"
        (t2.with-temp/with-temp [:model/Card {card-id :id :as card} {:name "Test card"}]
          (audit-log/record-event! :event/card-create card (mt/user->id :rasta) :model/Card card-id)
          (is (partial=
               {:topic    :card-create
                :user_id  (mt/user->id :rasta)
                :model    "Card"
                :model_id card-id
                :details  {:name "Test card"}}
               (t2/select-one :model/AuditLog :model_id card-id)))))

      (testing "Test that `record-event!` records an event with arbitrary data and no model specified"
        (audit-log/record-event! :event/test-event {:foo "bar"})
        (is (partial=
             {:topic :test-event
              :user_id (mt/user->id :rasta)
              :model nil
              :model_id nil
              :details {:foo "bar"}}
             (t2/select-one :model/AuditLog :topic :test-event)))))))
