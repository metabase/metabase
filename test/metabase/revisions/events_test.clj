(ns metabase.revisions.events-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.events.core :as events]
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
        (events/with-event-context {:revision-message "add two"}
          (events/with-batched-events
            (dotimes [i 2]
              (t2/insert! :model/DashboardCard {:dashboard_id dashboard-id :card_id card-id :row i :col 0
                                                :size_x 4 :size_y 4}))))
        (is (= (inc before) (count (revisions-of "Dashboard" dashboard-id))))
        (is (=? {:message "add two" :object {:cards [{} {}]}}
                (last (revisions-of "Dashboard" dashboard-id))))))))

(deftest segment-update-message-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Segment {segment-id :id} {}]
      (events/with-event-context {:revision-message "why"}
        (t2/update! :model/Segment :id segment-id {:name "renamed"}))
      (is (=? {:message "why"} (last (revisions-of "Segment" segment-id)))))))

(defn- last-object [model model-id]
  (:object (last (revisions-of model model-id))))

(deftest card-revision-object-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {card-id :id} {:name "Card"}]
      (let [object (last-object "Card" card-id)]
        (testing "the stored object is the serialized card"
          (is (=? {:name "Card" :archived false :type :question :database_id (mt/id)} object)))
        (testing "it holds nothing of the public link"
          (is (empty? (set/intersection #{:public_uuid :made_public_by_id :enable_embedding :embedding_params}
                                        (set (keys object))))))))))

(deftest dashboard-revision-object-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Dashboard"}]
      (let [object (last-object "Dashboard" dashboard-id)]
        (is (=? {:name "Dashboard" :archived false :tabs [] :cards []} object))
        (is (empty? (set/intersection #{:public_uuid :made_public_by_id :enable_embedding}
                                      (set (keys object)))))))))

(deftest dashboard-part-writes-record-revisions-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                   :model/Card      {card-id :id}      {}
                   :model/Card      {series-id :id}    {}]
      (let [revisions #(count (revisions-of "Dashboard" dashboard-id))
            records!  (fn [what write]
                        (let [before (revisions)]
                          (write)
                          (testing what
                            (is (= (inc before) (revisions))))))
            tab-id    (atom nil)
            dashcard  (atom nil)]
        (records! "adding a tab"
                  #(reset! tab-id (t2/insert-returning-pk! :model/DashboardTab {:dashboard_id dashboard-id :name "First" :position 0})))
        (is (=? {:tabs [{:id @tab-id :name "First"}]} (last-object "Dashboard" dashboard-id)))
        (records! "renaming a tab" #(t2/update! :model/DashboardTab :id @tab-id {:name "Renamed"}))
        (is (=? {:tabs [{:name "Renamed"}]} (last-object "Dashboard" dashboard-id)))
        (records! "adding a dashcard"
                  #(reset! dashcard (t2/insert-returning-pk! :model/DashboardCard {:dashboard_id dashboard-id :card_id card-id
                                                                                   :row 0 :col 0 :size_x 4 :size_y 4})))
        (records! "repositioning a dashcard" #(t2/update! :model/DashboardCard :id @dashcard {:size_x 3}))
        (is (=? {:cards [{:size_x 3}]} (last-object "Dashboard" dashboard-id)))
        (records! "adding a series to a dashcard"
                  #(t2/insert! :model/DashboardCardSeries {:dashboardcard_id @dashcard :card_id series-id :position 0}))
        (is (=? {:cards [{:series [series-id]}]} (last-object "Dashboard" dashboard-id)))
        (records! "removing the series"
                  #(t2/delete! :model/DashboardCardSeries :dashboardcard_id @dashcard))
        (is (=? {:cards [{:series []}]} (last-object "Dashboard" dashboard-id)))
        (records! "removing a dashcard" #(t2/delete! :model/DashboardCard :id @dashcard))
        (is (=? {:cards []} (last-object "Dashboard" dashboard-id)))
        (records! "removing a tab" #(t2/delete! :model/DashboardTab :id @tab-id))
        (is (=? {:tabs []} (last-object "Dashboard" dashboard-id)))))))
