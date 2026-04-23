(ns metabase.metabot.tools.document-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.table-utils :as table-utils]
   [metabase.metabot.tools.construct :as construct-tools]
   [metabase.metabot.tools.document :as document-tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.sql.create :as create-sql-query-tools]
   [metabase.query-processor :as qp]
   [metabase.warehouses.core :as warehouses]))

(deftest document-schema-collect-tool-test
  (testing "returns schema/instructions when one database reference is present"
    (with-redefs [shared/current-context (fn [] {:references {"database:1" "Test Database"}})
                  warehouses/get-database (fn [_] {:id 1 :engine "h2"})
                  table-utils/schema-full (fn [_]
                                            "CREATE TABLE TestTable (\n  TestColumn varchar\n);")]
      (let [result (document-tools/document-schema-collect-tool {})]
        (is (string? (:output result)))
        (is (re-find #"CREATE TABLE TestTable" (:output result)))
        (is (re-find #"TestColumn varchar" (:output result)))
        (is (re-find #"SQL engine: h2" (:output result)))
        (is (= {:database_id 1
                :sql_engine  "h2"}
               (:structured-output result))))))

  (testing "returns missing-database message when no database references are present"
    (with-redefs [shared/current-context (fn [] {:references {}})]
      (let [result (document-tools/document-schema-collect-tool {})]
        (is (= "You must `@` mention a database to use when not querying an existing model"
               (:output result))))))

  (testing "returns multiple-database message when more than one database is referenced"
    (with-redefs [shared/current-context (fn [] {:references {"database:1" "Test DB 1"
                                                              "database:2" "Test DB 2"}})]
      (let [result (document-tools/document-schema-collect-tool {})]
        (is (= "You can only `@` mention one database when generating SQL"
               (:output result)))))))

(deftest document-construct-sql-chart-tool-test
  (testing "builds chart draft payload from SQL query"
    (with-redefs [create-sql-query-tools/create-sql-query
                  (fn [_]
                    {:validation-result {:valid? true
                                         :dialect "postgres"}
                     :action-result     {:query-id "q-1"
                                         :query {:database 1
                                                 :type "native"
                                                 :native {:query "SELECT * FROM test"
                                                          :template-tags {}}}}})
                  qp/process-query (fn [_] nil)]
      (let [result (document-tools/document-construct-sql-chart-tool
                    {:database_id 1
                     :name "Test Name"
                     :description "Test Desc"
                     :analysis "Test Analysis"
                     :approach "Test Approach"
                     :sql "SELECT * FROM test"
                     :viz_settings {:chart_type "bar"}})
            structured (:structured-output result)]
        (is (true? (:final-response? result)))
        (is (= "document_construct_sql_chart" (:tool structured)))
        (is (= "Test Name" (:name structured)))
        (is (= "Test Desc" (:description structured)))
        (is (= "bar" (:display structured)))
        (is (= "bar" (:chart_type structured)))
        (is (= :chart-draft (:result-type structured)))
        (is (= {:database 1
                :type "native"
                :native {:query "SELECT * FROM test"
                         :template-tags {}}}
               (:dataset_query structured))))))

  (testing "returns instructions when SQL validation fails"
    (with-redefs [create-sql-query-tools/create-sql-query
                  (fn [_]
                    {:validation-result {:valid? false
                                         :dialect "postgres"
                                         :error-message "syntax error near FROM"}})]
      (let [result (document-tools/document-construct-sql-chart-tool
                    {:database_id 1
                     :name "Test Name"
                     :description "Test Desc"
                     :analysis "Test Analysis"
                     :approach "Test Approach"
                     :sql "SELECT FROM test"
                     :viz_settings {:chart_type "bar"}})]
        (is (nil? (:final-response? result)))
        (is (nil? (:structured-output result)))
        (is (re-find #"SQL chart draft generation failed" (:output result)))
        (is (re-find #"syntax error near FROM" (:output result))))))

  (testing "returns instructions when query processor rejects generated SQL"
    (with-redefs [create-sql-query-tools/create-sql-query
                  (fn [_]
                    {:validation-result {:valid? true
                                         :dialect "postgres"}
                     :action-result     {:query-id "q-1"
                                         :query {:database 1
                                                 :type "native"
                                                 :native {:query "SELECT * FROM missing_table"
                                                          :template-tags {}}}}})
                  qp/process-query (fn [_]
                                     (throw (ex-info "Table \"missing_table\" does not exist" {})))]
      (let [result (document-tools/document-construct-sql-chart-tool
                    {:database_id 1
                     :name "Test Name"
                     :description "Test Desc"
                     :analysis "Test Analysis"
                     :approach "Test Approach"
                     :sql "SELECT * FROM missing_table"
                     :viz_settings {:chart_type "bar"}})]
        (is (nil? (:final-response? result)))
        (is (nil? (:structured-output result)))
        (is (re-find #"could not be processed by Metabase" (:output result)))
        (is (re-find #"missing_table" (:output result)))))))

(deftest document-construct-model-chart-tool-test
  (testing "builds chart draft payload from model query"
    (with-redefs [construct-tools/construct-notebook-query-tool
                  (fn [_]
                    {:structured-output {:query-id "3"
                                         :query {:database 1
                                                 :type "query"}}})]
      ;; `construct-notebook-query-tool` is stubbed above, so the YAML string is an opaque
      ;; placeholder — it only needs to be a string.
      (let [result (document-tools/document-construct-model-chart-tool
                    {:name "Test Name"
                     :description "Test Desc"
                     :query ""
                     :viz_settings {:chart_type "bar"}})
            structured (:structured-output result)]
        (is (true? (:final-response? result)))
        (is (= "document_construct_model_chart" (:tool structured)))
        (is (= "Test Name" (:name structured)))
        (is (= "Test Desc" (:description structured)))
        (is (= "bar" (:display structured)))
        (is (= "bar" (:chart_type structured)))
        (is (= :chart-draft (:result-type structured)))
        (is (= {:database 1
                :type "query"}
               (:dataset_query structured)))))))
