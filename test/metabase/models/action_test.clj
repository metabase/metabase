(ns metabase.models.action-test
  (:require [clojure.test :refer :all]
            [metabase.actions.test-util :as actions.test-util]
            [metabase.models.action :as action]
            [metabase.test :as mt]))

(deftest hydrate-query-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-action [{:keys [query-action-card-id action-id] :as _context} {}]
        (is (partial=
              {:id action-id
               :name "Query Example"
               :card {:id query-action-card-id}
               :parameters [{:id "id" :type :number}]}
              (first (action/select-actions :id action-id))))))))

(deftest hydrate-http-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (actions.test-util/with-actions-test-data-and-actions-enabled
      (actions.test-util/with-action [{:keys [action-id] :as _context} {:type :http}]
        (is (partial=
              {:id action-id
               :name "Echo Example"
               :parameters [{:id "id" :type :number}
                            {:id "fail" :type :text}]}
              (first (action/select-actions :id action-id))))))))
