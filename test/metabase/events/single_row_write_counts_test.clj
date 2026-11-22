(ns metabase.events.single-row-write-counts-test
  "The number of app-DB statements of the write functions that publish their events by hand, for one row, which
  includes the one read of the previous row that the event needs."
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.measures.models.measure :as measure]
   [metabase.metabot.models.metabot-conversation :as metabot-conversation]
   [metabase.segments.models.segment :as segment]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.models.transform :as transform]
   [metabase.transforms.models.transform-job :as transform-job]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest segment-update-statement-counts-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Segment {id :id} {}]
      (testing "without a definition: the read of the previous row, the select of the hook and the update"
        (is (= 3 (events.tu/statement-count! #(segment/update-segments! [{:id id :name "Renamed"}])))))
      (testing "with a definition"
        (let [mp         (mt/metadata-provider)
              update!    (fn [n] #(segment/update-segments! [{:id id :definition (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                                                                             (lib/> (lib.metadata/field mp (mt/id :orders :total)) n))}]))]
          (segment/update-segments! [{:id id :definition (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                                                     (lib/> (lib.metadata/field mp (mt/id :orders :total)) 1))}])
          (is (= 8 (events.tu/statement-count! (update! 5)))))))))

(deftest measure-write-statement-counts-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Measure {id :id} {}]
      (testing "an update without a definition"
        (is (= 3 (events.tu/statement-count! #(measure/update-measures! [{:id id :name "Renamed"}])))))
      (testing "an update with a definition"
        (let [mp      (mt/metadata-provider)
              update! #(measure/update-measures! [{:id id :definition (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                                                                     (lib/sum (lib.metadata/field mp (mt/id :orders :total))))}])]
          (measure/update-measures! [{:id id :definition (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders))) (lib/count))}])
          (is (= 9 (events.tu/statement-count! update!)))))
      (testing "setting the dimensions"
        (is (= 3 (events.tu/statement-count! #(measure/set-measure-dimensions! id [] []))))))))

(deftest transform-write-statement-counts-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Transform {transform-id :id} {}
                   :model/TransformJob {job-id :id} {}]
      (testing "a transform update"
        (is (= 3 (events.tu/statement-count! #(transform/update-transforms! [{:id transform-id :name "Renamed"}])))))
      (testing "deactivating and activating a job"
        (is (= 3 (events.tu/statement-count! #(transform-job/deactivate-job! job-id))))
        (is (= 3 (events.tu/statement-count! #(transform-job/activate-job! job-id))))))))

(deftest metabot-conversation-upsert-statement-counts-test
  (let [id (str (random-uuid))]
    (testing "an upsert that inserts"
      (is (= 4 (events.tu/statement-count!
                #(metabot-conversation/upsert-metabot-conversation! id (fn [_] {:user_id (mt/user->id :rasta)}))))))
    (testing "an upsert that updates"
      (is (= 3 (events.tu/statement-count!
                #(metabot-conversation/upsert-metabot-conversation! id (fn [_] {:ip_address "1.2.3.4"}))))))))
