(ns metabase-enterprise.workspaces.demo.create-realistic-workspace
  "Demo script to create a realistic workspace with plans, transforms, and other artifacts"
  (:require
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn create-customer-churn-workspace
  "Creates a realistic customer churn analysis workspace with comprehensive plan and transforms"
  []
  (let [now (str (java.time.Instant/now))

        ;; Realistic plan matching the analysis structure you showed
        churn-analysis-plan
        {:title "Customer Churn Analysis"
         :description "Comprehensive analysis to identify key factors driving customer churn and develop retention strategies"
         :content {:analysis_plan
                   {:metadata
                    {:plan_id "customer_churn_analysis_001"
                     :created_at now
                     :objective "Identify key factors driving customer churn and segment high-risk customers for targeted retention campaigns"
                     :estimated_duration "2-3 hours"
                     :priority "high"
                     :owner "data-team"}

                    :data_sources
                    [{:name "customer_db"
                      :type "postgresql"
                      :connection "prod_customer_db"
                      :description "Primary customer database with user profiles, subscriptions, and usage data"
                      :tables ["customers" "subscriptions" "usage_logs" "payments" "support_tickets"]}

                     {:name "marketing_events"
                      :type "document"
                      :path "/data/marketing/campaign_events.csv"
                      :description "Marketing campaign events and customer engagement data"}

                     {:name "product_usage"
                      :type "api"
                      :endpoint "https://analytics-api.company.com/usage"
                      :description "Real-time product usage metrics from analytics service"}]

                    :stages
                    [{:stage_id "data_preparation"
                      :name "Data Collection and Preparation"
                      :description "Extract, clean, and standardize data from multiple sources"
                      :estimated_duration "45 minutes"
                      :tasks
                      [{:task_id "extract_customer_data"
                        :type "sql_query"
                        :source "customer_db"
                        :output_table "raw_customers"
                        :description "Extract customer profiles with subscription history"
                        :query "SELECT c.customer_id, c.email, c.signup_date, c.plan_type, c.mrr, c.last_login, s.status, s.churn_date FROM customers c LEFT JOIN subscriptions s ON c.customer_id = s.customer_id WHERE c.created_at >= '2023-01-01'"}

                       {:task_id "extract_usage_metrics"
                        :type "sql_query"
                        :source "customer_db"
                        :output_table "usage_summary"
                        :description "Aggregate usage metrics per customer"
                        :query "SELECT customer_id, AVG(daily_sessions) as avg_sessions, AVG(session_duration) as avg_duration, COUNT(*) as total_days_active FROM usage_logs WHERE log_date >= CURRENT_DATE - INTERVAL '90 days' GROUP BY customer_id"}

                       {:task_id "load_marketing_data"
                        :type "file_import"
                        :source "marketing_events"
                        :output_table "marketing_touchpoints"
                        :description "Load and parse marketing campaign interaction data"
                        :config {:delimiter "," :header_row true :date_format "yyyy-MM-dd"}}]}

                     {:stage_id "feature_engineering"
                      :name "Feature Engineering and Enrichment"
                      :description "Create predictive features and customer segments"
                      :estimated_duration "60 minutes"
                      :tasks
                      [{:task_id "calculate_churn_indicators"
                        :type "sql_query"
                        :source "derived"
                        :output_table "churn_features"
                        :description "Calculate key churn prediction features"
                        :query "SELECT r.customer_id, r.plan_type, r.mrr, CASE WHEN r.last_login < CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END as inactive_30d, u.avg_sessions, u.avg_duration, COALESCE(m.campaign_touches, 0) as marketing_touches FROM raw_customers r LEFT JOIN usage_summary u ON r.customer_id = u.customer_id LEFT JOIN (SELECT customer_id, COUNT(*) as campaign_touches FROM marketing_touchpoints GROUP BY customer_id) m ON r.customer_id = m.customer_id"}

                       {:task_id "segment_customers"
                        :type "sql_query"
                        :source "derived"
                        :output_table "customer_segments"
                        :description "Segment customers by value and engagement"
                        :query "SELECT *, CASE WHEN mrr >= 100 AND avg_sessions >= 5 THEN 'high_value_engaged' WHEN mrr >= 100 AND avg_sessions < 5 THEN 'high_value_at_risk' WHEN mrr < 100 AND avg_sessions >= 5 THEN 'low_value_engaged' ELSE 'low_value_at_risk' END as customer_segment FROM churn_features"}]}

                     {:stage_id "analysis_and_insights"
                      :name "Churn Analysis and Insights"
                      :description "Perform statistical analysis and generate actionable insights"
                      :estimated_duration "45 minutes"
                      :tasks
                      [{:task_id "churn_rate_analysis"
                        :type "sql_query"
                        :source "derived"
                        :output_table "churn_analysis"
                        :description "Calculate churn rates by segment and identify key factors"
                        :query "SELECT customer_segment, COUNT(*) as total_customers, SUM(CASE WHEN status = 'churned' THEN 1 ELSE 0 END) as churned_customers, ROUND(100.0 * SUM(CASE WHEN status = 'churned' THEN 1 ELSE 0 END) / COUNT(*), 2) as churn_rate, AVG(mrr) as avg_revenue, AVG(avg_sessions) as avg_usage FROM customer_segments cs JOIN raw_customers rc ON cs.customer_id = rc.customer_id GROUP BY customer_segment ORDER BY churn_rate DESC"}

                       {:task_id "identify_at_risk_customers"
                        :type "sql_query"
                        :source "derived"
                        :output_table "at_risk_customers"
                        :description "Identify customers with high churn probability for intervention"
                        :query "SELECT customer_id, email, plan_type, mrr, customer_segment, inactive_30d, avg_sessions, CASE WHEN inactive_30d = 1 AND avg_sessions < 2 THEN 'critical' WHEN inactive_30d = 1 OR avg_sessions < 3 THEN 'high' ELSE 'medium' END as risk_level FROM customer_segments WHERE customer_segment IN ('high_value_at_risk', 'low_value_at_risk') OR inactive_30d = 1 ORDER BY mrr DESC, avg_sessions ASC"}]}]}}
         :created-at now}

        ;; Realistic transforms for data processing
        data-cleanup-transform
        {:name "Customer Data Standardization"
         :description "Clean and standardize customer data from multiple sources, handling duplicates and data quality issues"
         :source {:type "query"
                  :query {:database 1
                          :type "native"
                          :native {:query "SELECT DISTINCT LOWER(TRIM(email)) as email, customer_id, COALESCE(first_name, 'Unknown') as first_name, COALESCE(last_name, 'Unknown') as last_name, signup_date, plan_type, mrr, CASE WHEN last_login IS NULL THEN signup_date ELSE last_login END as last_login FROM customers WHERE email IS NOT NULL AND email != '' AND signup_date >= '2023-01-01'"
                                   :template-tags {}}}}
         :target {:name "customers_clean"
                  :type "table"}
         :config {:dialect "postgresql"
                  :schema "analytics"
                  :create_indexes ["email", "signup_date", "plan_type"]
                  :description "Standardized customer data with cleaned emails and filled missing values"}
         :created-at now}

        churn-features-transform
        {:name "Churn Prediction Features"
         :description "Generate engineered features for churn prediction model including usage patterns, engagement scores, and risk indicators"
         :source {:type "query"
                  :query {:database 1
                          :type "native"
                          :native {:query "SELECT c.customer_id, c.email, c.plan_type, c.mrr, EXTRACT(days FROM CURRENT_DATE - c.last_login) as days_since_last_login, u.sessions_last_30d, u.avg_session_duration, COALESCE(s.support_tickets_count, 0) as support_tickets, CASE WHEN c.last_login < CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END as inactive_7d, CASE WHEN c.last_login < CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END as inactive_30d FROM customers_clean c LEFT JOIN (SELECT customer_id, COUNT(*) as sessions_last_30d, AVG(session_duration) as avg_session_duration FROM usage_logs WHERE log_date >= CURRENT_DATE - INTERVAL '30 days' GROUP BY customer_id) u ON c.customer_id = u.customer_id LEFT JOIN (SELECT customer_id, COUNT(*) as support_tickets_count FROM support_tickets WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' GROUP BY customer_id) s ON c.customer_id = s.customer_id"
                                   :template-tags {}}}}
         :target {:name "churn_features"
                  :type "table"}
         :config {:dialect "postgresql"
                  :schema "ml_features"
                  :create_indexes ["customer_id", "plan_type", "inactive_30d"]
                  :description "Feature table for churn prediction with usage, engagement, and risk indicators"}
         :created-at now}

        ;; Sample users for the workspace
        workspace-users
        [{:id 1001
          :name "Transform Writer"
          :email "transform.writer@company.com"
          :type "writer"
          :created-at now}
         {:id 1002
          :name "Transform Reader"
          :email "transform.reader@company.com"
          :type "reader"
          :created-at now}]

        ;; Data warehouse configurations
        ;; Data warehouse configurations
        dwh-connections
        [{:id 1
          :name "Production Analytics DB"
          :type :read-only
          :credentials {:host "prod-analytics.company.com"
                        :port 5432
                        :database "analytics"
                        :username "workspace_readonly"
                        :ssl true}
          :created-at now}
         {:id 2
          :name "ML Feature Store"
          :type :read-write
          :credentials {:host "ml-features.company.com"
                        :port 5432
                        :database "features"
                        :username "workspace_ml"
                        :ssl true}
          :created-at now}]

        ;; Permissions for tables
        table-permissions
        [{:table "customers" :permission :read :created-at now}
         {:table "subscriptions" :permission :read :created-at now}
         {:table "usage_logs" :permission :read :created-at now}
         {:table "support_tickets" :permission :read :created-at now}
         {:table "customers_clean" :permission :write :created-at now}
         {:table "churn_features" :permission :write :created-at now}
         {:table "churn_analysis" :permission :write :created-at now}]]

    ;; Create the workspace with all components
    (let [workspace-data {:name "Customer Churn Analysis Workspace"
                          :description "Comprehensive workspace for analyzing customer churn patterns, identifying at-risk customers, and developing data-driven retention strategies"
                          :created_at now
                          :updated_at now
                          :plans [churn-analysis-plan]
                          :transforms [data-cleanup-transform churn-features-transform]
                          :users workspace-users
                          :dwh dwh-connections
                          :documents [] ; Could add document IDs here
                          :permissions table-permissions
                          :activity_log []}]

      (println "🚀 Creating Customer Churn Analysis Workspace...")
      (println "📋 Plan: Customer Churn Analysis with 3 stages and 6 tasks")
      (println "🔧 Transforms: 2 data processing transforms")
      (println "👥 Users: 2 workspace users (analyst and data scientist)")
      (println "🗄️ DWH: 2 database connections (read-only analytics + ML feature store)")
      (println "🔐 Permissions: 7 table-level permissions")

      ;; Return the workspace data structure
      workspace-data)))

(defn create-marketing-analysis-workspace
  "Creates a marketing campaign analysis workspace"
  []
  (let [now (str (java.time.Instant/now))]
    {:name "Marketing Campaign Performance Workspace"
     :description "Analyze marketing campaign effectiveness and optimize ad spend allocation"
     :created_at now
     :updated_at now
     :plans [{:title "Q1 Marketing Campaign Analysis"
              :description "Analyze Q1 campaign performance across channels and optimize budget allocation"
              :content {:analysis_plan
                        {:metadata
                         {:plan_id "marketing_q1_analysis_001"
                          :created_at now
                          :objective "Measure Q1 campaign ROI and identify top-performing channels for budget reallocation"
                          :estimated_duration "90 minutes"}
                         :data_sources
                         [{:name "marketing_db"
                           :type "postgresql"
                           :connection "marketing_warehouse"
                           :tables ["campaigns" "ad_spend" "conversions" "attribution"]}
                          {:name "google_ads_export"
                           :type "document"
                           :path "/data/marketing/google_ads_q1.csv"}]
                         :stages
                         [{:stage_id "campaign_performance"
                           :name "Campaign Performance Analysis"
                           :tasks
                           [{:task_id "calculate_roas"
                             :type "sql_query"
                             :source "marketing_db"
                             :output_table "campaign_roas"
                             :query "SELECT campaign_id, channel, SUM(ad_spend) as spend, SUM(revenue) as revenue, SUM(revenue)/SUM(ad_spend) as roas FROM campaigns c JOIN conversions conv ON c.campaign_id = conv.campaign_id WHERE c.start_date >= '2024-01-01' AND c.start_date < '2024-04-01' GROUP BY campaign_id, channel"}]}]}}
              :created-at now}]
     :transforms [{:name "Campaign Attribution Model"
                   :description "Multi-touch attribution model for marketing campaigns"
                   :source {:type "query"
                            :query {:database 2
                                    :type "native"
                                    :native {:query "SELECT customer_id, campaign_id, touchpoint_order, attribution_weight FROM attribution_events WHERE event_date >= '2024-01-01'"
                                             :template-tags {}}}}
                   :target {:name "attribution_weights"
                            :type "table"}
                   :config {:dialect "postgresql"}
                   :created-at now}]
     :users [{:id 2001 :name "Jessica Park" :email "jessica.park@company.com" :type "marketing-analyst" :created-at now}]
     :dwh [{:id 3 :name "Marketing Data Warehouse" :type :read-only :credentials {:host "marketing-dw.company.com"} :created-at now}]
     :documents []
     :permissions [{:table "campaigns" :permission :read :created-at now} {:table "conversions" :permission :read :created-at now}]
     :activity_log []}))

(defn demo-workspace-creation
  "Demonstrates creating realistic workspaces and shows the structure"
  []
  (println "\n=== WORKSPACE CREATION DEMO ===\n")

  ;; Create customer churn workspace
  (let [churn-workspace (create-customer-churn-workspace)]
    (println "✅ Created Customer Churn Analysis Workspace")
    (println (str "   Name: " (:name churn-workspace)))
    (println (str "   Plans: " (count (:plans churn-workspace))))
    (println (str "   Transforms: " (count (:transforms churn-workspace))))
    (println (str "   Users: " (count (:users churn-workspace))))
    (println (str "   DWH Connections: " (count (:dwh churn-workspace))))
    (println (str "   Table Permissions: " (count (:permissions churn-workspace))))

    ;; Show plan structure
    (let [plan (first (:plans churn-workspace))
          metadata (get-in plan [:content :analysis_plan :metadata])
          stages (get-in plan [:content :analysis_plan :stages])]
      (println (str "\n📋 Plan Details:"))
      (println (str "   Plan ID: " (:plan_id metadata)))
      (println (str "   Objective: " (:objective metadata)))
      (println (str "   Duration: " (:estimated_duration metadata)))
      (println (str "   Stages: " (count stages)))
      (doseq [stage stages]
        (println (str "     - " (:name stage) " (" (count (:tasks stage)) " tasks)"))))

    ;; Show transforms
    (println "\n🔧 Transforms:")
    (doseq [transform (:transforms churn-workspace)]
      (println (str "   - " (:name transform)))
      (println (str "     Target: " (get-in transform [:target :name]))))

    (println "\n")
    churn-workspace))

(comment
  ;; Run the demo
  (demo-workspace-creation)

  ;; Create just the churn workspace
  (def churn-ws (create-customer-churn-workspace))

  ;; Inspect specific parts
  (get-in churn-ws [:plans 0 :content :analysis_plan :metadata])
  (get-in churn-ws [:plans 0 :content :analysis_plan :stages])
  (:transforms churn-ws)
  (:users churn-ws)

  ;; Create marketing workspace
  (def marketing-ws (create-marketing-analysis-workspace))

  ;; If you have a running Metabase instance, you could insert these:
  #_(t2/insert! :model/Workspace churn-ws)
  #_(t2/insert! :model/Workspace marketing-ws))

(require '[malli.core :as mc]
         '[metabase-enterprise.workspaces.models.workspace :as m.workspace])
