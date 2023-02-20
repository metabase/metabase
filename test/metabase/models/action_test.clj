(ns metabase.models.action-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Action Dashboard DashboardCard]]
   [metabase.models.action :as action]
   [metabase.test :as mt]
   [toucan.hydrate :refer [hydrate]]
   [toucan2.core :as t2]))

(deftest hydrate-query-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [model-id action-id] :as _context} {}]
        (is (partial= {:id action-id
                       :name "Query Example"
                       :model_id model-id
                       :parameters [{:id "id" :type :number}]}
                      (action/select-action :id action-id)))))))

(deftest hydrate-http-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [action-id] :as _context} {:type :http}]
        (is (partial= {:id action-id
                       :name "Echo Example"
                       :parameters [{:id "id" :type :number}
                                    {:id "fail" :type :text}]}
                      (action/select-action :id action-id)))))))

(deftest hydrate-creator-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [model-id action-id] :as _context} {}]
        (is (partial= {:id action-id
                       :name "Query Example"
                       :model_id model-id
                       :creator_id (mt/user->id :crowberto)
                       :creator {:common_name "Crowberto Corv"}
                       :parameters [{:id "id" :type :number}]}
                      (hydrate (action/select-action :id action-id) :creator)))))))

(deftest dashcard-deletion-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (testing "Dashcards are deleted after actions are archived"
        (mt/with-actions [{:keys [action-id]} {}]
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:action_id action-id
                                                            :dashboard_id dashboard-id}]]
            (is (= 1 (t2/count DashboardCard :id dashcard-id)))
            (action/update! {:id action-id, :archived true} {:id action-id})
            (is (zero? (t2/count DashboardCard :id dashcard-id))))))
      (testing "Dashcards are deleted after actions are deleted entirely"
        (mt/with-actions [{:keys [action-id]} {}]
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:action_id action-id
                                                            :dashboard_id dashboard-id}]]
            (is (= 1 (t2/count DashboardCard :id dashcard-id)))
            (t2/delete! Action :id action-id)
            (is (zero? (t2/count DashboardCard :id dashcard-id)))))))))
