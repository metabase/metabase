(ns metabase.models.action-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.action :as action]
   [metabase.test :as mt]
   [toucan.hydrate :refer [hydrate]]))

(deftest hydrate-query-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [model-id action-id] :as _context} {}]
        (is (partial=
             {:id action-id
              :name "Query Example"
              :model_id model-id
              :parameters [{:id "id" :type :number}]}
             (first (action/select-actions :id action-id))))))))

(deftest hydrate-http-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [action-id] :as _context} {:type :http}]
        (is (partial=
              {:id action-id
               :name "Echo Example"
               :parameters [{:id "id" :type :number}
                            {:id "fail" :type :text}]}
              (first (action/select-actions :id action-id))))))))

(deftest hydrate-creator-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [model-id action-id] :as _context} {}]
        (is (partial=
             {:id action-id
              :name "Query Example"
              :model_id model-id
              :creator_id (mt/user->id :crowberto)
              :creator {:common_name "Crowberto Corv"}
              :parameters [{:id "id" :type :number}]}
             (hydrate (first (action/select-actions :id action-id)) :creator)))))))
