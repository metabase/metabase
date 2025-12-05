(ns metabase-enterprise.workspaces.driver.bigquery-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.driver.bigquery :as bigquery]
   [metabase-enterprise.workspaces.driver.common :as driver.common]))

(deftest workspace-service-account-email-test
  (testing "Generates correct service account email format"
    (is (= "mb-workspace-123@my-project.iam.gserviceaccount.com"
           (#'bigquery/workspace-service-account-email "my-project" {:id 123})))))

(deftest isolation-namespace-name-test
  (testing "Uses common namespace naming"
    (let [workspace {:id "550e8400-e29b-41d4-a716-446655440000"}]
      ;; Result format: mb__isolation_{instance_slug}_{workspace_id}
      (is (string? (driver.common/isolation-namespace-name workspace)))
      (is (re-matches #"mb__isolation_\w+_\w+" (driver.common/isolation-namespace-name workspace))))))

(deftest isolated-table-name-test
  (testing "Generates correct isolated table name"
    (is (= "source_schema__source_table"
           (driver.common/isolated-table-name {:schema "source_schema" :name "source_table"})))))

;; Integration tests require a live BigQuery connection and are in drivers_test.clj
