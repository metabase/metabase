(ns metabase-enterprise.metabot-v3.agent.user-context-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.user-context :as user-context]))

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
    (let [context {:user_is_viewing [{:type      "adhoc"
                                      :query     {:type     "native"
                                                  :native   {:query "SELECT 1"}
                                                  :database 1}
                                      :sql_engine "PostgreSQL"}]}
          result (user-context/extract-sql-dialect context)]
      (is (= "postgresql" result))))

  (testing "returns nil for adhoc notebook (MBQL) query"
    (let [context {:user_is_viewing [{:type  "adhoc"
                                      :query {:type     "query"
                                              :query    {:source-table 1}
                                              :database 1}}]}
          result (user-context/extract-sql-dialect context)]
      (is (nil? result))))

  (testing "extracts sql_engine from transform context"
    (let [context {:user_is_viewing [{:type "transform"
                                      :sql_engine "MySQL"}]}
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
  (testing "formats adhoc notebook (MBQL) query context"
    (is (=? #"(?s).*notebook editor.*Database ID: 1.*"
            (user-context/format-viewing-context {:user_is_viewing [{:type  "adhoc"
                                                                     :query {:type        "query"
                                                                             :query       {:source-table 1}
                                                                             :database    1
                                                                             :data_source "card__123"}}]}))))

  (testing "formats adhoc native SQL query from frontend (type: adhoc, query.type: native)"
    (let [result (user-context/format-viewing-context
                  {:user_is_viewing [{:type       "adhoc"
                                      :query      {:type     "native"
                                                   :native   {:query "SELECT * FROM orders WHERE total > 100"}
                                                   :database 1}
                                      :sql_engine "PostgreSQL"
                                      :error      nil}]})]
      (is (re-find #"SQL editor" result))
      (is (re-find #"SELECT \* FROM orders WHERE total > 100" result))
      (is (re-find #"PostgreSQL" result))))

  (testing "formats adhoc native SQL query with error"
    (let [result (user-context/format-viewing-context
                  {:user_is_viewing [{:type       "adhoc"
                                      :query      {:type     "native"
                                                   :native   {:query "SELECT * FROM invalid"}
                                                   :database 1}
                                      :sql_engine "PostgreSQL"
                                      :error      "Table 'invalid' not found"}]})]
      (is (re-find #"SQL editor" result))
      (is (re-find #"SELECT \* FROM invalid" result))
      (is (re-find #"Table 'invalid' not found" result))))

  (testing "formats explicit type: native context with SQL string (legacy)"
    (let [result (user-context/format-viewing-context {:user_is_viewing [{:type "native"
                                                                          :query "SELECT * FROM users"
                                                                          :sql_engine "PostgreSQL"}]})]
      (is (re-find #"SQL editor" result))
      (is (re-find #"SELECT \* FROM users" result))
      (is (re-find #"PostgreSQL" result))))

  (testing "formats native query with error (legacy)"
    (let [context {:user_is_viewing [{:type "native"
                                      :query "SELECT * FROM invalid"
                                      :error "Table 'invalid' not found"}]}
          result (user-context/format-viewing-context context)]
      (is (some? result))
      (is (re-find #"error" result))
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
      (is (re-find #"no active buffers" result))))

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
      (is (= "" result)))))

(deftest enrich-context-for-template-test
  (testing "enriches context with all template variables (legacy type: native)"
    (let [context {:current_time_with_timezone "2024-01-15T14:30:00-05:00"
                   :first_day_of_week "Monday"
                   :user_is_viewing [{:type "native"
                                      :sql_engine "PostgreSQL"
                                      :query "SELECT * FROM users"}]
                   :user_recently_viewed [{:type "table"
                                           :id 123
                                           :name "users"}]}
          result (user-context/enrich-context-for-template context)]
      (is (contains? result :current_time))
      (is (contains? result :first_day_of_week))
      (is (contains? result :sql_dialect))
      (is (contains? result :viewing_context))
      (is (contains? result :recent_views))
      (is (string? (:current_time result)))
      (is (= "Monday" (:first_day_of_week result)))
      (is (= "postgresql" (:sql_dialect result)))
      (is (string? (:viewing_context result)))
      (is (string? (:recent_views result)))))

  (testing "enriches context from frontend adhoc native query payload"
    (let [context {:current_time_with_timezone "2024-01-15T14:30:00-05:00"
                   :first_day_of_week "Monday"
                   :user_is_viewing [{:type       "adhoc"
                                      :sql_engine "PostgreSQL"
                                      :query      {:type     "native"
                                                   :native   {:query "SELECT * FROM users"}
                                                   :database 1}}]
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
