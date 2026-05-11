(ns metabase.metabot.tools.document-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.metabot.table-utils :as table-utils]
   [metabase.metabot.tools.construct :as construct-tools]
   [metabase.metabot.tools.document :as document-tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.sql.create :as create-sql-query-tools]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.warehouses.core :as warehouses]
   [toucan2.core :as t2]))

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

(def ^:private sample-doc-ast
  {:type "doc"
   :content [{:type "heading" :attrs {:level 1}
              :content [{:type "text" :text "Title"}]}
             {:type "paragraph"
              :content [{:type "text" :text "Hello world."}]}
             {:type "cardEmbed" :attrs {:id 42 :name "Sales"}}]})

(deftest document-read-tool-test
  (testing "renders an existing document for the LLM"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Read Me"
                                                 :document sample-doc-ast
                                                 :content_type prose-mirror/prose-mirror-content-type
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-test-user :crowberto
        (let [{:keys [output structured-output]}
              (document-tools/document-read-tool {:document_id doc-id})]
          (is (string? output))
          (is (re-find #"Title: Read Me" output))
          (is (re-find #"# Title" output))
          (is (re-find #"Hello world\." output))
          (is (re-find #"\[Card #42" output))
          (is (= doc-id (:id structured-output)))
          (is (= sample-doc-ast (:document structured-output)))))))

  (testing "returns a not-found message for missing documents"
    (mt/with-test-user :crowberto
      (let [result (document-tools/document-read-tool {:document_id Integer/MAX_VALUE})]
        (is (re-find #"not found" (:output result)))
        (is (nil? (:structured-output result)))))))

(deftest document-update-tool-test
  (testing "replaces document content and bumps the title"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Before"
                                                 :document sample-doc-ast
                                                 :content_type prose-mirror/prose-mirror-content-type
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-test-user :crowberto
        (let [new-ast {:type "doc"
                       :content [{:type "heading" :attrs {:level 2}
                                  :content [{:type "text" :text "Summary"}]}
                                 {:type "paragraph"
                                  :content [{:type "text" :text "Updated body."}]}
                                 {:type "cardEmbed" :attrs {:id 42 :name "Sales"}}]}
              {:keys [output structured-output]}
              (document-tools/document-update-tool {:document_id doc-id
                                                    :document new-ast
                                                    :name "After"})
              reloaded (t2/select-one :model/Document :id doc-id)]
          (is (re-find #"updated" output))
          (is (= "document_update" (:tool structured-output)))
          (is (= :document-updated (:result-type structured-output)))
          (is (= "After" (:name reloaded)))
          (testing "id-bearing nodes get a synthesized :_id so the editor doesn't show them as dirty"
            (let [persisted-content (-> reloaded :document :content)]
              (is (= 3 (count persisted-content)))
              (doseq [node persisted-content]
                (is (string? (get-in node [:attrs :_id]))
                    (str "node " (:type node) " should have an :_id"))))
            ;; cardEmbed's existing :id attr is preserved
            (is (= 42 (get-in (last (-> reloaded :document :content)) [:attrs :id]))))))))

  (testing "rejects non-doc roots without changing the database"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Untouched"
                                                 :document sample-doc-ast
                                                 :content_type prose-mirror/prose-mirror-content-type
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-test-user :crowberto
        (let [result (document-tools/document-update-tool
                      {:document_id doc-id
                       :document {:type "paragraph"
                                  :content [{:type "text" :text "no good"}]}})]
          (is (re-find #"Invalid document AST" (:output result)))
          (is (= sample-doc-ast (:document (t2/select-one :model/Document :id doc-id))))))))

  (testing "refuses to edit archived documents"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Archived"
                                                 :document sample-doc-ast
                                                 :content_type prose-mirror/prose-mirror-content-type
                                                 :archived true
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-test-user :crowberto
        (let [result (document-tools/document-update-tool {:document_id doc-id
                                                           :document sample-doc-ast})]
          (is (re-find #"archived" (:output result))))))))

(deftest document-tools-refuse-on-unsaved-changes-test
  (testing "both tools refuse when the user has unsaved local changes"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Dirty"
                                                 :document sample-doc-ast
                                                 :content_type prose-mirror/prose-mirror-content-type
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-test-user :crowberto
        (let [memory-atom (atom {:context {:user_is_viewing
                                           [{:type "document"
                                             :id doc-id
                                             :has_unsaved_changes true}]}})]
          (binding [shared/*memory-atom* memory-atom]
            (let [read-result (document-tools/document-read-tool {:document_id doc-id})
                  update-result (document-tools/document-update-tool
                                 {:document_id doc-id
                                  :document {:type "doc" :content []}})]
              (is (re-find #"unsaved changes" (:output read-result)))
              (is (nil? (:structured-output read-result)))
              (is (re-find #"unsaved changes" (:output update-result)))
              ;; Persisted contents are unchanged
              (is (= sample-doc-ast
                     (:document (t2/select-one :model/Document :id doc-id)))))))))))
