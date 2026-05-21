(ns metabase.metabot.tools.document-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.table-utils :as table-utils]
   [metabase.metabot.tools.construct :as construct-tools]
   [metabase.metabot.tools.document :as document-tools]
   [metabase.metabot.tools.entity-usage :as entity-usage]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.sql.create :as create-sql-query-tools]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouses.core :as warehouses]))

(deftest document-schema-collect-tool-test
  (testing "returns schema/instructions when one database reference is present"
    (mt/with-dynamic-fn-redefs [shared/current-context (fn [] {:references {"database:1" "Test Database"}})
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
    (mt/with-dynamic-fn-redefs [shared/current-context (fn [] {:references {}})]
      (let [result (document-tools/document-schema-collect-tool {})]
        (is (= "You must `@` mention a database to use when not querying an existing model"
               (:output result))))))

  (testing "returns multiple-database message when more than one database is referenced"
    (mt/with-dynamic-fn-redefs [shared/current-context (fn [] {:references {"database:1" "Test DB 1"
                                                                            "database:2" "Test DB 2"}})]
      (let [result (document-tools/document-schema-collect-tool {})]
        (is (= "You can only `@` mention one database when generating SQL"
               (:output result)))))))

(deftest document-construct-sql-chart-tool-test
  (testing "builds chart draft payload from SQL query"
    (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
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
    (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
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
        (is (re-find #"SQL chart draft generation failed" (:output result)))
        (is (re-find #"syntax error near FROM" (:output result)))
        (testing "error branch still carries :entity-usage on :structured-output"
          (is (= {:entity-usage {:input  [{:type "database" :id 1}]
                                 :output []}}
                 (:structured-output result)))))))

  (testing "returns instructions when query processor rejects generated SQL"
    (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
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
        (is (re-find #"could not be processed by Metabase" (:output result)))
        (is (re-find #"missing_table" (:output result)))
        (testing "qp-rejection branch still carries :entity-usage on :structured-output"
          (is (= {:entity-usage {:input  [{:type "database" :id 1}]
                                 :output []}}
                 (:structured-output result))))))))

(deftest document-construct-model-chart-tool-test
  (testing "builds chart draft payload from model query"
    (mt/with-dynamic-fn-redefs [construct-tools/construct-notebook-query-tool
                                (fn [_]
                                  {:structured-output {:query-id "3"
                                                       :query {:database 1
                                                               :type "query"}}})]
      (let [result (document-tools/document-construct-model-chart-tool
                    {:name "Test Name"
                     :description "Test Desc"
                     :source_entity {:type "model" :id 4}
                     :program {:source {:type "context" :ref "source"} :operations []}
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

;;; ----------------------------------- entity-usage ----------------------------------------

(deftest document-construct-sql-chart-entity-usage-test
  (testing "document_construct_sql_chart success path emits :entity-usage with database + {{#N}} card refs"
    (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
                                (fn [_]
                                  {:validation-result {:valid? true
                                                       :dialect "postgres"}
                                   :action-result     {:query-id "q-1"
                                                       :query {:database 7
                                                               :type "native"
                                                               :native {:query "SELECT * FROM {{#11}}"
                                                                        :template-tags {}}}}})
                                qp/process-query (fn [_] nil)]
      (let [result (document-tools/document-construct-sql-chart-tool
                    {:database_id 7
                     :name "N"
                     :description "D"
                     :analysis "A"
                     :approach "A2"
                     :sql "SELECT * FROM {{#11}} JOIN {{#12-slug}} t ON t.id = 1"
                     :viz_settings {:chart_type "bar"}})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= [{:type "database" :id 7}
                {:type "card"     :id 11}
                {:type "card"     :id 12}]
               (:input eu)))
        (is (= [] (:output eu)))))))

(deftest document-construct-model-chart-entity-usage-test
  (testing "document_construct_model_chart success path emits :entity-usage with source_entity + program refs"
    (mt/with-dynamic-fn-redefs [construct-tools/construct-notebook-query-tool
                                (fn [_]
                                  {:structured-output {:query-id "3"
                                                       :query {:database 1 :type "query"}}})]
      (let [result (document-tools/document-construct-model-chart-tool
                    {:name "N"
                     :description "D"
                     :source_entity {:type "model" :id 4}
                     :program {:source {:type "dataset" :id 4} :operations []}
                     :viz_settings {:chart_type "bar"}})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= [] (:output eu)))
        (is (= [{:type "model" :id 4 :metadata {:arg_slot "source_entity"}}]
               (:input eu)))))))
