(ns metabase-enterprise.workspaces.api.workspace-test
  "Tests for workspace API endpoints"
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase-enterprise.workspaces.models.workspace :as m.workspace]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest workspace-with-plan-and-transform-test
  (testing "Create workspace with plan and transform matching expected structure"
    (let [;; Create a workspace with realistic plan and transform data
          workspace-data {:name "Customer Analysis Workspace"
                          :description "Workspace for customer churn analysis"
                          :created_at "2024-01-15T10:30:00Z"
                          :updated_at "2024-01-15T10:30:00Z"
                          :plans [{:title "Customer Churn Analysis"
                                   :description "Comprehensive customer churn analysis plan"
                                   :content {:analysis_plan
                                             {:metadata
                                              {:plan_id "customer_churn_analysis_001"
                                               :created_at "2024-01-15T10:30:00Z"
                                               :objective "Identify key factors driving customer churn and segment high-risk customers"
                                               :estimated_duration "45 minutes"}
                                              :data_sources
                                              [{:name "customer_db"
                                                :type "postgresql"
                                                :connection "prod_customer_db"
                                                :tables ["customers" "subscriptions" "usage_logs"]}
                                               {:name "support_tickets"
                                                :type "document"
                                                :path "/data/support_tickets.csv"}]
                                              :stages
                                              [{:stage_id "data_ingestion"
                                                :name "Load and validate source data"
                                                :tasks
                                                [{:task_id "load_customers"
                                                  :type "sql_query"
                                                  :source "customer_db"
                                                  :output_table "raw_customers"
                                                  :query "SELECT * FROM customers WHERE created_at >= '2023-01-01'"}]}]}}
                                   :created-at "2024-01-15T10:30:00Z"}]
                          :transforms [{:name "Customer Data Cleanup"
                                        :description "Clean and standardize customer data"
                                        :source {:type "query"
                                                 :query {:database 1
                                                         :type "native"
                                                         :native {:query "SELECT customer_id, email, signup_date, last_login FROM customers WHERE email IS NOT NULL"
                                                                  :template-tags {}}}}
                                        :target {:name "clean_customers"
                                                 :type "table"}
                                        :config {:dialect "postgresql"
                                                 :schema "analytics"}
                                        :created-at "2024-01-15T10:30:00Z"}]
                          :users []
                          :dwh []
                          :documents []
                          :permissions []
                          :activity_log []
                          :archived false}]

      ;; Test workspace basic fields
      (is (= "Customer Analysis Workspace" (:name workspace-data)))
      (is (= "Workspace for customer churn analysis" (:description workspace-data)))
      (is (false? (:archived workspace-data)))

      ;; Test plans structure
      (is (= 1 (count (:plans workspace-data))))
      (let [plan (first (:plans workspace-data))]
        (is (= "Customer Churn Analysis" (:title plan)))
        (is (= "Comprehensive customer churn analysis plan" (:description plan)))
        (is (contains? plan :content))
        (is (contains? plan :created-at))

        ;; Test plan content structure matches the YAML example
        (let [analysis-plan (get-in plan [:content :analysis_plan])]
          (is (contains? analysis-plan :metadata))
          (is (contains? analysis-plan :data_sources))
          (is (contains? analysis-plan :stages))

          ;; Test metadata matches expected structure
          (let [metadata (:metadata analysis-plan)]
            (is (= "customer_churn_analysis_001" (:plan_id metadata)))
            (is (= "2024-01-15T10:30:00Z" (:created_at metadata)))
            (is (= "Identify key factors driving customer churn and segment high-risk customers" (:objective metadata)))
            (is (= "45 minutes" (:estimated_duration metadata))))

          ;; Test data sources structure
          (let [data-sources (:data_sources analysis-plan)]
            (is (= 2 (count data-sources)))
            ;; First data source - PostgreSQL database
            (let [customer-db (first data-sources)]
              (is (= "customer_db" (:name customer-db)))
              (is (= "postgresql" (:type customer-db)))
              (is (= "prod_customer_db" (:connection customer-db)))
              (is (= ["customers" "subscriptions" "usage_logs"] (:tables customer-db))))
            ;; Second data source - document/CSV
            (let [support-tickets (second data-sources)]
              (is (= "support_tickets" (:name support-tickets)))
              (is (= "document" (:type support-tickets)))
              (is (= "/data/support_tickets.csv" (:path support-tickets)))))

          ;; Test stages and tasks structure
          (let [stages (:stages analysis-plan)]
            (is (= 1 (count stages)))
            (let [stage (first stages)]
              (is (= "data_ingestion" (:stage_id stage)))
              (is (= "Load and validate source data" (:name stage)))
              (is (contains? stage :tasks))
              (let [tasks (:tasks stage)]
                (is (= 1 (count tasks)))
                (let [task (first tasks)]
                  (is (= "load_customers" (:task_id task)))
                  (is (= "sql_query" (:type task)))
                  (is (= "customer_db" (:source task)))
                  (is (= "raw_customers" (:output_table task)))
                  (is (string? (:query task)))
                  (is (.contains (:query task) "customers"))))))))

      ;; Test transforms structure matches new schema
      (is (= 1 (count (:transforms workspace-data))))
      (let [transform (first (:transforms workspace-data))]
        (is (= "Customer Data Cleanup" (:name transform)))
        (is (= "Clean and standardize customer data" (:description transform)))
        (is (contains? transform :source))
        (is (contains? transform :target))
        (is (contains? transform :config))

        ;; Test transform source
        (let [source (:source transform)]
          (is (= "query" (:type source)))
          (is (contains? source :query))
          (let [query (:query source)]
            (is (= 1 (:database query)))
            (is (= "native" (:type query)))
            (is (string? (get-in query [:native :query])))))

        ;; Test transform target
        (let [target (:target transform)]
          (is (= "clean_customers" (:name target)))
          (is (= "table" (:type target))))

        ;; Test transform config
        (let [config (:config transform)]
          (is (= "postgresql" (:dialect config)))
          (is (= "analytics" (:schema config)))))

      (is (mc/validate ::m.workspace/workspace workspace-data)))))

(deftest workspace-validation-test
  (testing "Workspace validation with updated Malli schema structure"
    (let [valid-workspace {:name "Test"
                           :description "Test workspace"
                           :created-at "2023-08-06T15:00:00Z"
                           :updated-at "2023-08-06T15:00:00Z"
                           :plans []
                           :transforms []
                           :activity_log []
                           :permissions []
                           :users []
                           :dwh []
                           :documents []}]
      (is (map? valid-workspace))
      (is (vector? (:plans valid-workspace)))
      (is (vector? (:transforms valid-workspace)))
      (is (vector? (:users valid-workspace))))))

(deftest workspace-fields-are-arrays-test
  (testing "All workspace JSON fields should be arrays in new schema"
    (let [workspace-with-data {:plans [{:title "Test Plan"
                                        :description "A test plan"
                                        :content {:simple_content true}
                                        :created-at "2023-08-06T15:00:00Z"}]
                               :transforms [{:name "Test Transform"
                                             :description "A test transform"
                                             :source {:type "query"
                                                      :query {:database 1
                                                              :type "native"
                                                              :native {:query "SELECT * FROM table"}}}
                                             :target {:name "output_table"
                                                      :type "table"}
                                             :config {:dialect "postgresql"}
                                             :created-at "2023-08-06T15:00:00Z"}]
                               :users [{:id 1
                                        :name "Test User"
                                        :email "test@example.com"
                                        :type "workspace-user"
                                        :created-at "2023-08-06T15:00:00Z"}]
                               :dwh [{:id 1
                                      :name "Test DWH"
                                      :type :read-only
                                      :credentials {:username "user" :password "pass"}
                                      :created-at "2023-08-06T15:00:00Z"}]
                               :documents [1 2 3]
                               :permissions [{:table "users" :permission :read :created-at "2023-08-06T15:00:00Z"}]}]

      ;; Verify all fields are vectors (arrays)
      (is (vector? (:plans workspace-with-data)))
      (is (vector? (:transforms workspace-with-data)))
      (is (vector? (:users workspace-with-data)))
      (is (vector? (:dwh workspace-with-data)))
      (is (vector? (:documents workspace-with-data)))
      (is (vector? (:permissions workspace-with-data)))

      ;; Verify structure of each type
      (is (every? #(and (contains? % :title)
                        (contains? % :content)
                        (contains? % :created-at))
                  (:plans workspace-with-data)))
      (is (every? #(and (contains? % :name)
                        (contains? % :source)
                        (contains? % :target)
                        (contains? % :created-at))
                  (:transforms workspace-with-data)))
      (is (every? #(and (contains? % :type)
                        (contains? % :created-at))
                  (:users workspace-with-data)))
      (is (every? #(and (contains? % :credentials)
                        (contains? % :created-at))
                  (:dwh workspace-with-data)))
      (is (every? #(and (contains? % :table)
                        (contains? % :permission)
                        (contains? % :created-at))
                  (:permissions workspace-with-data))))))

(deftest create-workspace-test
  (testing "Creating a workspace with valid data using mt/with-temp"
    (mt/with-temp [:model/Workspace {workspace-id :id :as wksp} {:name        "Test Workspace"
                                                                 :description "A test workspace"}]
      (is (pos? workspace-id))
      (is (= "Test Workspace"
             (:name (t2/select-one :model/Workspace :id workspace-id))))
      (is (= [:name :description :created_at :updated_at :plans :transforms :documents :permissions :id]
             (keys (m.workspace/sort-workspace wksp)))))))

(comment)
