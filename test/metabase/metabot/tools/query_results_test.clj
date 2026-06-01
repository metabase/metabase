(ns metabase.metabot.tools.query-results-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.query-results :as query-results]))

(deftest enrich-tool-result-test
  (testing "appends generated query execution results to tool output"
    (with-redefs [query-results/execute-query (fn [_query]
                                                {:status :completed
                                                 :result_columns [{:name "name" :display_name "Name" :type :type/Text}]
                                                 :rows [["Ada"]]})]
      (let [result (query-results/enrich-tool-result
                    {:output "<result>\nQuery created.\n</result>"
                     :structured-output {:query-id "q1"
                                         :query {:database 1}}}
                    nil)
            output (:output result)]
        (is (str/includes? output "<query_execution status=\"completed\""))
        (is (str/includes? output "reference_type=\"query\" reference_id=\"q1\""))
        (is (str/includes? output "[query q1](metabase://query/q1)"))
        (is (re-find #"\[Ada\]\(metabase://data-point/[0-9a-f-]{36}\)" output))
        (is (re-find #"metabase://data-point/[0-9a-f-]{36}" output))
        (is (str/includes? output "choose natural link text"))
        (is (not (str/includes? output "<data_point_links")))
        (is (not (str/includes? output "Markdown Mention")))
        (is (= ["name"]
               (-> result :structured-output :data-points vals first :columns)))
        (is (= ["Ada"]
               (-> result :structured-output :data-points vals first :row)))
        (is (< (str/index-of output "<query_execution")
               (str/index-of output "</result>"))))))

  (testing "resolves chart-backed queries from memory"
    (with-redefs [query-results/execute-query (fn [query]
                                                (is (= {:database 1 :type :query} query))
                                                {:status :completed
                                                 :result_columns []
                                                 :rows []})]
      (let [result (query-results/enrich-tool-result
                    {:output "<result>\nChart created.\n</result>"
                     :structured-output {:chart-id "chart-1"}}
                    {:state {:charts {"chart-1" {:queries [{:database 1 :type :query}]}}}})]
        (is (str/includes? (:output result) "<query_execution status=\"completed\""))))))

(deftest query-result-summary-row-limit-test
  (testing "allows up to 100 rows"
    (let [summary (#'query-results/query-result-summary
                   {:status :completed
                    :row_count 100
                    :data {:cols [{:name "name"}]
                           :rows (mapv vector (range 100))}})]
      (is (= :completed (:status summary)))
      (is (= 100 (count (:rows summary))))))

  (testing "omits previews when more than 100 rows are returned"
    (let [summary (#'query-results/query-result-summary
                   {:status :completed
                    :data {:cols [{:name "name"}]
                           :rows (mapv vector (range 101))}})]
      (is (= :completed (:status summary)))
      (is (empty? (:rows summary)))
      (is (nil? (:result_columns summary)))
      (is (true? (:truncated? summary)))))

  (testing "omits previews when row_count reports more than 100 rows"
    (let [summary (#'query-results/query-result-summary
                   {:status :completed
                    :row_count 101
                    :data {:cols [{:name "name"}]
                           :rows (mapv vector (range 100))}})]
      (is (= :completed (:status summary)))
      (is (empty? (:rows summary)))
      (is (nil? (:result_columns summary)))
      (is (true? (:truncated? summary))))))

(deftest untruncated-query-result-summary-test
  (testing "keeps all rows for silent query inspection"
    (let [summary (#'query-results/untruncated-query-result-summary
                   {:status :completed
                    :row_count 101
                    :data {:cols [{:name "name"}]
                           :rows (mapv vector (range 101))}})]
      (is (= :completed (:status summary)))
      (is (= 101 (count (:rows summary))))
      (is (= [{:name "name" :display_name "name" :type nil :description nil}]
             (:result_columns summary)))
      (is (not (:truncated? summary))))))

(deftest execution-summary-xml-test
  (testing "oversized results are omitted and include a reusable reference"
    (let [xml (#'query-results/execution-summary->xml
               {:status :completed
                :row_count 101
                :rows []
                :truncated? true}
               nil
               {:type "query" :id "q1" :url "metabase://query/q1"})]
      (is (str/includes? xml "truncated=\"true\""))
      (is (str/includes? xml "results_omitted=\"true\""))
      (is (str/includes? xml "reference_type=\"query\" reference_id=\"q1\""))
      (is (str/includes?
           xml
           "The generated query returned more than 100 rows, so the results are omitted"))
      (is (str/includes? xml "Your next step MUST be a tool call"))
      (is (str/includes? xml "Do not produce a final answer until that tool call returns"))
      (is (str/includes? xml "[query q1](metabase://query/q1)"))
      (is (not (str/includes? xml "<query_results>"))))))
