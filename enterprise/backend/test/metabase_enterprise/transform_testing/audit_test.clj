(ns metabase-enterprise.transform-testing.audit-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.transform-testing.models]
   [metabase-enterprise.transform-testing.models.transform-test-run]
   [metabase-enterprise.transform-testing.run-tracking :as transform-testing.run-tracking]
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
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {transform-test-id :id} {:transform_id transform-id
                                                                 :creator_id   (mt/user->id :crowberto)
                                                                 :name         "Original"
                                                                 :description  "Checks output"}]
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
        (t2/update! :model/TransformTest transform-test-id {:name "Renamed"})
        (is (= {:model_id transform-test-id
                :user_id  (mt/user->id :crowberto)
                :details  {:transform_id transform-id
                           :name         "Renamed"
                           :description  "Checks output"}
                :topic    :transform-test-update
                :model    "TransformTest"}
               (mt/latest-audit-log-entry :transform-test-update transform-test-id))))
      (testing "delete"
        (t2/delete! :model/TransformTest :id transform-test-id)
        (is (= {:model_id transform-test-id
                :user_id  (mt/user->id :crowberto)
                :details  {:transform_id transform-id
                           :name         "Renamed"
                           :description  "Checks output"}
                :topic    :transform-test-delete
                :model    "TransformTest"}
               (mt/latest-audit-log-entry :transform-test-delete transform-test-id)))))))

(deftest transform-test-run-audit-events-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {transform-test-id :id} {:transform_id transform-id}]
      (let [initiated-by (mt/user->id :rasta)
            {run-id :id} (transform-testing.run-tracking/start-run! transform-test-id initiated-by)]
        (try
          (testing "start"
            (is (= {:model_id run-id
                    :user_id  initiated-by
                    :details  {:transform_test_id transform-test-id
                               :status            "started"}
                    :topic    :transform-test-run-start
                    :model    "TransformTestRun"}
                   (mt/latest-audit-log-entry :transform-test-run-start run-id))))
          (testing "cluster reaping records the timeout"
            (t2/update! :model/TransformTestRun run-id {:last_heartbeat (minutes-ago 10)})
            (is (= [run-id] (mapv :id (transform-testing.run-tracking/reap-orphaned-runs! 5))))
            (is (= {:model_id run-id
                    :user_id  initiated-by
                    :details  {:transform_test_id transform-test-id
                               :status            "timeout"}
                    :topic    :transform-test-run-timeout
                    :model    "TransformTestRun"}
                   (mt/latest-audit-log-entry :transform-test-run-timeout run-id))))
          (finally
            (transform-testing.run-tracking/finish-run! run-id :timeout)
            (t2/delete! :model/TransformTestRun :id run-id)))))))
