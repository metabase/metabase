(ns metabase.llm.anthropic-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.llm.anthropic :as anthropic]
   [metabase.llm.settings :as llm.settings]
   [metabase.test :as mt]
   [metabase.util.http :as u.http]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- extract-tool-input Tests -------------------------------------------

(deftest ^:parallel extract-tool-input-test
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

(deftest ^:parallel build-request-headers-test
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

(deftest ^:parallel generate-sql-tool-test
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
    (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"not configured"
           (anthropic/chat-completion {:messages [{:role "user" :content "test"}]}))))))

(deftest chat-completion-e2e-localhost-safeguard-test
  (testing "during e2e tests, refuses a non-localhost base URL before making any request"
    (with-redefs [config/is-e2e? true]
      (mt/with-temporary-setting-values [llm-anthropic-api-key       "sk-ant-test-key"
                                         llm-anthropic-api-base-url  "https://api.anthropic.com"]
        (mt/with-dynamic-fn-redefs [http/post (fn [& _] (throw (ex-info "http/post should not be called" {})))]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"non-localhost"
               (anthropic/chat-completion {:messages [{:role "user" :content "test"}]})))))))
  (testing "during e2e tests, a localhost base URL is allowed through to the request"
    (let [mock-response {:body {:content [{:type "tool_use" :name "generate_sql" :input {:sql "SELECT 1"}}]
                                :usage   {:input_tokens 1 :output_tokens 1}}}]
      (with-redefs [config/is-e2e? true]
        ;; the e2e runner pins the network policy the same way, since the mock LLM server is on localhost
        (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
          (mt/with-temporary-setting-values [llm-anthropic-api-key      "sk-ant-test-key"
                                             llm-anthropic-api-base-url "http://localhost:6123"]
            (mt/with-dynamic-fn-redefs [http/post (constantly mock-response)]
              (is (=? {:result {:sql "SELECT 1"}}
                      (anthropic/chat-completion {:messages [{:role "user" :content "test"}]}))))))))))

(deftest chat-completion-network-policy-test
  (testing "a base URL on a network llm-allowed-networks forbids is refused when the connection resolves it"
    ;; the URL is redefined rather than set, the way one saved before the policy was tightened would be stored;
    ;; the mock stands in for clj-http far enough to run the request's `:dns-resolver` on the host
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "external-only"]
      (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key      (constantly "sk-ant-test-key")
                                  llm.settings/llm-anthropic-api-base-url (constantly "http://127.0.0.1:9")
                                  http/post (fn [url opts]
                                              (.resolve ^org.apache.http.conn.DnsResolver (:dns-resolver opts)
                                                        (u.http/->hostname url))
                                              (is false "the resolver should have refused the address"))]
        (is (=? {:status-code 400 :status 400 :error-code :llm-host-not-allowed :llm-host "127.0.0.1"}
                (try (anthropic/chat-completion {:messages [{:role "user" :content "test"}]})
                     (catch clojure.lang.ExceptionInfo e (ex-data e))))))))
  (testing "a permitted base URL goes out with the policy-enforcing DNS resolver on the connection"
    (let [captured      (atom nil)
          mock-response {:body {:content [{:type "tool_use" :name "generate_sql" :input {:sql "SELECT 1"}}]
                                :usage   {:input_tokens 1 :output_tokens 1}}}]
      (mt/with-temp-env-var-value! [mb-llm-allowed-networks "external-only"]
        (mt/with-temporary-setting-values [llm-anthropic-api-key      "sk-ant-test-key"
                                           llm-anthropic-api-base-url "https://8.8.8.8"]
          (mt/with-dynamic-fn-redefs [http/post (fn [_url opts] (reset! captured opts) mock-response)]
            (is (=? {:result {:sql "SELECT 1"}}
                    (anthropic/chat-completion {:messages [{:role "user" :content "test"}]})))
            (is (= :none (:redirect-strategy @captured)))
            (is (instance? org.apache.http.conn.DnsResolver (:dns-resolver @captured))))))
      (testing "a connection-time DNS policy rejection has the same 400 shape as the upfront check"
        (mt/with-temp-env-var-value! [mb-llm-allowed-networks "external-only"]
          (mt/with-temporary-setting-values [llm-anthropic-api-key      "sk-ant-test-key"
                                             llm-anthropic-api-base-url "https://8.8.8.8"]
            (mt/with-dynamic-fn-redefs [http/post (fn [& _] (throw (ex-info "blocked" {:ssrf true})))]
              (is (=? {:status-code 400 :api-error true :error-code :llm-host-not-allowed}
                      (try (anthropic/chat-completion {:messages [{:role "user" :content "test"}]})
                           (catch clojure.lang.ExceptionInfo e (ex-data e)))))))))
      (testing "and under :allow-all on clj-http's default resolver"
        (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
          (mt/with-temporary-setting-values [llm-anthropic-api-key      "sk-ant-test-key"
                                             llm-anthropic-api-base-url "http://127.0.0.1:9"]
            (mt/with-dynamic-fn-redefs [http/post (fn [_url opts] (reset! captured opts) mock-response)]
              (anthropic/chat-completion {:messages [{:role "user" :content "test"}]})
              (is (not (contains? @captured :dns-resolver))))))))))

(deftest chat-completion-returns-usage-test
  (testing "chat-completion returns result, usage, and duration"
    (let [mock-response {:body {:id      "msg_123"
                                :model   "claude-sonnet-4-5-20250929"
                                :content [{:type  "tool_use"
                                           :id    "tool_123"
                                           :name  "generate_sql"
                                           :input {:sql         "SELECT * FROM users"
                                                   :explanation "Fetches all users"}}]
                                :usage   {:input_tokens  1500
                                          :output_tokens 250}}}]
      (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-test-key"
                                         llm-anthropic-model "claude-sonnet-4-5-20250929"]
        (mt/with-dynamic-fn-redefs [http/post (constantly mock-response)]
          (let [result (anthropic/chat-completion {:system   "You are a SQL expert"
                                                   :messages [{:role "user" :content "get all users"}]})]
            (is (=? {:result      {:sql         "SELECT * FROM users"
                                   :explanation "Fetches all users"}
                     :duration-ms #(and (number? %) (pos? %))
                     :usage       {:model      "claude-sonnet-4-5-20250929"
                                   :prompt     1500
                                   :completion 250}}
                    result))))))))
