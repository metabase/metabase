(ns metabase.metabot.tools.run-query-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.run-query :as run-query]
   [metabase.metabot.tools.shared :as shared]
   [metabase.query-processor.core :as qp]
   [metabase.test :as mt]))

(defn- run-tool
  "Call `run_query` as rasta with `queries` in conversation state."
  [queries args]
  (mt/with-current-user (mt/user->id :rasta)
    (binding [shared/*memory-atom* (atom {:state {:queries queries}})]
      (run-query/run-query-tool args))))

(defn- venues-by-id
  []
  (let [mp (mt/metadata-provider)]
    (as-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) q
      (lib/order-by q (lib.metadata/field mp (mt/id :venues :id))))))

(defn- data-lines
  "The table lines between the data boundary markers of a `run_query` output."
  [output]
  (->> (str/split-lines output)
       (drop-while #(not (str/starts-with? % "<data ")))
       rest
       (take-while #(not (str/starts-with? % "</data ")))))

(deftest run-query-test
  (testing "a stored MBQL 5 query returns its first rows as a table"
    (let [{:keys [output structured-output]} (run-tool {"q1" (venues-by-id)} {:query_id "q1" :row_limit 2})]
      (is (=? {:query-id "q1" :returned 2 :truncated? true} structured-output))
      (is (str/includes? output "<query_results query_id=\"q1\" returned=\"2\" truncated=\"true\">"))
      (is (=? [#"\| ID \| Name \| .*"
               #"\| --- \| .*"
               #"\| 1 \| Red Medicine \| .*"
               #"\| 2 \| Stout Burgers & Beers \| .*"]
              (data-lines output)))
      (is (str/includes? output "Only the first 2 rows are shown"))))
  (testing "a result that fits is not reported as truncated"
    (let [mp    (mt/metadata-provider)
          query (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/count))
          {:keys [output structured-output]} (run-tool {"q1" query} {:query_id "q1"})]
      (is (=? {:returned 1 :truncated? false} structured-output))
      (is (= ["| Count |" "| --- |" "| 100 |"] (data-lines output)))
      (is (not (str/includes? output "Only the first")))))
  (testing "an MBQL 4 query from the user's viewing context runs too"
    (let [{:keys [structured-output]} (run-tool {"ctx" (mt/mbql-query venues {:limit 3})} {:query_id "ctx"})]
      (is (=? {:returned 3 :truncated? false} structured-output)))))

(deftest run-query-records-a-metabot-run-test
  (let [info (atom nil)]
    (mt/with-dynamic-fn-redefs [qp/process-query (fn [query]
                                                   (reset! info (:info query))
                                                   {:status :completed :data {:cols [] :rows []}})]
      (run-tool {"q1" (venues-by-id)} {:query_id "q1"}))
    (is (=? {:context :metabot :executed-by (mt/user->id :rasta)} @info))))

(deftest run-query-refusals-test
  (testing "an unknown id lists the ids the model can use"
    (is (= {:output "No query with id nope. Known query ids: [q1]."}
           (run-tool {"q1" (venues-by-id)} {:query_id "nope"}))))
  (testing "a SQL query is refused"
    (is (=? {:output #"run_query only runs notebook queries.*"}
            (run-tool {"q1" (mt/native-query {:query "SELECT 1"})} {:query_id "q1"}))))
  (testing "a user without data access gets a failure, not rows"
    (mt/with-no-data-perms-for-all-users!
      (let [result (run-tool {"q1" (venues-by-id)} {:query_id "q1"})]
        (is (=? {:output #"Query failed: .*"} result))
        (is (nil? (:structured-output result)))))))

(deftest result-output-bounds-test
  (let [output (fn [cols rows]
                 (#'run-query/result-output "q1" {:cols cols :rows rows :truncated? false}))]
    (testing "cell text cannot break the table"
      (is (= ["| A\\|B |" "| --- |" "| x\\|y z |"]
             (data-lines (output [{:display_name "A|B"}] [["x|y\nz"]])))))
    (testing "rows past the character budget are dropped and reported as truncated"
      (let [out (output [{:display_name "A"}] (repeat 100 [(apply str (repeat 300 "x"))]))]
        (is (str/includes? out "truncated=\"true\""))
        (is (< (count out) 11000))))
    (testing "columns past the cap are dropped and reported"
      (let [cols (for [i (range 40)] {:display_name (str "c" i)})
            out  (output cols [(vec (range 40))])]
        (is (str/includes? out "Only the first 30 of 40 columns are shown."))))))
