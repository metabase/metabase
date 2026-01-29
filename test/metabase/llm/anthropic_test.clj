(ns metabase.llm.anthropic-test
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.anthropic :as anthropic]
   [metabase.test :as mt])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- extract-tool-input Tests -------------------------------------------

(deftest extract-tool-input-test
  (testing "valid tool_use response extracts input"
    (let [response {:content [{:type "tool_use"
                               :id "123"
                               :name "generate_sql"
                               :input {:sql "SELECT 1"}}]}]
      (is (= {:sql "SELECT 1"}
             (#'anthropic/extract-tool-input response)))))

  (testing "multiple content blocks finds tool_use"
    (let [response {:content [{:type "text" :text "thinking..."}
                              {:type "tool_use"
                               :id "456"
                               :name "generate_sql"
                               :input {:sql "SELECT 1" :explanation "Simple query"}}]}]
      (is (= {:sql "SELECT 1" :explanation "Simple query"}
             (#'anthropic/extract-tool-input response)))))

  (testing "no tool_use block returns nil"
    (let [response {:content [{:type "text" :text "no tool"}]}]
      (is (nil? (#'anthropic/extract-tool-input response)))))

  (testing "empty content returns nil"
    (is (nil? (#'anthropic/extract-tool-input {:content []})))
    (is (nil? (#'anthropic/extract-tool-input {}))))

  (testing "tool_use without input returns nil"
    (let [response {:content [{:type "tool_use" :id "123" :name "generate_sql"}]}]
      (is (nil? (#'anthropic/extract-tool-input response)))))

  (testing "returns first tool_use when multiple present"
    (let [response {:content [{:type "tool_use"
                               :id "1"
                               :name "generate_sql"
                               :input {:sql "SELECT 1"}}
                              {:type "tool_use"
                               :id "2"
                               :name "generate_sql"
                               :input {:sql "SELECT 2"}}]}]
      (is (= {:sql "SELECT 1"}
             (#'anthropic/extract-tool-input response))))))

;;; ------------------------------------------- build-request-headers Tests -------------------------------------------

(deftest build-request-headers-test
  (testing "includes required headers"
    (let [headers (#'anthropic/build-request-headers "sk-test-key")]
      (is (= "sk-test-key" (get headers "x-api-key")))
      (is (= "2023-06-01" (get headers "anthropic-version")))
      (is (= "application/json" (get headers "content-type"))))))

;;; ------------------------------------------- build-request-body Tests -------------------------------------------

(deftest build-request-body-test
  (testing "includes required fields with default max_tokens"
    (mt/with-temporary-setting-values [llm-max-tokens nil]
      (let [body (#'anthropic/build-request-body {:model "claude-sonnet-4-5-20250929"
                                                  :messages [{:role "user" :content "test"}]})]
        (is (= "claude-sonnet-4-5-20250929" (:model body)))
        (is (= 4096 (:max_tokens body)))
        (is (= [{:role "user" :content "test"}] (:messages body)))
        (is (vector? (:tools body)))
        (is (= {:type "tool" :name "generate_sql"} (:tool_choice body))))))

  (testing "uses configured max_tokens setting"
    (mt/with-temporary-setting-values [llm-max-tokens 8192]
      (let [body (#'anthropic/build-request-body {:model "claude-sonnet-4-5-20250929"
                                                  :messages [{:role "user" :content "test"}]})]
        (is (= 8192 (:max_tokens body))))))

  (testing "includes system prompt when provided"
    (let [body (#'anthropic/build-request-body {:model "claude-sonnet-4-5-20250929"
                                                :system "You are a SQL expert"
                                                :messages [{:role "user" :content "test"}]})]
      (is (= "You are a SQL expert" (:system body)))))

  (testing "omits system when not provided"
    (let [body (#'anthropic/build-request-body {:model "claude-sonnet-4-5-20250929"
                                                :messages [{:role "user" :content "test"}]})]
      (is (not (contains? body :system))))))

;;; ------------------------------------------- generate-sql-tool Tests -------------------------------------------

(deftest generate-sql-tool-test
  (testing "tool definition has correct structure"
    (let [tool @#'anthropic/generate-sql-tool]
      (is (= "generate_sql" (:name tool)))
      (is (string? (:description tool)))
      (is (= "object" (get-in tool [:input_schema :type])))
      (is (contains? (get-in tool [:input_schema :properties]) :sql))
      (is (= ["sql"] (get-in tool [:input_schema :required]))))))

;;; ------------------------------------------- chat-completion Tests -------------------------------------------

(deftest chat-completion-not-configured-test
  (testing "throws when API key not configured"
    (mt/with-temporary-setting-values [llm-anthropic-api-key nil]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"not configured"
           (anthropic/chat-completion {:messages [{:role "user" :content "test"}]}))))))

(deftest chat-completion-returns-usage-test
  (testing "chat-completion returns result, usage, and duration"
    (let [mock-response {:body {:id "msg_123"
                                :model "claude-sonnet-4-5-20250929"
                                :content [{:type "tool_use"
                                           :id "tool_123"
                                           :name "generate_sql"
                                           :input {:sql "SELECT * FROM users"
                                                   :explanation "Fetches all users"}}]
                                :usage {:input_tokens 1500
                                        :output_tokens 250}}}]
      (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-test-key"]
        (with-redefs [http/post (constantly mock-response)]
          (let [result (anthropic/chat-completion {:system "You are a SQL expert"
                                                   :messages [{:role "user" :content "get all users"}]})]
            (is (=? {:result {:sql "SELECT * FROM users"
                              :explanation "Fetches all users"}
                     :duration-ms #(and (number? %) (pos? %))
                     :usage {:model "anthropic/claude-sonnet-4-5"
                             :prompt 1500
                             :completion 250}}
                    result))))))))

;;; ------------------------------------------- default-model Tests -------------------------------------------

(deftest default-model-test
  (testing "default model is defined and reasonable"
    (is (string? anthropic/default-model))
    (is (str/includes? anthropic/default-model "claude"))))

;;; ------------------------------------------- model->simplified-provider-model Tests -------------------------------------------

(deftest ^:parallel model->simplified-provider-model-test
  (testing "strips date suffix and adds provider prefix"
    (is (= "anthropic/claude-sonnet-4-5"
           (#'anthropic/model->simplified-provider-model "claude-sonnet-4-5-20250929")))
    (is (= "anthropic/claude-opus-4-5"
           (#'anthropic/model->simplified-provider-model "claude-opus-4-5-20250514")))))

(deftest ^:parallel model->simplified-provider-model-no-suffix-test
  (testing "handles model without date suffix"
    (is (= "anthropic/claude-sonnet-4-5"
           (#'anthropic/model->simplified-provider-model "claude-sonnet-4-5")))))

(deftest ^:parallel model->simplified-provider-model-nil-model-test
  (testing "returns nil for nil input"
    (is (nil? (#'anthropic/model->simplified-provider-model nil)))))

;;; ------------------------------------------- chat-completion-stream Tests -------------------------------------------

(deftest chat-completion-stream-usage-parts-test
  (testing "chat-completion-stream emits usage parts with model id"
    (let [sse-data (str "event: message_start\n"
                        "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_123\",\"model\":\"claude-sonnet-4-20250514\",\"usage\":{\"input_tokens\":1500}}}\n\n"
                        "event: content_block_start\n"
                        "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"name\":\"generate_sql\"}}\n\n"
                        "event: content_block_delta\n"
                        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"sql\\\":\\\"SELECT 1\\\"}\"}}\n\n"
                        "event: content_block_stop\n"
                        "data: {\"type\":\"content_block_stop\",\"index\":0}\n\n"
                        "event: message_delta\n"
                        "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":250}}\n\n"
                        "event: message_stop\n"
                        "data: {\"type\":\"message_stop\"}\n\n")
          mock-response {:status 200
                         :body (ByteArrayInputStream. (.getBytes sse-data "UTF-8"))}]
      (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-test-key"
                                         llm-anthropic-model "claude-sonnet-4-20250514"]
        (with-redefs [http/post (constantly mock-response)]
          (let [ch (anthropic/chat-completion-stream {:system "You are a SQL expert"
                                                      :messages [{:role "user" :content "test"}]})
                results (loop [acc []]
                          (if-let [v (a/<!! ch)]
                            (recur (conj acc v))
                            acc))
                usage-parts (filter #(= :usage (:type %)) results)
                text-parts (filter #(= :text-delta (:type %)) results)]
            ;; Should have two usage parts (prompt and completion)
            (is (= [{:type :usage
                     :id "anthropic/claude-sonnet-4"
                     :usage {:promptTokens 1500}}
                    {:type :usage
                     :id "anthropic/claude-sonnet-4"
                     :usage {:completionTokens 250}}]
                   usage-parts))
            (is (= [{:type :text-delta
                     :delta "{\"sql\":\"SELECT 1\"}"}]
                   text-parts))))))))

(deftest chat-completion-stream-not-configured-test
  (testing "throws when API key not configured"
    (mt/with-temporary-setting-values [llm-anthropic-api-key nil]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"not configured"
           (anthropic/chat-completion-stream {:messages [{:role "user" :content "test"}]}))))))
