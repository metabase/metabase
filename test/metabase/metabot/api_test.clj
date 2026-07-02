(ns metabase.metabot.api-test
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
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
   [metabase.metabot.agent.core :as agent]
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
          (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
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
  (testing "When the client closes a native-agent streaming connection, the
            pipeline tears down and the partial turn is persisted as aborted."
    ;; We set up a fake OpenRouter-compatible (Chat Completions) SSE server that
    ;; streams text-delta events. The Metabase server connects to it via the
    ;; full native-agent pipeline:
    ;;   openrouter-raw → sse-reducible → openrouter->aisdk-chunks-xf → tool-executor-xf
    ;;   → lite-aisdk-xf → agent loop → aisdk-line-xf → streaming-writer-rf → client
    ;; The test client reads one byte and closes. The streaming-writer-rf's poll
    ;; of `canceled-chan` flips the `canceled?` volatile and returns `reduced`,
    ;; the agent loop unwinds, and `finalize-assistant-turn!` is called from the
    ;; `finally` with `:finished? false`, UPDATEing the placeholder row inserted
    ;; by `start-turn!`.
    (let [total-chunks  30
          cnt           (atom total-chunks)
          stored-parts  (atom nil)
          stored-kwargs (atom nil)
          chat-id       (str "chatcmpl-" (random-uuid))
          ;; Fake OpenRouter API: streams Chat Completions SSE text deltas.
          llm-handler
          (fn [req respond _raise]
            (respond
             (compojure.response/render
              (sr/streaming-response {:content-type "text/event-stream; charset=utf-8"} [os llm-canceled-chan]
                (try
                  (let [write!    (fn [^String s]
                                    (.write os (.getBytes s "UTF-8"))
                                    (.flush os))
                        canceled? #(some? (a/poll! llm-canceled-chan))]
                    ;; First chunk: role assignment (empty content to establish assistant role)
                    (write! (sse-event {:id      chat-id
                                        :model   "anthropic/claude-haiku-4-5"
                                        :choices [{:index         0
                                                   :delta         {:role "assistant" :content ""}
                                                   :finish_reason nil}]}))
                    ;; Stream text content chunks slowly, stop early if the consumer disconnects
                    (loop []
                      (when (and (pos? @cnt) (not (canceled?)))
                        (write! (sse-event {:id      chat-id
                                            :model   "anthropic/claude-haiku-4-5"
                                            :choices [{:index         0
                                                       ;; pad past Jetty's 8 KB buffer so .flush reaches the client mid-stream
                                                       :delta         {:content (str "chunk-" @cnt " " (apply str (repeat 512 \x)))}
                                                       :finish_reason nil}]}))
                        (swap! cnt dec)
                        (Thread/sleep 10)
                        (recur)))
                    (when-not (canceled?)
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
                      (write! "data: [DONE]\n\n")))
                  (catch Exception _e nil)))
              req)))
          llm-server
          (doto (server.instance/create-server llm-handler {:port 0 :join? false})
            .start)
          llm-url       (str "http://localhost:" (.. llm-server getURI getPort))]
      (try
        (mt/test-helpers-set-global-values!
          (search.tu/with-index-disabled
            (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider test-provider]
              (let [real-http-post http/post]
                (with-redefs [llm.settings/llm-openrouter-api-key            (constantly "fake-key")
                              llm.settings/llm-openrouter-api-base-url       (constantly llm-url)
                              scope/resolve-user-permissions                 (constantly scope/all-yes-permissions)
                              ;; The fake LLM server doesn't gzip, but clj-http wraps with
                              ;; GZIPInputStream by default. Closing mid-stream causes ZLIB errors.
                              http/post                                      (fn [url opts]
                                                                               (real-http-post url (assoc opts :decompress-body false)))
                              metabot.context/create-context                 (fn [ctx & _] ctx)
                              metabot.persistence/finalize-assistant-turn!   (fn [_conv-id _pk parts & kwargs]
                                                                               (reset! stored-parts parts)
                                                                               (reset! stored-kwargs (apply hash-map kwargs)))
                              sr/async-cancellation-poll-interval-ms         5]
                  (testing "Closing stream body tears down the pipeline and persists the aborted turn"
                    (reset! cnt total-chunks)
                    (reset! stored-parts nil)
                    (reset! stored-kwargs nil)
                    (mt/with-model-cleanup [:model/MetabotMessage
                                            [:model/MetabotConversation :created_at]]
                      (let [conversation-id (str (random-uuid))
                            response (mt/user-real-request-full-response
                                      :rasta :post 202 "metabot/agent-streaming"
                                      {:request-options {:as              :stream
                                                         :decompress-body false}}
                                      {:message         "Test closure"
                                       :context         {}
                                       :conversation_id conversation-id
                                       :history         []
                                       :state           {}})]
                        (.read ^java.io.InputStream (:body response)) ;; start the handler
                        ;; Close the underlying client, not the body stream: closing the body would
                        ;; make clj-http drain the (now chunked) response to completion, which looks
                        ;; like a normal finish rather than a disconnect. Closing the client aborts
                        ;; the connection, which is what the server's cancel loop detects.
                        (.close ^java.io.Closeable (:http-client response))
                        (u/poll {:thunk       #(deref stored-parts)
                                 :done?       some?
                                 :interval-ms 10
                                 :timeout-ms  3000})
                        (is (some? @stored-parts)
                            "finalize-assistant-turn! was called even though the client disconnected")
                        (is (false? (:finished? @stored-kwargs))
                            "the finalized turn is marked :finished? false — the cancel was detected")
                        (is (= 2 (count (t2/select :model/MetabotMessage
                                                   :conversation_id conversation-id)))
                            "start-turn! inserted exactly user + placeholder; no extra row from finalize")))))))))
        (finally
          (.stop llm-server))))))

(deftest thrown-during-agent-setup-persists-as-errored-test
  (testing "A throwable escaping the agent loop (e.g. permission/setup throw before
            the reducible is constructed) finalizes the placeholder with
            :finished? true + a structured :error payload — distinguishable from
            both a successful turn (error nil) and a client abort (finished false)."
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider test-provider]
      (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
        (let [stored-parts  (atom nil)
              stored-kwargs (atom nil)]
          (with-redefs [;; Pre-reducible throw: this is the exact escape path the new
                        ;; catch covers. The agent loop's own (catch Exception) is
                        ;; inside the reify, so a throw from `run-agent-loop` itself
                        ;; bypasses it entirely.
                        agent/run-agent-loop
                        (fn [_opts]
                          (throw (ex-info "agent setup exploded"
                                          {:status 503 :provider :test})))
                        metabot.persistence/finalize-assistant-turn!
                        (fn [_conv-id _pk parts & kwargs]
                          (reset! stored-parts parts)
                          (reset! stored-kwargs (apply hash-map kwargs)))]
            (mt/with-model-cleanup [:model/MetabotMessage
                                    [:model/MetabotConversation :created_at]]
              (let [response (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                   {:message         "go"
                                                    :context         {}
                                                    :conversation_id (str (random-uuid))
                                                    :history         []
                                                    :state           {}})]
                (u/poll {:thunk       #(deref stored-kwargs)
                         :done?       some?
                         :interval-ms 10
                         :timeout-ms  3000})
                (is (some? @stored-kwargs)
                    "finalize-assistant-turn! is called from the finally even when setup threw")
                (is (true? (:finished? @stored-kwargs))
                    "a thrown turn is :finished? true — `finished=false` is reserved for client aborts")
                (is (=? {:message #"(?i)agent setup exploded"
                         :type    "clojure.lang.ExceptionInfo"
                         :data    {:status 503 :provider :test}}
                        (:error @stored-kwargs))
                    "the throwable becomes a structured error payload")
                (testing "the failure is streamed to the client as an AI SDK error part (3:...) rather than a silent close"
                  (is (some #(str/starts-with? % "3:") (str/split-lines response)))
                  (is (re-find #"(?i)agent setup exploded" response)))))))))))

(deftest settings-get-returns-live-models-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-haiku-4-5"
                                     llm.settings/llm-anthropic-api-key    "sk-ant-valid"]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn
                                                           ([provider]
                                                            (is (= "anthropic" provider))
                                                            {:models [{:id "claude-haiku-4-5"
                                                                       :display_name "Claude Haiku 4.5"}]})
                                                           ([provider {:keys [credentials]}]
                                                            (is (= "anthropic" provider))
                                                            (is (= {:api-key "sk-ant-valid"} credentials))
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
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [credentials]}]
                                                           (is (= {:api-key "sk-ant-valid"} credentials))
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
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [credentials]}]
                                                           (is (= {:api-key "sk-or-v1-valid"} credentials))
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
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn
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
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn
                                                           ([provider]
                                                            (is (= "openai" provider))
                                                            {:models [{:id "gpt-4.1-mini"
                                                                       :display_name "GPT-4.1 mini"}]})
                                                           ([provider {:keys [credentials]}]
                                                            (is (= "openai" provider))
                                                            (is (= {:api-key "sk-valid"} credentials))
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
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn
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
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn
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
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-haiku-4-5"
                                       llm.settings/llm-anthropic-api-key nil]
      (let [calls (atom 0)]
        (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                               (swap! calls inc)
                                                               (is (= "anthropic" provider))
                                                               (is (= {:api-key "sk-ant-valid"} credentials))
                                                               (is (nil? (llm.settings/llm-anthropic-api-key))
                                                                   "verification should happen before saving the key")
                                                               {:models [{:id "claude-haiku-4-5"
                                                                          :display_name "Claude Haiku 4.5"}]})]
          (is (= {:value  "anthropic/claude-haiku-4-5"
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
        (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                               (swap! calls inc)
                                                               (is (= "anthropic" provider))
                                                               (is (= {:api-key "sk-ant-valid"} credentials))
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
        (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                               (swap! calls inc)
                                                               (is (= "anthropic" provider))
                                                               (is (= {:api-key "sk-ant-valid"} credentials))
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
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                           (is (= "anthropic" provider))
                                                           (is (= {:api-key "sk-ant-valid"} credentials))
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
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                             (swap! calls inc)
                                                             (is (= "openai" provider))
                                                             (is (= {:api-key "sk-invalid"} credentials))
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

(deftest settings-put-blank-api-key-clears-saved-key-test
  (mt/with-temp-env-var-value! [mb-llm-openai-api-key nil]
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "openai/gpt-4.1-mini"
                                       llm.settings/llm-openai-api-key       "sk-valid"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider _opts]
                                                             (is false (str "unexpected list-models call: " provider)))]
        (testing "an explicit nil api-key clears the saved key without validating against the old one"
          (is (=? {:value  "openai/gpt-4.1-mini"
                   :models []}
                  (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                        {:provider "openai"
                                         :api-key  nil})))
          (is (nil? (llm.settings/llm-openai-api-key))))))))

(deftest settings-put-does-not-treat-outages-as-invalid-keys-test
  (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key nil]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                           (is (= "openai" provider))
                                                           (is (= {:api-key "sk-valid"} credentials))
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
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                           (is (= "anthropic" provider))
                                                           (is (= {:api-key "sk-ant-valid"} credentials))
                                                           (throw (ex-info "Anthropic API key has insufficient permissions"
                                                                           {:api-error true
                                                                            :status-code 403})))]
      (let [response (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                           {:provider "anthropic"
                                            :model    "claude-sonnet-4-5"})]
        (is (= "Anthropic API key has insufficient permissions" (:message response)))
        (is (= "anthropic/claude-haiku-4-5"
               (metabot.settings/llm-metabot-provider)))))))

(deftest settings-get-surfaces-credentials-error-test
  (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key "sk-invalid"]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider _opts]
                                                           (throw (ex-info "OpenAI API key expired or invalid"
                                                                           {:api-error true
                                                                            :status-code 401})))]
      (is (= {:value             (metabot.settings/llm-metabot-provider)
              :credentials-error "OpenAI API key expired or invalid"
              :models            []}
             (mt/user-http-request :crowberto :get 200 "metabot/settings"
                                   :provider "openai"))))))

(deftest settings-get-degrades-non-credential-provider-4xx-test
  (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key "sk-valid"]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider _opts]
                                                           ;; e.g. a base URL pointing at the wrong Azure surface;
                                                           ;; rethrow-api-error! tags these with :status, not :status-code
                                                           (throw (ex-info "OpenAI API error (HTTP 400) — Missing required query parameter: api-version"
                                                                           {:api-error true
                                                                            :status    400})))]
      (let [response (mt/user-http-request :crowberto :get 200 "metabot/settings"
                                           :provider "openai")]
        (is (= [] (:models response)))
        (is (re-find #"api-version" (:credentials-error response))
            "a non-401 provider 4xx (misconfigured surface) keeps GET /settings loadable and returns the provider message")))))

(deftest settings-put-rejects-env-shadowed-provider-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider "anthropic/claude-haiku-4-5"
                                mb-llm-openai-api-key   nil]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider _opts]
                                                           (is false "should reject before verifying credentials"))]
      (let [response (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                           {:provider "openai"
                                            :model    "gpt-5.1"
                                            :api-key  "sk-new"})]
        (is (re-find #"MB_LLM_METABOT_PROVIDER" (:message response))
            "a provider/model write is rejected when the provider setting is env-controlled")))))

(deftest settings-put-allows-api-key-rotation-when-provider-env-set-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider "openai/gpt-5.1"
                                mb-llm-openai-api-key   nil]
    (mt/with-temporary-setting-values [llm.settings/llm-openai-api-key "sk-old"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [credentials]}]
                                                             (is (= {:api-key "sk-new"} credentials))
                                                             {:models [{:id "gpt-5.1" :display_name "GPT-5.1"}]})]
        (mt/user-http-request :crowberto :put 200 "metabot/settings"
                              {:provider "openai"
                               :api-key  "sk-new"})
        (is (= "sk-new" (llm.settings/llm-openai-api-key))
            "rotating the key for an env-set provider does not require a provider write and so is allowed")))))

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
                         :positive   true}))))
    (testing "/source-feedback"
      (is (= "Unauthenticated"
             (mt/client :post 401 "metabot/source-feedback"
                        {:metabot_id  1
                         :message_id  "x"
                         :source_id   1
                         :source_type "table"
                         :positive    true}))))))

(deftest source-feedback-returns-no-content-test
  (testing "POST /metabot/source-feedback returns 204 after persisting feedback"
    (let [conversation-id (str (random-uuid))
          external-id     (str (random-uuid))
          user-id         (mt/user->id :rasta)]
      (try
        (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
        (let [message-id (first (t2/insert-returning-pks!
                                 :model/MetabotMessage
                                 {:conversation_id conversation-id
                                  :role            "assistant"
                                  :profile_id      "gpt-x"
                                  :external_id     external-id
                                  :total_tokens    5
                                  :data            [{:type "text" :text "hi"}]}))]
          (is (nil? (mt/user-http-request :rasta :post 204 "metabot/source-feedback"
                                          {:metabot_id  1
                                           :message_id  external-id
                                           :source_id   42
                                           :source_type "table"
                                           :positive    true})))
          (is (some? (t2/select-one :model/MetabotSourceFeedback
                                    :message_id  message-id
                                    :user_id     user-id
                                    :source_id   42
                                    :source_type "table"))))
        (finally
          (t2/delete! :model/MetabotSourceFeedback :user_id user-id :source_id 42 :source_type "table")
          (t2/delete! :model/MetabotMessage :conversation_id conversation-id)
          (t2/delete! :model/MetabotConversation :id conversation-id))))))

(deftest metabot-enabled-setting-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider test-provider]
    (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
      (let [base-request {:message         "Test"
                          :context         {}
                          :conversation_id (str (random-uuid))
                          :history         []
                          :state           {}}]
        (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
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

(defn- start-and-finalize-with-provider!
  "Helper: run start-turn! + finalize-assistant-turn! under `provider`, return the
  finalized assistant row."
  [provider]
  (binding [mb.api/*current-user-id* (mt/user->id :crowberto)]
    (let [conv-id (str (random-uuid))]
      (try
        (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider provider]
          (let [{:keys [assistant-msg-id]} (metabot.persistence/start-turn!
                                            conv-id "internal"
                                            {:role "user" :content "hi"})]
            (metabot.persistence/finalize-assistant-turn!
             conv-id assistant-msg-id
             [{:type :start :id "msg-1"}
              {:type :text :text "Hello"}
              ;; SSE usage parts carry bare model names (from provider API response)
              {:type :usage :model "claude-sonnet-4-6" :usage {:promptTokens 100 :completionTokens 50}}
              {:type :data :data-type "state" :data {:step 1}}
              {:type :finish}])
            (t2/select-one :model/MetabotMessage assistant-msg-id)))
        (finally
          (t2/delete! :model/MetabotMessage :conversation_id conv-id)
          (t2/delete! :model/MetabotConversation :id conv-id))))))

(deftest start-turn-ai-proxy-test
  (testing "metabase/ provider prefix sets ai_proxied true and stores bare model names"
    (let [msg (start-and-finalize-with-provider! "metabase/anthropic/claude-sonnet-4-6")]
      (is (true? (:ai_proxied msg)))
      (is (= {:claude-sonnet-4-6 {:prompt 100 :completion 50}}
             (:usage msg))
          "usage keys should be bare model names, not metabase/anthropic/...")))
  (testing "BYOK provider (no metabase/ prefix) sets ai_proxied false"
    (let [msg (start-and-finalize-with-provider! "anthropic/claude-sonnet-4-6")]
      (is (false? (:ai_proxied msg)))
      (is (= {:claude-sonnet-4-6 {:prompt 100 :completion 50}}
             (:usage msg))))))

(deftest finalize-assistant-turn-data-part-filtering-test
  (testing "persistable data parts land in MetabotMessage.data; state is salvaged to conversation and excluded from data"
    (binding [mb.api/*current-user-id* (mt/user->id :crowberto)]
      (let [conv-id (str (random-uuid))]
        (try
          (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-sonnet-4-6"]
            (let [{:keys [assistant-msg-id]} (metabot.persistence/start-turn!
                                              conv-id "internal"
                                              {:role "user" :content "hi"})]
              (metabot.persistence/finalize-assistant-turn!
               conv-id assistant-msg-id
               [{:type :start :id "msg-1"}
                {:type :text :text "Hi"}
                {:type :data :data-type "navigate_to" :data "/question/1"}
                {:type :data :data-type "todo_list" :version 1 :data [{:id "1" :content "x" :status "pending" :priority "low"}]}
                {:type :data :data-type "code_edit" :version 1 :data {:buffer_id "b" :value "v"}}
                {:type :data :data-type "transform_suggestion" :version 1 :data {}}
                {:type :data :data-type "adhoc_viz" :version 1 :data {:query {} :link "/q"}}
                {:type :data :data-type "static_viz" :version 1 :data {:entity_id 1}}
                {:type :data :data-type "state" :data {:step 1}}
                {:type :usage :model "claude-sonnet-4-6" :usage {:promptTokens 1 :completionTokens 1}}
                {:type :finish}])
              (let [msg        (t2/select-one :model/MetabotMessage assistant-msg-id)
                    conv       (t2/select-one :model/MetabotConversation :id conv-id)
                    data-types (into #{} (keep :data-type) (:data msg))
                    part-types (into #{} (map :type) (:data msg))]
                (is (= #{"navigate_to" "todo_list" "code_edit" "transform_suggestion" "adhoc_viz" "static_viz"}
                       data-types)
                    "all persistable data parts (not state) should be in :data")
                (is (contains? part-types "text")
                    "text parts survive")
                (is (not-any? part-types #{"start" "usage" "finish"})
                    "stream metadata is dropped")
                (is (= {:step 1} (:state conv))
                    "state value is salvaged to MetabotConversation.state"))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conv-id)
            (t2/delete! :model/MetabotConversation :id conv-id)))))))

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
      (mt/with-dynamic-fn-redefs [metabot.config/check-metabot-enabled! (constantly nil)
                                  api/check-conversation-access!        (constantly nil)
                                  metabot.persistence/start-turn!       (fn [& _]
                                                                          {:assistant-msg-id 1
                                                                           :assistant-external-id "ext-id"})
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
                               {:origin nil :referer nil :user-agent nil :ip-address nil})
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
                         (:ip_address (t2/select-one :model/MetabotConversation :id conversation-id)))
          info-with-ip (fn [ip] {:origin nil :referer nil :user-agent nil :ip-address ip})]
      (mt/with-dynamic-fn-redefs [metabot.config/check-metabot-enabled! (constantly nil)
                                  api/native-agent-streaming-request    (constantly nil)]
        (mt/with-premium-features #{:audit-app}
          (mt/with-test-user :rasta
            (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
              (testing "first writer wins: initial call captures the IP, later calls do not overwrite it"
                (let [conversation-id (str (random-uuid))]
                  (api/streaming-request (request-body conversation-id) (info-with-ip "1.2.3.4"))
                  (is (= "1.2.3.4" (ip-for conversation-id)))
                  (api/streaming-request (request-body conversation-id) (info-with-ip "5.6.7.8"))
                  (is (= "1.2.3.4" (ip-for conversation-id)))))
              (testing "null IP on pre-feature rows is backfilled on next call"
                (let [conversation-id (str (random-uuid))]
                  (t2/insert! :model/MetabotConversation {:id conversation-id :user_id (mt/user->id :rasta)})
                  (api/streaming-request (request-body conversation-id) (info-with-ip "9.9.9.9"))
                  (is (= "9.9.9.9" (ip-for conversation-id))))))
            (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
              (testing "ip_address is NOT recorded when analytics-pii-retention-enabled is off"
                (let [conversation-id (str (random-uuid))]
                  (api/streaming-request (request-body conversation-id) (info-with-ip "1.2.3.4"))
                  (is (nil? (ip-for conversation-id))))))))))))

(deftest streaming-request-embedding-fields-test
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
          info-with    (fn [embed-referrer]
                         {:origin     embed-referrer
                          :referer    embed-referrer
                          :user-agent nil
                          :ip-address nil})
          convo-for    (fn [conversation-id]
                         (t2/select-one :model/MetabotConversation :id conversation-id))]
      (mt/with-dynamic-fn-redefs [metabot.config/check-metabot-enabled! (constantly nil)
                                  api/native-agent-streaming-request    (constantly nil)]
        (mt/with-premium-features #{:audit-app}
          (mt/with-test-user :rasta
            (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
              (testing "flag on: hostname AND path are recorded"
                (let [conversation-id (str (random-uuid))]
                  (api/streaming-request (request-body conversation-id)
                                         (info-with "https://customer.example.com/dashboard"))
                  (let [convo (convo-for conversation-id)]
                    (is (= "customer.example.com" (:embedding_hostname convo)))
                    (is (= "/dashboard"           (:embedding_path     convo))))))
              (testing "first writer wins: hostname is not overwritten on later calls"
                (let [conversation-id (str (random-uuid))]
                  (api/streaming-request (request-body conversation-id)
                                         (info-with "https://host.example.com/page"))
                  (api/streaming-request (request-body conversation-id)
                                         (info-with "https://other.example.com/other"))
                  (let [convo (convo-for conversation-id)]
                    (is (= "host.example.com" (:embedding_hostname convo)))
                    (is (= "/page"            (:embedding_path     convo))))))
              (testing "missing embed referrer leaves both columns null"
                (let [conversation-id (str (random-uuid))]
                  (api/streaming-request (request-body conversation-id) (info-with nil))
                  (let [convo (convo-for conversation-id)]
                    (is (nil? (:embedding_hostname convo)))
                    (is (nil? (:embedding_path     convo)))))))
            (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
              (testing "flag off: hostname IS still recorded (ungated), path is NOT"
                (let [conversation-id (str (random-uuid))]
                  (api/streaming-request (request-body conversation-id)
                                         (info-with "https://customer.example.com/dashboard"))
                  (let [convo (convo-for conversation-id)]
                    (is (= "customer.example.com" (:embedding_hostname convo)))
                    (is (nil?                     (:embedding_path     convo)))))))))))))

(deftest agent-streaming-endpoint-captures-embed-referrer-test
  (testing "POST /metabot/agent-streaming captures x-metabase-embed-referrer as embedding_hostname/embedding_path"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider test-provider]
        (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
          (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                              (mut/mock-llm-response
                                                               [{:type :start :id "msg-1"}
                                                                {:type :text :text "hi"}
                                                                {:type  :usage       :usage {:promptTokens 1 :completionTokens 1}
                                                                 :model "test-model" :id    "msg-1"}]))]
            (mt/with-model-cleanup [:model/MetabotMessage
                                    [:model/MetabotConversation :created_at]]
              (testing "flag on: hostname AND path are recorded"
                (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
                  (let [conversation-id (str (random-uuid))
                        embed-referrer  "https://customer.example.com/dashboard"]
                    (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                          {:request-options {:headers {"x-metabase-embed-referrer" embed-referrer}}}
                                          {:message         "hello"
                                           :context         {}
                                           :conversation_id conversation-id
                                           :history         []
                                           :state           {}})
                    (let [convo (t2/select-one :model/MetabotConversation :id conversation-id)]
                      (is (= "customer.example.com" (:embedding_hostname convo)))
                      (is (= "/dashboard"           (:embedding_path     convo)))))))
              (testing "flag off: hostname recorded (ungated), path NOT recorded"
                (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
                  (let [conversation-id (str (random-uuid))
                        embed-referrer  "https://customer.example.com/dashboard"]
                    (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                          {:request-options {:headers {"x-metabase-embed-referrer" embed-referrer}}}
                                          {:message         "hello"
                                           :context         {}
                                           :conversation_id conversation-id
                                           :history         []
                                           :state           {}})
                    (let [convo (t2/select-one :model/MetabotConversation :id conversation-id)]
                      (is (= "customer.example.com" (:embedding_hostname convo)))
                      (is (nil?                     (:embedding_path     convo)))))))
              (testing "standard Referer header (no x-metabase-embed-referrer) leaves both columns null"
                (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
                  (let [conversation-id (str (random-uuid))]
                    (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                          {:request-options {:headers {"referer" "https://customer.example.com/dashboard"}}}
                                          {:message         "hello"
                                           :context         {}
                                           :conversation_id conversation-id
                                           :history         []
                                           :state           {}})
                    (let [convo (t2/select-one :model/MetabotConversation :id conversation-id)]
                      (is (nil? (:embedding_hostname convo)))
                      (is (nil? (:embedding_path     convo)))))))
              (testing "user-agent recorded only when flag is on"
                (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
                  (let [conversation-id (str (random-uuid))]
                    (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                          {:request-options {:headers {"user-agent" "Mozilla/5.0 (TestAgent)"}}}
                                          {:message         "hello"
                                           :context         {}
                                           :conversation_id conversation-id
                                           :history         []
                                           :state           {}})
                    (let [convo (t2/select-one :model/MetabotConversation :id conversation-id)]
                      (is (= "Mozilla/5.0 (TestAgent)" (:user_agent convo)))
                      (is (some? (:sanitized_user_agent convo))))))
                (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
                  (let [conversation-id (str (random-uuid))]
                    (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                          {:request-options {:headers {"user-agent" "Mozilla/5.0 (TestAgent)"}}}
                                          {:message         "hello"
                                           :context         {}
                                           :conversation_id conversation-id
                                           :history         []
                                           :state           {}})
                    (let [convo (t2/select-one :model/MetabotConversation :id conversation-id)]
                      (is (nil? (:user_agent           convo)))
                      (is (nil? (:sanitized_user_agent convo))))))))))))))

(deftest agent-streaming-returns-free-trial-limit-error-when-managed-provider-is-locked-test
  (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                     "metabase/anthropic/claude-sonnet-4-6"]
    (mt/with-dynamic-fn-redefs [premium-features/token-status             (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value 1000000
                                                                                                                                     :is-locked   true}}})
                                metabot.config/check-metabot-enabled!     (constantly nil)
                                metabot.persistence/start-turn!           (fn [& _]
                                                                            (throw (ex-info "should not store messages" {})))
                                api/native-agent-streaming-request        (fn [& _]
                                                                            (throw (ex-info "should not call agent" {})))]
      (mt/user-http-request :rasta :post 402 "metabot/agent-streaming"
                            {:message         "test message"
                             :context         {}
                             :conversation_id (str (random-uuid))
                             :history         []
                             :state           {}}))))

;;; ------------------------------------------------ Bedrock settings ------------------------------------------------

(deftest settings-get-groups-bedrock-models-test
  (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                     llm.settings/llm-bedrock-secret-access-key "test-secret"]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                           (is (= "bedrock" provider))
                                                           (is (=? {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                                    :secret-access-key "test-secret"}
                                                                   credentials)
                                                               "the configured AWS credentials are passed to the model lister")
                                                           {:models [{:id "openai.gpt-5.5"
                                                                      :display_name "openai.gpt-5.5"}
                                                                     {:id "anthropic.claude-haiku-4-5"
                                                                      :display_name "anthropic.claude-haiku-4-5"}]})]
      (is (= {:value  (metabot.settings/llm-metabot-provider)
              :models [{:id           "anthropic.claude-haiku-4-5"
                        :display_name "anthropic.claude-haiku-4-5"
                        :group        "Anthropic"}
                       {:id           "openai.gpt-5.5"
                        :display_name "openai.gpt-5.5"
                        :group        "OpenAI"}]}
             (mt/user-http-request :crowberto :get 200 "metabot/settings" :provider "bedrock"))))))

(deftest settings-put-saves-bedrock-credentials-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-access-key-id     nil
                                mb-llm-bedrock-secret-access-key nil
                                mb-llm-bedrock-session-token     nil
                                mb-llm-bedrock-region            nil]
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     nil
                                       llm.settings/llm-bedrock-secret-access-key nil
                                       llm.settings/llm-bedrock-session-token     nil
                                       llm.settings/llm-bedrock-region            "us-east-1"
                                       metabot.settings/llm-metabot-provider      "anthropic/claude-sonnet-4-6"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                             (is (= "bedrock" provider))
                                                             (is (= {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                                     :secret-access-key "test-secret"
                                                                     :region            "us-east-2"
                                                                     :session-token     "test-token"}
                                                                    credentials)
                                                                 "model verification should run against the request credentials")
                                                             (is (nil? (llm.settings/llm-bedrock-access-key-id))
                                                                 "verification should happen before saving the credentials")
                                                             {:models [{:id "anthropic.claude-haiku-4-5"
                                                                        :display_name "anthropic.claude-haiku-4-5"}]})]
        (testing "connecting bedrock saves the credentials and selects the default bedrock model"
          (is (=? {:value "bedrock/anthropic.claude-opus-4-8"}
                  (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                        {:provider    "bedrock"
                                         :credentials {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                       :secret-access-key "test-secret"
                                                       :region            "us-east-2"
                                                       :session-token     "test-token"}}))))
        (is (= "AKIAIOSFODNN7EXAMPLE" (llm.settings/llm-bedrock-access-key-id)))
        (is (= "test-secret" (llm.settings/llm-bedrock-secret-access-key)))
        (is (= "us-east-2" (llm.settings/llm-bedrock-region)))
        (is (= "test-token" (llm.settings/llm-bedrock-session-token)))))))

(deftest settings-put-rejects-env-shadowed-bedrock-credential-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-secret-access-key "env-secret"]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider _opts]
                                                           (is false "should reject before verifying credentials"))]
      (let [response (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                           {:provider    "bedrock"
                                            :credentials {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                          :secret-access-key "test-secret"}})]
        (is (re-find #"MB_LLM_BEDROCK_SECRET_ACCESS_KEY" (:message response))
            "a bedrock credentials write is rejected when one of its settings is env-controlled")))))

(deftest settings-put-bedrock-rejects-incomplete-credentials-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-access-key-id     nil
                                mb-llm-bedrock-secret-access-key nil
                                mb-llm-bedrock-session-token     nil]
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     nil
                                       llm.settings/llm-bedrock-secret-access-key nil
                                       metabot.settings/llm-metabot-provider      "anthropic/claude-sonnet-4-6"]
      (testing "credentials missing the secret access key fail verification and nothing is saved"
        (is (=? {:message      "AWS Bedrock credentials are incomplete."
                 :missing-keys ["secret-access-key"]}
                (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                      {:provider    "bedrock"
                                       :credentials {:access-key-id "AKIAIOSFODNN7EXAMPLE"}})))
        (is (nil? (llm.settings/llm-bedrock-access-key-id)))
        (is (= "anthropic/claude-sonnet-4-6" (metabot.settings/llm-metabot-provider)))))))

(deftest settings-put-bedrock-rejects-blank-credentials-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-access-key-id     nil
                                mb-llm-bedrock-secret-access-key nil
                                mb-llm-bedrock-session-token     nil]
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     nil
                                       llm.settings/llm-bedrock-secret-access-key nil
                                       metabot.settings/llm-metabot-provider      "anthropic/claude-sonnet-4-6"]
      (testing "all-blank credentials with nothing saved fail verification instead of throwing a 500"
        (is (=? {:message      "AWS Bedrock credentials are incomplete."
                 :missing-keys ["access-key-id" "secret-access-key"]}
                (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                      {:provider    "bedrock"
                                       :credentials {:access-key-id     ""
                                                     :secret-access-key ""
                                                     :session-token     ""
                                                     :region            ""}})))
        (is (= "anthropic/claude-sonnet-4-6" (metabot.settings/llm-metabot-provider)))))))

(deftest settings-put-bedrock-clears-stale-session-token-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-access-key-id     nil
                                mb-llm-bedrock-secret-access-key nil
                                mb-llm-bedrock-session-token     nil]
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     "AKIAOLDOLDOLDOLDOLD1"
                                       llm.settings/llm-bedrock-secret-access-key "old-secret"
                                       llm.settings/llm-bedrock-session-token     "old-token"
                                       metabot.settings/llm-metabot-provider      "bedrock/anthropic.claude-opus-4-8"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (constantly {:models []})]
        (mt/user-http-request :crowberto :put 200 "metabot/settings"
                              {:provider    "bedrock"
                               :credentials {:access-key-id     "AKIANEWNEWNEWNEWNEW1"
                                             :secret-access-key "new-secret"
                                             :session-token     nil}})
        (testing "an explicit nil session token sent alongside rotated keys clears the saved token"
          (is (nil? (llm.settings/llm-bedrock-session-token))))
        (is (= "AKIANEWNEWNEWNEWNEW1" (llm.settings/llm-bedrock-access-key-id)))
        (is (= "new-secret" (llm.settings/llm-bedrock-secret-access-key)))))))

(deftest settings-put-bedrock-rotation-without-session-token-field-keeps-token-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-access-key-id     nil
                                mb-llm-bedrock-secret-access-key nil
                                mb-llm-bedrock-session-token     nil]
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     "AKIAOLDOLDOLDOLDOLD1"
                                       llm.settings/llm-bedrock-secret-access-key "old-secret"
                                       llm.settings/llm-bedrock-session-token     "old-token"
                                       metabot.settings/llm-metabot-provider      "bedrock/anthropic.claude-opus-4-8"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (constantly {:models []})]
        (mt/user-http-request :crowberto :put 200 "metabot/settings"
                              {:provider    "bedrock"
                               :credentials {:access-key-id     "AKIANEWNEWNEWNEWNEW1"
                                             :secret-access-key "new-secret"}})
        (testing "new key material without a session-token field keeps the saved token; clearing it takes an explicit nil"
          (is (= "old-token" (llm.settings/llm-bedrock-session-token))))
        (is (= "AKIANEWNEWNEWNEWNEW1" (llm.settings/llm-bedrock-access-key-id)))
        (is (= "new-secret" (llm.settings/llm-bedrock-secret-access-key)))))))

(deftest settings-put-bedrock-nil-session-token-clears-token-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-access-key-id     nil
                                mb-llm-bedrock-secret-access-key nil
                                mb-llm-bedrock-session-token     nil
                                mb-llm-bedrock-region            nil]
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                       llm.settings/llm-bedrock-secret-access-key "test-secret"
                                       llm.settings/llm-bedrock-session-token     "stale-token"
                                       llm.settings/llm-bedrock-region            "us-east-2"
                                       metabot.settings/llm-metabot-provider      "bedrock/anthropic.claude-opus-4-8"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                             (is (= "bedrock" provider))
                                                             (is (= {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                                     :secret-access-key "test-secret"
                                                                     :session-token     nil
                                                                     :region            "us-east-2"}
                                                                    credentials)
                                                                 "validation should run without the cleared session token")
                                                             {:models []})]
        (mt/user-http-request :crowberto :put 200 "metabot/settings"
                              {:provider    "bedrock"
                               :credentials {:session-token nil}})
        (testing "an explicit nil session token clears the saved token without touching the keys"
          (is (nil? (llm.settings/llm-bedrock-session-token))))
        (is (= "AKIAIOSFODNN7EXAMPLE" (llm.settings/llm-bedrock-access-key-id)))
        (is (= "test-secret" (llm.settings/llm-bedrock-secret-access-key)))
        (is (= "us-east-2" (llm.settings/llm-bedrock-region)))))))

(deftest settings-put-bedrock-blank-session-token-clears-token-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-access-key-id     nil
                                mb-llm-bedrock-secret-access-key nil
                                mb-llm-bedrock-session-token     nil
                                mb-llm-bedrock-region            nil]
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                       llm.settings/llm-bedrock-secret-access-key "test-secret"
                                       llm.settings/llm-bedrock-session-token     "stale-token"
                                       llm.settings/llm-bedrock-region            "us-east-2"
                                       metabot.settings/llm-metabot-provider      "bedrock/anthropic.claude-opus-4-8"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (constantly {:models []})]
        (mt/user-http-request :crowberto :put 200 "metabot/settings"
                              {:provider    "bedrock"
                               :credentials {:session-token ""}})
        (testing "a blank session token field counts as an explicit clear, same as nil"
          (is (nil? (llm.settings/llm-bedrock-session-token))))
        (is (= "AKIAIOSFODNN7EXAMPLE" (llm.settings/llm-bedrock-access-key-id)))
        (is (= "test-secret" (llm.settings/llm-bedrock-secret-access-key)))))))

(deftest settings-put-bedrock-nil-region-resets-to-default-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-access-key-id     nil
                                mb-llm-bedrock-secret-access-key nil
                                mb-llm-bedrock-session-token     nil
                                mb-llm-bedrock-region            nil]
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                       llm.settings/llm-bedrock-secret-access-key "test-secret"
                                       llm.settings/llm-bedrock-session-token     "test-token"
                                       llm.settings/llm-bedrock-region            "us-east-2"
                                       metabot.settings/llm-metabot-provider      "bedrock/anthropic.claude-opus-4-8"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (constantly {:models []})]
        (mt/user-http-request :crowberto :put 200 "metabot/settings"
                              {:provider    "bedrock"
                               :credentials {:region nil}})
        (testing "an explicit nil region resets the setting to its default"
          (is (= "us-east-1" (llm.settings/llm-bedrock-region))))
        (is (= "AKIAIOSFODNN7EXAMPLE" (llm.settings/llm-bedrock-access-key-id)))
        (is (= "test-secret" (llm.settings/llm-bedrock-secret-access-key)))
        (is (= "test-token" (llm.settings/llm-bedrock-session-token)))))))

(deftest settings-put-bedrock-preserves-session-token-without-new-key-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-access-key-id     nil
                                mb-llm-bedrock-secret-access-key nil
                                mb-llm-bedrock-session-token     nil
                                mb-llm-bedrock-region            nil]
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                       llm.settings/llm-bedrock-secret-access-key "test-secret"
                                       llm.settings/llm-bedrock-session-token     "test-token"
                                       llm.settings/llm-bedrock-region            "us-east-1"
                                       metabot.settings/llm-metabot-provider      "bedrock/anthropic.claude-opus-4-8"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (constantly {:models []})]
        (mt/user-http-request :crowberto :put 200 "metabot/settings"
                              {:provider    "bedrock"
                               :credentials {:region "us-east-2"}})
        (testing "editing an unrelated field without new key material leaves the session token intact"
          (is (= "test-token" (llm.settings/llm-bedrock-session-token))))
        (is (= "us-east-2" (llm.settings/llm-bedrock-region)))
        (is (= "AKIAIOSFODNN7EXAMPLE" (llm.settings/llm-bedrock-access-key-id)))
        (is (= "test-secret" (llm.settings/llm-bedrock-secret-access-key)))))))

(deftest settings-put-nil-bedrock-credentials-clears-saved-credentials-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-access-key-id     nil
                                mb-llm-bedrock-secret-access-key nil
                                mb-llm-bedrock-session-token     nil
                                mb-llm-bedrock-region            nil]
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                       llm.settings/llm-bedrock-secret-access-key "test-secret"
                                       llm.settings/llm-bedrock-session-token     "test-token"
                                       llm.settings/llm-bedrock-region            "us-east-2"
                                       metabot.settings/llm-metabot-provider      "bedrock/anthropic.claude-opus-4-8"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider _opts]
                                                             (is false (str "unexpected list-models call: " provider)))]
        (testing "an explicit nil credentials clears the saved key material without validating against it"
          (is (=? {:value  "bedrock/anthropic.claude-opus-4-8"
                   :models []}
                  (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                        {:provider    "bedrock"
                                         :credentials nil})))
          (is (nil? (llm.settings/llm-bedrock-access-key-id)))
          (is (nil? (llm.settings/llm-bedrock-secret-access-key)))
          (is (nil? (llm.settings/llm-bedrock-session-token))))
        (testing "the clear also resets the region to its default"
          (is (= "us-east-1" (llm.settings/llm-bedrock-region))))))))

(deftest settings-put-bedrock-absent-credentials-leaves-saved-credentials-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider          nil
                                mb-llm-bedrock-access-key-id     nil
                                mb-llm-bedrock-secret-access-key nil
                                mb-llm-bedrock-session-token     nil
                                mb-llm-bedrock-region            nil]
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                       llm.settings/llm-bedrock-secret-access-key "test-secret"
                                       llm.settings/llm-bedrock-session-token     "test-token"
                                       llm.settings/llm-bedrock-region            "us-east-2"
                                       metabot.settings/llm-metabot-provider      "bedrock/anthropic.claude-opus-4-8"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                             (is (= "bedrock" provider))
                                                             (is (= {:access-key-id     "AKIAIOSFODNN7EXAMPLE"
                                                                     :secret-access-key "test-secret"
                                                                     :session-token     "test-token"
                                                                     :region            "us-east-2"}
                                                                    credentials)
                                                                 "a model-only change validates against the saved credentials")
                                                             {:models [{:id "anthropic.claude-haiku-4-5"
                                                                        :display_name "anthropic.claude-haiku-4-5"}]})]
        (testing "a body without a credentials key leaves the saved credentials untouched"
          (is (=? {:value "bedrock/anthropic.claude-haiku-4-5"}
                  (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                        {:provider "bedrock"
                                         :model    "anthropic.claude-haiku-4-5"})))
          (is (= "AKIAIOSFODNN7EXAMPLE" (llm.settings/llm-bedrock-access-key-id)))
          (is (= "test-secret" (llm.settings/llm-bedrock-secret-access-key)))
          (is (= "test-token" (llm.settings/llm-bedrock-session-token)))
          (is (= "us-east-2" (llm.settings/llm-bedrock-region))))))))

;;; ------------------------------------------------ Azure ------------------------------------------------

(deftest settings-put-saves-azure-credentials-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider   nil
                                mb-llm-azure-api-key      nil
                                mb-llm-azure-api-base-url nil]
    (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key        nil
                                       llm.settings/llm-azure-api-base-url   nil
                                       metabot.settings/llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials model]}]
                                                             (is (= "azure" provider))
                                                             (is (= {:api-key  "azure-key"
                                                                     :base-url "https://my-resource.services.ai.azure.com/anthropic"}
                                                                    credentials)
                                                                 "validation runs against the normalized request credentials")
                                                             (is (= "anthropic/claude-sonnet-4-5" model)
                                                                 "the candidate model selects the surface family to validate")
                                                             (is (nil? (llm.settings/llm-azure-api-key))
                                                                 "validation should happen before saving the credentials")
                                                             {:models []})]
        (testing "connecting azure saves the credentials and the composed provider/model value"
          (is (=? {:value  "azure/anthropic/claude-sonnet-4-5"
                   :models []}
                  (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                        {:provider    "azure"
                                         :model       "anthropic/claude-sonnet-4-5"
                                         :credentials {:api-key  "azure-key"
                                                       :base-url "https://my-resource.services.ai.azure.com/anthropic/"}}))))
        (is (= "azure-key" (llm.settings/llm-azure-api-key)))
        (testing "the trailing slash is trimmed before persisting"
          (is (= "https://my-resource.services.ai.azure.com/anthropic"
                 (llm.settings/llm-azure-api-base-url))))))))

(deftest settings-put-azure-requires-model-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider   nil
                                mb-llm-azure-api-key      nil
                                mb-llm-azure-api-base-url nil]
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider _opts]
                                                             (is false "should reject before verifying credentials"))]
        (testing "switching to azure without a model is rejected — there is no default deployment"
          (is (re-find #"model provider and deployment name are required"
                       (:message (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                                       {:provider    "azure"
                                                        :credentials {:api-key  "azure-key"
                                                                      :base-url "https://my-resource.services.ai.azure.com/openai"}}))))
          (is (= "anthropic/claude-sonnet-4-6" (metabot.settings/llm-metabot-provider))))))))

(deftest settings-put-azure-rejects-invalid-model-format-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider   nil
                                mb-llm-azure-api-key      nil
                                mb-llm-azure-api-base-url nil]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider _opts]
                                                           (is false "should reject before verifying credentials"))]
      (testing "an unsupported wire family is rejected before the validation round-trip"
        (is (re-find #"Invalid Azure model"
                     (:message (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                                     {:provider    "azure"
                                                      :model       "gemini/some-deployment"
                                                      :credentials {:api-key  "azure-key"
                                                                    :base-url "https://my-resource.services.ai.azure.com/openai"}}))))))))

(deftest settings-put-azure-rejects-incomplete-credentials-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider   nil
                                mb-llm-azure-api-key      nil
                                mb-llm-azure-api-base-url nil]
    (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key        nil
                                       llm.settings/llm-azure-api-base-url   nil
                                       metabot.settings/llm-metabot-provider "anthropic/claude-sonnet-4-6"]
      (testing "credentials missing the base URL fail before validation and nothing is saved"
        (is (=? {:message      "Azure credentials are incomplete."
                 :missing-keys ["base-url"]}
                (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                      {:provider    "azure"
                                       :model       "openai/gpt-4.1-mini"
                                       :credentials {:api-key "azure-key"}})))
        (is (nil? (llm.settings/llm-azure-api-key)))
        (is (= "anthropic/claude-sonnet-4-6" (metabot.settings/llm-metabot-provider)))))))

(deftest settings-put-azure-key-rotation-uses-saved-base-url-and-model-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider   nil
                                mb-llm-azure-api-key      nil
                                mb-llm-azure-api-base-url nil]
    (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key        "old-key"
                                       llm.settings/llm-azure-api-base-url   "https://my-resource.services.ai.azure.com/anthropic"
                                       metabot.settings/llm-metabot-provider "azure/anthropic/claude-sonnet-4-5"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider {:keys [credentials model]}]
                                                             (is (= {:api-key  "new-key"
                                                                     :base-url "https://my-resource.services.ai.azure.com/anthropic"}
                                                                    credentials)
                                                                 "the new key is layered over the saved base URL")
                                                             (is (= "anthropic/claude-sonnet-4-5" model)
                                                                 "a credentials-only rotation validates against the saved model's family")
                                                             {:models []})]
        (is (=? {:value "azure/anthropic/claude-sonnet-4-5"}
                (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                      {:provider    "azure"
                                       :credentials {:api-key "new-key"}})))
        (is (= "new-key" (llm.settings/llm-azure-api-key)))
        (is (= "https://my-resource.services.ai.azure.com/anthropic"
               (llm.settings/llm-azure-api-base-url)))))))

(deftest settings-put-nil-azure-credentials-clears-saved-credentials-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider   nil
                                mb-llm-azure-api-key      nil
                                mb-llm-azure-api-base-url nil]
    (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key        "azure-key"
                                       llm.settings/llm-azure-api-base-url   "https://my-resource.services.ai.azure.com/openai"
                                       metabot.settings/llm-metabot-provider "azure/openai/gpt-4.1-mini"]
      (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider _opts]
                                                             (is false (str "unexpected list-models call: " provider)))]
        (testing "an explicit nil credentials clears both saved settings without validating against them"
          (is (=? {:value  "azure/openai/gpt-4.1-mini"
                   :models []}
                  (mt/user-http-request :crowberto :put 200 "metabot/settings"
                                        {:provider    "azure"
                                         :credentials nil})))
          (is (nil? (llm.settings/llm-azure-api-key)))
          (is (nil? (llm.settings/llm-azure-api-base-url))))))))

(deftest settings-put-rejects-env-shadowed-azure-settings-test
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider nil
                                mb-llm-azure-api-key    "env-key"]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider _opts]
                                                           (is false "should reject before verifying credentials"))]
      (testing "an azure credentials write is rejected when an azure setting is env-controlled"
        (is (re-find #"MB_LLM_AZURE_API_KEY"
                     (:message (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                                     {:provider    "azure"
                                                      :model       "openai/gpt-4.1-mini"
                                                      :credentials {:api-key  "new-key"
                                                                    :base-url "https://my-resource.services.ai.azure.com/openai"}})))))))
  (mt/with-temp-env-var-value! [mb-llm-metabot-provider   nil
                                mb-llm-azure-api-key      nil
                                mb-llm-azure-api-base-url "https://env.services.ai.azure.com/openai"]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [_provider _opts]
                                                           (is false "should reject before verifying credentials"))]
      (testing "the base URL env var is guarded the same way"
        (is (re-find #"MB_LLM_AZURE_API_BASE_URL"
                     (:message (mt/user-http-request :crowberto :put 400 "metabot/settings"
                                                     {:provider    "azure"
                                                      :model       "openai/gpt-4.1-mini"
                                                      :credentials {:api-key "new-key"}}))))))))

(deftest settings-get-azure-returns-empty-models-test
  (mt/with-temporary-setting-values [llm.settings/llm-azure-api-key        "azure-key"
                                     llm.settings/llm-azure-api-base-url   "https://my-resource.services.ai.azure.com/anthropic"
                                     metabot.settings/llm-metabot-provider "azure/anthropic/claude-sonnet-4-5"]
    (mt/with-dynamic-fn-redefs [metabot.self/list-models (fn [provider {:keys [credentials]}]
                                                           (is (= "azure" provider))
                                                           (is (= {:api-key  "azure-key"
                                                                   :base-url "https://my-resource.services.ai.azure.com/anthropic"}
                                                                  credentials))
                                                           {:models []})]
      (testing "azure never returns models — deployment names are free text, not a dropdown"
        (is (= {:value  "azure/anthropic/claude-sonnet-4-5"
                :models []}
               (mt/user-http-request :crowberto :get 200 "metabot/settings" :provider "azure")))))))
