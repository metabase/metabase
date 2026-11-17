(ns metabase.revisions.hooks-test
  (:require
   [clojure.test :refer :all]
   [metabase.revisions.hooks :as revisions.hooks]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- revisions-of [model model-id]
  (t2/select :model/Revision :model model :model_id model-id {:order-by [[:id :asc]]}))

(deftest card-revisions-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {card-id :id} {}]
      (testing "the insert records a creation"
        (is (=? [{:is_creation true :user_id (mt/user->id :crowberto)}] (revisions-of "Card" card-id))))
      (testing "an update records a revision"
        (t2/update! :model/Card :id card-id {:name "renamed"})
        (is (=? [{:is_creation true} {:is_creation false :object {:name "renamed"}}] (revisions-of "Card" card-id))))
      (testing "an update of what revisions leave out records none"
        (t2/update! :model/Card :id card-id {:collection_position 3})
        (is (= 2 (count (revisions-of "Card" card-id))))))))

(deftest no-user-records-nothing-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (t2/update! :model/Card :id card-id {:name "renamed"})
    (is (empty? (revisions-of "Card" card-id)))))

(deftest dashboard-writes-are-one-revision-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                   :model/Card      {card-id :id}      {}]
      (let [before (count (revisions-of "Dashboard" dashboard-id))]
        (revisions.hooks/with-revision-message "add two"
          ((requiring-resolve 'metabase.dependencies.hooks/do-with-batched-marks)
           (fn []
             ((requiring-resolve 'metabase.util.write-batch/do-with-write-batch)
              (fn []
                (dotimes [i 2]
                  (t2/insert! :model/DashboardCard {:dashboard_id dashboard-id :card_id card-id :row i :col 0
                                                    :size_x 4 :size_y 4})))))))
        (is (= (inc before) (count (revisions-of "Dashboard" dashboard-id))))
        (is (=? {:message "add two" :object {:cards [{} {}]}}
                (last (revisions-of "Dashboard" dashboard-id))))))))

(deftest segment-update-message-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Segment {segment-id :id} {}]
      (revisions.hooks/with-revision-message "why"
        (t2/update! :model/Segment :id segment-id {:name "renamed"}))
      (is (=? {:message "why"} (last (revisions-of "Segment" segment-id)))))))
