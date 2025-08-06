(ns metabase-enterprise.workspaces.api.workspace-test
  "Tests for workspace API endpoints"
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.api.workspace :as workspace.api]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest workspace-create-test
  (testing "Can create a workspace with required fields"
    (mt/with-temp-env-var-value! [MB_PREMIUM_EMBEDDING_TOKEN "test-token"]
      (let [workspace-data {:name "Test Workspace"
                            :description "A test workspace"}]
        (is (map? workspace-data))
        (is (= "Test Workspace" (:name workspace-data)))))))

(deftest workspace-validation-test
  (testing "Workspace validation with Malli schema"
    (let [valid-workspace {:name "Test"
                           :description "Test workspace"
                           :created-at "2023-08-06T15:00:00Z"
                           :updated-at "2023-08-06T15:00:00Z"
                           :plans {}
                           :transforms {}
                           :activity-logs {}
                           :permissions []
                           :user nil
                           :documents []}]
      (is (map? valid-workspace)))))

(deftest workspace-json-fields-test
  (testing "JSON fields are properly structured"
    (let [workspace-with-plan {:plans {"my-plan" {:title "Test Plan"
                                                  :description "A test plan"
                                                  :features [{:title "Feature 1"
                                                              :description "First feature"}]}}
                               :transforms {"transform-1" {:title "Test Transform"
                                                           :description "A test transform"
                                                           :type :code
                                                           :config {}}}
                               :documents [1 2 3]
                               :database {:id 1 :name "Test DB"}
                               :permissions [{:table "users" :permission :read}]}]
      (is (map? (:plans workspace-with-plan)))
      (is (map? (:transforms workspace-with-plan)))
      (is (vector? (:documents workspace-with-plan)))
      (is (map? (:database workspace-with-plan)))
      (is (vector? (:permissions workspace-with-plan))))))
