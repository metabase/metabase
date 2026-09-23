(ns metabase.metabot.agent.routing-test
  (:require
   [clojure.test :refer :all]
   [metabase.jev.client :as jev]
   [metabase.metabot.agent.routing :as routing]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- answers [probabilities]
  (update-vals probabilities #(hash-map :type "noul" :noul %)))

(deftest ^:parallel notebook-routing-test
  (let [result (answers {:intent-find-or-create-query 0.9
                         :needs-calculation          0.8
                         :needs-multiple-sources     0.7})]
    (is (= #{:read-resource :construct-notebook-query-core
             :construct-notebook-query-operators :construct-notebook-query-advanced}
           (routing/skills-to-load result {})))
    (is (= #{"read_resource" "search" "retrieve_library_entities" "create_chart" "construct_notebook_query"}
           (routing/tools-to-call result {})))))

(deftest ^:parallel sql-routing-test
  (let [facts {:available-tools #{"create_sql_query" "edit_sql_query" "replace_sql_query"}}]
    (doseq [[probabilities tool skill]
            [[{:intent-find-or-create-query 0.9 :mentions-sql 0.9} "create_sql_query" :create-sql-query]
             [{:intent-modify-previous-query 0.9 :mentions-sql 0.9} "edit_sql_query" :edit-sql-query]
             [{:intent-modify-previous-query 0.9 :mentions-sql 0.9 :rewrites-most-of-query 0.9}
              "replace_sql_query" :replace-sql-query]]]
      (is (contains? (routing/tools-to-call (answers probabilities) facts) tool))
      (is (contains? (routing/skills-to-load (answers probabilities) facts) skill)))
    (testing "SQL requests cannot add tools unavailable in the profile"
      (is (contains? (routing/tools-to-call (answers {:intent-find-or-create-query 0.9 :mentions-sql 0.9}) {})
                     "construct_notebook_query")))))

(deftest ^:parallel latest-prompt-test
  (is (= "show orders\nby month"
         (routing/latest-prompt [{:role :user :content "hello"}
                                 {:role :assistant :content "Hi"}
                                 {:role :user :content [{:type :text :text "show orders"}
                                                        {:type :text :text "by month"}]}]))))

(deftest route-with-existing-jev-client-test
  (let [captured (atom nil)]
    (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                                jev/ask (fn [state questions opts]
                                          (reset! captured {:state state :questions questions :opts opts})
                                          {:ok true :answers (answers {:intent-find-or-create-query 0.9})})]
      (is (=? {:intents [:intent-find-or-create-query] :escalate? false}
              (routing/route [{:role :user :content "show orders"}] {} ["search" "construct_notebook_query"])))
      (is (= "show orders" (get-in @captured [:state :prompt])))
      (is (= {:timeout-ms 5000} (:opts @captured)))
      (is (every? #(= "noul" (:type %)) (vals (:questions @captured)))))))

(deftest route-fallback-test
  (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)]
    (testing "Jev HTTP errors leave the agent unrouted"
      (mt/with-dynamic-fn-redefs [jev/ask (constantly {:ok false :status 503 :error "unavailable"})]
        (is (nil? (routing/route [{:role :user :content "orders"}] {} ["search"])))))
    (testing "uncertain, reasoning, and unavailable-tool intents keep the full tool set"
      (doseq [probabilities [{} {:intent-needs-reasoning 0.9} {:intent-analyze-results 0.9}]]
        (mt/with-dynamic-fn-redefs [jev/ask (constantly {:ok true :answers (answers probabilities)})]
          (is (:escalate? (routing/route [{:role :user :content "orders"}] {} ["search" "read_resource"])))))))
  (mt/with-dynamic-fn-redefs [jev/ask (fn [& _] (throw (ex-info "Jev should not be called" {})))]
    (testing "no token"
      (mt/with-dynamic-fn-redefs [jev/key-present? (constantly false)]
        (is (nil? (routing/route [{:role :user :content "orders"}] {} ["search"])))))
    (testing "no user prompt"
      (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)]
        (is (nil? (routing/route [] {} ["search"])))))))

(deftest ^:parallel limit-tools-preserves-permissions-test
  (is (= {"read_resource" :read}
         (routing/limit-tools {"read_resource" :read "search" :search}
                              #{"read_resource" "create_sql_query"}
                              #{:create-sql-query}
                              {}))))

(deftest explore-table-routing-test
  (let [available ["search" "read_resource" "construct_notebook_query" "create_chart" "explore_table"]]
    (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                                jev/ask          (constantly {:ok true
                                                              :answers (answers {:intent-explore-table 0.9
                                                                                 :answer-is-the-chart  0.9
                                                                                 :single-chart-suffices 0.9})})]
      (is (=? {:intents              [:intent-explore-table]
               :tools                #{"explore_table" "search" "retrieve_library_entities" "read_resource"
                                       "create_chart" "construct_notebook_query"}
               :skills               #{:construct-notebook-query-core :construct-notebook-query-operators
                                       :construct-notebook-query-advanced}
               :escalate?            false
               :chart-is-the-answer? false}
              (routing/route [{:role :user :content "[Orders](metabase://table/5)"}] {} available))))
    (testing "an open-ended invitation to explore stays routed"
      (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                                  jev/ask          (constantly {:ok true
                                                                :answers (answers {:intent-explore-table   0.95
                                                                                   :intent-needs-reasoning 0.38})})]
        (is (false? (:escalate? (routing/route [{:role :user :content "what's interesting in [Orders](metabase://table/5)?"}]
                                               {} available))))))))
