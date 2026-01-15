(ns metabase-enterprise.metabot-v3.agent.messages-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.messages :as messages]))

(deftest build-message-history-test
  (testing "builds message history from input messages only"
    (let [input-messages [{:role :user :content "Hello"}]
          mem (memory/initialize input-messages {})
          history (messages/build-message-history mem)]
      (is (= 1 (count history)))
      (is (= "user" (:role (first history))))
      (is (= "Hello" (:content (first history))))))

  (testing "includes assistant messages from input"
    (let [input-messages [{:role :user :content "Hello"}
                          {:role :assistant :content "Hi there"}]
          mem (memory/initialize input-messages {})
          history (messages/build-message-history mem)]
      (is (= 2 (count history)))
      (is (= "user" (:role (first history))))
      (is (= "assistant" (:role (second history))))))

  (testing "includes steps from memory"
    (let [input-messages [{:role :user :content "Hello"}]
          parts [{:type :text :text "Response text"}]
          mem (-> (memory/initialize input-messages {})
                  (memory/add-step parts))
          history (messages/build-message-history mem)]
      (is (= 2 (count history)))
      (is (= "user" (:role (first history))))
      (is (= "assistant" (:role (second history))))
      (is (= "Response text" (:content (second history))))))

  (testing "includes tool calls from steps"
    (let [input-messages [{:role :user :content "Search for revenue"}]
          parts [{:type :tool-input
                  :id "tool_1"
                  :function "search"
                  :arguments {:query "revenue"}}]
          mem (-> (memory/initialize input-messages {})
                  (memory/add-step parts))
          history (messages/build-message-history mem)]
      (is (= 2 (count history)))
      (is (= "user" (:role (first history))))
      (is (= "assistant" (:role (second history))))
      (is (some? (:tool_calls (second history))))
      (is (= "tool_1" (-> (second history) :tool_calls first :id)))
      (is (= "search" (-> (second history) :tool_calls first :name)))))

  (testing "includes tool results from steps"
    (let [input-messages [{:role :user :content "Search"}]
          tool-input [{:type :tool-input
                       :id "tool_1"
                       :function "search"
                       :arguments {:query "test"}}]
          tool-output [{:type :tool-output
                        :id "tool_1"
                        :result {:data []}}]
          mem (-> (memory/initialize input-messages {})
                  (memory/add-step tool-input)
                  (memory/add-step tool-output))
          history (messages/build-message-history mem)]
      (is (= 3 (count history)))
      (is (= "user" (:role (first history))))
      (is (= "assistant" (:role (second history))))
      (is (= "user" (:role (nth history 2))))
      (is (some? (:content (nth history 2))))
      (is (vector? (:content (nth history 2))))
      (is (= "tool_result" (-> (nth history 2) :content first :type)))))

  (testing "handles multiple iterations"
    (let [input-messages [{:role :user :content "Hello"}]
          iteration1 [{:type :tool-input :id "t1" :function "search" :arguments {}}]
          iteration2 [{:type :tool-output :id "t1" :result {:data []}}]
          iteration3 [{:type :text :text "Found results"}]
          mem (-> (memory/initialize input-messages {})
                  (memory/add-step iteration1)
                  (memory/add-step iteration2)
                  (memory/add-step iteration3))
          history (messages/build-message-history mem)]
      (is (= 4 (count history)))
      (is (= "user" (:role (first history))))
      (is (= "assistant" (:role (second history))))
      (is (= "user" (:role (nth history 2))))
      (is (= "assistant" (:role (nth history 3)))))))

(deftest format-message-test
  (testing "formats user message"
    (let [msg {:role :user :content "Hello"}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "user" (:role (first formatted))))
      (is (= "Hello" (:content (first formatted))))))

  (testing "formats assistant message with content"
    (let [msg {:role :assistant :content "Response"}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "assistant" (:role (first formatted))))
      (is (= "Response" (:content (first formatted))))))

  (testing "formats assistant message with tool calls"
    (let [msg {:role :assistant
               :tool_calls [{:id "t1" :name "search" :arguments "{}"}]}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "assistant" (:role (first formatted))))
      (is (some? (:tool_calls (first formatted))))))

  (testing "formats tool result message"
    (let [msg {:role :tool
               :tool_call_id "t1"
               :content "result"}
          formatted (messages/build-message-history
                     (memory/initialize [msg] {}))]
      (is (= "user" (:role (first formatted))))
      (is (vector? (:content (first formatted))))
      (is (= "tool_result" (-> formatted first :content first :type)))
      (is (= "t1" (-> formatted first :content first :tool_use_id))))))

(deftest build-system-message-test
  (testing "builds basic system message"
    (let [context {}
          profile {:model "claude-sonnet-4-5-20250929"}
          msg (messages/build-system-message context profile)]
      (is (= "system" (:role msg)))
      (is (string? (:content msg)))
      (is (re-find #"Metabot" (:content msg)))))

  (testing "includes viewing context"
    (let [context {:user_is_viewing {:type :dashboard :id 1}}
          profile {:model "claude-sonnet-4-5-20250929"}
          msg (messages/build-system-message context profile)]
      (is (re-find #"viewing" (:content msg)))))

  (testing "includes recent views context"
    (let [context {:user_recently_viewed [{:type :question :id 1}]}
          profile {:model "claude-sonnet-4-5-20250929"}
          msg (messages/build-system-message context profile)]
      (is (re-find #"Recent" (:content msg)))))

  (testing "includes capabilities"
    (let [context {:capabilities #{:search :query}}
          profile {:model "claude-sonnet-4-5-20250929"}
          msg (messages/build-system-message context profile)]
      (is (re-find #"capabilities" (:content msg))))))
