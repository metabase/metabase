(ns metabase-enterprise.workspaces.demo.api-usage-demo
  "Demo script showing how to use the workspace API endpoints"
  (:require
   [clj-yaml.core :as yaml]
   [clojure.data.json :as json]
   [metabase-enterprise.workspaces.demo.create-realistic-workspace :as demo]))

(defn api-call-examples
  "Examples of API calls you would make to create and manage workspaces"
  []
  (println "\n=== WORKSPACE API USAGE EXAMPLES ===\n")

  ;; Get the demo workspace data
  (let [churn-workspace (demo/create-customer-churn-workspace)
        plan (first (:plans churn-workspace))
        transform (first (:transforms churn-workspace))
        user (first (:users churn-workspace))
        dwh (first (:dwh churn-workspace))]

    (println "🌟 Here are the API calls you would make to create this workspace:\n")

    ;; 1. Create workspace
    (println "1️⃣ CREATE WORKSPACE")
    (println "POST /api/ee/workspace")
    (println "Content-Type: application/json")
    (println (json/write-str
              {:name (:name churn-workspace)
               :description (:description churn-workspace)} :indent true))
    (println)

    ;; 2. Add plan  
    (println "2️⃣ ADD PLAN")
    (println "PUT /api/ee/workspace/1/plan")
    (println "Content-Type: application/json")
    (println (json/write-str {:title (:title plan)
                              :description (:description plan)
                              :content (:content plan)} :indent true))
    (println)

    ;; 3. Add transforms
    (println "3️⃣ ADD TRANSFORM")
    (println "PUT /api/ee/workspace/1/transform")
    (println "Content-Type: application/json")
    (println (json/write-str {:name (:name transform)
                              :description (:description transform)
                              :source (:source transform)
                              :target (:target transform)
                              :config (:config transform)} :indent true))
    (println)

    ;; 4. Add user
    (println "4️⃣ ADD USER")
    (println "PUT /api/ee/workspace/1/user")
    (println "Content-Type: application/json")
    (println (json/write-str {:user_id (:id user)
                              :name (:name user)
                              :email (:email user)
                              :type (:type user)} :indent true))
    (println)

    ;; 5. Add data warehouse
    (println "5️⃣ ADD DATA WAREHOUSE")
    (println "PUT /api/ee/workspace/1/dwh")
    (println "Content-Type: application/json")
    (println (json/write-str {:dwh_id (:id dwh)
                              :name (:name dwh)
                              :type (name (:type dwh))
                              :credentials (:credentials dwh)} :indent true))
    (println)

    ;; 6. Query workspace
    (println "6️⃣ GET WORKSPACE")
    (println "GET /api/ee/workspace/1")
    (println)

    ;; 7. List all workspaces
    (println "7️⃣ LIST ALL WORKSPACES")
    (println "GET /api/ee/workspace")
    (println)))

(defn curl-examples
  "Generate actual curl commands for testing the API"
  []
  (println "\n=== CURL COMMANDS FOR TESTING ===\n")

  (let [base-url "http://localhost:3000" ; Default Metabase dev server
        token "YOUR_API_TOKEN_HERE"] ; User would need to replace this

    (println "📝 Replace YOUR_API_TOKEN_HERE with your actual API token\n")

    (println "1️⃣ Create workspace:")
    (println (str "curl -X POST " base-url "/api/ee/workspace \\"))
    (println "  -H \"Content-Type: application/json\" \\")
    (println (str "  -H \"Authorization: Bearer " token "\" \\"))
    (println "  -d '{")
    (println "    \"name\": \"Customer Churn Analysis Workspace\",")
    (println "    \"description\": \"Comprehensive workspace for analyzing customer churn patterns\"")
    (println "  }'")
    (println)

    (println "2️⃣ Add a simple plan:")
    (println (str "curl -X PUT " base-url "/api/ee/workspace/1/plan \\"))
    (println "  -H \"Content-Type: application/json\" \\")
    (println (str "  -H \"Authorization: Bearer " token "\" \\"))
    (println "  -d '{")
    (println "    \"title\": \"Customer Churn Analysis\",")
    (println "    \"description\": \"Analyze customer churn patterns\",")
    (println "    \"content\": {")
    (println "      \"objective\": \"Identify at-risk customers\",")
    (println "      \"duration\": \"2 hours\"")
    (println "    }")
    (println "  }'")
    (println)

    (println "3️⃣ Add a transform:")
    (println (str "curl -X PUT " base-url "/api/ee/workspace/1/transform \\"))
    (println "  -H \"Content-Type: application/json\" \\")
    (println (str "  -H \"Authorization: Bearer " token "\" \\"))
    (println "  -d '{")
    (println "    \"name\": \"Customer Data Cleanup\",")
    (println "    \"description\": \"Clean customer data\",")
    (println "    \"source\": {")
    (println "      \"type\": \"query\",")
    (println "      \"query\": {")
    (println "        \"database\": 1,")
    (println "        \"type\": \"native\",")
    (println "        \"native\": {")
    (println "          \"query\": \"SELECT * FROM customers WHERE email IS NOT NULL\",")
    (println "          \"template-tags\": {}")
    (println "        }")
    (println "      }")
    (println "    },")
    (println "    \"target\": {")
    (println "      \"name\": \"clean_customers\",")
    (println "      \"type\": \"table\"")
    (println "    },")
    (println "    \"config\": {")
    (println "      \"dialect\": \"postgresql\"")
    (println "    }")
    (println "  }'")
    (println)

    (println "4️⃣ Get the workspace:")
    (println (str "curl -X GET " base-url "/api/ee/workspace/1 \\"))
    (println (str "  -H \"Authorization: Bearer " token "\""))
    (println)

    (println "5️⃣ List all workspaces:")
    (println (str "curl -X GET " base-url "/api/ee/workspace \\"))
    (println (str "  -H \"Authorization: Bearer " token "\""))
    (println)))

(defn validate-workspace-structure
  "Validates that the workspace structure matches our schema"
  []
  (println "\n=== WORKSPACE STRUCTURE VALIDATION ===\n")

  (let [workspace (demo/create-customer-churn-workspace)]
    (println "✅ Validating workspace structure against schema...")

    ;; Required fields
    (assert (:name workspace) "Missing name field")
    (assert (:created_at workspace) "Missing created_at field")
    (assert (:updated_at workspace) "Missing updated_at field")

    ;; Array fields
    (assert (vector? (:plans workspace)) "Plans should be an array")
    (assert (vector? (:transforms workspace)) "Transforms should be an array")
    (assert (vector? (:users workspace)) "Users should be an array")
    (assert (vector? (:dwh workspace)) "DWH should be an array")
    (assert (vector? (:documents workspace)) "Documents should be an array")
    (assert (vector? (:permissions workspace)) "Permissions should be an array")
    (assert (vector? (:activity_log workspace)) "Activity log should be an array")

    ;; Plan structure
    (let [plan (first (:plans workspace))]
      (assert (:title plan) "Plan missing title")
      (assert (:description plan) "Plan missing description")
      (assert (:content plan) "Plan missing content")
      (assert (:created-at plan) "Plan missing created-at")

      ;; Plan content structure
      (let [analysis-plan (get-in plan [:content :analysis_plan])]
        (assert (:metadata analysis-plan) "Plan missing metadata")
        (assert (:data_sources analysis-plan) "Plan missing data_sources")
        (assert (:stages analysis-plan) "Plan missing stages")

        (let [metadata (:metadata analysis-plan)]
          (assert (:plan_id metadata) "Plan metadata missing plan_id")
          (assert (:objective metadata) "Plan metadata missing objective")
          (assert (:estimated_duration metadata) "Plan metadata missing estimated_duration"))))

    ;; Transform structure
    (let [transform (first (:transforms workspace))]
      (assert (:name transform) "Transform missing name")
      (assert (:description transform) "Transform missing description")
      (assert (:source transform) "Transform missing source")
      (assert (:target transform) "Transform missing target")

      (let [source (:source transform)]
        (assert (= "query" (:type source)) "Transform source should be query type"))

      (let [target (:target transform)]
        (assert (:name target) "Transform target missing name")
        (assert (:type target) "Transform target missing type")))

    ;; User structure
    (let [user (first (:users workspace))]
      (assert (:id user) "User missing id")
      (assert (:name user) "User missing name")
      (assert (:email user) "User missing email")
      (assert (:type user) "User missing type"))

    ;; DWH structure
    (let [dwh (first (:dwh workspace))]
      (assert (:id dwh) "DWH missing id")
      (assert (:name dwh) "DWH missing name")
      (assert (:type dwh) "DWH missing type")
      (assert (:credentials dwh) "DWH missing credentials"))

    (println "✅ All validations passed!")
    (println (str "📊 Workspace contains:"))
    (println (str "   - " (count (:plans workspace)) " plans"))
    (println (str "   - " (count (:transforms workspace)) " transforms"))
    (println (str "   - " (count (:users workspace)) " users"))
    (println (str "   - " (count (:dwh workspace)) " data warehouses"))
    (println (str "   - " (count (:permissions workspace)) " permissions"))
    (println (str "   - Plan has " (count (get-in workspace [:plans 0 :content :analysis_plan :stages])) " stages"))
    (println (str "   - Plan has " (->> (get-in workspace [:plans 0 :content :analysis_plan :stages])
                                        (mapcat :tasks)
                                        count) " total tasks"))
    true))

(defn demo-full-workflow
  "Demonstrates the complete workflow"
  []
  (println "\n🚀 COMPLETE WORKSPACE DEMO WORKFLOW")
  (println "=" (apply str (repeat 50 "=")))

  ;; Run all demos
  (demo/demo-workspace-creation)
  (api-call-examples)
  (curl-examples)
  (validate-workspace-structure)

  (println "\n🎉 Demo completed successfully!")
  (println "👉 You now have a complete workspace API implementation with:")
  (println "   • Realistic workspace data structures")
  (println "   • Comprehensive plans with metadata, stages, and tasks")
  (println "   • Data transforms with source/target configurations")
  (println "   • User and data warehouse management")
  (println "   • Full API endpoints for CRUD operations")
  (println "   • Example curl commands for testing"))

(comment
  ;; Run individual parts
  (demo/demo-workspace-creation)
  (api-call-examples)
  (curl-examples)
  (validate-workspace-structure)

  ;; Run complete workflow
  (demo-full-workflow)

  ;; Test specific components
  (let [workspace (demo/create-customer-churn-workspace)]
    ;; Inspect the plan structure
    (get-in workspace [:plans 0 :content :analysis_plan :metadata])

    ;; Look at the data sources
    (get-in workspace [:plans 0 :content :analysis_plan :data_sources])

    ;; Check stages and tasks
    (->> (get-in workspace [:plans 0 :content :analysis_plan :stages])
         (map #(select-keys % [:stage_id :name :tasks]))
         (map #(update % :tasks count)))))
