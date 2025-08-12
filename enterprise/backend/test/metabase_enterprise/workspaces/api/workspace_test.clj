(ns metabase-enterprise.workspaces.api.workspace-test
  "Tests for workspace API endpoints"
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
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
      (is (nil? (mc/explain ::m.workspace/workspace valid-workspace))))))

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

(defn- create-test-collection
  "Create a test collection for workspace tests."
  []
  (mt/user-http-request :crowberto :post 200 "collection/"
                        {:name "Test Workspace Collection"
                         :slug "test_workspace_collection"}))

(deftest api-create-workspace-validation-test
  (testing "POST /api/ee/workspace/ - validation tests"
    (mt/with-model-cleanup [:model/Workspace]
      (let [collection (create-test-collection)]

        (testing "should require name"
          (mt/user-http-request :crowberto :post 400 "ee/workspace/"
                                {:description "Missing name"
                                 :collection_id (:id collection)}))

        (testing "should require collection_id"
          (mt/user-http-request :crowberto :post 400 "ee/workspace/"
                                {:name "Missing collection"
                                 :description "Test"}))

        (testing "should reject blank name"
          (mt/user-http-request :crowberto :post 400 "ee/workspace/"
                                {:name ""
                                 :collection_id (:id collection)
                                 :description "Blank name"}))))))

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

(deftest api-update-workspace-test
  (testing "PUT /api/ee/workspace/:workspace-id - update workspace"
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Workspace {workspace-id :id} (test-workspace-data {:collection_id col-id})]
      (testing "should update workspace successfully"
        (let [updated-data {:name "Updated Workspace"
                            :description "Updated description"}
              result (mt/user-http-request :crowberto :put 200
                                           (format "ee/workspace/%s" workspace-id)
                                           updated-data)]
          (is (partial= updated-data result))
          (is (= workspace-id (:id result)))

          ;; Verify in database
          (let [db-workspace (t2/select-one :model/Workspace :id workspace-id)]
            (is (partial= updated-data db-workspace)))))

      (testing "should return 404 for non-existent workspace"
        (mt/user-http-request :crowberto :put 404 "ee/workspace/99999"
                              {:name "Non-existent"})))))

(deftest api-delete-workspace-test
  (testing "DELETE /api/ee/workspace/:workspace-id - delete workspace"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Workspace {workspace-id :id} (test-workspace-data {:collection_id col-id})]
        (testing "should delete workspace successfully"
          (mt/user-http-request :crowberto :delete 204
                                (format "ee/workspace/%s" workspace-id))

          ;; Verify workspace is deleted
          (is (nil? (t2/select-one :model/Workspace :id workspace-id))))

        (testing "should return 404 for non-existent workspace"
          (mt/user-http-request :crowberto :delete 404 "ee/workspace/99999"))))))

;;; Workspace Plans API Tests

(deftest api-add-plan-to-workspace-test
  (testing "POST /api/ee/workspace/:workspace-id/plan - add new plan to workspace"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Workspace {workspace-id :id} (test-workspace-data {:collection_id col-id})]
        (testing "should add plan successfully"
          (let [plan-data {:title "Test Plan"
                           :description "Test plan description"
                           :content {:steps ["Step 1" "Step 2" "Step 3"]
                                     :timeline "Q1 2025"}}
                result (mt/user-http-request :crowberto :post 200
                                             (format "ee/workspace/%s/plan" workspace-id)
                                             plan-data)]
            (is (= workspace-id (:id result)))
            (is (= 1 (count (:plans result))))
            (let [added-plan (first (:plans result))]
              (is (partial= plan-data added-plan))
              (is (contains? added-plan :created_at)))))

        (testing "should add multiple plans"
          (let [second-plan {:title "Second Plan"
                             :description "Second plan description"
                             :content {:steps ["Another step"]}}]
            (mt/user-http-request :crowberto :post 200
                                  (format "ee/workspace/%s/plan" workspace-id)
                                  second-plan)
            (let [updated-workspace (t2/select-one :model/Workspace :id workspace-id)]
              (is (= 2 (count (:plans updated-workspace)))))))

        (testing "should validate required fields"
          (mt/user-http-request :crowberto :post 400
                                (format "ee/workspace/%s/plan" workspace-id)
                                {:description "Missing title"
                                 :content {}}))

        (testing "should return 404 for non-existent workspace"
          (mt/user-http-request :crowberto :post 404 "ee/workspace/99999/plan"
                                {:title "Plan" :description "Desc" :content {}}))))))

;;; Workspace Transforms API Tests

(deftest api-add-transform-to-workspace-test
  (testing "POST /api/ee/workspace/:workspace-id/transform - add transform to workspace"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Workspace {workspace-id :id} (test-workspace-data {:collection_id col-id})]
        (testing "should add transform successfully"
          (let [transform-data {:name "ETL Transform"
                                :description "Transform raw data"
                                :source {:type "database" :connection "source-db"}
                                :target {:type "warehouse" :connection "target-db"}
                                :config {:schedule "daily"}}
                result (mt/user-http-request :crowberto :post 200
                                             (format "ee/workspace/%s/transform" workspace-id)
                                             transform-data)]
            (is (= workspace-id (:id result)))
            (is (= 1 (count (:transforms result))))
            (let [added-transform (first (:transforms result))]
              (is (partial= transform-data added-transform))
              (is (contains? added-transform :created_at)))))

        (testing "should validate required fields"
          (mt/user-http-request :crowberto :post 400
                                (format "ee/workspace/%s/transform" workspace-id)
                                {:description "Missing name and source/target"})

          (mt/user-http-request :crowberto :post 400
                                (format "ee/workspace/%s/transform" workspace-id)
                                {:name "Transform"
                                 :description "Missing source"
                                 :target {}}))))))

(deftest api-add-user-to-workspace-test
  (testing "POST /api/ee/workspace/:workspace-id/user - add user to workspace"
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Workspace {workspace-id :id} (test-workspace-data {:collection_id col-id})]
      (testing "should add user successfully"
        (let [user-data {:id 123
                         :name "John Doe"
                         :email "john@example.com"
                         :type "workspace-user"}
              result (mt/user-http-request :crowberto :post 200
                                           (format "ee/workspace/%s/user" workspace-id)
                                           user-data)]
          (is (= workspace-id (:id result)))
          (is (= 1 (count (:users result))))
          (let [added-user (first (:users result))]
            (is (partial= user-data added-user))
            (is (contains? added-user :created_at)))))

      (testing "should validate required fields"
        (mt/user-http-request :crowberto :post 400
                              (format "ee/workspace/%s/user" workspace-id)
                              {:name "Missing user_id and email"
                               :type "user"})))))

(deftest api-add-document-to-workspace-test
  (testing "PUT /api/ee/workspace/:workspace-id/document - add document to workspace"
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Workspace {workspace-id :id} (test-workspace-data {:collection_id col-id})]
      (testing "should add document successfully"
        (let [document-data {:document_id 456}
              result (mt/user-http-request :crowberto :put 200
                                           (format "ee/workspace/%s/document" workspace-id)
                                           document-data)]
          (is (= workspace-id (:id result)))
          (is (= [456] (:documents result)))))

      (testing "should add multiple documents"
        (let [second-document {:document_id 789}]
          (mt/user-http-request :crowberto :put 200
                                (format "ee/workspace/%s/document" workspace-id)
                                second-document)
          (let [updated-workspace (t2/select-one :model/Workspace :id workspace-id)]
            (is (= #{456 789} (set (:documents updated-workspace)))))))

      (testing "should not duplicate document IDs"
        (let [duplicate-document {:document_id 456}]
          (mt/user-http-request :crowberto :put 200
                                (format "ee/workspace/%s/document" workspace-id)
                                duplicate-document)
          (let [updated-workspace (t2/select-one :model/Workspace :id workspace-id)]
            (is (= [456 789] (:documents updated-workspace))))))

      (testing "should validate required fields"
        (is (= {:specific-errors {:document_id ["missing required key, received: nil"]},
                :errors {:document_id "value must be an integer greater than zero."}}
               (mt/user-http-request :crowberto :put 400
                                     (format "ee/workspace/%s/document" workspace-id)
                                     {:missing "document_id"})))))))

;;; Workspace Data Warehouses API Tests

(deftest api-add-data-warehouse-to-workspace-test
  (testing "PUT /api/ee/workspace/:workspace-id/data_warehouse - add data warehouse to workspace"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Workspace {workspace-id :id} (test-workspace-data {:collection_id col-id})]
        (testing "should add data warehouse successfully"
          (let [dwh-data {:data_warehouses_id 101
                          :name "Production DWH"
                          :type "read-only"
                          :credentials {:host "dwh.company.com"
                                        :port 5432
                                        :username "analyst"}}
                result (mt/user-http-request :crowberto :put 200
                                             (format "ee/workspace/%s/data_warehouse" workspace-id)
                                             dwh-data)]
            (is (= workspace-id (:id result)))
            (is (= 1 (count (:data_warehouses result))))
            (let [added-dwh (first (:data_warehouses result))]
              (is (= 101 (:id added-dwh)))
              (is (= "Production DWH" (:name added-dwh)))
              (is (= "read-only" (:type added-dwh)))
              (is (= (:credentials dwh-data) (:credentials added-dwh)))
              (is (contains? added-dwh :created_at)))))

        (testing "should add multiple data warehouses"
          (let [second-dwh {:data_warehouses_id 102
                            :name "Analytics DWH"
                            :type "read-write"
                            :credentials {:host "analytics.company.com"}}]
            (mt/user-http-request :crowberto :put 200
                                  (format "ee/workspace/%s/data_warehouse" workspace-id)
                                  second-dwh)
            (let [updated-workspace (t2/select-one :model/Workspace :id workspace-id)]
              (is (= 2 (count (:data_warehouses updated-workspace)))))))

        (testing "should validate required fields"
          (mt/user-http-request :crowberto :put 400
                                (format "ee/workspace/%s/data_warehouse" workspace-id)
                                {:name "Missing required fields"})

          (mt/user-http-request :crowberto :put 400
                                (format "ee/workspace/%s/data_warehouse" workspace-id)
                                {:data_warehouses_id 103
                                 :name "Invalid type"
                                 :type "invalid-type"
                                 :credentials {}}))

        (testing "should validate type enum"
          (mt/user-http-request :crowberto :put 400
                                (format "ee/workspace/%s/data_warehouse" workspace-id)
                                {:data_warehouses_id 104
                                 :name "Bad Type"
                                 :type "write-only"
                                 :credentials {}}))))))

;;; Workspace Permissions API Tests

(deftest api-add-permission-to-workspace-test
  (testing "PUT /api/ee/workspace/:workspace-id/permission - add permission to workspace"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Workspace {workspace-id :id} (test-workspace-data {:collection_id col-id})]
        (testing "should add permission successfully"
          (let [permission-data {:table "customers"
                                 :permission "read"}
                result (mt/user-http-request :crowberto :put 200
                                             (format "ee/workspace/%s/permission" workspace-id)
                                             permission-data)]
            (is (= workspace-id (:id result)))
            (is (= 1 (count (:permissions result))))
            (let [added-permission (first (:permissions result))]
              (is (= "customers" (:table added-permission)))
              (is (= "read" (:permission added-permission)))
              (is (contains? added-permission :created_at)))))

        (testing "should add multiple permissions"
          (let [write-permission {:table "orders" :permission "write"}]
            (mt/user-http-request :crowberto :put 200
                                  (format "ee/workspace/%s/permission" workspace-id)
                                  write-permission)
            (let [updated-workspace (t2/select-one :model/Workspace :id workspace-id)
                  perm-set (set (mapv #(dissoc % :created_at) (:permissions updated-workspace)))]
              (is (= 2 (count perm-set)))
              (is (contains? perm-set
                             {:table "orders" :permission "write"})))))

        (testing "should validate required fields"
          (mt/user-http-request :crowberto :put 400
                                (format "ee/workspace/%s/permission" workspace-id)
                                {:table "products"}))

        (testing "should validate permission enum"
          (mt/user-http-request :crowberto :put 400
                                (format "ee/workspace/%s/permission" workspace-id)
                                {:table "products"
                                 :permission "execute"}))))))

;;; Authentication Tests

(deftest api-workspace-authentication-test
  (testing "Workspace API endpoints require authentication"
    (let [endpoints [["GET" "ee/workspace/"]
                     ["GET" "ee/workspace/1"]
                     ["POST" "ee/workspace/"]
                     ["PUT" "ee/workspace/1"]
                     ["DELETE" "ee/workspace/1"]

                     ["POST" "ee/workspace/1/plan"]
                     ["POST" "ee/workspace/1/transform"]
                     ["POST" "ee/workspace/1/user"]
                     ["POST" "ee/workspace/1/document"]
                     ["POST" "ee/workspace/1/data_warehouse"]
                     ["POST" "ee/workspace/1/permission"]]]
      (doseq [[method endpoint] endpoints]
        (testing (format "%s /api/%s should require authentication" method endpoint)
          (case method
            "GET" (mt/client :get 401 endpoint)
            "POST" (mt/client :post 401 endpoint {})
            "PUT" (mt/client :put 401 endpoint {})
            "DELETE" (mt/client :delete 401 endpoint)))))))

;;; Integration Tests

(deftest api-workspace-full-lifecycle-test
  (testing "Complete workspace lifecycle integration test via API"
    (mt/with-temp [:model/Collection {col-id :id} {}

                   :model/Workspace
                   {workspace-id :id :as workspace}
                   {:collection_id col-id :name "Test Workspace"}]
      (testing "Workspace creation"
        (is (pos? workspace-id))
        (is (= "Test Workspace" (:name workspace))))

      (testing "Add plan to workspace"
        (let [plan-result (mt/user-http-request :crowberto :put 200
                                                (format "ee/workspace/%s/plan" workspace-id)
                                                {:title "Strategic Plan"
                                                 :description "2025 strategic initiatives"
                                                 :content {:goals ["Increase efficiency" "Reduce costs"]}})]
          (is (= 1 (count (:plans plan-result))))))

      (testing "Add transform to workspace"
        (let [transform-result (mt/user-http-request :crowberto :put 200
                                                     (format "ee/workspace/%s/transform" workspace-id)
                                                     {:name "Daily ETL"
                                                      :description "Daily data processing"
                                                      :source {:type "oltp"}
                                                      :target {:type "olap"}})]
          (is (= 1 (count (:transforms transform-result))))))

      (testing "Add user to workspace"
        (let [user-result (mt/user-http-request :crowberto :put 200
                                                (format "ee/workspace/%s/user" workspace-id)
                                                {:id 100
                                                 :name "Alice Smith"
                                                 :email "alice@company.com"
                                                 :type "analyst"})]
          (is (= 1 (count (:users user-result))))))

      (testing "Add document to workspace"
        (let [document-result (mt/user-http-request :crowberto :put 200
                                                    (format "ee/workspace/%s/document" workspace-id)
                                                    {:document_id 999})]
          (is (= [999] (:documents document-result)))))

      (testing "Add data warehouse to workspace"
        (let [dwh-result (mt/user-http-request :crowberto :put 200
                                               (format "ee/workspace/%s/data_warehouse" workspace-id)
                                               {:data_warehouses_id 200
                                                :name "Test DWH"
                                                :type "read-only"
                                                :credentials {:host "test.db"}})]
          (is (= 1 (count (:data_warehouses dwh-result))))))

      (testing "Add permission to workspace"
        (let [permission-result (mt/user-http-request :crowberto :put 200
                                                      (format "ee/workspace/%s/permission" workspace-id)
                                                      {:table "test_table"
                                                       :permission "read"})]
          (is (= 1 (count (:permissions permission-result))))))

      (testing "Update workspace"
        (let [update-result (mt/user-http-request :crowberto :put 200
                                                  (format "ee/workspace/%s" workspace-id)
                                                  {:name "Updated Strategic Workspace"
                                                   :description "Updated workspace description"})]
          (is (= "Updated Strategic Workspace" (:name update-result)))))

      (testing "Get workspace with all components"
        (let [final-workspace (mt/user-http-request :crowberto :get 200
                                                    (format "ee/workspace/%s" workspace-id))]
          (is (= "Updated Strategic Workspace" (:name final-workspace)))
          (is (= 1 (count (:plans final-workspace))))
          (is (= 1 (count (:transforms final-workspace))))
          ;;(is (= 1 (count (:users final-workspace))))
          (is (= [999] (:documents final-workspace)))
          (is (= 1 (count (:data_warehouses final-workspace))))
          (is (= 1 (count (:permissions final-workspace))))))

      (testing "Delete workspace"
        (mt/user-http-request :crowberto :delete 204
                              (format "ee/workspace/%s" workspace-id))
        (is (nil? (t2/select-one :model/Workspace :id workspace-id)))))))

(comment

  ;; repl stuff
  (do
    (let [id (atom 1000)]
      (defn next-id [] (swap! id inc)))
    (def c (t2/insert-returning-instance! :model/Collection {:name "Test Workspace Collection"}))

    (try (def w (t2/insert-returning-instance! :model/Workspace {:name "test workspace"
                                                                 :collection_id (:id c)
                                                                 :data_warehouses []
                                                                 :users []
                                                                 :plans []
                                                                 :activity_logs []
                                                                 :transforms []
                                                                 :documents []}))
         (catch Exception e (ex-data e))))

  [w c]

  (mt/user-http-request :crowberto :get 200
                        (format "ee/workspace/%s" (:id w)))

  (mt/user-http-request :crowberto :put 200
                        (format "ee/workspace/%s" (:id w))
                        {:name "boop"})

  (mt/user-http-request :crowberto :put 200
                        (format "ee/workspace/%s" (:id w))
                        {:name "XXX"})

  (mt/user-http-request :crowberto :put 200
                        (format "ee/workspace/%s/user" (:id w))
                        {:id 100 :name "Alice Smith" :email "alice@company.com" :type "analyst"})

  (mt/user-http-request :crowberto :put 200
                        (format "ee/workspace/%s/user" (:id w))
                        {:id 100 :name "Alice Smith" :email "alice@company.com" :type "analyst"})

  ;; could that somehow get back:
  [{:operation :select :table "workspace" :query [:= :id (:id w)]}
   {:operation :insert
    :table "workspace"
    :row {:id 100
          :name "Alice Smith"
          :email "alice@company.com"
          :type "analyst"}}]

  (mt/user-http-request :crowberto :put 200
                        (format "ee/workspace/%s/plan" (:id w))
                        {:title "x" :description "?" :content {}})

  (mt/user-http-request :crowberto :put 200
                        (format "ee/workspace/%s/plan/0" (:id w))
                        {:title (str "xx" (rand)) :content {}})

  (mt/user-http-request :crowberto :delete 200
                        (format "ee/workspace/%s/plan/0" (:id w))
                        {:title "X" :content {}})

  [(mt/user-http-request :crowberto :put 200 (format "ee/workspace/%s/document" (:id w))
                         {:document_id (next-id)})
   (t2/select-one :model/Workspace :id (:id w))]
  (t2/select-one :model/Workspace :id (:id w)))
