(ns metabase-enterprise.workspaces.api-test
  "Tests for workspace API endpoints"
  (:require
   [clojure.test :refer :all]
   [malli.util :as mut]
   [metabase-enterprise.workspaces.models.workspace :as m.workspace]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(deftest workspace-validation-test
  (testing "Workspace validation with updated Malli schema structure"
    (let [valid-workspace {:name "Test"
                           :description "Test workspace"
                           :created_at "2023-08-06T15:00:00Z"
                           :updated_at "2023-08-06T15:00:00Z"
                           :plans []
                           :transforms []
                           :activity_logs []
                           :permissions []
                           :users []
                           :data_warehouses []
                           :documents []}]
      (is (nil? (mr/explain ::m.workspace/workspace valid-workspace))))))

(deftest create-workspace-test
  (testing "Creating a workspace with valid data using mt/with-temp"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "API Workspace Collection"}
                   :model/Workspace {workspace-id :id :as wksp} {:name "Test Workspace"
                                                                 :description "A test workspace"
                                                                 :collection_id collection-id}]
      (is (pos? workspace-id))
      (is (= "Test Workspace"
             (:name (t2/select-one :model/Workspace :id workspace-id))))
      (is (= (mut/keys (mr/resolve-schema ::m.workspace/workspace))
             (keys (m.workspace/sort-workspace wksp)))))))

 ;;; API Endpoint Tests

(defn- test-workspace-data
  "Generate test workspace data with a valid collection."
  ([]
   (test-workspace-data {}))
  ([overrides]
   (merge {:name "Test Workspace"
           :description "A test workspace"
           :collection_id 1 ; Will be replaced with actual collection ID in tests
           :users []
           :plans []
           :transforms []
           :documents []
           :data_warehouses []
           :permissions []
           :activity_logs []}
          overrides)))

(deftest api-get-workspaces-test
  (testing "GET /api/ee/workspace/ - list workspaces"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "API Workspace Collection"}
                   :model/Workspace _ {:name "API Workspace 1"
                                       :collection_id collection-id}
                   :model/Workspace _ {:name "API Workspace 2"
                                       :collection_id collection-id}]
      (let [result (mt/user-http-request :crowberto :get 200 "ee/workspace/")]
        (is (>= (count result) 2))
        (is (some #(= "API Workspace 1" (:name %)) result))
        (is (some #(= "API Workspace 2" (:name %)) result))))))

(deftest api-get-workspace-by-id-test
  (testing "GET /api/ee/workspace/:workspace-id - get specific workspace"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Workspace Collection"}
                   :model/Workspace {workspace-id :id} {:name "Test Workspace"
                                                        :collection_id collection-id}]
      (testing "should get existing workspace"
        (let [result (mt/user-http-request :crowberto :get 200 (format "ee/workspace/%s" workspace-id))]
          (is (= workspace-id (:id result)))))
      (testing "should return 404 for non-existent workspace"
        (mt/user-http-request :crowberto :get 404 "ee/workspace/888888")))))
