(ns metabase.metabot.self.xai-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.xai :as xai]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private credentials
  {:api-key "xai-test-key" :base-url "https://api.x.ai/v1"})

(def ^:private input
  [{:role :user :content "hi"}])

(deftest xai-raw-request-test
  (testing "a chat request goes to the connection's Chat Completions endpoint with its key, on Grok 4.7 by default"
    (with-redefs [self.core/sse-reducible             identity
                  self.core/reducible-with-api-errors (fn [r _ _] r)
                  debug/capture-stream                (fn [r _] r)
                  http/request                        (fn [req] {:body req})]
      (let [req (xai/xai-raw {:input input :credentials credentials})]
        (is (=? {:method  :post
                 :url     "https://api.x.ai/v1/chat/completions"
                 :headers {"Authorization" "Bearer xai-test-key"}}
                req))
        (is (=? {:model "grok-4.7" :stream true :stream_options {:include_usage true}}
                (json/decode+kw (:body req))))))))

(deftest ^:parallel request-body-test
  (testing "the output cap is sent as max_completion_tokens, since xAI deprecates max_tokens"
    (let [body (xai/xai-request-body {:input input :max-tokens 512})]
      (is (= 512 (:max_completion_tokens body)))
      (is (not (contains? body :max_tokens)))))
  (testing "a caller with no cap gets the chat cap, not xAI's 128,000 default"
    (is (= 32000 (:max_completion_tokens (xai/xai-request-body {:input input})))))
  (testing "chat keeps each model's default reasoning effort"
    (is (not (contains? (xai/xai-request-body {:input input :tools [(metabot.tu/get-time-tool)]})
                        :reasoning_effort))))
  (testing "structured output, and a caller opting out of reasoning, drop to the model's lowest effort"
    (doseq [[model effort] {"grok-4.3" "none" "grok-4.7" "low"}
            opts           [{:schema {:type "object"}} {:reasoning? false}]]
      (testing (str model " " opts)
        (is (= effort (:reasoning_effort (xai/xai-request-body (merge {:model model :input input} opts))))))))
  (testing "a model off the allow-list gets no effort, since Grok 4.20 rejects the parameter"
    (is (not (contains? (xai/xai-request-body {:model  "grok-4.20-0309-reasoning"
                                               :input  input
                                               :schema {:type "object"}})
                        :reasoning_effort))))
  (testing "the conversation id is forwarded as prompt_cache_key"
    (is (= "conversation-1"
           (:prompt_cache_key (xai/xai-request-body {:input input :prompt-cache-key "conversation-1"}))))
    (is (not (contains? (xai/xai-request-body {:input input}) :prompt_cache_key)))))

(defn- grok-chunk
  [m]
  (merge {:id "resp-1" :object "chat.completion.chunk" :model "grok-4.7"} m))

(def ^:private tool-call-stream
  "A Grok turn that reasons and calls a tool, streamed the way api.x.ai streams one: reasoning summary deltas, the
  whole tool call in one delta, the finish reason, then usage on a final chunk with no choices. Usage counts the
  reasoning tokens next to `completion_tokens`: 291 + 26 + 196 = 513."
  (mapv grok-chunk
        [{:choices [{:index 0 :delta {:role "assistant" :reasoning_content "Checking the"}}]}
         {:choices [{:index 0 :delta {:reasoning_content " time."}}]}
         {:choices [{:index 0 :delta {:tool_calls [{:id       "call_1"
                                                    :index    0
                                                    :type     "function"
                                                    :function {:name      "get-time"
                                                               :arguments "{\"tz\":\"Europe/Bucharest\"}"}}]}}]}
         {:choices [{:index 0 :delta {} :finish_reason "tool_calls"}]}
         {:choices []
          :usage   {:prompt_tokens             291
                    :completion_tokens         26
                    :total_tokens              513
                    :prompt_tokens_details     {:text_tokens 291 :cached_tokens 290}
                    :completion_tokens_details {:reasoning_tokens 196}}}]))

(deftest ^:parallel tool-call-stream-test
  (testing "reasoning, the tool call and usage come through, with reasoning tokens counted as output"
    (is (=? [{:type :start}
             {:type :reasoning :text "Checking the time."}
             {:type      :tool-input
              :id        "call_1"
              :function  "get-time"
              :arguments {:tz "Europe/Bucharest"}}
             {:type          :usage
              :model         "grok-4.7"
              :finish-reason "tool-calls"
              :usage         {:promptTokens     291
                              :completionTokens 222
                              :cacheReadTokens  290}}]
            (into [] (comp (xai/xai->aisdk-chunks-xf) (self.core/aisdk-xf)) tool-call-stream)))))

(deftest list-models-test
  (testing "the picker offers the allow-listed models the key can reach, named from the allow-list"
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (is (=? {:method  :get
                                                        :url     "https://api.x.ai/v1/models"
                                                        :headers {"Authorization" "Bearer xai-test-key"}}
                                                       req))
                                               {:status 200
                                                :body   {:object "list"
                                                         :data   [{:id "grok-4.7" :aliases []}
                                                                  {:id "grok-4.3" :aliases ["grok-4.3-latest"]}
                                                                  {:id "grok-imagine-image" :aliases []}]}})]
      (is (= {:models [{:id "grok-4.3" :display_name "Grok 4.3"}
                       {:id "grok-4.7" :display_name "Grok 4.7"}]}
             (xai/list-models {:credentials credentials}))))))

(defn- list-models-error
  "The message `list-models` fails with when xAI answers with `status` and `body`."
  [status body]
  (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                             (throw (ex-info (str "clj-http: status " status)
                                                             {:status status :body (json/encode body)})))]
    (try
      (xai/list-models {:credentials credentials})
      nil
      (catch clojure.lang.ExceptionInfo e
        (ex-message e)))))

(deftest error-message-test
  (testing "xAI answers an incorrect key with a 400, and its own explanation reaches the message"
    (is (re-find #"^xAI API error \(HTTP 400\).*Incorrect API key provided: xa\*\*\*kA"
                 (list-models-error 400 {:code  "Client specified an invalid argument"
                                         :error (str "Incorrect API key provided: xa***kA. "
                                                     "You can obtain an API key from https://console.x.ai")}))))
  (testing "a 403 names both of its causes and keeps the response body out of the message"
    (is (= "xAI API key lacks permission, or the team is out of credits"
           (list-models-error 403 {:error (str "Your team has either used all available credits or reached its "
                                               "monthly spending limit.")})))))
