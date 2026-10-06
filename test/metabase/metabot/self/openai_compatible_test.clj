(ns metabase.metabot.self.openai-compatible-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai-compatible :as openai-compatible]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   (java.net ConnectException)))

(set! *warn-on-reflection* true)

(def ^:private credentials
  {:base-url "https://inference.internal/v1" :api-key "sk-test" :model-id "gpt-oss-120b"})

(def ^:private tool-call
  {:message       {:content    ""
                   :tool_calls [{:id       "call-1"
                                 :type     "function"
                                 :function {:name "record_table_name" :arguments "{\"table_name\": \"orders\"}"}}]}
   :finish_reason "tool_calls"})

(defn- no-model-list []
  (throw (ex-info "clj-http: status 404" {:status 404 :body "Not Found"})))

(defn- connect!
  "Run the connect-time listing against a stubbed server, returning the listing and the models the checks named.

  The stub's `GET /models` answers `(models-response)`, and its chat completions answer `(choice request-body)`."
  [models-response choice]
  (let [checked (atom [])]
    (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url body]}]
                                               (if (re-find #"/models$" (str url))
                                                 (models-response)
                                                 (let [request (json/decode+kw (str body))]
                                                   (swap! checked conj (:model request))
                                                   {:status 200 :body {:choices [(choice request)]}})))]
      {:listing (openai-compatible/list-models {:credentials credentials :model "gpt-oss-120b" :probe? true})
       :checked @checked})))

(deftest connect-checks-the-named-model-test
  (testing "the model the connection names is checked whether or not the server lists it"
    (doseq [[server-lists models-response] [["no models"         no-model-list]
                                            ["other models only" (constantly {:status 200 :body {:data [{:id "other"}]}})]]]
      (testing server-lists
        (is (= {:listing {:models          [{:id "gpt-oss-120b" :display_name "gpt-oss-120b"}]
                          :connection-info {vllm/reasoning-config-key "false"}}
                :checked ["gpt-oss-120b" "gpt-oss-120b"]}
               (connect! models-response (constantly tool-call))))))))

(deftest connect-checks-a-listed-context-window-test
  (testing "a context window the server lists for the model is checked, under vLLM's name or OpenRouter's"
    (doseq [field [:max_model_len :context_length]]
      (testing field
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"gpt-oss-120b has a 4096 token context window, which is too small for Metabot"
             (connect! (constantly {:status 200 :body {:data [{:id "gpt-oss-120b" field 4096}]}})
                       (constantly tool-call))))))))

(deftest ^:parallel streams-reasoning-test
  (testing "a saved connection reports what its connect check saw"
    (is (true? (openai-compatible/streams-reasoning? {:credentials (assoc credentials :model-reasoning "true")})))
    (is (false? (openai-compatible/streams-reasoning? {:credentials (assoc credentials :model-reasoning "false")}))))
  (testing "one configured by environment variables never ran the check, so the chat shows any reasoning"
    (is (true? (openai-compatible/streams-reasoning? {:credentials credentials})))))

(deftest plain-listing-makes-no-request-test
  (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
    (is (= {:models [{:id "gpt-oss-120b" :display_name "gpt-oss-120b"}]}
           (openai-compatible/list-models {:credentials credentials :model "gpt-oss-120b"})))))

(deftest connect-failures-say-what-to-check-test
  (testing "a model that answers with text instead of calling a tool"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"^gpt-oss-120b answered with text instead of calling a tool. Check that the server supports tool calling"
         (connect! no-model-list (constantly {:message {:content "Orders it is." :tool_calls []} :finish_reason "stop"})))))
  (testing "a server that ignores tool_choice, as Ollama does"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"^The server answered with text when tool_choice required a tool call"
         (connect! no-model-list (fn [{[{:keys [content]}] :messages}]
                                   (if (re-find #"table name" content)
                                     tool-call
                                     {:message {:content "Hello!" :tool_calls []} :finish_reason "stop"}))))))
  (testing "a model ID the server doesn't serve keeps the server's own reason"
    (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                               (throw (ex-info "clj-http: status 404"
                                                               {:status 404
                                                                :body   "{\"message\":\"The model `gpt-oss-12b` does not exist.\"}"})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"^The server has no Chat Completions endpoint at this base URL, or no model with this ID.*does not exist"
           (openai-compatible/list-models {:credentials credentials :model "gpt-oss-12b" :probe? true})))))
  (testing "a server that can't be reached is a client error naming the base URL"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ConnectException. "Connection refused")))]
      (let [e (try (openai-compatible/list-models {:credentials credentials :model "gpt-oss-120b" :probe? true})
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (= "Could not reach the server at https://inference.internal/v1. Check that it is running and that the base URL is correct."
               (ex-message e)))
        (is (= 400 (:status-code (ex-data e))))))))

(deftest chat-request-test
  (testing "a chat turn goes to the connection's server, with its key and vLLM's request body and timeout"
    (let [captured (atom nil)]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible (fn [_] (reify clojure.lang.IReduceInit
                                                                    (reduce [_ _rf init] init)))
                                  debug/capture-stream    (fn [r _] r)
                                  http/request            (fn [req] (reset! captured req) {:body nil})]
        (into [] (openai-compatible/openai-compatible {:model       "gpt-oss-120b"
                                                       :input       [{:role :user :content "hi"}]
                                                       :credentials credentials})))
      (is (=? {:url            "https://inference.internal/v1/chat/completions"
               :headers        {"Authorization" "Bearer sk-test"}
               :socket-timeout (llm.settings/llm-vllm-request-timeout-ms)}
              @captured))
      (is (=? {:model "gpt-oss-120b" :max_tokens (llm.settings/llm-max-tokens) :temperature 0.3}
              (json/decode+kw (:body @captured)))))))

(deftest chat-usage-test
  (testing "a streamed reply counts its usage once, with reasoning tokens the server reports separately as output"
    (let [chunks [{:id      "chatcmpl-1"
                   :model   "grok-4.3"
                   :choices [{:index 0 :delta {:role "assistant" :content "Hi"}}]
                   :usage   {:prompt_tokens 32 :completion_tokens 1 :total_tokens 120}}
                  {:choices [{:index 0 :delta {} :finish_reason "stop"}]
                   :usage   {:prompt_tokens 32 :completion_tokens 9 :total_tokens 135}}]
          body   (str/join (map #(str "data: " (json/encode %) "\n\n") chunks))]
      (mt/with-dynamic-fn-redefs [debug/capture-stream (fn [r _] r)
                                  http/request         (fn [_]
                                                         {:body (java.io.ByteArrayInputStream.
                                                                 (.getBytes ^String body "UTF-8"))})]
        (is (=? [{:type :usage :usage {:promptTokens 32 :completionTokens 103}}]
                (filterv #(= :usage (:type %))
                         (into [] (openai-compatible/openai-compatible {:model       "grok-4.3"
                                                                        :input       [{:role :user :content "hi"}]
                                                                        :credentials credentials})))))))))
