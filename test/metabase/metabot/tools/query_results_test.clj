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
        ;; the value column is linked with an explicit 0-based column index
        (is (re-find #"\[Ada\]\(metabase://data-point/[0-9a-f-]{36}/0\)" output))
        (is (re-find #"metabase://data-point/[0-9a-f-]{36}" output))
        ;; the LLM is told how to target any other column in the row by reusing the row id
        (is (str/includes? output "metabase://data-point/{id}/{column_index}"))
        (is (str/includes? output "Columns (0-based): 0=Name"))
        (is (str/includes? output "choose natural link text"))
        (is (not (str/includes? output "<data_point_links")))
        (is (not (str/includes? output "Markdown Mention")))
        (is (= ["name"]
               (-> result :structured-output :data-points vals first :columns)))
        (is (= ["Ada"]
               (-> result :structured-output :data-points vals first :row)))
        ;; each data point is tagged with its source query so the chat can
        ;; re-render it on demand when its chart isn't on screen
        (let [source (-> result :structured-output :data-points vals first :source)]
          (is (= "query" (:type source)))
          (is (= "q1" (:id source)))
          (is (str/starts-with? (:question_url source) "/question#")))
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

(deftest format-untruncated-execution-result-source-test
  (testing "silent execution tags data points with a renderable source from the query"
    (let [summary {:status         :completed
                   :result_columns [{:name "name" :display_name "Name" :type :type/Text}]
                   :rows           [["Ada"]]}
          target  (-> (query-results/format-untruncated-execution-result
                       summary {:database 1 :type :query})
                      :structured-output :data-points vals first)]
      (is (str/starts-with? (-> target :source :question_url) "/question#"))
      ;; silent queries have no chart/query reference, only a renderable url
      (is (nil? (-> target :source :type))))
    (testing "without a query there is no source"
      (let [summary {:status         :completed
                     :result_columns [{:name "name" :display_name "Name" :type :type/Text}]
                     :rows           [["Ada"]]}
            target  (-> (query-results/format-untruncated-execution-result summary)
                        :structured-output :data-points vals first)]
        (is (nil? (:source target)))))))

(deftest representative-indices-test
  (testing "returns every index when at or below the target"
    (is (= [0 1 2] (#'query-results/representative-indices [1.0 2.0 3.0] 10))))

  (testing "down-samples while always keeping first, last, and ascending order"
    (let [values (mapv double (range 500))
          idxs   (#'query-results/representative-indices values 20)]
      (is (<= (count idxs) 20))
      (is (contains? (set idxs) 0))
      (is (contains? (set idxs) 499))
      (is (= idxs (sort idxs)))))

  (testing "captures a statistical outlier spike"
    (let [values (assoc (mapv double (range 500)) 137 1.0e9)
          idxs   (#'query-results/representative-indices values 20)]
      (is (contains? (set idxs) 137))))

  (testing "still samples when the value column is non-numeric"
    (let [idxs (#'query-results/representative-indices (vec (repeat 500 nil)) 20)]
      (is (<= (count idxs) 20))
      (is (contains? (set idxs) 0))
      (is (contains? (set idxs) 499)))))

(deftest sample-summary-test
  (testing "keeps results at or below the budget untouched"
    (let [summary {:status         :completed
                   :row_count      100
                   :result_columns [{:name "v"}]
                   :rows           (mapv vector (range 100))}]
      (is (= summary (#'query-results/sample-summary summary)))
      (is (not (:sampled? (#'query-results/sample-summary summary))))))

  (testing "down-samples larger results to a representative subset of real rows"
    (let [n       1000
          ;; col0 = index, col1 = value with a spike outlier at row 500
          rows    (mapv (fn [i] [i (if (= i 500) 999999 i)]) (range n))
          summary {:status         :completed
                   :row_count      n
                   :result_columns [{:name "i"} {:name "v"}]
                   :rows           rows}
          sampled (#'query-results/sample-summary summary)
          kept    (:rows sampled)]
      (is (true? (:sampled? sampled)))
      (is (= n (:total-row-count sampled)))
      (is (<= (count kept) 100))
      (is (= (first rows) (first kept)) "first row is kept")
      (is (= (last rows) (last kept)) "last row is kept")
      (is (some #(= 999999 (second %)) kept) "the outlier/max spike is kept")
      (is (= (map first kept) (sort (map first kept))) "original order is preserved")
      ;; every kept row is a real row from the original result
      (is (every? (set rows) kept)))))

(deftest execution-summary-xml-test
  (testing "oversized results are surfaced as a representative sample, not omitted"
    (let [summary {:status          :completed
                   :row_count       5000
                   :sampled?        true
                   :total-row-count 5000
                   :result_columns  [{:name "day" :display_name "Day" :type :type/Date}
                                     {:name "v" :display_name "V" :type :type/Integer}]
                   :rows            [["2024-01-01" 5] ["2024-06-01" 999]]}
          links   (#'query-results/data-point-link-rows summary)
          xml     (#'query-results/execution-summary->xml
                   summary links {:type "query" :id "q1" :url "metabase://query/q1"})]
      (is (str/includes? xml "sampled=\"true\""))
      (is (str/includes? xml "total_row_count=\"5000\""))
      (is (not (str/includes? xml "results_omitted")))
      (is (str/includes? xml "representative sample"))
      (is (str/includes? xml "reference_type=\"query\" reference_id=\"q1\""))
      (is (str/includes? xml "[query q1](metabase://query/q1)"))
      (is (str/includes? xml "<query_results>"))
      (is (re-find #"metabase://data-point/[0-9a-f-]{36}" xml))
      ;; value column (index 1 of two columns) is linked with its explicit index
      (is (re-find #"metabase://data-point/[0-9a-f-]{36}/1" xml))
      ;; the column-index legend lets the LLM target the other (Day) column
      (is (str/includes? xml "Columns (0-based): 0=Day, 1=V"))))

  (testing "small results show all rows"
    (let [summary {:status         :completed
                   :row_count      2
                   :result_columns [{:name "v" :display_name "V" :type :type/Integer}]
                   :rows           [[1] [2]]}
          links   (#'query-results/data-point-link-rows summary)
          xml     (#'query-results/execution-summary->xml summary links nil)]
      (is (not (str/includes? xml "sampled=\"true\"")))
      (is (str/includes? xml "Showing all 2 rows"))
      (is (str/includes? xml "<query_results>")))))
