(ns metabase-enterprise.metabot-analytics.queries-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase-enterprise.metabot-analytics.queries :as analytics.queries]))

(set! *warn-on-reflection* true)

;; Most cases stub `referenced-table-names` so unit tests don't depend on a
;; real database/driver. The Macaw integration is exercised end-to-end in
;; the API integration test.

(defn- with-stubbed-tables! [tables thunk]
  (with-redefs [analytics.queries/referenced-table-names (fn [_db _sql] tables)]
    (thunk)))

;;; ------------------------- happy paths -------------------------

(deftest create-sql-query-row-test
  (with-stubbed-tables! ["orders" "products"]
    (fn []
      (let [rows (analytics.queries/messages->generated-queries
                  [{:id 7
                    :data [{:type "tool-input"
                            :id "call-1"
                            :function "create_sql_query"
                            :arguments {:database_id 1
                                        :sql_query "SELECT * FROM orders JOIN products ON ..."}}
                           {:type "tool-output"
                            :id "call-1"
                            :result {:output "<result>...</result>"
                                     :structured-output {:query-id      "qid-1"
                                                         :query-content "SELECT * FROM orders JOIN products ON ..."
                                                         :query         {:database 1
                                                                         :type     :native
                                                                         :native   {:query "SELECT * FROM orders JOIN products ON ..."}}
                                                         :database      1}}}]}])]
        (is (= 1 (count rows)))
        (let [row (first rows)]
          (is (= "create_sql_query" (:tool row)))
          (is (= "sql" (:query_type row)))
          (is (= "qid-1" (:query_id row)))
          (is (= "call-1" (:call_id row)))
          (is (= 7 (:message_id row)))
          (is (= 1 (:database_id row)))
          (is (= ["orders" "products"] (:tables row)))
          (is (= "SELECT * FROM orders JOIN products ON ..." (:sql row)))
          (is (nil? (:mbql row))))))))

(deftest edit-sql-query-row-test
  (with-stubbed-tables! ["orders"]
    (fn []
      (let [rows (analytics.queries/messages->generated-queries
                  [{:id 8
                    :data [{:type "tool-input"
                            :id "call-2"
                            :function "edit_sql_query"
                            :arguments {:query_id "qid-1"
                                        :checklist "..."
                                        :edits     [{:old_string "1" :new_string "2"}]}}
                           {:type "tool-output"
                            :id "call-2"
                            :result {:structured-output {:query-id      "qid-1"
                                                         :query-content "SELECT 2 FROM orders"
                                                         :query         {:database 1
                                                                         :type     :native
                                                                         :native   {:query "SELECT 2 FROM orders"}}
                                                         :database      1}}}]}])
            row  (first rows)]
        (is (= "edit_sql_query" (:tool row)))
        (is (= "SELECT 2 FROM orders" (:sql row)))
        (is (= "sql" (:query_type row)))))))

(deftest replace-sql-query-row-test
  (with-stubbed-tables! []
    (fn []
      (let [rows (analytics.queries/messages->generated-queries
                  [{:id 9
                    :data [{:type "tool-input"
                            :id "call-3"
                            :function "replace_sql_query"
                            :arguments {:query_id  "qid-1"
                                        :checklist "..."
                                        :new_query "SELECT 3"}}
                           {:type "tool-output"
                            :id "call-3"
                            :result {:structured-output {:query-id      "qid-1"
                                                         :query-content "SELECT 3"
                                                         :query         {:database 1
                                                                         :type     :native
                                                                         :native   {:query "SELECT 3"}}
                                                         :database      1}}}]}])
            row  (first rows)]
        (is (= "replace_sql_query" (:tool row)))
        (is (= "SELECT 3" (:sql row)))))))

(deftest construct-notebook-query-legacy-test
  (with-stubbed-tables! []
    (fn []
      (let [legacy-query {:database 7 :type :query :query {:source-table 5}}
            rows         (analytics.queries/messages->generated-queries
                          ;; Notebook tool persists structured-output WITHOUT a top-level
                          ;; :database key — the db id lives inside :query.
                          [{:id 10
                            :data [{:type "tool-input"
                                    :id "call-4"
                                    :function "construct_notebook_query"
                                    :arguments {:reasoning "show me orders"
                                                :query     {:query_type "raw"
                                                            :source     {:table_id 5}}}}
                                   {:type "tool-output"
                                    :id "call-4"
                                    :result {:structured-output {:query-id "qid-2"
                                                                 :query    legacy-query}}}]}])
            row          (first rows)]
        (is (= "construct_notebook_query" (:tool row)))
        (is (= "notebook" (:query_type row)))
        (is (nil? (:sql row)))
        (is (= legacy-query (:mbql row)))
        (is (= 7 (:database_id row))
            "database_id should fall back to :query.database for notebook tools")
        (is (= [] (:tables row)))))))

(deftest construct-notebook-query-pmbql-test
  (testing "pMBQL is passed through to the frontend as-is, without conversion to legacy MBQL"
    (with-stubbed-tables! []
      (fn []
        (let [pmbql {:lib/type "mbql/query"
                     :lib/metadata nil
                     :database 1
                     :stages   [{:lib/type     "mbql.stage/mbql"
                                 :source-table 5}]}
              rows  (analytics.queries/messages->generated-queries
                     [{:id 11
                       :data [{:type "tool-input"
                               :id "call-5"
                               :function "construct_notebook_query"
                               :arguments {:reasoning "test"
                                           :query     {:query_type "raw" :source {:table_id 5}}}}
                              {:type "tool-output"
                               :id "call-5"
                               :result {:structured-output {:query-id "qid-3"
                                                            :query    pmbql}}}]}])
              row   (first rows)]
          (is (= "notebook" (:query_type row)))
          (is (= pmbql (:mbql row)))
          (is (= 1 (:database_id row))))))))

;;; ------------------------- filtered-out cases -------------------------

(deftest tool-input-without-output-is-filtered-test
  (with-stubbed-tables! []
    (fn []
      (let [rows (analytics.queries/messages->generated-queries
                  [{:id 12
                    :data [{:type "tool-input"
                            :id "orphan"
                            :function "create_sql_query"
                            :arguments {:database_id 1 :sql_query "SELECT 1"}}]}])]
        (is (= [] rows))))))

(deftest tool-output-with-error-is-filtered-test
  (with-stubbed-tables! []
    (fn []
      (let [rows (analytics.queries/messages->generated-queries
                  [{:id 13
                    :data [{:type "tool-input"
                            :id "call-err"
                            :function "create_sql_query"
                            :arguments {:database_id 1 :sql_query "SELECT 1"}}
                           {:type "tool-output"
                            :id "call-err"
                            :error "exploded"}]}])]
        (is (= [] rows))))))

(deftest tool-output-without-structured-is-filtered-test
  (testing "tools that hit a validation error return :output but no :structured-output"
    (with-stubbed-tables! []
      (fn []
        (let [rows (analytics.queries/messages->generated-queries
                    [{:id 14
                      :data [{:type "tool-input"
                              :id "call-bad"
                              :function "create_sql_query"
                              :arguments {:database_id 1 :sql_query "SELEKT bad"}}
                             {:type "tool-output"
                              :id "call-bad"
                              :result {:output "<result>SQL query construction failed.</result>"}}]}])]
          (is (= [] rows)))))))

(deftest non-query-tool-calls-are-skipped-test
  (with-stubbed-tables! ["orders"]
    (fn []
      (let [rows (analytics.queries/messages->generated-queries
                  [{:id 15
                    :data [{:type "tool-input"
                            :id "call-search"
                            :function "search"
                            :arguments {:q "foo"}}
                           {:type "tool-output"
                            :id "call-search"
                            :result {:rows [1 2 3]}}
                           {:type "tool-input"
                            :id "call-sql"
                            :function "create_sql_query"
                            :arguments {:database_id 1 :sql_query "SELECT 1 FROM orders"}}
                           {:type "tool-output"
                            :id "call-sql"
                            :result {:structured-output {:query-id      "qid-x"
                                                         :query-content "SELECT 1 FROM orders"
                                                         :query         {:database 1 :type :native :native {:query "SELECT 1 FROM orders"}}
                                                         :database      1}}}]}])]
        (is (= 1 (count rows)))
        (is (= "create_sql_query" (-> rows first :tool)))))))

(deftest slackbot-shape-blocks-are-filtered-test
  (testing "legacy slackbot rows wrote :_type 'TOOL_CALL' blocks with no recoverable structured-output;
            the :type filter excludes them and the extractor yields nothing for those historical rows"
    (with-stubbed-tables! []
      (fn []
        (let [rows (analytics.queries/messages->generated-queries
                    [{:id 16
                      :data [{:role       "assistant"
                              :_type      "TOOL_CALL"
                              :tool_calls [{:id        "slack-call-1"
                                            :name      "create_sql_query"
                                            :arguments {:database_id 1 :sql_query "SELECT 1"}}]}
                             {:role         "tool"
                              :_type        "TOOL_RESULT"
                              :tool_call_id "slack-call-1"
                              :content      "<result>...</result>"}]}])]
          (is (= [] rows)))))))

(deftest slackbot-native-shape-blocks-are-extracted-test
  (testing "going-forward slackbot rows are persisted via store-native-parts!, so they carry
            the same :type 'tool-input'/'tool-output' block shape as in-app rows and the
            analytics extractor handles them identically"
    (with-stubbed-tables! ["orders"]
      (fn []
        (let [data [{:type "tool-input"
                     :id "call-search"
                     :function "search"
                     :arguments {:query "orders"}}
                    {:type "tool-output"
                     :id "call-search"
                     :result {:output "<result>orders</result>"}}
                    {:type "tool-input"
                     :id "call-sql"
                     :function "create_sql_query"
                     :arguments {:database_id 1 :sql_query "SELECT 1 FROM orders"}}
                    {:type "tool-output"
                     :id "call-sql"
                     :result {:output            "<result>sql</result>"
                              :structured-output {:query-id      "qid-slack"
                                                  :query-content "SELECT 1 FROM orders"
                                                  :query         {:database 1
                                                                  :type     :native
                                                                  :native   {:query "SELECT 1 FROM orders"}}
                                                  :database      1}}}]
              message {:id 200 :data data}]
          (testing "count-tool-invocations reaches tool names directly by :function"
            (is (= 1 (analytics.queries/count-tool-invocations [message] "search")))
            (is (= 1 (analytics.queries/count-tool-invocations
                      [message] analytics.queries/new-query-tool-names))))
          (testing "messages->generated-queries surfaces the SQL tool call"
            (let [rows (analytics.queries/messages->generated-queries [message])]
              (is (= 1 (count rows)))
              (is (= "create_sql_query" (-> rows first :tool)))
              (is (= "qid-slack" (-> rows first :query_id)))
              (is (= "SELECT 1 FROM orders" (-> rows first :sql))))))))))

;;; ------------------------- aggregation -------------------------

(deftest flattens-across-messages-preserving-order-test
  (with-stubbed-tables! ["t"]
    (fn []
      (let [base-output (fn [qid sql]
                          {:type "tool-output"
                           :id   (str "call-" qid)
                           :result {:structured-output {:query-id      qid
                                                        :query-content sql
                                                        :query         {:database 1
                                                                        :type     :native
                                                                        :native   {:query sql}}
                                                        :database      1}}})
            base-input  (fn [qid sql]
                          {:type "tool-input"
                           :id   (str "call-" qid)
                           :function "create_sql_query"
                           :arguments {:database_id 1 :sql_query sql}})
            rows        (analytics.queries/messages->generated-queries
                         [{:id 100
                           :data [(base-input "a" "SELECT 1")
                                  (base-output "a" "SELECT 1")]}
                          {:id 101
                           :data [(base-input "b" "SELECT 2")
                                  (base-output "b" "SELECT 2")
                                  (base-input "c" "SELECT 3")
                                  (base-output "c" "SELECT 3")]}])]
        (is (= ["a" "b" "c"] (map :query_id rows)))
        (is (= [100 101 101] (map :message_id rows)))))))

(deftest empty-and-nil-data-test
  (is (= [] (analytics.queries/messages->generated-queries [])))
  (is (= [] (analytics.queries/messages->generated-queries [{:id 1 :data nil}])))
  (is (= [] (analytics.queries/messages->generated-queries [{:id 1 :data []}]))))

;;; ------------------------- count-tool-invocations -------------------------

(deftest count-tool-invocations-test
  (testing "sums matching tool-input blocks across messages, including errored calls"
    ;; Mix within-message and across-messages, plus an errored and an unrelated tool.
    (is (= 4 (analytics.queries/count-tool-invocations
              [{:id 1 :data [{:type "tool-input" :function "search" :id "a"}
                             {:type "tool-output" :id "a" :error "boom"}        ; errored still counts
                             {:type "tool-input" :function "search" :id "b"}]}
               {:id 2 :data [{:type "tool-input" :function "create_sql_query" :id "c"} ; ignored tool
                             {:type "tool-input" :function "search" :id "d"}
                             {:type "tool-input" :function "search" :id "e"}]}]
              "search"))))
  (testing "returns 0 for inputs that contain no matching tool-input blocks"
    (are [messages] (zero? (analytics.queries/count-tool-invocations messages "search"))
      []
      [{:id 1 :data nil}]
      [{:id 1 :data []}]
      [{:id 1 :data [{:type "text" :text "hi"}]}]
      [{:id 1 :data [{:type "tool-input" :function "create_sql_query" :id "x"}]}]
      ;; Slackbot-shaped blocks lack `:type` and are intentionally skipped.
      [{:id 1 :data [{:role "assistant"
                      :_type "TOOL_CALL"
                      :tool_calls [{:id "slack-1" :name "search"}]}]}]))
  (testing "accepts a set of tool names; a block counts if its :function is in the set"
    ;; new-query-tool-names matches create_sql_query and construct_notebook_query,
    ;; but not edit_sql_query / replace_sql_query.
    (is (= 3 (analytics.queries/count-tool-invocations
              [{:id 1 :data [{:type "tool-input" :function "create_sql_query" :id "a"}
                             {:type "tool-input" :function "edit_sql_query" :id "b"}        ; excluded
                             {:type "tool-input" :function "construct_notebook_query" :id "c"}]}
               {:id 2 :data [{:type "tool-input" :function "replace_sql_query" :id "d"}     ; excluded
                             {:type "tool-input" :function "create_sql_query" :id "e"}
                             {:type "tool-input" :function "search" :id "f"}]}]             ; excluded
              analytics.queries/new-query-tool-names)))))
