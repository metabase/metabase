(ns metabase.metabot.tools.alert-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.tools.alert :as tools.alert]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- orders-by-month-query
  []
  (let [mp      (lib-be/application-database-metadata-provider (mt/id))
        orders  (lib.metadata/table mp (mt/id :orders))
        created (lib.metadata/field mp (mt/id :orders :created_at))]
    (-> (lib/query mp orders)
        (lib/aggregate (lib/count))
        (lib/breakout (lib/with-temporal-bucket created :month)))))

(defn- with-queries-in-memory
  [queries thunk]
  (binding [shared/*memory-atom* (atom (reduce-kv memory/set-query (memory/initialize [] nil) queries))]
    (thunk)))

(deftest run-query-tool-test
  (mt/with-test-user :crowberto
    (testing "runs a query the agent built earlier and shows it the results, stats first"
      (let [{:keys [output]} (with-queries-in-memory {"q1" (orders-by-month-query)}
                               #(tools.alert/run-query-tool {:query_id "q1"}))]
        (is (str/includes? output "# Chart Analysis"))
        (is (str/includes? output "## Rows"))
        (is (str/includes? output "Created At: Month\tCount"))))
    (testing "row_limit caps how many rows are fetched"
      (let [{:keys [output]} (with-queries-in-memory {"q1" (orders-by-month-query)}
                               #(tools.alert/run-query-tool {:query_id "q1" :row_limit 3}))
            rows (->> (str/split-lines (second (str/split output #"## Rows\n")))
                      (drop 1))]
        (is (= 3 (count rows)))))
    (testing "an unknown query id is an error the model can recover from, not a thrown exception"
      (let [{:keys [output structured-output]} (with-queries-in-memory {}
                                                 #(tools.alert/run-query-tool {:query_id "nope"}))]
        (is (nil? structured-output))
        (is (str/includes? output "not found"))))))

(deftest submit-tools-test
  (testing "submitting the summary ends the turn with it as structured output"
    (is (= {:summary "Revenue is up **12%**."}
           (:structured-output (tools.alert/submit-alert-summary-tool {:summary "Revenue is up **12%**."})))))
  (testing "the summary can carry a title"
    (is (= {:summary "Up." :title "Revenue up 12%"}
           (:structured-output (tools.alert/submit-alert-summary-tool {:summary "Up." :title "Revenue up 12%"})))))
  (testing "submitting a send decision carries all three fields"
    (is (= {:reason "It fell." :verdict "deliver" :explanation "Orders fell 40%."}
           (:structured-output (tools.alert/submit-send-decision-tool
                                {:reason "It fell." :verdict "deliver" :explanation "Orders fell 40%."}))))))

(deftest alert-system-context-test
  (testing "the caller's task instructions are passed to the prompt template"
    (is (= {:alert_instructions "Decide whether to send."}
           (tools.alert/alert-system-context {:alert_instructions "Decide whether to send."})))))

(deftest alert-profile-test
  (let [{:keys [tools terminal-tools skills? max-iterations]} (profiles/get-profile :alert)
        tool-names (set (map #(:tool-name (meta %)) tools))]
    (testing "the model can find other content, build queries on it, and run them"
      (is (every? tool-names ["search" "read_resource" "construct_notebook_query" "run_query"])))
    (testing "the turn ends when the model submits its answer for either task"
      (is (= #{"submit_alert_summary" "submit_send_decision"} terminal-tools)))
    (is (false? skills?))
    (is (= 8 max-iterations))))
