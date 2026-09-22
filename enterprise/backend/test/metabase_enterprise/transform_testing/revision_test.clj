(ns metabase-enterprise.transform-testing.revision-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transform-testing.models]
   [metabase-enterprise.transform-testing.models.transform-test-run]
   [metabase-enterprise.transform-testing.run-tracking :as transform-testing.run-tracking]
   [metabase.revisions.core :as revisions]
   [metabase.revisions.events]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest transform-test-revision-serialization-test
  (let [transform-test (t2/instance :model/TransformTest
                                    {:id           1
                                     :entity_id    "test-entity-id"
                                     :transform_id 2
                                     :creator_id   3
                                     :name         "No nulls"
                                     :description  "Checks the output"
                                     :inputs       []
                                     :expectations []
                                     :created_at   :not-revisioned
                                     :updated_at   :not-revisioned})]
    (is (= {:transform_id 2
            :name         "No nulls"
            :description  "Checks the output"
            :inputs       []
            :expectations []}
           (revisions/serialize-instance :model/TransformTest 1 transform-test)))))

(deftest transform-test-create-and-update-revisions-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {transform-test-id :id} {:transform_id transform-id
                                                                 :creator_id   (mt/user->id :crowberto)
                                                                 :name         "Original"}]
      (testing "creation records the initial revision"
        (let [[creation] (revisions/revisions :model/TransformTest transform-test-id)]
          (is (true? (:is_creation creation)))
          (is (= "Original" (get-in creation [:object :name])))
          (is (= (mt/user->id :crowberto) (:user_id creation)))))
      (testing "an update records the changed editable fields"
        (t2/update! :model/TransformTest transform-test-id {:name "Renamed"})
        (let [[updated creation] (revisions/revisions :model/TransformTest transform-test-id)]
          (is (= "Renamed" (get-in updated [:object :name])))
          (is (false? (:is_creation updated)))
          (is (= "Original" (get-in creation [:object :name]))))))))

(deftest transform-test-revision-revert-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Transform     {transform-id :id} {}
                       :model/TransformTest {transform-test-id :id} {:transform_id transform-id
                                                                     :name         "Original"}]
          (t2/update! :model/TransformTest transform-test-id {:name "Renamed"})
          (let [creation (last (revisions/revisions :model/TransformTest transform-test-id))]
            (mt/user-http-request :crowberto :post 200 "revision/revert"
                                  {:entity      "transform-test"
                                   :id          transform-test-id
                                   :revision_id (:id creation)})
            (testing "the saved test is restored"
              (is (= "Original" (t2/select-one-fn :name :model/TransformTest :id transform-test-id))))
            (testing "the reversion is recorded after the model update revision"
              (let [[reversion reverted-update update creation]
                    (revisions/revisions :model/TransformTest transform-test-id)]
                (is (= 4 (count (revisions/revisions :model/TransformTest transform-test-id))))
                (is (true? (:is_reversion reversion)))
                (is (= "Original" (get-in reversion [:object :name])))
                (is (false? (:is_reversion reverted-update)))
                (is (= "Original" (get-in reverted-update [:object :name])))
                (is (= "Renamed" (get-in update [:object :name])))
                (is (true? (:is_creation creation)))))))))))

(deftest transform-test-runs-are-not-revisioned-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {transform-test-id :id} {:transform_id transform-id}]
      (let [{run-id :id} (transform-testing.run-tracking/start-run! transform-test-id (mt/user->id :crowberto))]
        (try
          (transform-testing.run-tracking/finish-run! run-id :passed)
          (is (zero? (t2/count :model/Revision :model "TransformTestRun" :model_id run-id)))
          (finally
            (t2/delete! :model/TransformTestRun :id run-id)))))))
