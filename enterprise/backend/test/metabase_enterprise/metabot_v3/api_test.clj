(ns metabase-enterprise.metabot-v3.api-test
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [compojure.response]
   [medley.core :as m]
   [metabase-enterprise.llm.settings :as llm.settings]
   [metabase-enterprise.metabot-v3.api :as api]
   [metabase-enterprise.metabot-v3.client :as client]
   [metabase-enterprise.metabot-v3.client-test :as client-test]
   [metabase-enterprise.metabot-v3.context :as metabot.context]
   [metabase-enterprise.metabot-v3.self.openrouter :as openrouter]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase-enterprise.metabot-v3.test-util :as mut]
   [metabase-enterprise.metabot-v3.util :as metabot.u]
   [metabase.config.core :as config]
   [metabase.search.test-util :as search.tu]
   [metabase.server.instance :as server.instance]
   [metabase.server.streaming-response :as sr]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest agent-streaming-test
  (mt/with-premium-features #{:metabot-v3}
    ;; Ensure we use the Python AI service path, not native agent
    (mt/with-temporary-setting-values [metabot.settings/use-native-agent false]
      (let [mock-response      (client-test/make-mock-text-stream-response
                                ["Hello", " from", " streaming!"]
                                {"some-model" {:prompt 12 :completion 3}})
            conversation-id    (str (random-uuid))
            question           {:role "user" :content "Test streaming question"}
            historical-message {:role "user" :content "previous message"}
            ai-requests        (atom [])]
        (mt/with-dynamic-fn-redefs [client/post! (fn [url opts]
                                                   (swap! ai-requests conj (-> (String. ^bytes (:body opts) "UTF-8")
                                                                               json/decode+kw))
                                                   ((client-test/mock-post! mock-response) url opts))]
          (testing "Streaming request"
            (doseq [metabot-id [nil (str (random-uuid))]]
              (mt/with-model-cleanup [:model/MetabotMessage
                                      [:model/MetabotConversation :created_at]]
                (reset! ai-requests [])
                (let [response (mt/user-http-request :rasta :post 202 "ee/metabot-v3/agent-streaming"
                                                     (-> {:message         (:content question)
                                                          :context         {}
                                                          :conversation_id conversation-id
                                                          :history         [historical-message]
                                                          :state           {}}
                                                         (m/assoc-some :metabot_id metabot-id)))
                      conv     (t2/select-one :model/MetabotConversation :id conversation-id)
                      messages (t2/select :model/MetabotMessage :conversation_id conversation-id)]
                  (is (=? [{:messages        [historical-message question]
                            :conversation_id conversation-id}]
                          @ai-requests))
                  (is (=? [{:_type   :TEXT
                            :role    "assistant"
                            :content "Hello from streaming!"}
                           {:_type         :FINISH_MESSAGE
                            :finish_reason "stop"
                            :usage         {:some-model {:prompt 12 :completion 3}}}]
                          (metabot.u/aisdk->messages "assistant" (str/split-lines response))))
                  (is (=? {:user_id (mt/user->id :rasta)}
                          conv))
                  (is (=? [{:total_tokens 0
                            :role         :user
                            :data         [{:role "user" :content (:content question)}]}
                           {:total_tokens 15
                            :role         :assistant
                            :data         [{:role "assistant" :content "Hello from streaming!"}]}]
                          messages)))))))))))

(deftest native-agent-streaming-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/with-temporary-setting-values [metabot.settings/use-native-agent true]
      (with-redefs [config/is-dev? true]
        (let [conversation-id    (str (random-uuid))
              question           {:role "user" :content "Test native streaming"}
              historical-message {:role "user" :content "previous message"}]
          (with-redefs [openrouter/openrouter (fn [_]
                                                (mut/mock-llm-response
                                                 [{:type :start :id "msg-1"}
                                                  {:type :text :text "Hello from native agent!"}
                                                  {:type :usage :usage {:promptTokens 10 :completionTokens 5}
                                                   :model "test-model" :id "msg-1"}]))]
            (testing "Native agent streaming request"
              (mt/with-model-cleanup [:model/MetabotMessage
                                      [:model/MetabotConversation :created_at]]
                (let [response (mt/user-http-request :rasta :post 202 "ee/metabot-v3/agent-streaming"
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

(deftest closing-connection-test
  (mt/with-temporary-setting-values [metabot.settings/use-native-agent false]
    (let [messages   (atom nil)
          cnt        (atom 30)
          canceled   (atom nil)
          ai-handler (fn [req respond _raise]
                       (respond
                        (compojure.response/render
                         (sr/streaming-response {:content-type "text/event-stream; charset=utf-8"
                                                 ;; Transfer-Encoding: chunked is what makes normal .close on body fail
                                                 ;; See: `metabase-enterprise.metabot-v3.client/quick-closing-body`
                                                 :headers      {"Transfer-Encoding" "chunked"}} [os canceled-chan]
                           (try
                             (loop []
                               (if (a/poll! canceled-chan)
                                 (reset! canceled :nice)
                                 (do
                                   (.write os (.getBytes (str "2:" (json/encode {:msg @cnt}) "\n")))
                                   (.flush os)
                                   (swap! cnt dec)
                                   (Thread/sleep 10)
                                   (when (pos? @cnt)
                                     (recur)))))
                             (catch Exception _e
                               (reset! canceled :not-nice))))
                         req)))
          ai-server  (doto (server.instance/create-server ai-handler {:port 0 :join? false})
                       .start)
          ai-url     (str "http://localhost:" (.. ai-server getURI getPort))]
      (try
        (mt/test-helpers-set-global-values!
          (search.tu/with-index-disabled
            (mt/with-premium-features #{:metabot-v3}
              (with-redefs [client/ai-url                          (constantly ai-url)
                            api/store-aiservice-messages!          (fn [_conv-id _prof-id msgs]
                                                                     (reset! messages msgs))
                            sr/async-cancellation-poll-interval-ms 5]
                (testing "Closing stream body will drop connection to LLM"
                  (let [body (mt/user-real-request :rasta :post 202 "ee/metabot-v3/agent-streaming"
                                                   {:request-options {:as              :stream
                                                                      :decompress-body false}}
                                                   {:message         "Test closure"
                                                    :context         {}
                                                    :conversation_id (str (random-uuid))
                                                    :history         []
                                                    :state           {}})]
                    (.read ^java.io.InputStream body) ;; start the handler
                    (.close ^java.io.Closeable body)
                    (u/poll {:thunk       #(deref canceled)
                             :done?       some?
                             :interval-ms 5})
                    (is (number? (:msg (first @messages)))
                        "store-messages! was called in the end on the lines streaming-request managed to process")
                    ;; if this flakes in CI, increase the number a bit; but it was 1 quite consistently for me
                    (is (> 10 (count @messages))
                        "But we shouldn't go through all 30 of them")
                    (testing "request to ai-service was canceled"
                      (is (< 20 @cnt) "Stopped writing when channel closed")
                      ;; see `metabase.server.streaming-response-test/canceling-chan-is-working-test` for explanation,
                      ;; reducing flakiness here
                      (is (some? @canceled)))))))))
        (finally
          (.stop ai-server))))))

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
            (mt/with-premium-features #{:metabot-v3}
              (mt/with-temporary-setting-values [metabot.settings/use-native-agent true]
                (let [real-http-post http/post]
                  (with-redefs [llm.settings/ee-openrouter-api-key      (constantly "fake-key")
                                llm.settings/ee-openrouter-api-base-url (constantly llm-url)
                                ;; The fake LLM server doesn't gzip, but clj-http wraps with
                                ;; GZIPInputStream by default. Closing mid-stream causes ZLIB errors.
                                http/post                              (fn [url opts]
                                                                         (real-http-post url (assoc opts :decompress-body false)))
                                metabot.context/create-context         identity
                                api/store-native-parts!                (fn [_conv-id _prof-id parts]
                                                                         (reset! stored-parts parts))
                                sr/async-cancellation-poll-interval-ms 5]
                    (testing "Closing stream body will drop connection to LLM"
                      (reset! cnt total-chunks)
                      (reset! stored-parts nil)
                      (let [body (mt/user-real-request :rasta :post 202 "ee/metabot-v3/agent-streaming"
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
                                 :interval-ms 5
                                 :timeout-ms  1000})
                        (is (some? @stored-parts) "store-parts! was called even though client disconnected")
                        (testing "LLM server stopped writing when connection was dropped"
                          (is (< 20 @cnt) "Server should not have written all chunks"))
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
                              "Only a fraction of the text chunks were processed before disconnect"))))))))))
        (finally
          (.stop llm-server))))))

(deftest feedback-endpoint-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/with-random-premium-token! [premium-token]
      (let [store-url "http://hm.example"]
        (testing "Submits feedback to Harbormaster with token and base URL"
          (mt/with-temporary-setting-values [store-api-url store-url]
            (let [captured     (atom nil)
                  feedback     {:metabot_id        1
                                :feedback          {:positive          true
                                                    :message_id        "m-1"
                                                    :freeform_feedback "ok"}
                                :conversation_data {}
                                :version           "v0.0.0"
                                :submission_time   "2025-01-01T00:00:00Z"
                                :is_admin          false}
                  expected-url (str store-url "/api/v2/metabot/feedback/" premium-token)]
              (mt/with-dynamic-fn-redefs
                [http/post (fn [url opts]
                             (reset! captured {:url  url
                                               :body (json/decode+kw (:body opts))}))]
                (let [_resp (mt/user-http-request :rasta :post 204 "ee/metabot-v3/feedback" feedback)]
                  (is (= {:url expected-url :body feedback}
                         @captured)))))))

        (testing "Returns 500 when http post fails"
          (mt/with-temporary-setting-values [premium-embedding-token premium-token]
            (mt/with-dynamic-fn-redefs
              [http/post (fn [_url _opts]
                           (throw (ex-info "boom" {:status 404})))]
              (mt/user-http-request :rasta :post 500 "ee/metabot-v3/feedback" {:any "payload"}))))

        ;; We're not testing the branch where the store-api-url is missing because that defsetting
        ;; has the default value. It doesn't work well with `with-temporary-setting-values` helper.
        (testing "Throws when premium token is missing"
          (mt/with-temporary-setting-values [premium-embedding-token nil]
            (mt/user-http-request :rasta :post 400 "ee/metabot-v3/feedback" {:foo "bar"})))))))

(deftest extract-usage-test
  (testing "takes last cumulative usage per model"
    (is (= {"gpt-4" {:prompt 250 :completion 50}}
           (#'api/extract-usage
            [{:type :text :text "hi"}
             {:type :usage :usage {:promptTokens 100 :completionTokens 20} :model "gpt-4"}
             {:type :tool-input :id "t1"}
             ;; second usage is cumulative (subsumes first)
             {:type :usage :usage {:promptTokens 250 :completionTokens 50} :model "gpt-4"}]))))

  (testing "handles multiple models independently"
    (is (= {"model-a" {:prompt 100 :completion 20}
            "model-b" {:prompt 200 :completion 40}}
           (#'api/extract-usage
            [{:type :usage :usage {:promptTokens 100 :completionTokens 20} :model "model-a"}
             {:type :usage :usage {:promptTokens 200 :completionTokens 40} :model "model-b"}]))))

  (testing "returns empty map when no usage parts"
    (is (= {} (#'api/extract-usage [{:type :text :text "hi"}]))))

  (testing "missing model defaults to unknown"
    (is (= {"unknown" {:prompt 50 :completion 10}}
           (#'api/extract-usage
            [{:type :usage :usage {:promptTokens 50 :completionTokens 10}}])))))

(deftest combine-text-parts-xf-test
  (testing "passes through non-text parts"
    (is (= [{:type :tool, :id 1} {:type :tool, :id 2}]
           (into [] (#'api/combine-text-parts-xf)
                 [{:type :tool, :id 1} {:type :tool, :id 2}]))))

  (testing "combines consecutive text parts"
    (is (= [{:type :text, :text "hello world"}]
           (into [] (#'api/combine-text-parts-xf)
                 [{:type :text, :text "hello "}
                  {:type :text, :text "world"}]))))

  (testing "combines multiple runs"
    (is (= [{:type :text, :text "ab"}
            {:type :tool, :id 1}
            {:type :text, :text "cd"}]
           (into [] (#'api/combine-text-parts-xf)
                 [{:type :text, :text "a"}
                  {:type :text, :text "b"}
                  {:type :tool, :id 1}
                  {:type :text, :text "c"}
                  {:type :text, :text "d"}]))))

  (testing "handles empty input"
    (is (= [] (into [] (#'api/combine-text-parts-xf) []))))

  (testing "handles single text part"
    (is (= [{:type :text, :text "solo"}]
           (into [] (#'api/combine-text-parts-xf)
                 [{:type :text, :text "solo"}])))))
