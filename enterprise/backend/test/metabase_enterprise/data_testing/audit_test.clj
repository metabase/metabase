(ns metabase-enterprise.data-testing.audit-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.models.card-test :as data-testing.models.card-test]
   [metabase-enterprise.data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.models.segment-test]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.audit-app.events.audit-log]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fn [test-fn]
    (mt/with-premium-features #{:audit-app}
      (test-fn))))

(defn- minutes-ago ^OffsetDateTime [^long n]
  (.minusMinutes (OffsetDateTime/now ZoneOffset/UTC) n))

(deftest transform-test-audit-events-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Transform {transform-id :id} {}]
      (let [{transform-test-id :id} (data-testing.models/create-transform-test! {:transform_id transform-id
                                                                                 :creator_id   (mt/user->id :crowberto)
                                                                                 :name         "Original"
                                                                                 :description  "Checks output"
                                                                                 :inputs       []
                                                                                 :expectations []})]
        (testing "create"
          (is (= {:model_id transform-test-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:transform_id transform-id
                             :name         "Original"
                             :description  "Checks output"}
                  :topic    :transform-test-create
                  :model    "TransformTest"}
                 (mt/latest-audit-log-entry :transform-test-create transform-test-id))))
        (testing "update"
          (data-testing.models/update-transform-test! transform-test-id {:name "Renamed"})
          (is (= {:model_id transform-test-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:transform_id transform-id
                             :name         "Renamed"
                             :description  "Checks output"}
                  :topic    :transform-test-update
                  :model    "TransformTest"}
                 (mt/latest-audit-log-entry :transform-test-update transform-test-id))))
        (testing "delete"
          (data-testing.models/delete-transform-test! transform-test-id)
          (is (= {:model_id transform-test-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:transform_id transform-id
                             :name         "Renamed"
                             :description  "Checks output"}
                  :topic    :transform-test-delete
                  :model    "TransformTest"}
                 (mt/latest-audit-log-entry :transform-test-delete transform-test-id))))))))

(deftest transform-test-model-writes-by-user-write-audit-rows-test
  (testing "Inserting, updating and deleting a transform test through the model as a user writes an audit row each"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Transform     {transform-id :id}      {}
                     :model/TransformTest {transform-test-id :id} {:transform_id transform-id}]
        (t2/update! :model/TransformTest :id transform-test-id {:name "Renamed"})
        (t2/delete! :model/TransformTest :id transform-test-id)
        (is (= 3 (t2/count :model/AuditLog :model "TransformTest" :model_id transform-test-id)))))))

(deftest transform-test-run-audit-events-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {transform-test-id :id} {:transform_id transform-id}]
      (let [initiated-by (mt/user->id :rasta)
            {run-id :id} (data-testing.run-tracking/start-run! :transform transform-test-id initiated-by)]
        (try
          (testing "start"
            (is (= {:model_id run-id
                    :user_id  initiated-by
                    :details  {:test_type "transform"
                               :test_id   transform-test-id
                               :status    "started"}
                    :topic    :transform-test-run-start
                    :model    "DataTestRun"}
                   (mt/latest-audit-log-entry :transform-test-run-start run-id))))
          (testing "cluster reaping records the timeout"
            (t2/update! :model/DataTestRun :id run-id {:last_heartbeat (minutes-ago 10)})
            (is (= [run-id] (mapv :id (data-testing.run-tracking/reap-orphaned-runs! 5))))
            (is (= {:model_id run-id
                    :user_id  initiated-by
                    :details  {:test_type "transform"
                               :test_id   transform-test-id
                               :status    "timeout"}
                    :topic    :transform-test-run-timeout
                    :model    "DataTestRun"}
                   (mt/latest-audit-log-entry :transform-test-run-timeout run-id))))
          (finally
            (data-testing.run-tracking/finish-run! run-id :timeout)
            (t2/delete! :model/DataTestRun :id run-id)))))))

(deftest card-test-run-audit-events-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card     {card-id :id} {}
                   :model/CardTest {card-test-id :id} {:card_id card-id}]
      (let [initiated-by (mt/user->id :rasta)
            {run-id :id} (data-testing.run-tracking/start-run! :card card-test-id initiated-by)]
        (try
          (testing "start, under the card-test topic"
            (is (= {:model_id run-id
                    :user_id  initiated-by
                    :details  {:test_type "card"
                               :test_id   card-test-id
                               :status    "started"}
                    :topic    :card-test-run-start
                    :model    "DataTestRun"}
                   (mt/latest-audit-log-entry :card-test-run-start run-id))))
          (testing "cluster reaping records the timeout under the card-test topic"
            (t2/update! :model/DataTestRun :id run-id {:last_heartbeat (minutes-ago 10)})
            (is (= [run-id] (mapv :id (data-testing.run-tracking/reap-orphaned-runs! 5))))
            (is (= {:model_id run-id
                    :user_id  initiated-by
                    :details  {:test_type "card"
                               :test_id   card-test-id
                               :status    "timeout"}
                    :topic    :card-test-run-timeout
                    :model    "DataTestRun"}
                   (mt/latest-audit-log-entry :card-test-run-timeout run-id))))
          (finally
            (data-testing.run-tracking/finish-run! run-id :timeout)
            (t2/delete! :model/DataTestRun :id run-id)))))))

(deftest card-test-audit-events-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [{card-test-id :id} (data-testing.models.card-test/create-card-test! {:card_id      card-id
                                                                                 :creator_id   (mt/user->id :crowberto)
                                                                                 :name         "Original"
                                                                                 :description  "Checks output"
                                                                                 :inputs       []
                                                                                 :expectations []})]
        (testing "create"
          (is (= {:model_id card-test-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:card_id     card-id
                             :name        "Original"
                             :description "Checks output"}
                  :topic    :card-test-create
                  :model    "CardTest"}
                 (mt/latest-audit-log-entry :card-test-create card-test-id))))
        (testing "update"
          (data-testing.models.card-test/update-card-test! card-test-id {:name "Renamed"})
          (is (= {:model_id card-test-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:card_id     card-id
                             :name        "Renamed"
                             :description "Checks output"}
                  :topic    :card-test-update
                  :model    "CardTest"}
                 (mt/latest-audit-log-entry :card-test-update card-test-id))))
        (testing "delete"
          (data-testing.models.card-test/delete-card-test! card-test-id)
          (is (= {:model_id card-test-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:card_id     card-id
                             :name        "Renamed"
                             :description "Checks output"}
                  :topic    :card-test-delete
                  :model    "CardTest"}
                 (mt/latest-audit-log-entry :card-test-delete card-test-id))))))))

(deftest card-test-model-writes-by-user-write-audit-rows-test
  (testing "Inserting, updating and deleting a card test through the model as a user writes an audit row each"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card     {card-id :id}      {}
                     :model/CardTest {card-test-id :id} {:card_id card-id}]
        (t2/update! :model/CardTest :id card-test-id {:name "Renamed"})
        (t2/delete! :model/CardTest :id card-test-id)
        (is (= 3 (t2/count :model/AuditLog :model "CardTest" :model_id card-test-id)))))))

(deftest card-test-audit-events-name-the-acting-user-test
  (testing "The rows of the create, update and delete of a card test name the user who acts, who is its creator"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [{card-test-id :id} (data-testing.models.card-test/create-card-test! {:card_id      card-id
                                                                                   :creator_id   (mt/user->id :rasta)
                                                                                   :name         "Original"
                                                                                   :inputs       []
                                                                                   :expectations []})]
          (testing "create"
            (is (=? {:user_id (mt/user->id :rasta)}
                    (mt/latest-audit-log-entry :card-test-create card-test-id))))
          (testing "update"
            (data-testing.models.card-test/update-card-test! card-test-id {:name "Renamed"})
            (is (=? {:user_id (mt/user->id :rasta)}
                    (mt/latest-audit-log-entry :card-test-update card-test-id))))
          (testing "delete"
            (data-testing.models.card-test/delete-card-test! card-test-id)
            (is (=? {:user_id (mt/user->id :rasta)}
                    (mt/latest-audit-log-entry :card-test-delete card-test-id)))))))))

(deftest segment-test-audit-events-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Segment     {segment-id :id}      (data-testing.test-util/segment-on (mt/id :people) "A segment")
                   :model/SegmentTest {segment-test-id :id} {:segment_id  segment-id
                                                             :creator_id  (mt/user->id :crowberto)
                                                             :name        "Original"
                                                             :description "Checks output"}]
      (let [entry (fn [topic test-name]
                    {:model_id segment-test-id
                     :user_id  (mt/user->id :crowberto)
                     :details  {:segment_id segment-id :name test-name :description "Checks output"}
                     :topic    topic
                     :model    "SegmentTest"})]
        (testing "create"
          (is (= (entry :segment-test-create "Original")
                 (mt/latest-audit-log-entry :segment-test-create segment-test-id))))
        (testing "update"
          (t2/update! :model/SegmentTest :id segment-test-id {:name "Renamed"})
          (is (= (entry :segment-test-update "Renamed")
                 (mt/latest-audit-log-entry :segment-test-update segment-test-id))))
        (testing "delete"
          (t2/delete! :model/SegmentTest :id segment-test-id)
          (is (= (entry :segment-test-delete "Renamed")
                 (mt/latest-audit-log-entry :segment-test-delete segment-test-id))))))))

(deftest segment-test-run-audit-events-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Segment     {segment-id :id}      (data-testing.test-util/segment-on (mt/id :people) "A segment")
                   :model/SegmentTest {segment-test-id :id} {:segment_id segment-id}]
      (let [initiated-by (mt/user->id :rasta)
            {run-id :id} (data-testing.run-tracking/start-run! :segment segment-test-id initiated-by)
            entry        (fn [topic status]
                           {:model_id run-id
                            :user_id  initiated-by
                            :details  {:test_type "segment" :test_id segment-test-id :status status}
                            :topic    topic
                            :model    "DataTestRun"})]
        (try
          (testing "start, under the segment-test topic"
            (is (= (entry :segment-test-run-start "started")
                   (mt/latest-audit-log-entry :segment-test-run-start run-id))))
          (testing "cluster reaping records the timeout under the segment-test topic"
            (t2/update! :model/DataTestRun :id run-id {:last_heartbeat (minutes-ago 10)})
            (is (= [run-id] (mapv :id (data-testing.run-tracking/reap-orphaned-runs! 5))))
            (is (= (entry :segment-test-run-timeout "timeout")
                   (mt/latest-audit-log-entry :segment-test-run-timeout run-id))))
          (finally
            (data-testing.run-tracking/finish-run! run-id :timeout)
            (t2/delete! :model/DataTestRun :id run-id)))))))
