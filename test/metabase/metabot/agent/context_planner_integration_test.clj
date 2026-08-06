(ns metabase.metabot.agent.context-planner-integration-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.agent.context-planner :as context-planner]
   [metabase.metabot.agent.core :as agent]
   [metabase.metabot.agent.messages :as messages]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.self :as self]
   [metabase.metabot.test-util :as mut]
   [metabase.test :as mt]))

(def ^:private test-provider "openrouter/anthropic/claude-haiku-4-5")

(deftest profile-has-an-explicit-conservative-default-test
  (is (= context-planner/default-context-token-budget
         (:context-token-budget (profiles/get-profile :internal)))))

(deftest call-llm-plans-a-copy-and-leaves-full-memory-unchanged-test
  (mt/with-temporary-setting-values [llm-metabot-provider test-provider]
    (let [input-messages [{:role :user
                           :content (str "Old request " (apply str (repeat 1000 "history ")))}
                          {:role :assistant
                           :content "I searched the old request."
                           :tool_calls [{:id "old-search"
                                         :name "search"
                                         :arguments {:query "orders"}}]}
                          {:role :tool
                           :tool_call_id "old-search"
                           :content (str (apply str (repeat 1000 "result "))
                                         " query-id=q-7 database=2")}
                          {:role :user :content "Keep this current intent exactly"}]
          agent-state    (#'agent/init-agent {:messages input-messages
                                              :state {}
                                              :profile-id :internal
                                              :context {}})
          memory-atom    (:memory-atom agent-state)
          memory-before  @memory-atom
          context        (:context agent-state)
          profile        (assoc (:profile agent-state) :context-token-budget 100)
          tools          (:tools agent-state)
          raw-parts      (messages/build-message-history context memory-before)
          captured       (atom nil)]
      (mt/with-dynamic-fn-redefs
        [self/call-llm (fn [model system parts passed-tools tracking-opts llm-opts]
                         (reset! captured {:model model
                                           :system system
                                           :parts parts
                                           :tools passed-tools
                                           :tracking-opts tracking-opts
                                           :llm-opts llm-opts})
                         (mut/mock-llm-response [{:type :text :text "done"}]))]
        (into [] (#'agent/call-llm memory-before
                                   context
                                   profile
                                   tools
                                   1
                                   (:tracking-opts agent-state)
                                   (atom {}))))
      (testing "planning changes only the provider-bound copy"
        (is (= memory-before @memory-atom))
        (is (= input-messages (:input-messages @memory-atom)))
        (is (< (context-planner/estimate-tokens (:parts @captured))
               (context-planner/estimate-tokens raw-parts))))
      (testing "current intent, system instructions, and tool schemas still cross the same boundary"
        (is (some #(and (= :user (:role %))
                        (str/includes? (:content %) "Keep this current intent exactly"))
                  (:parts @captured)))
        (let [planned-text (str/join "\n" (keep :content (:parts @captured)))]
          (is (str/includes? planned-text "query-id=q-7"))
          (is (str/includes? planned-text "database=2")))
        (is (not (str/blank? (:system @captured))))
        (is (identical? tools (:tools @captured)))
        (is (= (:model profile) (:model @captured)))))))
