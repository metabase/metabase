(ns ^:mb/driver-tests metabase-enterprise.workspaces.validation-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase-enterprise.workspaces.validation :as ws.validation]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(ws.tu/ws-fixtures!)

;;; ---------------------------------------- Basic API Tests ----------------------------------------

(deftest find-downstream-problems-empty-workspace-test
  (testing "find-downstream-problems returns empty for workspace with no transforms"
    (ws.tu/with-workspaces! [workspace {:name "Empty Workspace"}]
      (is (= [] (ws.validation/find-downstream-problems (:id workspace)))))))

(deftest problems-endpoint-returns-empty-for-new-workspace-test
  (testing "GET /api/ee/workspace/:id/problems returns empty list for workspace with no transforms"
    (ws.tu/with-workspaces! [workspace {:name "Test Workspace"}]
      (let [response (mt/user-http-request :crowberto :get 200
                                           (str "ee/workspace/" (:id workspace) "/problems"))]
        (is (= [] response))))))

(deftest problems-endpoint-requires-superuser-test
  (testing "GET /api/ee/workspace/:id/problems requires superuser"
    (ws.tu/with-workspaces! [workspace {:name "Private Workspace"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403
                                   (str "ee/workspace/" (:id workspace) "/problems")))))))

(deftest problems-endpoint-404-for-nonexistent-workspace-test
  (testing "GET /api/ee/workspace/:id/problems returns 404 for non-existent workspace"
    (is (= "Not found."
           (mt/user-http-request :crowberto :get 404 "ee/workspace/999999/problems")))))

;;; ---------------------------------------- Problem Detection Tests ----------------------------------------

(deftest unused-output-not-yet-created-test
  (testing "detects when a workspace output table hasn't been created yet (no external dependents)"
    (ws.tu/with-workspaces! [workspace {:name "Test Workspace"}]
      (let [ws-id (:id workspace)
            ;; Create a workspace transform
            {ref-id :ref_id} (mt/user-http-request :crowberto :post 200
                                                   (str "ee/workspace/" ws-id "/transform")
                                                   {:name   "Test Transform"
                                                    :source {:type  "query"
                                                             :query {:database (mt/id)
                                                                     :type     :native
                                                                     :native   {:query "SELECT 1 as col"}}}
                                                    :target {:type   "table"
                                                             :schema "public"
                                                             :name   "test_output_table"}})
            ;; The transform hasn't been run, so isolated_table_id is nil
            ;; No external transforms depend on it
            problems (ws.validation/find-downstream-problems ws-id)]
        (is (= 1 (count problems)))
        (is (= :unused-not-run (:type (first problems))))
        (is (= :info (:severity (first problems))))
        (is (false? (:blocks-merge? (first problems))))
        (is (=? {:output    {:schema "public" :table "test_output_table"}
                 :transform {:type :workspace-transform :id ref-id}}
                (:data (first problems))))))))

(deftest dependent-transform-output-not-yet-created-test
  (testing "detects when output table hasn't been created but external transforms depend on it"
    (ws.tu/with-workspaces! [workspace {:name "Test Workspace"}]
      (let [ws-id (:id workspace)]
        ;; First create the global output table that we'll have a dependency on
        (mt/with-temp [:model/Table output-table {:db_id  (mt/id)
                                                  :schema "public"
                                                  :name   "global_output_table"
                                                  :active true}]
          ;; Create an external transform that depends on this table
          ;; Note: The dependency will be created automatically by the Transform model hooks
          (mt/with-temp [:model/Transform external-tx {:name   "External Transform"
                                                       :source {:type  :query
                                                                :query {:database     (mt/id)
                                                                        :type         :query
                                                                        :query        {:source-table (:id output-table)}}}
                                                       :target {:type     "table"
                                                                :database (mt/id)
                                                                :schema   "public"
                                                                :name     "external_output"}}]
            ;; Create a workspace transform that targets the same table
            (let [{ref-id :ref_id} (mt/user-http-request :crowberto :post 200
                                                         (str "ee/workspace/" ws-id "/transform")
                                                         {:name   "Workspace Transform"
                                                          :source {:type  "query"
                                                                   :query {:database (mt/id)
                                                                           :type     :native
                                                                           :native   {:query "SELECT 1 as col"}}}
                                                          :target {:type   "table"
                                                                   :schema "public"
                                                                   :name   "global_output_table"}})]
              ;; Manually update the WorkspaceOutput to point to the global table
              ;; (simulating a checked-out transform scenario)
              (t2/update! :model/WorkspaceOutput
                          {:workspace_id ws-id :ref_id ref-id}
                          {:global_table_id (:id output-table)})

              (let [problems (ws.validation/find-downstream-problems ws-id)]
                (is (= 1 (count problems)))
                (is (= :external-downstream-not-run (:type (first problems))))
                (is (= :warning (:severity (first problems))))
                (is (true? (:blocks-merge? (first problems))))
                (is (=? {:output     {:schema "public" :table "global_output_table"}
                         :transform  {:type :workspace-transform :id ref-id}
                         :dependents [{:type :global-transform
                                       :id   (:id external-tx)
                                       :name "External Transform"}]}
                        (:data (first problems))))))))))))

(deftest no-problems-when-output-exists-and-no-field-changes-test
  (testing "no problems when isolated table exists and has all required fields"
    (ws.tu/with-workspaces! [workspace {:name "Test Workspace"}]
      (let [ws-id (:id workspace)]
        ;; Create both global and isolated tables with matching fields
        (mt/with-temp [:model/Table global-table {:db_id  (mt/id)
                                                  :schema "public"
                                                  :name   "output_table"
                                                  :active true}
                       :model/Field _ {:table_id      (:id global-table)
                                       :name          "col1"
                                       :database_type "TEXT"
                                       :base_type     :type/Text
                                       :active        true}
                       :model/Table isolated-table {:db_id  (mt/id)
                                                    :schema "mb__isolation_test"
                                                    :name   "public__output_table"
                                                    :active true}
                       :model/Field _ {:table_id      (:id isolated-table)
                                       :name          "col1"
                                       :database_type "TEXT"
                                       :base_type     :type/Text
                                       :active        true}]
          ;; External transform that uses col1 via MBQL source-table
          (mt/with-temp [:model/Transform _external-tx {:name   "External Transform"
                                                        :source {:type  :query
                                                                 :query {:database     (mt/id)
                                                                         :type         :query
                                                                         :query        {:source-table (:id global-table)}}}
                                                        :target {:type     "table"
                                                                 :database (mt/id)
                                                                 :schema   "public"
                                                                 :name     "external_output"}}]
            ;; Create workspace transform and output
            (let [{ref-id :ref_id} (mt/user-http-request :crowberto :post 200
                                                         (str "ee/workspace/" ws-id "/transform")
                                                         {:name   "Workspace Transform"
                                                          :source {:type  "query"
                                                                   :query {:database (mt/id)
                                                                           :type     :native
                                                                           :native   {:query "SELECT 'test' as col1"}}}
                                                          :target {:type   "table"
                                                                   :schema "public"
                                                                   :name   "output_table"}})]
              ;; Update WorkspaceOutput to have both global and isolated table IDs
              (t2/update! :model/WorkspaceOutput
                          {:workspace_id ws-id :ref_id ref-id}
                          {:global_table_id   (:id global-table)
                           :isolated_table_id (:id isolated-table)})

              ;; Should have no problems since isolated table has all required fields
              (let [problems (ws.validation/find-downstream-problems ws-id)]
                (is (empty? problems))))))))))
