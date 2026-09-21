(ns metabase-enterprise.metabot-analytics.queries-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase-enterprise.metabot-analytics.queries :as analytics.queries]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;; Most cases stub `referenced-table-names` so unit tests don't depend on a
;; real database/driver. The Macaw integration is exercised end-to-end in
;; the API integration test.

(defn- with-stubbed-tables! [tables thunk]
  (mt/with-dynamic-fn-redefs [analytics.queries/referenced-table-names (fn [_db _sql] tables)]
    (thunk)))

(defn- tool-part
  "A stored v2 tool part in `output-available` state."
  [tool-name call-id input output]
  {:type         (str "tool-" tool-name)
   :toolCallId   call-id
   :state        "output-available"
   :input        input
   :output       output})

;;; ------------------------- happy paths -------------------------

(deftest create-sql-query-row-test
  (with-stubbed-tables! ["orders" "products"]
    (fn []
      (let [rows (analytics.queries/messages->generated-queries
                  [{:id 7
                    :data [(tool-part "create_sql_query" "call-1"
                                      {:database_id 1
                                       :sql_query "SELECT * FROM orders JOIN products ON ..."}
                                      {:output "<result>...</result>"
                                       :structured_output {:query-id      "qid-1"
                                                           :query-content "SELECT * FROM orders JOIN products ON ..."
                                                           :query         {:database 1
                                                                           :type     :native
                                                                           :native   {:query "SELECT * FROM orders JOIN products ON ..."}}
                                                           :database      1}})]}])]
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
                    :data [(tool-part "edit_sql_query" "call-2"
                                      {:query_id "qid-1"
                                       :checklist "..."
                                       :edits     [{:old_string "1" :new_string "2"}]}
                                      {:structured_output {:query-id      "qid-1"
                                                           :query-content "SELECT 2 FROM orders"
                                                           :query         {:database 1
                                                                           :type     :native
                                                                           :native   {:query "SELECT 2 FROM orders"}}
                                                           :database      1}})]}])
            row  (first rows)]
        (is (= "edit_sql_query" (:tool row)))
        (is (= "SELECT 2 FROM orders" (:sql row)))
        (is (= "sql" (:query_type row)))))))

(deftest replace-sql-query-row-test
  (with-stubbed-tables! []
    (fn []
      (let [rows (analytics.queries/messages->generated-queries
                  [{:id 9
                    :data [(tool-part "replace_sql_query" "call-3"
                                      {:query_id  "qid-1"
                                       :checklist "..."
                                       :new_query "SELECT 3"}
                                      {:structured_output {:query-id      "qid-1"
                                                           :query-content "SELECT 3"
                                                           :query         {:database 1
                                                                           :type     :native
                                                                           :native   {:query "SELECT 3"}}
                                                           :database      1}})]}])
            row  (first rows)]
        (is (= "replace_sql_query" (:tool row)))
        (is (= "SELECT 3" (:sql row)))))))

(deftest construct-notebook-query-legacy-test
  (with-stubbed-tables! []
    (fn []
      (let [legacy-query {:database 7 :type :query :query {:source-table 5}}
            rows         (analytics.queries/messages->generated-queries
                          ;; Notebook tool persists structured output WITHOUT a top-level
                          ;; :database key — the db id lives inside :query.
                          [{:id 10
                            :data [(tool-part "construct_notebook_query" "call-4"
                                              {:reasoning "show me orders"
                                               :query     {:query_type "raw"
                                                           :source     {:table_id 5}}}
                                              {:structured_output {:query-id "qid-2"
                                                                   :query    legacy-query}})]}])
            row          (first rows)]
        (is (= "construct_notebook_query" (:tool row)))
        (is (= "notebook" (:query_type row)))
        (is (nil? (:sql row)))
        (is (= legacy-query (:mbql row)))
        (is (= 7 (:database_id row))
            "database_id should fall back to :query.database for notebook tools")
        (is (= [] (:tables row)))))))

(deftest construct-notebook-query-mbql5-test
  (testing "MBQL 5 is passed through to the frontend as-is, without conversion to legacy MBQL"
    (with-stubbed-tables! []
      (fn []
        (let [mbql5 {:lib/type "mbql/query"
                     :lib/metadata nil
                     :database 1
                     :stages   [{:lib/type     "mbql.stage/mbql"
                                 :source-table 5}]}
              rows  (analytics.queries/messages->generated-queries
                     [{:id 11
                       :data [(tool-part "construct_notebook_query" "call-5"
                                         {:reasoning "test"
                                          :query     {:query_type "raw" :source {:table_id 5}}}
                                         {:structured_output {:query-id "qid-3"
                                                              :query    mbql5}})]}])
              row   (first rows)]
          (is (= "notebook" (:query_type row)))
          (is (= mbql5 (:mbql row)))
          (is (= 1 (:database_id row))))))))

(deftest migrated-rows-use-kebab-structured-output-alias-test
  (testing "rows migrated from v1 carry :structured-output (kebab) inside :output; the extractor reads both"
    (with-stubbed-tables! []
      (fn []
        (let [rows (analytics.queries/messages->generated-queries
                    [{:id 17
                      :data [(tool-part "create_sql_query" "call-kebab"
                                        {:database_id 1 :sql_query "SELECT 1"}
                                        {:output "<result>...</result>"
                                         :structured-output {:query-id      "qid-k"
                                                             :query-content "SELECT 1"
                                                             :database      1}})]}])]
          (is (= ["qid-k"] (map :query_id rows))))))))

;;; ------------------------- filtered-out cases -------------------------

(deftest unresolved-tool-part-is-filtered-test
  (with-stubbed-tables! []
    (fn []
      (let [rows (analytics.queries/messages->generated-queries
                  [{:id 12
                    :data [{:type         "tool-create_sql_query"
                            :toolCallId   "orphan"
                            :state        "input-available"
                            :input        {:database_id 1 :sql_query "SELECT 1"}}]}])]
        (is (= [] rows))))))

(deftest errored-tool-part-is-filtered-test
  (with-stubbed-tables! []
    (fn []
      (let [rows (analytics.queries/messages->generated-queries
                  [{:id 13
                    :data [{:type         "tool-create_sql_query"
                            :toolCallId   "call-err"
                            :state        "output-error"
                            :input        {:database_id 1 :sql_query "SELECT 1"}
                            :errorText    "exploded"}]}])]
        (is (= [] rows))))))

(deftest tool-part-without-structured-is-filtered-test
  (testing "tools that hit a validation error return :output but no structured output"
    (with-stubbed-tables! []
      (fn []
        (let [rows (analytics.queries/messages->generated-queries
                    [{:id 14
                      :data [(tool-part "create_sql_query" "call-bad"
                                        {:database_id 1 :sql_query "SELEKT bad"}
                                        {:output "<result>SQL query construction failed.</result>"})]}])]
          (is (= [] rows)))))))

(deftest non-query-tool-calls-are-skipped-test
  (with-stubbed-tables! ["orders"]
    (fn []
      (let [rows (analytics.queries/messages->generated-queries
                  [{:id 15
                    :data [(tool-part "search" "call-search" {:q "foo"} {:output "rows"})
                           (tool-part "create_sql_query" "call-sql"
                                      {:database_id 1 :sql_query "SELECT 1 FROM orders"}
                                      {:structured_output {:query-id      "qid-x"
                                                           :query-content "SELECT 1 FROM orders"
                                                           :query         {:database 1 :type :native :native {:query "SELECT 1 FROM orders"}}
                                                           :database      1}})]}])]
        (is (= 1 (count rows)))
        (is (= "create_sql_query" (-> rows first :tool)))))))

(deftest non-tool-parts-are-skipped-test
  (testing "text and data parts pass through the extractor without producing rows"
    (with-stubbed-tables! []
      (fn []
        (is (= [] (analytics.queries/messages->generated-queries
                   [{:id 16
                     :data [{:type "text" :text "hi"}
                            {:type "data-navigate_to" :data "/question/1"}]}])))))))

;;; ------------------------- aggregation -------------------------

(deftest flattens-across-messages-preserving-order-test
  (with-stubbed-tables! ["t"]
    (fn []
      (let [sql-part (fn [qid sql]
                       (tool-part "create_sql_query" (str "call-" qid)
                                  {:database_id 1 :sql_query sql}
                                  {:structured_output {:query-id      qid
                                                       :query-content sql
                                                       :query         {:database 1
                                                                       :type     :native
                                                                       :native   {:query sql}}
                                                       :database      1}}))
            rows     (analytics.queries/messages->generated-queries
                      [{:id 100
                        :data [(sql-part "a" "SELECT 1")]}
                       {:id 101
                        :data [(sql-part "b" "SELECT 2")
                               (sql-part "c" "SELECT 3")]}])]
        (is (= ["a" "b" "c"] (map :query_id rows)))
        (is (= [100 101 101] (map :message_id rows)))))))

(deftest empty-and-nil-data-test
  (is (= [] (analytics.queries/messages->generated-queries [])))
  (is (= [] (analytics.queries/messages->generated-queries [{:id 1 :data nil}])))
  (is (= [] (analytics.queries/messages->generated-queries [{:id 1 :data []}]))))

;;; ------------------------- count-tool-invocations -------------------------

(deftest count-tool-invocations-test
  (testing "sums matching tool parts across messages, regardless of how the call resolved"
    (is (= 4 (analytics.queries/count-tool-invocations
              [{:id 1 :data [{:type "tool-search" :toolCallId "a" :state "output-error"
                              :input {} :errorText "boom"}              ; errored still counts
                             {:type "tool-search" :toolCallId "b" :state "input-available"
                              :input {}}]}
               {:id 2 :data [(tool-part "create_sql_query" "c" {} {})    ; ignored tool
                             (tool-part "search" "d" {} {})
                             (tool-part "search" "e" {} {})]}]
              "search"))))
  (testing "returns 0 for inputs that contain no matching tool parts"
    (are [messages] (zero? (analytics.queries/count-tool-invocations messages "search"))
      []
      [{:id 1 :data nil}]
      [{:id 1 :data []}]
      [{:id 1 :data [{:type "text" :text "hi"}]}]
      [{:id 1 :data [(tool-part "create_sql_query" "x" {} {})]}]))
  (testing "accepts a set of tool names; a part counts if its name is in the set"
    (is (= 5 (analytics.queries/count-tool-invocations
              [{:id 1 :data [(tool-part "create_sql_query" "a" {} {})
                             (tool-part "edit_sql_query" "b" {} {})
                             (tool-part "construct_notebook_query" "c" {} {})]}
               {:id 2 :data [(tool-part "replace_sql_query" "d" {} {})
                             (tool-part "create_sql_query" "e" {} {})
                             (tool-part "search" "f" {} {})]}]             ; non-query tool
              metabot.tools/query-generation-tool-names)))))
