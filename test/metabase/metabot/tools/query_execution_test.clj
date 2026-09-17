(ns metabase.metabot.tools.query-execution-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.query-execution :as query-execution]
   [metabase.metabot.tools.sql.create :as sql.create]
   [metabase.test :as mt]))

(def ^:private cols
  [{:name "NAME" :display_name "Name" :base_type :type/Text}
   {:name "TOTAL" :display_name "Total" :base_type :type/Float :effective_type :type/Float}])

(defn- completed [rows & {:keys [truncated?] :or {truncated? false}}]
  {:status :completed :cols cols :rows rows :returned (count rows) :truncated? truncated? :running-time-ms 7})

(deftest ^:parallel narrate-test
  (is (= "Returned all 2 rows matching this query. The row limit of 10 was not reached and nothing was truncated."
         (query-execution/narrate (completed [[1 2] [3 4]]) 10)))
  (is (str/starts-with? (query-execution/narrate (completed [[1 2]] :truncated? true) 1)
                        "Returned 1 rows, reaching the row limit of 1, so more rows may exist."))
  (is (= "The query failed to run: boom" (query-execution/narrate {:status :failed :error "boom"} 10)))
  (is (str/includes? (query-execution/narrate {:status :timeout :error "cancelled"} 10) "did not finish within"))
  (is (= "The query was not run. no values" (query-execution/narrate {:status :skipped :reason "no values"} 10))))

(deftest ^:parallel execution->xml-test
  (let [xml (query-execution/execution->xml (completed [["a|b" 1.5] ["<x>" nil]]) 10)]
    (testing "attributes and narration"
      (is (str/starts-with? xml "<query_execution status=\"completed\" returned=\"2\" truncated=\"false\" limit=\"10\" running_time_ms=\"7\">"))
      (is (str/includes? xml "Returned all 2 rows")))
    (testing "column table carries name, display name and type"
      (is (str/includes? xml "| TOTAL | Total | type/Float |")))
    (testing "rows are wrapped, pipe- and xml-escaped, nil rendered empty"
      (is (str/includes? xml "<rows count=\"2\">"))
      (is (str/includes? xml "| a\\|b | 1.5 |"))
      (is (str/includes? xml "| &lt;x&gt; |  |"))
      (is (str/ends-with? xml "</query_execution>")))
    (testing "nulls over returned rows are counted"
      (is (str/includes? xml "Nulls over the returned rows: TOTAL=1/2."))))
  (testing "an all-null column is flagged"
    (is (str/includes? (query-execution/execution->xml (completed [["a" nil] ["b" nil]]) 10)
                       "TOTAL=2/2 (all null)")))
  (testing "no rows still renders a rows element"
    (is (str/includes? (query-execution/execution->xml (completed []) 10) "<rows count=\"0\">\n(no rows)\n</rows>")))
  (testing "a failure carries only its status and escaped message"
    (is (= "<query_execution status=\"failed\">\nThe query failed to run: a &lt; b\n</query_execution>"
           (query-execution/execution->xml {:status :failed :error "a < b"} 10)))))

(deftest ^:parallel long-cells-are-capped-test
  (let [xml (query-execution/execution->xml (completed [[(apply str (repeat 500 "x")) 1]]) 10)]
    (is (str/includes? xml (str (apply str (repeat 200 "x")) "…")))
    (is (not (str/includes? xml (apply str (repeat 201 "x")))))))

(deftest ^:parallel execution-summary-test
  (is (= {:status "completed" :returned 3 :truncated true}
         (query-execution/execution-summary (completed [[1] [2] [3]] :truncated? true))))
  (is (= {:status "failed"} (query-execution/execution-summary {:status :failed :error "x"}))))

(deftest ^:parallel insert-into-result-block-test
  (is (= "<result>\nx\n<qe/>\n</result>\n<instructions>i</instructions>"
         (query-execution/insert-into-result-block "<result>\nx\n</result>\n<instructions>i</instructions>" "<qe/>")))
  (is (= "plain\n<qe/>" (query-execution/insert-into-result-block "plain" "<qe/>"))))

(deftest ^:parallel strip-large-rows-test
  (let [small "<query_execution>\n<rows count=\"3\">\n| a |\n</rows>\n</query_execution>"
        large "<query_execution>\n<rows count=\"40\">\n| a |\n| b |\n</rows>\n</query_execution>"]
    (is (= small (query-execution/strip-large-rows small 10)))
    (is (= "<query_execution>\n<rows omitted=\"true\" count=\"40\">Rows were dropped from the stored history; call run_query again if you need them.</rows>\n</query_execution>"
           (query-execution/strip-large-rows large 10)))
    (testing "every block in the output is considered"
      (is (= 1 (count (re-seq #"omitted" (query-execution/strip-large-rows (str small "\n" large) 10))))))
    (testing "text without rows is untouched"
      (is (= "no rows here" (query-execution/strip-large-rows "no rows here" 10))))))

(deftest execute-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "an aggregate below the limit is complete"
      (let [{:keys [status returned truncated? rows cols]}
            (query-execution/execute {:database (mt/id)
                                      :type     :query
                                      :query    {:source-table (mt/id :products)
                                                 :aggregation  [[:count]]
                                                 :breakout     [[:field (mt/id :products :category) nil]]}}
                                     10)]
        (is (= :completed status))
        (is (= 4 returned))
        (is (false? truncated?))
        (is (= ["CATEGORY" "count"] (map :name cols)))
        (is (= 4 (count rows)))))
    (testing "the probe row is dropped and truncation observed"
      (let [{:keys [status returned truncated? rows]}
            (query-execution/execute {:database (mt/id) :type :query :query {:source-table (mt/id :products)}} 3)]
        (is (= :completed status))
        (is (= 3 returned (count rows)))
        (is (true? truncated?))))
    (testing "a legacy native query runs and a bad one fails without throwing"
      (let [native (fn [sql] (-> (sql.create/create-sql-query {:database-id (mt/id) :sql sql}) :action-result :query))]
        (is (= :completed (:status (query-execution/execute (native "SELECT COUNT(*) FROM PRODUCTS") 5))))
        (let [{:keys [status error]} (query-execution/execute (native "SELECT * FROM no_such_table") 5)]
          (is (= :failed status))
          (is (str/includes? error "NO_SUCH_TABLE")))))
    (testing "a native query with an unbound variable is skipped rather than run"
      (let [query (-> (sql.create/create-sql-query {:database-id (mt/id) :sql "SELECT * FROM PRODUCTS WHERE ID = {{id}}"})
                      :action-result :query)
            {:keys [status reason]} (query-execution/execute query 5)]
        (is (= :skipped status))
        (is (str/includes? reason "{{id}}"))))))
