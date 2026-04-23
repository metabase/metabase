(ns metabase.metabot.api-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [compojure.response]
   [medley.core :as m]
   [metabase.api.common :as mb.api]
   [metabase.config.core :as config]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.api :as api]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.context :as metabot.context]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.test-util :as mut]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.test-util :as search.tu]
   [metabase.server.instance :as server.instance]
   [metabase.server.streaming-response :as sr]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private test-provider "openrouter/anthropic/claude-haiku-4-5")

(deftest native-agent-streaming-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider test-provider]
    (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
      (with-redefs [config/is-dev? true]
        (let [conversation-id    (str (random-uuid))
              question           {:role "user" :content "Test native streaming"}
              historical-message {:role "user" :content "previous message"}]
          (with-redefs [openrouter/openrouter (fn [_]
                                                (mut/mock-llm-response
                                                 [{:type :start :id "msg-1"}
                                                  {:type :text :text "Hello from native agent!"}
                                                  {:type  :usage       :usage {:promptTokens 10 :completionTokens 5}
                                                   :model "test-model" :id    "msg-1"}]))]
            (testing "Native agent streaming request"
              (mt/with-model-cleanup [:model/MetabotMessage
                                      [:model/MetabotConversation :created_at]]
                (let [response (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                     {:message         (:content question)
                                                      :context         {}
                                                      :conversation_id conversation-id
                                                      :history         [historical-message]
                                                      :state           {}})
                      lines    (str/split-lines response)
                      conv     (t2/select-one :model/MetabotConversation :id conversation-id)
                      messages (t2/select :model/MetabotMessage :conversation_id conversation-id)]
              ;; Native agent emits AI SDK v4 line protocol directly
                  (testing "response contains expected line types"
                ;; f:{start}, 0:"text" chunks, 2:{state data}, d:{finish with usage}
                    (is (=? [#"f:.*"
                             #"0:.*"
                             #"2:.*"
                             #"d:.*"]
                            (m/distinct-by #(subs % 0 2) lines)))
                ;; Text chunks reassemble to full message
                    (let [text-lines (filter #(str/starts-with? % "0:") lines)]
                      (is (= "Hello from native agent!"
                             (apply str (map #(json/decode (subs % 2)) text-lines)))))
                ;; Finish line includes usage
                    (is (str/includes? (last lines) "promptTokens")))
                  (is (=? {:user_id (mt/user->id :rasta)}
                          conv))
              ;; Native agent stores parts in raw format
                  (is (=? [{:total_tokens 0
                            :role         :user
                            :data         [{:role "user" :content (:content question)}]}
                           {:total_tokens pos-int?
                            :role         :assistant
                            :data         [{:type "text" :text "Hello from native agent!"}]}]
                          messages)))))))))))

(defn ^:private sse-event
  "Format an SSE event as a string for a mock LLM server."
  ^String [data]
  (str "data: " (json/encode data) "\n\n"))

(deftest closing-connection-native-agent-test
  (testing "When the client closes a native-agent streaming connection,
            the pipeline stops and store-parts! is still called."
    ;; We set up a fake OpenRouter-compatible (Chat Completions) SSE server that
    ;; streams many text-delta events slowly. The Metabase server connects to it
    ;; via the full native-agent pipeline:
    ;;   openrouter-raw → sse-reducible → openrouter->aisdk-chunks-xf → tool-executor-xf
    ;;   → lite-aisdk-xf → agent loop → aisdk-line-xf → streaming-writer-rf → client
    ;; Then the test client reads one byte and closes the connection.
    ;; We assert that store-parts! is called with a partial result.
    (let [total-chunks 30
          cnt          (atom total-chunks)
          stored-parts (atom nil)
          chat-id      (str "chatcmpl-" (random-uuid))
          ;; Fake OpenRouter API: streams Chat Completions SSE text deltas slowly
          llm-handler
          (fn [req respond _raise]
            (respond
             (compojure.response/render
              (sr/streaming-response {:content-type "text/event-stream; charset=utf-8"} [os _canceled-chan]
                (try
                  (let [write! (fn [^String s]
                                 (.write os (.getBytes s "UTF-8"))
                                 (.flush os))]
                    ;; First chunk: role assignment (empty content to establish assistant role)
                    (write! (sse-event {:id      chat-id
                                        :model   "anthropic/claude-haiku-4-5"
                                        :choices [{:index         0
                                                   :delta         {:role "assistant" :content ""}
                                                   :finish_reason nil}]}))
                    ;; Stream text content chunks slowly
                    (loop []
                      (when (pos? @cnt)
                        (write! (sse-event {:id      chat-id
                                            :model   "anthropic/claude-haiku-4-5"
                                            :choices [{:index         0
                                                       :delta         {:content (str "chunk-" @cnt " ")}
                                                       :finish_reason nil}]}))
                        (swap! cnt dec)
                        (Thread/sleep 10)
                        (recur)))
                    ;; Finish reason
                    (write! (sse-event {:id      chat-id
                                        :model   "anthropic/claude-haiku-4-5"
                                        :choices [{:index         0
                                                   :delta         {}
                                                   :finish_reason "stop"}]}))
                    ;; Usage (separate final chunk, as OpenRouter does)
                    (write! (sse-event {:id      chat-id
                                        :model   "anthropic/claude-haiku-4-5"
                                        :choices []
                                        :usage   {:prompt_tokens     10
                                                  :completion_tokens 50}}))
                    (write! "data: [DONE]\n\n"))
                  (catch Exception _e nil)))
              req)))
          llm-server
          (doto (server.instance/create-server llm-handler {:port 0 :join? false})
            .start)
          llm-url      (str "http://localhost:" (.. llm-server getURI getPort))]
      (try
        (mt/test-helpers-set-global-values!
          (search.tu/with-index-disabled
            (let [real-http-post http/post]
              (with-redefs [llm.settings/llm-openrouter-api-key      (constantly "fake-key")
                            llm.settings/llm-openrouter-api-base-url (constantly llm-url)
                            scope/resolve-user-permissions           (constantly scope/all-yes-permissions)
                            ;; The fake LLM server doesn't gzip, but clj-http wraps with
                            ;; GZIPInputStream by default. Closing mid-stream causes ZLIB errors.
                            http/post                                (fn [url opts]
                                                                       (real-http-post url (assoc opts :decompress-body false)))
                            metabot.context/create-context           identity
                            metabot.persistence/store-native-parts!  (fn [_conv-id _prof-id parts & _kwargs]
                                                                       (reset! stored-parts parts))
                            sr/async-cancellation-poll-interval-ms   5]
                (testing "Closing stream body will drop connection to LLM"
                  (reset! cnt total-chunks)
                  (reset! stored-parts nil)
                  (let [body (mt/user-real-request :rasta :post 202 "metabot/agent-streaming"
                                                   {:request-options {:as              :stream
                                                                      :decompress-body false}}
                                                   {:message         "Test closure"
                                                    :context         {}
                                                    :conversation_id (str (random-uuid))
                                                    :history         []
                                                    :state           {}})]
                    (.read ^java.io.InputStream body) ;; start the handler
                    (.close ^java.io.Closeable body)
                    (u/poll {:thunk       #(deref stored-parts)
                             :done?       some?
                             :interval-ms 10
                             :timeout-ms  3000})
                    (is (some? @stored-parts) "store-parts! was called even though client disconnected")
                    (testing "LLM server stopped writing when connection was dropped"
                      (is (< 10 @cnt) "Server should not have written all chunks"))
                    ;; The stored parts should contain partial data — not all 30 chunks.
                    ;; Text chunks are combined by combine-text-parts-xf, so we check
                    ;; that the concatenated text is shorter than it would be if all
                    ;; 30 chunks were processed.
                    (let [stored-text (->> @stored-parts
                                           (filter #(= :text (:type %)))
                                           (map :text)
                                           (str/join ""))]
                      (is (< (count stored-text)
                             ;; Each chunk is "chunk-NN " (~10 chars). If all 30 were
                             ;; processed, that's ~300 chars. We should have far fewer.
                             (* 10 total-chunks))
                          "Only a fraction of the text chunks were processed before disconnect"))))))))
        (finally
          (.stop llm-server))))))

(deftest settings-get-returns-live-models-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-haiku-4-5"
                                     llm.settings/llm-anthropic-api-key    "sk-ant-valid"]
    (with-redefs [metabot.self/list-models (fn
                                             ([provider]
                                              (is (= "anthropic" provider))
                                              {:models [{:id "claude-haiku-4-5"
                                                         :display_name "Claude Haiku 4.5"}]})
                                             ([provider {:keys [api-key]}]
                                              (is (= "anthropic" provider))
                                              (is (= "sk-ant-valid" api-key))
                                              {:models [{:id "claude-sonnet-4-5"
                                                         :display_name "Claude Sonnet 4.5"}
                                                        {:id "claude-haiku-4-5"
                                                         :display_name "Claude Haiku 4.5"}
                                                        {:id "claude-opus-4-5"
                                                         :display_name "Claude Opus 4.5"}
                                                        {:id "claude-opus-4-1"
                                                         :display_name "Claude Opus 4.1"}]}))]
      (is (= {:value  "anthropic/claude-haiku-4-5"
              :models [{:id "claude-haiku-4-5"
                        :display_name "Claude Haiku 4.5"
                        :group "Haiku"}
                       {:id "claude-opus-4-5"
                        :display_name "Claude Opus 4.5"
                        :group "Opus"}
                       {:id "claude-opus-4-1"
                        :display_name "Claude Opus 4.1"
                        :group "Opus"}
                       {:id "claude-sonnet-4-5"
                        :display_name "Claude Sonnet 4.5"
                        :group "Sonnet"}]}
             (mt/user-http-request :crowberto :get 200 "metabot/settings" :provider "anthropic"))))))

(deftest settings-get-normalizes-legacy-anthropic-ids-test
  (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key "sk-ant-valid"]
    (with-redefs [metabot.self/list-models (fn [_provider {:keys [api-key]}]
                                             (is (= "sk-ant-valid" api-key))
                                             {:models [{:id "claude-3-haiku-20240307"
                                                        :display_name "Claude 3 Haiku"}
                                                       {:id "claude-haiku-4-5"
                                                        :display_name "Claude Haiku 4.5"}]})]
      (is (= {:value  (metabot.settings/llm-metabot-provider)
              :models [{:id "claude-3-haiku-20240307"
                        :display_name "Claude 3 Haiku"
                        :group "Haiku"}
                       {:id "claude-haiku-4-5"
                        :display_name "Claude Haiku 4.5"
                        :group "Haiku"}]}
             (mt/user-http-request :crowberto :get 200 "metabot/settings"
                                   :provider "anthropic"))))))

(deftest settings-get-groups-openrouter-models-test
  (mt/with-temporary-setting-values [llm.settings/llm-openrouter-api-key "sk-or-v1-valid"]
    (with-redefs [metabot.self/list-models (fn [_provider {:keys [api-key]}]
                                             (is (= "sk-or-v1-valid" api-key))
                                             {:models [{:id "openai/gpt-4.1-mini"
                                                        :display_name "OpenAI: GPT-4.1 mini"}
                                                       {:id "anthropic/claude-sonnet-4.5"
                                                        :display_name "Anthropic: Claude Sonnet 4.5"}]})]
      (is (= {:value  (metabot.settings/llm-metabot-provider)
              :models [{:id "anthropic/claude-sonnet-4.5"
                        :display_name "Anthropic: Claude Sonnet 4.5"
                        :group "Anthropic"}
                       {:id "openai/gpt-4.1-mini"
                        :display_name "OpenAI: GPT-4.1 mini"
                        :group "OpenAI"}]}
             (mt/user-http-request :crowberto :get 200 "metabot/settings"
                                   :provider "openrouter"))))))

(deftest settings-get-returns-metabase-models-without-api-key-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"]
    (with-redefs [metabot.self/list-models (fn
                                             ([provider]
                                              (is false (str "unexpected list-models call: " provider)))
                                             ([provider opts]
                                              (is (= "anthropic" provider))
                                              (is (= {:ai-proxy? true} opts))
                                              {:models [{:id "claude-haiku-4-5" :display_name "Claude Haiku 4.5"}
                                                        {:id "claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}
                                                        {:id "claude-opus-4-1" :display_name "Claude Opus 4.1"}]}))]
      (is (= {:value  "metabase/anthropic/claude-sonnet-4-6"
              :models [{:id "anthropic/claude-haiku-4-5" :display_name "Claude Haiku 4.5"}
                       {:id "anthropic/claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}
                       {:id "anthropic/claude-opus-4-1" :display_name "Claude Opus 4.1"}]}
             (mt/user-http-request :crowberto :get 200 "metabot/settings"
                                   :provider "metabase"))))))

(deftest settings-put-updates-provider-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-haiku-4-5"
                                     llm.settings/llm-openai-api-key      "sk-valid"]
    (with-redefs [metabot.self/list-models (fn
                                             ([provider]
                                              (is (= "openai" provider))
                                              {:models [{:id "gpt-4.1-mini"
                                                         :display_name "GPT-4.1 mini"}]})
                                             ([provider {:keys [api-key]}]
                                              (is (= "openai" provider))
                                              (is (= "sk-valid" api-key))
                                              {:models [{:id "gpt-4.1-mini"
                                                         :display_name "GPT-4.1 mini"}]}))]
      (is (= {:value  "openai/gpt-4.1-mini"
              :models [{:id "gpt-4.1-mini"
                        :display_name "GPT-4.1 mini"}]}
             (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                   {:provider "openai"
                                    :model    "gpt-4.1-mini"})))
      (is (= "openai/gpt-4.1-mini"
             (metabot.settings/llm-metabot-provider))))))

(deftest settings-put-updates-metabase-provider-without-api-key-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-haiku-4-5"]
    (with-redefs [metabot.self/list-models (fn
                                             ([provider]
                                              (is false (str "unexpected list-models call: " provider)))
                                             ([provider opts]
                                              (is (= "anthropic" provider))
                                              (is (= {:ai-proxy? true} opts))
                                              {:models [{:id "claude-haiku-4-5" :display_name "Claude Haiku 4.5"}
                                                        {:id "claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}
                                                        {:id "claude-opus-4-1" :display_name "Claude Opus 4.1"}]}))]
      (is (= {:value  "metabase/anthropic/claude-sonnet-4-6"
              :models [{:id "anthropic/claude-haiku-4-5" :display_name "Claude Haiku 4.5"}
                       {:id "anthropic/claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}
                       {:id "anthropic/claude-opus-4-1" :display_name "Claude Opus 4.1"}]}
             (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                   {:provider "metabase"
                                    :model    "anthropic/claude-sonnet-4-6"})))
      (is (= "metabase/anthropic/claude-sonnet-4-6"
             (metabot.settings/llm-metabot-provider))))))

(deftest settings-put-defaults-empty-metabase-model-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-haiku-4-5"]
    (with-redefs [metabot.self/list-models (fn
                                             ([provider]
                                              (is false (str "unexpected list-models call: " provider)))
                                             ([provider opts]
                                              (is (= "anthropic" provider))
                                              (is (= {:ai-proxy? true} opts))
                                              {:models [{:id "claude-haiku-4-5" :display_name "Claude Haiku 4.5"}
                                                        {:id "claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}
                                                        {:id "claude-opus-4-1" :display_name "Claude Opus 4.1"}]}))]
      (is (= {:value  "metabase/anthropic/claude-sonnet-4-6"
              :models [{:id "anthropic/claude-haiku-4-5" :display_name "Claude Haiku 4.5"}
                       {:id "anthropic/claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}
                       {:id "anthropic/claude-opus-4-1" :display_name "Claude Opus 4.1"}]}
             (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                   {:provider "metabase"
                                    :model    ""})))
      (is (= "metabase/anthropic/claude-sonnet-4-6"
             (metabot.settings/llm-metabot-provider))))))

(deftest settings-put-verifies-and-saves-api-keys-test
  (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key nil]
    (mt/with-temporary-setting-values [llm.settings/llm-anthropic-api-key nil]
      (let [calls (atom 0)]
        (with-redefs [metabot.self/list-models (fn [provider {:keys [api-key]}]
                                                 (swap! calls inc)
                                                 (is (= "anthropic" provider))
                                                 (is (= "sk-ant-valid" api-key))
                                                 (is (nil? (llm.settings/llm-anthropic-api-key))
                                                     "verification should happen before saving the key")
                                                 {:models [{:id "claude-haiku-4-5"
                                                            :display_name "Claude Haiku 4.5"}]})]
          (is (= {:value  (metabot.settings/llm-metabot-provider)
                  :models [{:id "claude-haiku-4-5"
                            :display_name "Claude Haiku 4.5"
                            :group "Haiku"}]}
                 (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                       {:provider "anthropic"
                                        :api-key  "sk-ant-valid"})))
          (is (= 1 @calls)
              "should verify before saving and reuse the verified response")
          (is (= "sk-ant-valid"
                 (llm.settings/llm-anthropic-api-key))))))))

(deftest settings-put-api-key-rotation-does-not-reset-non-default-model-test
  (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key nil]
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-opus-4-1"
                                       llm.settings/llm-anthropic-api-key nil]
      (let [calls (atom 0)]
        (with-redefs [metabot.self/list-models (fn [provider {:keys [api-key]}]
                                                 (swap! calls inc)
                                                 (is (= "anthropic" provider))
                                                 (is (= "sk-ant-valid" api-key))
                                                 (is (nil? (llm.settings/llm-anthropic-api-key))
                                                     "verification should happen before saving the key")
                                                 {:models [{:id "claude-opus-4-1"
                                                            :display_name "Claude Opus 4.1"
                                                            :group "Opus"}]})]
          (is (= {:value  "anthropic/claude-opus-4-1"
                  :models [{:id "claude-opus-4-1"
                            :display_name "Claude Opus 4.1"
                            :group "Opus"}]}
                 (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                       {:provider "anthropic"
                                        :api-key  "sk-ant-valid"})))
          (is (= 1 @calls)
              "should verify before saving and reuse the verified response")
          (is (= "anthropic/claude-opus-4-1"
                 (metabot.settings/llm-metabot-provider))
              "rotating an API key should not reset the selected model")
          (is (= "sk-ant-valid"
                 (llm.settings/llm-anthropic-api-key))))))))

(deftest settings-put-api-key-switches-from-metabase-to-provider-default-model-test
  (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key nil]
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"
                                       llm.settings/llm-anthropic-api-key nil]
      (let [calls (atom 0)]
        (with-redefs [metabot.self/list-models (fn [provider {:keys [api-key]}]
                                                 (swap! calls inc)
                                                 (is (= "anthropic" provider))
                                                 (is (= "sk-ant-valid" api-key))
                                                 (is (nil? (llm.settings/llm-anthropic-api-key))
                                                     "verification should happen before saving the key")
                                                 {:models [{:id "claude-sonnet-4-6"
                                                            :display_name "Claude Sonnet 4.6"
                                                            :group "Sonnet"}
                                                           {:id "claude-opus-4-1"
                                                            :display_name "Claude Opus 4.1"
                                                            :group "Opus"}]})]
          (is (= {:value  "anthropic/claude-sonnet-4-6"
                  :models [{:id "claude-opus-4-1"
                            :display_name "Claude Opus 4.1"
                            :group "Opus"}
                           {:id "claude-sonnet-4-6"
                            :display_name "Claude Sonnet 4.6"
                            :group "Sonnet"}]}
                 (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                       {:provider "anthropic"
                                        :api-key  "sk-ant-valid"})))
          (is (= 1 @calls)
              "should verify before saving and reuse the verified response")
          (is (= "anthropic/claude-sonnet-4-6"
                 (metabot.settings/llm-metabot-provider))
              "switching away from the managed provider should pick the anthropic default model")
          (is (= "sk-ant-valid"
                 (llm.settings/llm-anthropic-api-key))))))))

(deftest settings-put-blank-model-does-not-reset-when-provider-is-unchanged-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-opus-4-1"
                                     llm.settings/llm-anthropic-api-key "sk-ant-valid"]
    (with-redefs [metabot.self/list-models (fn [provider {:keys [api-key]}]
                                             (is (= "anthropic" provider))
                                             (is (= "sk-ant-valid" api-key))
                                             {:models [{:id "claude-sonnet-4-6"
                                                        :display_name "Claude Sonnet 4.6"}
                                                       {:id "claude-opus-4-1"
                                                        :display_name "Claude Opus 4.1"}]})]
      (is (= {:value  "anthropic/claude-opus-4-1"
              :models [{:id "claude-opus-4-1"
                        :display_name "Claude Opus 4.1"
                        :group "Opus"}
                       {:id "claude-sonnet-4-6"
                        :display_name "Claude Sonnet 4.6"
                        :group "Sonnet"}]}
             (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                   {:provider "anthropic"
                                    :model    ""})))
      (is (= "anthropic/claude-opus-4-1"
             (metabot.settings/llm-metabot-provider))
          "blank model should not reset the selection when the provider is unchanged"))))

(deftest settings-put-rejects-invalid-api-key-test
  (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key nil]
    (let [calls (atom 0)]
      (with-redefs [metabot.self/list-models (fn [provider {:keys [api-key]}]
                                               (swap! calls inc)
                                               (is (= "openai" provider))
                                               (is (= "sk-invalid" api-key))
                                               (is (nil? (llm.settings/llm-openai-api-key))
                                                   "failed verification should not save the key")
                                               (throw (ex-info "OpenAI API key expired or invalid"
                                                               {:api-error true
                                                                :status-code 401})))]
        (let [response (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                             {:provider "openai"
                                              :api-key  "sk-invalid"})]
          (is (= "OpenAI API key expired or invalid" (:message response)))
          (is (= 1 @calls)
              "should stop after the failed verification call")
          (is (nil? (llm.settings/llm-openai-api-key))))))))

(deftest settings-put-does-not-treat-outages-as-invalid-keys-test
  (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key nil]
    (with-redefs [metabot.self/list-models (fn [provider {:keys [api-key]}]
                                             (is (= "openai" provider))
                                             (is (= "sk-valid" api-key))
                                             (throw (ex-info "OpenAI API is not working but not saying why"
                                                             {:api-error true
                                                              :status-code 500})))]
      (let [response (mt/user-http-request :crowberto :put 500 "metabot/settings"
                                           {:provider "openai"
                                            :api-key  "sk-valid"})]
        (is (= "OpenAI API is not working but not saying why" (:message response)))
        (is (nil? (llm.settings/llm-openai-api-key)))))))

(deftest settings-put-does-not-save-model-when-preflight-fails-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-haiku-4-5"
                                     llm.settings/llm-anthropic-api-key      "sk-ant-valid"]
    (with-redefs [metabot.self/list-models (fn [provider {:keys [api-key]}]
                                             (is (= "anthropic" provider))
                                             (is (= "sk-ant-valid" api-key))
                                             (throw (ex-info "Anthropic API key has insufficient permissions"
                                                             {:api-error true
                                                              :status-code 403})))]
      (let [response (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                           {:provider "anthropic"
                                            :model    "claude-sonnet-4-5"})]
        (is (= "Anthropic API key has insufficient permissions" (:message response)))
        (is (= "anthropic/claude-haiku-4-5"
               (metabot.settings/llm-metabot-provider)))))))

(deftest settings-get-surfaces-invalid-api-key-error-test
  (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key "sk-invalid"]
    (with-redefs [metabot.self/list-models (fn [_provider _opts]
                                             (throw (ex-info "OpenAI API key expired or invalid"
                                                             {:api-error true
                                                              :status-code 401})))]
      (is (= {:value         (metabot.settings/llm-metabot-provider)
              :api-key-error "OpenAI API key expired or invalid"
              :models        []}
             (mt/user-http-request :crowberto :get 200 "metabot/settings"
                                   :provider "openai"))))))

(deftest settings-permissions-test
  (mt/user-http-request :rasta :get 403 "metabot/settings" :provider "anthropic")
  (mt/user-http-request :rasta :put 403 "metabot/settings"
                        {:provider "anthropic"
                         :model    "claude-haiku-4-5"}))

(deftest metabot-provider-without-api-key-is-configured-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"
                                       llm.settings/llm-proxy-base-url      "https://proxy.example.com"
                                       llm.settings/llm-anthropic-api-key    nil
                                       llm.settings/llm-openai-api-key       nil
                                       llm.settings/llm-openrouter-api-key   nil]
      (is (true? (metabot.settings/llm-metabot-configured?))))))

(deftest endpoints-require-authentication-test
  (testing "Metabot v3 endpoints require authentication"
    (testing "/agent-streaming"
      (is (= "Unauthenticated"
             (mt/client :post 401 "metabot/agent-streaming"
                        {:message "Test"
                         :context {}
                         :conversation_id (str (random-uuid))
                         :history []
                         :state {}}))))
    (testing "/feedback"
      (is (= "Unauthenticated"
             (mt/client :post 401 "metabot/feedback"
                        {:metabot_id 1
                         :message_id "x"
                         :positive   true}))))))

(deftest metabot-enabled-setting-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider test-provider]
    (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
      (let [base-request {:message         "Test"
                          :context         {}
                          :conversation_id (str (random-uuid))
                          :history         []
                          :state           {}}]
        (with-redefs [openrouter/openrouter (fn [_]
                                              (mut/mock-llm-response
                                               [{:type :start :id "msg-1"}
                                                {:type :text :text "Hello"}
                                                {:type  :usage       :usage {:promptTokens 1 :completionTokens 1}
                                                 :model "test-model" :id    "msg-1"}]))]
          (testing "Regular metabot is blocked when metabot-enabled is false"
            (mt/with-temporary-setting-values [metabot-enabled? false]
              (mt/with-model-cleanup [:model/MetabotMessage
                                      [:model/MetabotConversation :created_at]]
                (mt/user-http-request :rasta :post 403 "metabot/agent-streaming"
                                      base-request))))
          (testing "Regular metabot works when metabot-enabled is true"
            (mt/with-temporary-setting-values [metabot-enabled? true]
              (mt/with-model-cleanup [:model/MetabotMessage
                                      [:model/MetabotConversation :created_at]]
                (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                      (assoc base-request :conversation_id (str (random-uuid)))))))
          (testing "Embedded metabot is blocked when embedded-metabot-enabled? is false"
            (mt/with-temporary-setting-values [embedded-metabot-enabled? false]
              (mt/with-model-cleanup [:model/MetabotMessage
                                      [:model/MetabotConversation :created_at]]
                (mt/user-http-request :rasta :post 403 "metabot/agent-streaming"
                                      (assoc base-request
                                             :metabot_id metabot.config/embedded-metabot-id
                                             :conversation_id (str (random-uuid)))))))
          (testing "Embedded metabot works when embedded-metabot-enabled? is true"
            (mt/with-temporary-setting-values [embedded-metabot-enabled? true]
              (mt/with-model-cleanup [:model/MetabotMessage
                                      [:model/MetabotConversation :created_at]]
                (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                      (assoc base-request
                                             :metabot_id metabot.config/embedded-metabot-id
                                             :conversation_id (str (random-uuid)))))))
          (testing "Regular metabot still works when only embedded is disabled"
            (mt/with-temporary-setting-values [metabot-enabled?          true
                                               embedded-metabot-enabled? false]
              (mt/with-model-cleanup [:model/MetabotMessage
                                      [:model/MetabotConversation :created_at]]
                (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                      (assoc base-request :conversation_id (str (random-uuid)))))))
          (testing "Embedded metabot still works when only regular is disabled"
            (mt/with-temporary-setting-values [metabot-enabled?          false
                                               embedded-metabot-enabled? true]
              (mt/with-model-cleanup [:model/MetabotMessage
                                      [:model/MetabotConversation :created_at]]
                (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                      (assoc base-request
                                             :metabot_id metabot.config/embedded-metabot-id
                                             :conversation_id (str (random-uuid))))))))))))

(deftest extract-usage-test
  (testing "takes last cumulative usage per model"
    (is (= {"gpt-4" {:prompt 250 :completion 50}}
           (metabot.persistence/extract-usage
            [{:type :text :text "hi"}
             {:type :usage :usage {:promptTokens 100 :completionTokens 20} :model "gpt-4"}
             {:type :tool-input :id "t1"}
             ;; second usage is cumulative (subsumes first)
             {:type :usage :usage {:promptTokens 250 :completionTokens 50} :model "gpt-4"}]))))

  (testing "handles multiple models independently"
    (is (= {"model-a" {:prompt 100 :completion 20}
            "model-b" {:prompt 200 :completion 40}}
           (metabot.persistence/extract-usage
            [{:type :usage :usage {:promptTokens 100 :completionTokens 20} :model "model-a"}
             {:type :usage :usage {:promptTokens 200 :completionTokens 40} :model "model-b"}]))))

  (testing "returns empty map when no usage parts"
    (is (= {} (metabot.persistence/extract-usage [{:type :text :text "hi"}]))))

  (testing "missing model defaults to unknown"
    (is (= {"unknown" {:prompt 50 :completion 10}}
           (metabot.persistence/extract-usage
            [{:type :usage :usage {:promptTokens 50 :completionTokens 10}}])))))

(deftest combine-text-parts-xf-test
  (testing "passes through non-text parts"
    (is (= [{:type :tool, :id 1} {:type :tool, :id 2}]
           (into [] (metabot.persistence/combine-text-parts-xf)
                 [{:type :tool, :id 1} {:type :tool, :id 2}]))))

  (testing "combines consecutive text parts"
    (is (= [{:type :text, :text "hello world"}]
           (into [] (metabot.persistence/combine-text-parts-xf)
                 [{:type :text, :text "hello "}
                  {:type :text, :text "world"}]))))

  (testing "combines multiple runs"
    (is (= [{:type :text, :text "ab"}
            {:type :tool, :id 1}
            {:type :text, :text "cd"}]
           (into [] (metabot.persistence/combine-text-parts-xf)
                 [{:type :text, :text "a"}
                  {:type :text, :text "b"}
                  {:type :tool, :id 1}
                  {:type :text, :text "c"}
                  {:type :text, :text "d"}]))))

  (testing "handles empty input"
    (is (= [] (into [] (metabot.persistence/combine-text-parts-xf) []))))

  (testing "handles single text part"
    (is (= [{:type :text, :text "solo"}]
           (into [] (metabot.persistence/combine-text-parts-xf)
                 [{:type :text, :text "solo"}])))))

(defn- store-and-check!
  "Helper: call store-native-parts! with the given provider setting, return the stored message."
  [provider]
  (binding [mb.api/*current-user-id* (mt/user->id :crowberto)]
    (let [conv-id (str (random-uuid))]
      (try
        (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider provider]
          (metabot.persistence/store-native-parts!
           conv-id "internal"
           [{:type :start :id "msg-1"}
            {:type :text :text "Hello"}
            ;; SSE usage parts carry bare model names (from provider API response)
            {:type :usage :model "claude-sonnet-4-6" :usage {:promptTokens 100 :completionTokens 50}}
            {:type :data :data-type "state" :data {:step 1}}
            {:type :finish}]
           :external-id (str (random-uuid)))
          (t2/select-one :model/MetabotMessage :conversation_id conv-id))
        (finally
          (t2/delete! :model/MetabotMessage :conversation_id conv-id)
          (t2/delete! :model/MetabotConversation :id conv-id))))))

(deftest store-native-parts-ai-proxy-test
  (testing "metabase/ provider prefix sets ai_proxied true and stores bare model names"
    (let [msg (store-and-check! "metabase/anthropic/claude-sonnet-4-6")]
      (is (true? (:ai_proxied msg)))
      (is (= {:claude-sonnet-4-6 {:prompt 100 :completion 50}}
             (:usage msg))
          "usage keys should be bare model names, not metabase/anthropic/...")))

  (testing "BYOK provider (no metabase/ prefix) sets ai_proxied false"
    (let [msg (store-and-check! "anthropic/claude-sonnet-4-6")]
      (is (false? (:ai_proxied msg)))
      (is (= {:claude-sonnet-4-6 {:prompt 100 :completion 50}}
             (:usage msg))))))

(deftest strip-tool-output-bloat-test
  (testing "drops transient keys and structured-output fields outside the persisted subset"
    (is (= {:type :tool-output :id "call-1" :result {:output "<result>XML</result>"}}
           (metabot.persistence/strip-tool-output-bloat
            {:type   :tool-output
             :id     "call-1"
             :result {:output            "<result>XML</result>"
                      :resources         [{:id 1 :name "Orders" :columns [{:field_values [1 2 3]}]}]
                      :structured-output {:result-type :search :data [{:id 1}]}
                      :data-parts        [{:type :data :data-type "navigate_to"}]}}))))
  (testing "keeps the query-related subset of :structured-output for analytics extraction"
    (let [query-map {:database 1 :type :native :native {:query "SELECT 1"}}]
      (is (= {:type   :tool-output
              :id     "call-sql"
              :result {:output            "<result>...</result>"
                       :structured-output {:query-id      "qid-1"
                                           :query-content "SELECT 1"
                                           :query         query-map
                                           :database      1}}}
             (metabot.persistence/strip-tool-output-bloat
              {:type   :tool-output
               :id     "call-sql"
               :result {:output            "<result>...</result>"
                        :structured-output {:query-id      "qid-1"
                                            :query-content "SELECT 1"
                                            :query         query-map
                                            :database      1
                                            :resources     [{:field_values [1 2 3]}]
                                            :reactions     [:noop]}
                        :data-parts        [{:type :data}]}})))))
  (testing "preserves the snake-case :structured_output alias when present"
    (is (= {:type   :tool-output
            :id     "call-snake"
            :result {:output            "<result>...</result>"
                     :structured_output {:query-id "qid-2" :query-content "SELECT 2"}}}
           (metabot.persistence/strip-tool-output-bloat
            {:type   :tool-output
             :id     "call-snake"
             :result {:output            "<result>...</result>"
                      :structured_output {:query-id      "qid-2"
                                          :query-content "SELECT 2"
                                          :extra-bloat   [1 2 3]}}}))))
  (testing "leaves non-tool-output parts untouched"
    (let [text-part {:type :text :text "hello"}]
      (is (= text-part (metabot.persistence/strip-tool-output-bloat text-part)))))
  (testing "handles result with no :output key and no query-related structured-output"
    (is (= {:type :tool-output :id "call-2" :result {}}
           (metabot.persistence/strip-tool-output-bloat
            {:type   :tool-output
             :id     "call-2"
             :result {:structured-output {:some "data"}}})))))

(defn- legacy-query
  "A legacy inner-query-style map suitable for [[#'api/upgrade-viewing-queries]]."
  []
  {:database (mt/id)
   :query    {:source-table (mt/id :orders)}
   :type     :query})

(deftest upgrade-viewing-queries-upgradable-types-test
  (doseq [item-type ["adhoc" "question" "metric" "model"]]
    (testing (str "upgrades query for type=" item-type)
      (let [result (#'api/upgrade-viewing-queries [{:type item-type :query (legacy-query)}])
            q      (:query (first result))]
        (is (= :mbql/query (:lib/type q)))
        (is (= (mt/id) (:database q)))))))

(deftest upgrade-viewing-queries-chart-configs-test
  (let [lq     (legacy-query)
        item   {:type          "adhoc"
                :query         lq
                :chart_configs [{:query lq}
                                {:query lq}]}
        result (first (#'api/upgrade-viewing-queries [item]))]
    (is (= :mbql/query (:lib/type (:query result))))
    (is (every? #(= :mbql/query (:lib/type (:query %)))
                (:chart_configs result)))))

(deftest upgrade-viewing-queries-missing-keys-test
  (testing "items without :query are unchanged"
    (let [item {:type "adhoc"}]
      (is (= [item] (#'api/upgrade-viewing-queries [item])))))
  (testing "items without :chart_configs keep no chart_configs"
    (let [result (first (#'api/upgrade-viewing-queries [{:type "question" :query (legacy-query)}]))]
      (is (nil? (:chart_configs result))))))

(deftest upgrade-viewing-queries-mixed-items-test
  (let [lq (legacy-query)
        items [{:type "adhoc" :query lq}
               {:type "dashboard"}
               {:type "model" :query lq :chart_configs [{:query lq}]}]
        result (#'api/upgrade-viewing-queries items)]
    (is (=? [{:query {:lib/type :mbql/query}}
             {}
             {:query {:lib/type :mbql/query}
              :chart_configs [{:query {:lib/type :mbql/query}}]}]
            result))))

(deftest upgrade-viewing-queries-idempotence-test
  (let [mp meta/metadata-provider
        q (lib/query mp (lib.metadata/table mp (meta/id :orders)))
        items [{:type "adhoc" :query q}
               {:type "dashboard"}
               {:type "model" :query q :chart_configs [{:query q}]}]
        result (#'api/upgrade-viewing-queries items)]
    (is (=? [{:type "adhoc" :query q}
             {:type "dashboard"}
             {:type "model" :query q :chart_configs [{:query q}]}]
            result))))

(deftest ^:parallel upgrade-viewing-queries-native-test
  (testing "Native queries are properly adjusted"
    (let [mp (mt/metadata-provider)
          native (lib/native-query mp "select * from orders")
          legacy (lib.convert/->legacy-MBQL native)
          items  [{:type "adhoc" :query legacy}
                  {:type "dashboard"}
                  {:type "model" :query legacy :chart_configs [{:query legacy}]}]
          result (#'api/upgrade-viewing-queries items)]
      (is (=? [{:type "adhoc" :query native}
               {:type "dashboard"}
               {:type "model" :query native :chart_configs [{:query native}]}]
              result)))))

(deftest streaming-request-passes-metabot-id-test
  (testing "streaming-request passes metabot-id to native-agent-streaming-request"
    (let [captured-args (atom nil)
          test-metabot-id metabot.config/embedded-metabot-id]
      (with-redefs [metabot.config/check-metabot-enabled! (constantly nil)
                    api/store-aiservice-messages!         (constantly nil)
                    api/native-agent-streaming-request    (fn [args]
                                                            (reset! captured-args args)
                                                            ;; Return a minimal streaming response
                                                            nil)]
        (api/streaming-request {:metabot_id      test-metabot-id
                                :profile_id      nil
                                :message         "test message"
                                :context         {}
                                :history         []
                                :conversation_id (str (random-uuid))
                                :state           {}
                                :debug           false}
                               nil
                               nil)
        (testing "metabot-id is included in the arguments"
          (is (some? (:metabot-id @captured-args))
              "metabot-id should not be nil")
          (is (= test-metabot-id (:metabot-id @captured-args))
              "metabot-id should match the input metabot_id"))))))

(deftest streaming-request-ip-address-test
  (mt/with-model-cleanup [:model/MetabotMessage
                          [:model/MetabotConversation :created_at]]
    (let [request-body (fn [conversation-id]
                         {:metabot_id      metabot.config/embedded-metabot-id
                          :profile_id      nil
                          :message         "hi"
                          :context         {}
                          :history         []
                          :conversation_id conversation-id
                          :state           {}
                          :debug           false})
          ip-for       (fn [conversation-id]
                         (:ip_address (t2/select-one :model/MetabotConversation :id conversation-id)))]
      (with-redefs [metabot.config/check-metabot-enabled! (constantly nil)
                    api/native-agent-streaming-request    (constantly nil)]
        (mt/with-test-user :rasta
          (testing "first writer wins: initial call captures the IP, later calls do not overwrite it"
            (let [conversation-id (str (random-uuid))]
              (api/streaming-request (request-body conversation-id) "1.2.3.4" nil)
              (is (= "1.2.3.4" (ip-for conversation-id)))
              (api/streaming-request (request-body conversation-id) "5.6.7.8" nil)
              (is (= "1.2.3.4" (ip-for conversation-id)))))
          (testing "null IP on pre-feature rows is backfilled on next call"
            (let [conversation-id (str (random-uuid))]
              (t2/insert! :model/MetabotConversation {:id conversation-id :user_id (mt/user->id :rasta)})
              (api/streaming-request (request-body conversation-id) "9.9.9.9" nil)
              (is (= "9.9.9.9" (ip-for conversation-id))))))))))

(deftest streaming-request-embed-url-test
  (mt/with-model-cleanup [:model/MetabotMessage
                          [:model/MetabotConversation :created_at]]
    (let [request-body  (fn [conversation-id]
                          {:metabot_id      metabot.config/embedded-metabot-id
                           :profile_id      nil
                           :message         "hi"
                           :context         {}
                           :history         []
                           :conversation_id conversation-id
                           :state           {}
                           :debug           false})
          embed-url-for (fn [conversation-id]
                          (:embed_url (t2/select-one :model/MetabotConversation :id conversation-id)))]
      (with-redefs [metabot.config/check-metabot-enabled! (constantly nil)
                    api/native-agent-streaming-request    (constantly nil)]
        (mt/with-test-user :rasta
          (testing "first writer wins: initial call captures the Referer, later calls do not overwrite it"
            (let [conversation-id (str (random-uuid))]
              (api/streaming-request (request-body conversation-id) nil "https://host.example.com/page")
              (is (= "https://host.example.com/page" (embed-url-for conversation-id)))
              (api/streaming-request (request-body conversation-id) nil "https://other.example.com/other")
              (is (= "https://host.example.com/page" (embed-url-for conversation-id)))))
          (testing "null embed_url on pre-feature rows is backfilled on next call"
            (let [conversation-id (str (random-uuid))]
              (t2/insert! :model/MetabotConversation {:id conversation-id :user_id (mt/user->id :rasta)})
              (api/streaming-request (request-body conversation-id) nil "https://host.example.com/backfilled")
              (is (= "https://host.example.com/backfilled" (embed-url-for conversation-id)))))
          (testing "missing Referer leaves embed_url null"
            (let [conversation-id (str (random-uuid))]
              (api/streaming-request (request-body conversation-id) nil nil)
              (is (nil? (embed-url-for conversation-id))))))))))

(deftest agent-streaming-endpoint-captures-referer-test
  (testing "POST /metabot/agent-streaming captures the Referer header as embed_url"
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider test-provider]
      (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
        (with-redefs [openrouter/openrouter (fn [_]
                                              (mut/mock-llm-response
                                               [{:type :start :id "msg-1"}
                                                {:type :text :text "hi"}
                                                {:type  :usage       :usage {:promptTokens 1 :completionTokens 1}
                                                 :model "test-model" :id    "msg-1"}]))]
          (mt/with-model-cleanup [:model/MetabotMessage
                                  [:model/MetabotConversation :created_at]]
            (let [conversation-id (str (random-uuid))
                  referer         "https://customer.example.com/dashboard"]
              (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                    {:request-options {:headers {"referer" referer}}}
                                    {:message         "hello"
                                     :context         {}
                                     :conversation_id conversation-id
                                     :history         []
                                     :state           {}})
              (is (= referer
                     (:embed_url (t2/select-one :model/MetabotConversation :id conversation-id)))))))))))

(deftest agent-streaming-returns-free-trial-limit-error-when-managed-provider-is-locked-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                     "metabase/anthropic/claude-sonnet-4-6"]
    (with-redefs [premium-features/token-status             (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value 1000000
                                                                                                                       :is-locked   true}}})
                  metabot.config/check-metabot-enabled!     (constantly nil)
                  api/store-aiservice-messages!             (fn [& _]
                                                              (throw (ex-info "should not store messages" {})))
                  api/native-agent-streaming-request        (fn [& _]
                                                              (throw (ex-info "should not call agent" {})))]
      (mt/user-http-request :rasta :post 402 "metabot/agent-streaming"
                            {:message         "test message"
                             :context         {}
                             :conversation_id (str (random-uuid))
                             :history         []
                             :state           {}}))))
