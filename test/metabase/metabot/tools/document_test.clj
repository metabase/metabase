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
        (is (= {:database_id  1
                :sql_engine   "h2"
                :entity-usage {:input  [{:type "database" :id 1}]
                               :output []}}
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
               (:dataset_query structured)))))))

(deftest document-construct-sql-chart-tool-test-2
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
        (testing "error branch still carries :entity-usage on :structured-output, stamped invalid"
          (is (= {:entity-usage   {:input  [{:type "database" :id 1}]
                                   :output []}
                  :artifact-valid false}
                 (:structured-output result))))))))

(deftest document-construct-sql-chart-tool-test-3
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
        (testing "qp-rejection branch still carries :entity-usage on :structured-output, stamped invalid"
          (is (= {:entity-usage   {:input  [{:type "database" :id 1}]
                                   :output []}
                  :artifact-valid false}
                 (:structured-output result))))))))

(deftest document-construct-model-chart-tool-test
  (testing "builds chart draft payload from model query"
    (mt/with-dynamic-fn-redefs [construct-tools/construct-notebook-query-tool
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

(deftest document-construct-model-chart-tool-stamps-construct-failure-as-invalid-test
  (testing (str "when the wrapped construct_notebook_query produces no resolved query (an "
                "invalid authoring attempt), document_construct_model_chart returns a normal "
                "result relaying the message and stamps :artifact-valid false")
    (mt/with-dynamic-fn-redefs [construct-tools/construct-notebook-query-tool
                                (fn [_]
                                  ;; Mirrors construct's Option C agent-error shape: a message,
                                  ;; empty entity-usage, stamped invalid, and no resolved :query.
                                  {:output            "unknown table"
                                   :structured-output {:entity-usage   {:input [] :output []}
                                                       :artifact-valid false}})]
      (let [result (document-tools/document-construct-model-chart-tool
                    {:name "N"
                     :description "D"
                     :query ""
                     :viz_settings {:chart_type "bar"}})]
        (is (nil? (:final-response? result)))
        (is (= "unknown table" (:output result)))
        (is (false? (get-in result [:structured-output :artifact-valid])))))))

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

(deftest document-construct-sql-chart-entity-usage-physical-tables-test
  (testing "document_construct_sql_chart success path resolves physical tables named in the SQL"
    (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
                                (fn [_]
                                  {:validation-result {:valid? true
                                                       :dialect "h2"}
                                   :action-result     {:query-id "q-1"
                                                       :query {:database (mt/id)
                                                               :type "native"
                                                               :native {:query "SELECT * FROM venues"
                                                                        :template-tags {}}}}})
                                qp/process-query (fn [_] nil)]
      (let [result (document-tools/document-construct-sql-chart-tool
                    {:database_id (mt/id)
                     :name "N"
                     :description "D"
                     :analysis "A"
                     :approach "A2"
                     :sql "SELECT * FROM venues"
                     :viz_settings {:chart_type "bar"}})
            eu     (get-in result [:structured-output :entity-usage])
            input  (set (:input eu))]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (contains? input {:type "table" :id (mt/id :venues)})
            "the directly-named physical table is recorded as authored input")
        (is (contains? input {:type "database" :id (mt/id)})))))
  (testing "validation-failure branch keeps the cheap db+card projection (no table resolution)"
    (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
                                (fn [_]
                                  {:validation-result {:valid? false
                                                       :dialect "h2"
                                                       :error-message "bad sql"}
                                   :action-result     nil})]
      (let [result (document-tools/document-construct-sql-chart-tool
                    {:database_id (mt/id)
                     :name "N"
                     :description "D"
                     :analysis "A"
                     :approach "A2"
                     :sql "SELECT * FROM venues"
                     :viz_settings {:chart_type "bar"}})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (= [{:type "database" :id (mt/id)}] (:input eu)))
        (is (false? (get-in result [:structured-output :artifact-valid])))))))

(deftest document-construct-model-chart-entity-usage-test
  (testing "success path forwards :entity-usage from the underlying construct_notebook_query"
    (let [forwarded-eu {:input  [{:type "database" :id 1}
                                 {:type "card"     :id 42}]
                        :output []}]
      (mt/with-dynamic-fn-redefs [construct-tools/construct-notebook-query-tool
                                  (fn [_]
                                    {:structured-output {:query-id     "3"
                                                         :query        {:database 1 :type "query"}
                                                         :entity-usage forwarded-eu}})]
        (let [result (document-tools/document-construct-model-chart-tool
                      {:name "N"
                       :description "D"
                       :query ""
                       :viz_settings {:chart_type "bar"}})
              eu     (get-in result [:structured-output :entity-usage])]
          (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
          (is (= forwarded-eu eu)
              "entity-usage from the inner construct_notebook_query call should pass through unchanged")))))
  (testing "falls back to empty entity-usage when the inner tool didn't attach one"
    (mt/with-dynamic-fn-redefs [construct-tools/construct-notebook-query-tool
                                (fn [_]
                                  {:structured-output {:query-id "3"
                                                       :query {:database 1 :type "query"}}})]
      (let [result (document-tools/document-construct-model-chart-tool
                    {:name "N"
                     :description "D"
                     :query ""
                     :viz_settings {:chart_type "bar"}})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= {:input [] :output []} eu))))))

(deftest document-schema-collect-entity-usage-test
  (testing "single-database success path emits database input"
    (mt/with-dynamic-fn-redefs [shared/current-context (fn [] {:references {"database:42" "DB"}})
                                warehouses/get-database (fn [_] {:id 42 :engine "postgres"})
                                table-utils/schema-full (fn [_] "CREATE TABLE a (b int);")]
      (let [result (document-tools/document-schema-collect-tool {})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= {:input  [{:type "database" :id 42}]
                :output []}
               eu)))))
  (testing "no-database branch emits empty input/output"
    (mt/with-dynamic-fn-redefs [shared/current-context (fn [] {:references {}})]
      (let [result (document-tools/document-schema-collect-tool {})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= {:input [] :output []} eu)))))
  (testing "multiple-databases branch emits empty input/output"
    (mt/with-dynamic-fn-redefs [shared/current-context (fn [] {:references {"database:1" "A"
                                                                            "database:2" "B"}})]
      (let [result (document-tools/document-schema-collect-tool {})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= {:input [] :output []} eu))))))
