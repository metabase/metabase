(ns metabase.metabot.agent.user-context-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.metabot.agent.user-context :as user-context]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.shared.llm-representations :as llm-rep]
   [metabase.test :as mt]))

(deftest format-current-time-test
  (testing "formats time from context with timezone"
    (let [context {:current_time_with_timezone "2024-01-15T14:30:00-05:00"}
          result  (user-context/format-current-time context)]
      (is (some? result))
      (is (string? result))
      ;; Should contain date components
      (is (re-find #"2024" result))
      (is (re-find #"14:30" result))))

  (testing "uses current_user_time when provided"
    (let [context {:current_user_time "2024-02-01T09:15:00"}
          result  (user-context/format-current-time context)]
      (is (= "2024-02-01T09:15:00" result))))

  (testing "handles missing timezone by using current time"
    (let [context {}
          result  (user-context/format-current-time context)]
      (is (some? result))
      (is (string? result))
      ;; Should contain some date
      (is (re-find #"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}" result))))

  (testing "handles invalid timezone gracefully"
    (is (string?
         (user-context/format-current-time {:current_time_with_timezone "invalid"})))))

(deftest extract-sql-dialect-test
  (testing "extracts sql_engine from explicit type: native context"
    (let [context {:user_is_viewing [{:type "native"
                                      :sql_engine "PostgreSQL"}]}
          result (user-context/extract-sql-dialect context)]
      (is (= "postgresql" result))))

  (testing "extracts sql_engine from adhoc item with native dataset-query (frontend payload)"
    (let [context {:user_is_viewing [{:type "adhoc"
                                      :query (lib/native-query (mt/metadata-provider) "select 1")
                                      :sql_engine "PostgreSQL"}]}
          result (user-context/extract-sql-dialect context)]
      (is (= "postgresql" result))))

  (testing "returns nil for adhoc notebook (MBQL) query"
    (let [context {:user_is_viewing [{:type  "adhoc"
                                      :query (let [mp (mt/metadata-provider)]
                                               (lib/query mp (lib.metadata/table mp (mt/id :venues))))}]}
          result (user-context/extract-sql-dialect context)]
      (is (nil? result))))

  (testing "returns nil when no viewing context"
    (let [context {}
          result (user-context/extract-sql-dialect context)]
      (is (nil? result))))

  (testing "returns nil when no sql_engine in context"
    (let [context {:user_is_viewing [{:type "table" :id 1}]}
          result (user-context/extract-sql-dialect context)]
      (is (nil? result)))))

(deftest format-viewing-context-test
  (let [mp meta/metadata-provider]
    (testing "formats adhoc notebook (MBQL) query context"
      (is (=? (re-pattern
               (format "(?s).*notebook editor.*Database ID: %d.*"
                       (meta/id)))
              (user-context/format-viewing-context
               {:user_is_viewing [{:type  "adhoc"
                                   :query (lib/query mp (lib.metadata/table mp (meta/id :venues)))}]}))))

    (testing "formats adhoc native SQL query from frontend (type: adhoc, query.type: native)"
      (let [result (user-context/format-viewing-context
                    {:user_is_viewing [{:type       "adhoc"
                                        :query (lib/native-query mp "SELECT * FROM orders WHERE total > 100")
                                        :sql_engine "postgres"
                                        :error      nil}]})]
        (is (re-find #"SQL editor" result))
        (is (re-find #"SELECT \* FROM orders WHERE total > 100" result))
        (is (re-find #"postgres" result))))

    (testing "formats adhoc native SQL query with error"
      (let [result (user-context/format-viewing-context
                    {:user_is_viewing [{:type       "adhoc"
                                        :query (lib/native-query mp "SELECT * FROM invalid")
                                        :sql_engine "postgres"
                                        :error      "Table 'invalid' not found"}]})]
        (is (re-find #"SQL editor" result))
        (is (re-find #"SELECT \* FROM invalid" result))
        (is (re-find #"Table 'invalid' not found" result))))

    (testing "formats transform context"
      (let [context {:user_is_viewing [{:type "transform"
                                        :id 123
                                        :name "Daily Revenue"
                                        :source_type "sql"}]}
            result (user-context/format-viewing-context context)]
        (is (some? result))
        (is (re-find #"Transform" result))
        (is (re-find #"Daily Revenue" result))
        (is (re-find #"sql" result))))

    (testing "formats transform context with error"
      (let [context {:user_is_viewing [{:type "transform"
                                        :id 123
                                        :name "Broken Revenue"
                                        :source_type "native"
                                        :error "ERROR: relation \"missing_table\" does not exist"}]}
            result (user-context/format-viewing-context context)]
        (is (some? result))
        (is (re-find #"Transform error" result))
        (is (re-find #"ERROR: relation \"missing_table\" does not exist" result))))

    (testing "formats code editor context"
      (let [context {:user_is_viewing [{:type "code_editor"
                                        :buffers [{:id "buffer1"
                                                   :source {:language "python"
                                                            :database_id 42}
                                                   :cursor {:line 10 :column 5}}]}]}
            result (user-context/format-viewing-context context)]
        (is (some? result))
        (is (re-find #"code editor" result))
        (is (re-find #"python" result))
        (is (re-find #"Line 10" result))))

    (testing "formats code editor with selection"
      (let [context {:user_is_viewing [{:type "code_editor"
                                        :buffers [{:id "buffer1"
                                                   :source {:language "sql"
                                                            :database_id 42}
                                                   :cursor {:line 5 :column 0}
                                                   :selection {:start {:line 5 :column 0}
                                                               :end {:line 10 :column 20}
                                                               :text "SELECT * FROM foo"}}]}]}
            result (user-context/format-viewing-context context)]
        (is (some? result))
        (is (re-find #"Selected lines:" result))
        (is (re-find #"SELECT \* FROM foo" result))))

    (testing "formats code editor with no buffers"
      (let [context {:user_is_viewing [{:type "code_editor"
                                        :buffers []}]}
            result (user-context/format-viewing-context context)]
        (is (some? result))
        (is (re-find #"no active buffers" result))))))

(deftest format-viewing-context-test-2
  (testing "formats table entity"
    (let [context {:user_is_viewing [{:type "table"
                                      :id 123
                                      :name "users"
                                      :description "User accounts"}]}
          result (user-context/format-viewing-context context)]
      (is (some? result))
      (is (re-find #"table" result))
      (is (re-find #"users" result))
      (is (re-find #"User accounts" result))))

  (testing "formats model entity"
    (let [context {:user_is_viewing [{:type "model"
                                      :id 456
                                      :name "Revenue Model"
                                      :description "Daily revenue metrics"}]}
          result (user-context/format-viewing-context context)]
      (is (some? result))
      (is (re-find #"model" result))
      (is (re-find #"Revenue Model" result))))

  (testing "formats question entity"
    (let [context {:user_is_viewing [{:type "question"
                                      :id 789
                                      :name "Top Customers"}]}
          result (user-context/format-viewing-context context)]
      (is (some? result))
      (is (re-find #"question" result))
      (is (re-find #"Top Customers" result))))

  (testing "formats metric entity"
    (let [context {:user_is_viewing [{:type "metric"
                                      :id 111
                                      :name "Total Revenue"}]}
          result (user-context/format-viewing-context context)]
      (is (some? result))
      (is (re-find #"metric" result))
      (is (re-find #"Total Revenue" result))))

  (testing "formats dashboard entity"
    (let [context {:user_is_viewing [{:type "dashboard"
                                      :id 222
                                      :name "Executive Dashboard"}]}
          result (user-context/format-viewing-context context)]
      (is (some? result))
      (is (re-find #"dashboard" result))
      (is (re-find #"Executive Dashboard" result))))

  (testing "handles keyword types in viewing context"
    (let [context {:user_is_viewing [{:type :table
                                      :id 321
                                      :name "orders"}]}
          result (user-context/format-viewing-context context)]
      (is (some? result))
      (is (re-find #"table" result))
      (is (re-find #"orders" result))))

  (testing "handles empty viewing context"
    (let [context {}
          result (user-context/format-viewing-context context)]
      (is (= "" result))))

  (testing "handles multiple viewing items"
    (let [context {:user_is_viewing [{:type "table" :id 1 :name "users"}
                                     {:type "question" :id 2 :name "Top Users"}]}
          result (user-context/format-viewing-context context)]
      (is (some? result))
      (is (re-find #"users" result))
      (is (re-find #"Top Users" result)))))

(deftest format-recent-views-test
  (testing "formats recent views"
    (let [context {:user_recently_viewed [{:type "question"
                                           :id 123
                                           :name "Revenue Query"
                                           :description "Daily revenue"}
                                          {:type "dashboard"
                                           :id 456
                                           :name "Sales Dashboard"}]}
          result (user-context/format-recent-views context)]
      (is (some? result))
      (is (re-find #"recently viewed" result))
      (is (re-find #"Revenue Query" result))
      (is (re-find #"Sales Dashboard" result))
      (is (re-find #"Daily revenue" result))))

  (testing "includes guidance text"
    (let [context {:user_recently_viewed [{:type "table" :id 1 :name "users"}]}
          result (user-context/format-recent-views context)]
      (is (re-find #"might be relevant" result))
      (is (re-find #"search tool" result))))

  (testing "returns empty string when no recent views"
    (let [context {}
          result (user-context/format-recent-views context)]
      (is (= "" result))))

  (testing "returns empty string when recent views is an empty vector (e.g. after verified-only filter)"
    (let [context {:user_recently_viewed []}
          result (user-context/format-recent-views context)]
      (is (= "" result)))))

(deftest format-current-user-info-test
  (testing "formats the current user as XML"
    (with-redefs [entity-details/get-current-user (fn [_]
                                                    {:structured-output {:id            1
                                                                         :name          "Jane Doe"
                                                                         :email-address "jane@example.com"
                                                                         :glossary      {"ARR" "Annual Recurring Revenue"}}})]
      (is (= (llm-rep/user->xml {:id       1
                                 :name     "Jane Doe"
                                 :email    "jane@example.com"
                                 :glossary {"ARR" "Annual Recurring Revenue"}})
             (user-context/format-current-user-info {})))))

  (testing "returns nil when there is no current user"
    (with-redefs [entity-details/get-current-user (fn [_]
                                                    {:output "current user not found"})]
      (is (nil? (user-context/format-current-user-info {}))))))

(deftest enrich-context-for-template-test
  (testing "enriches context with all template variables (legacy type: native)"
    (with-redefs [user-context/format-current-user-info (constantly "<user>Jane Doe</user>")]
      (let [context {:current_time_with_timezone "2024-01-15T14:30:00-05:00"
                     :first_day_of_week "Monday"
                     :user_is_viewing [{:type "adhoc"
                                        :sql_engine "PostgreSQL"
                                        :query (lib/native-query (mt/metadata-provider) "SELECT * FROM users")}]
                     :user_recently_viewed [{:type "table"
                                             :id 123
                                             :name "users"}]}
            result (user-context/enrich-context-for-template context)]
        (is (contains? result :current_time))
        (is (contains? result :first_day_of_week))
        (is (contains? result :sql_dialect))
        (is (contains? result :current_user_info))
        (is (contains? result :viewing_context))
        (is (contains? result :recent_views))
        (is (string? (:current_time result)))
        (is (= "Monday" (:first_day_of_week result)))
        (is (= "postgresql" (:sql_dialect result)))
        (is (= "<user>Jane Doe</user>" (:current_user_info result)))
        (is (string? (:viewing_context result)))
        (is (string? (:recent_views result))))))

  (testing "enriches context from frontend adhoc native query payload"
    (let [context {:current_time_with_timezone "2024-01-15T14:30:00-05:00"
                   :first_day_of_week "Monday"
                   :user_is_viewing [{:type       "adhoc"
                                      :sql_engine "PostgreSQL"
                                      :query      (lib/native-query (mt/metadata-provider) "SELECT * FROM users")}]
                   :user_recently_viewed [{:type "table"
                                           :id 123
                                           :name "users"}]}
          result (user-context/enrich-context-for-template context)]
      (is (= "postgresql" (:sql_dialect result)))
      (is (re-find #"SQL editor" (:viewing_context result)))
      (is (re-find #"SELECT \* FROM users" (:viewing_context result)))))

  (testing "uses default first_day_of_week when not provided"
    (let [context {}
          result (user-context/enrich-context-for-template context)]
      (is (= "Sunday" (:first_day_of_week result)))))

  (testing "handles minimal context"
    (let [context {}
          result (user-context/enrich-context-for-template context)]
      (is (some? (:current_time result)))
      (is (= "Sunday" (:first_day_of_week result)))
      (is (nil? (:sql_dialect result)))
      (is (= "" (:viewing_context result)))
      (is (= "" (:recent_views result))))))

(deftest format-entity-includes-measures-and-segments-test
  (testing "table viewing context includes measures and segments when present"
    (with-redefs [entity-details/get-table-details
                  (fn [{:keys [table-id with-measures? with-segments?]}]
                    ;; Verify that with-measures? and with-segments? are requested
                    (is (true? with-measures?) "should request measures")
                    (is (true? with-segments?) "should request segments")
                    {:structured-output
                     {:id table-id
                      :type :table
                      :name "int_shopify_order_facts"
                      :database_id 2
                      :database_engine "postgres"
                      :database_schema "shopify_enriched"
                      :description "Order facts with enriched data"
                      :fields [{:field_id "t10-1" :name "order_id" :database_type "INTEGER"}]
                      :measures [{:id 1 :name "avg_order_value" :display-name "Average Order Value"
                                  :description "Average value of all orders"}]
                      :segments [{:id 2 :name "q4_orders" :display-name "Q4 Orders"
                                  :description "Orders placed in Q4"}]}})]
      (let [result (user-context/format-viewing-context
                    {:user_is_viewing [{:type "table" :id 10}]})]
        (is (re-find #"table" result))
        (is (re-find #"int_shopify_order_facts" result))
        (is (re-find #"Measures \(Pre-defined Aggregation Formulas\)" result))
        (is (re-find #"Average Order Value" result))
        (is (re-find #"Segments \(Pre-defined Filter Conditions\)" result))
        (is (re-find #"Q4 Orders" result)))))

  (testing "model viewing context includes measures and segments when present"
    (with-redefs [entity-details/get-table-details
                  (fn [{:keys [model-id with-measures? with-segments?]}]
                    (is (true? with-measures?) "should request measures for model")
                    (is (true? with-segments?) "should request segments for model")
                    {:structured-output
                     {:id model-id
                      :type :model
                      :name "Revenue Model"
                      :database_id 2
                      :database_engine "postgres"
                      :description "Revenue model"
                      :measures [{:id 3 :name "total_revenue" :display-name "Total Revenue"
                                  :description "Sum of all revenue"}]
                      :segments [{:id 4 :name "enterprise" :display-name "Enterprise Accounts"
                                  :description "Enterprise-tier customers"}]}})]
      (let [result (user-context/format-viewing-context
                    {:user_is_viewing [{:type "model" :id 20}]})]
        (is (re-find #"model" result))
        (is (re-find #"Revenue Model" result))
        (is (re-find #"Measures" result))
        (is (re-find #"Total Revenue" result))
        (is (re-find #"Segments" result))
        (is (re-find #"Enterprise Accounts" result)))))

  (testing "table viewing context omits measures/segments sections when none exist"
    (with-redefs [entity-details/get-table-details
                  (fn [{:keys [entity-id]}]
                    {:structured-output
                     {:id entity-id
                      :type :table
                      :name "plain_table"
                      :database_id 1
                      :database_engine "h2"
                      :description "A plain table"
                      :fields [{:field_id "t1-1" :name "id" :database_type "INTEGER"}]}})]
      (let [result (user-context/format-viewing-context
                    {:user_is_viewing [{:type "table" :id 1}]})]
        (is (re-find #"plain_table" result))
        (is (not (re-find #"Measures" result)))
        (is (not (re-find #"Segments" result)))))))

(deftest format-entity-fetches-details-from-db-test
  (testing "question with only type+id fetches name and description from DB"
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Card {card-id :id} {:name          "Retention Cohorts"
                                                :description   "Shows retention by cohort"
                                                :type          "question"
                                                :database_id   (mt/id)
                                                :dataset_query {:database (mt/id)
                                                                :type     :query
                                                                :query    {:source-table (mt/id :orders)}}}]
        (let [result (user-context/format-viewing-context
                      {:user_is_viewing [{:type "question" :id card-id}]})]
          (is (re-find #"Retention Cohorts" result))
          (is (re-find #"Shows retention by cohort" result))))))

  (testing "question includes display_type in formatted output"
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Card {card-id :id} {:name          "Revenue Pie Chart"
                                                :type          "question"
                                                :display       :pie
                                                :database_id   (mt/id)
                                                :dataset_query {:database (mt/id)
                                                                :type     :query
                                                                :query    {:source-table (mt/id :orders)}}}]
        (let [result (user-context/format-viewing-context
                      {:user_is_viewing [{:type "question" :id card-id}]})]
          (is (re-find #"display_type=\"pie\"" result))))))

  (testing "dashboard with only type+id fetches name and description from DB"
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name        "Executive Dashboard"
                                                     :description "Top-level KPIs"}]
        (let [result (user-context/format-viewing-context
                      {:user_is_viewing [{:type "dashboard" :id dash-id}]})]
          (is (re-find #"Executive Dashboard" result))
          (is (re-find #"Top-level KPIs" result))))))

  (testing "table with only type+id fetches details including fields from DB"
    (mt/with-test-user :rasta
      (let [result (user-context/format-viewing-context
                    {:user_is_viewing [{:type "table" :id (mt/id :orders)}]})]
        (is (re-find #"(?i)orders" result))
        (is (re-find #"(?i)field" result))))))

(deftest ^:parallel format-user-context-with-legacy-query-test
  (let [lq {:database 1111
            :type :native
            :native {:query "select 1"}}
        {:keys [result error]}
        (try {:result (user-context/format-viewing-context
                       {:user_is_viewing [{:type "adhoc" :query lq}]})}
             (catch Throwable t
               {:error t}))]
    (is (nil? error)
        "Formatting of context with legacy query should yield no error.")
    (is (string? result)
        "Formatting result should be a string.")
    (is (str/includes? result "select 1")
        "Formatting result should contain the native query string")
    (is (str/includes? result "1111")
        "Formatting result should contain database id")))
