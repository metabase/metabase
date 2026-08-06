(ns metabase.metabot.agent.context-planner-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.agent.context-planner :as context-planner]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]))

(defn- tool-step
  [id function output]
  [{:type :tool-input :id id :function function :arguments {:value id}}
   {:type :tool-output :id id :result output}])

(defn- tool-ids
  [part-type parts]
  (frequencies (keep #(when (= part-type (:type %)) (:id %)) parts)))

(deftest ^:parallel estimate-tokens-is-deterministic-test
  (testing "map insertion order does not change the planning estimate"
    (is (= (context-planner/estimate-tokens [{:a 1 :b "two"}])
           (context-planner/estimate-tokens [(array-map :b "two" :a 1)])))))

(deftest ^:parallel within-budget-is-an-identity-test
  (let [parts  [{:role :user :content "Show me orders"}
                {:type :text :text "I will inspect them."}]
        budget (context-planner/estimate-tokens parts)
        plan   (context-planner/plan-message-history parts {:budget budget})]
    (is (= parts (:parts plan)))
    (is (= 0 (get-in plan [:stats :compacted-unit-count])))
    (is (= 0 (get-in plan [:stats :estimated-token-savings])))
    (is (true? (get-in plan [:stats :budget-satisfied?])))))

(deftest ^:parallel compacts-only-older-safe-units-test
  (let [old-user    {:role :user :content (str "Earlier request: " (apply str (repeat 800 "x")))}
        old-call    {:type :tool-input
                     :id "old-call"
                     :function "search"
                     :arguments {:query "orders"}}
        old-result  {:type :tool-output
                     :id "old-call"
                     :result {:output (str (apply str (repeat 800 "row "))
                                           " [Sales source](metabase://question/44)")
                              :structured-output {:query-id "q-42"
                                                  :card_id 17
                                                  :database 9}}}
        current     {:role :user :content "Use q-42 to answer my current question"}
        recent-one  (tool-step "recent-1" "read_resource" {:output "schema payload"})
        recent-two  (tool-step "recent-2" "create_chart" {:output "chart payload"})
        steps       [{:parts [{:type :text :text "an older step"} old-call old-result]}
                     {:parts recent-one}
                     {:parts recent-two}]
        parts       (vec (concat [old-user {:type :text :text "Searching."} old-call old-result current]
                                 recent-one
                                 recent-two))
        snapshot    {:input-messages [old-user current]
                     :steps-taken steps
                     :state {:queries {"q-42" {:database 9}}}}
        memory      snapshot
        plan        (context-planner/plan-message-history parts {:budget 0 :steps steps})
        planned     (:parts plan)
        records     (->> planned (keep :content) (filter #(str/includes? % "Prior context record")))]
    (testing "the planner is pure and leaves the complete in-memory transcript alone"
      (is (= snapshot memory))
      (is (= steps (:steps-taken memory))))
    (testing "current intent and the two newest agent steps remain byte-for-byte equivalent"
      (is (some #(= current %) planned))
      (is (= (vec (concat recent-one recent-two)) (vec (take-last 4 planned)))))
    (testing "an old resolved call/result is removed atomically"
      (is (= (tool-ids :tool-input planned) (tool-ids :tool-output planned)))
      (is (not (contains? (tool-ids :tool-input planned) "old-call")))
      (is (not (contains? (tool-ids :tool-output planned) "old-call"))))
    (testing "exact follow-up identifiers and citations survive in a deterministic text record"
      (let [record (str/join "\n" records)]
        (is (str/includes? record "query-id=\"q-42\""))
        (is (str/includes? record "card_id=17"))
        (is (str/includes? record "database=9"))
        (is (str/includes? record "metabase://question/44"))
        (is (str/includes? record "Tools: search."))))
    (testing "the estimated reduction is measurable"
      (is (pos? (get-in plan [:stats :compacted-unit-count])))
      (is (pos? (get-in plan [:stats :estimated-token-savings])))
      (is (< (get-in plan [:stats :estimated-tokens-after])
             (get-in plan [:stats :estimated-tokens-before]))))
    (testing "every provider adapter can serialize the planned ordinary-text history"
      (is (vector? (claude/parts->claude-messages planned)))
      (is (vector? (openai/parts->openai-input planned)))
      (is (vector? (:messages (openrouter/openrouter-request-body
                               {:model "openai/gpt-5.4" :input planned :tools []})))))))

(deftest ^:parallel structured-citation-references-survive-compaction-test
  (let [parts   [{:type :tool-input :id "citation-call" :function "search" :arguments {}}
                 {:type :tool-output
                  :id "citation-call"
                  :result {:output (apply str (repeat 500 "payload "))
                           :structured-output {:citations [{:id "citation-1"
                                                            :ref "warehouse-doc"}]
                                               :row {:id "generic-row-id"}}}}
                 {:role :user :content "Use the cited source now"}]
        planned (:parts (context-planner/plan-message-history parts {:budget 0}))
        text    (str/join "\n" (keep :content planned))]
    (is (str/includes? text "citation.id=\"citation-1\""))
    (is (str/includes? text "citation.ref=\"warehouse-doc\""))
    (is (not (str/includes? text "generic-row-id")))))

(deftest ^:parallel recent-reasoning-parts-remain-verbatim-test
  (let [reasoning {:type :reasoning
                   :id "reasoning-1"
                   :text (apply str (repeat 500 "thought "))}
        parts     [{:role :user :content "Current request"} reasoning]
        plan      (context-planner/plan-message-history parts {:budget 0 :steps [{:parts [reasoning]}]})]
    (is (= reasoning (last (:parts plan))))
    (is (= parts (:parts plan)))))

(deftest ^:parallel required-units-win-over-an-impossibly-small-budget-test
  (let [parts [{:role :system :content "Historical system constraint"}
               {:type :tool-input :id "pending" :function "search" :arguments {:query "x"}}
               {:type :text :text "The previous attempt had an error."}
               {:type :tool-input :id "failed" :function "read_resource" :arguments {}}
               {:type :tool-output :id "failed" :error {:message "Permission denied for database 12"}}
               {:role :user :content "Scope: read-only access to database 12"}
               {:type :tool-output :id "orphan" :result {:output "orphaned result"}}
               {:role :user :content "This is the current intent"}]
        plan  (context-planner/plan-message-history parts {:budget 1})]
    (is (= parts (:parts plan))
        "The planner must not satisfy a budget by dropping required protocol or policy facts")
    (is (false? (get-in plan [:stats :budget-satisfied?])))
    (is (= 0 (get-in plan [:stats :compacted-unit-count])))
    (is (= (tool-ids :tool-input parts) (tool-ids :tool-input (:parts plan))))
    (is (= (tool-ids :tool-output parts) (tool-ids :tool-output (:parts plan))))))
