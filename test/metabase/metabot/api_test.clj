(ns metabase.metabot.api-test
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [compojure.response]
   [metabase.api.common :as mb.api]
   [metabase.config.core :as config]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.llm.settings :as llm.settings]
   [metabase.llm.test-util :as llm.tu]
   [metabase.metabot.agent.core :as agent]
   [metabase.metabot.api :as api]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.context :as metabot.context]
   [metabase.metabot.conversation-title :as conversation-title]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.self.core :as self.core]
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
  (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                     metabot.settings/llm-metabot-provider test-provider]
    (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
      (with-redefs [config/is-dev? true]
        (let [conversation-id (str (random-uuid))
              question        {:role "user" :content "Test native streaming"}]
          (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                              (mut/mock-llm-response
                                                               [{:type :start :id "msg-1"}
                                                                {:type :text :text "Hello from native agent!"}
                                                                {:type  :usage       :usage {:promptTokens 10 :completionTokens 5}
                                                                 :model "test-model" :id    "msg-1"
                                                                 :finish-reason "length"}]))
                                      metabot.self/context-window-tokens (constantly 1000)
                                      conversation-title/ensure-title! (constantly {:status :ready
                                                                                    :title  "Orders by Month"})]
            (testing "Native agent streaming request"
              (mt/with-model-cleanup [:model/MetabotMessage
                                      [:model/MetabotConversation :created_at]]
                (let [response (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                     {:message         (:content question)
                                                      :context         {}
                                                      :conversation_id conversation-id
                                                      :state           {}})
                      lines    (->> (str/split-lines response)
                                    (filter #(str/starts-with? % "data: ")))
                      events   (->> lines
                                    (remove #(= "data: [DONE]" %))
                                    (mapv #(json/decode+kw (subs % 6))))
                      conv     (t2/select-one :model/MetabotConversation :id conversation-id)
                      messages (t2/select :model/MetabotMessage :conversation_id conversation-id)]
                  (testing "response is an SSE stream of typed events ending with [DONE]"
                    (is (= "data: [DONE]" (last lines)))
                    (is (= ["start" "data-conversation-title" "start-step"] (mapv :type (take 3 events))))
                    (is (= ["finish-step" "finish"] (mapv :type (take-last 2 events))))
                    (is (=? {:type "data-conversation-title" :data "Orders by Month"}
                            (second events)))
                    (let [text-deltas (filter #(= "text-delta" (:type %)) events)]
                      (is (= "Hello from native agent!"
                             (apply str (map :delta text-deltas)))))
                    (is (=? {:finishReason "length"
                             :messageMetadata {:usage               {:inputTokens 10 :outputTokens 5 :totalTokens 15}
                                               :contextTokens       15
                                               :contextWindowTokens 1000}}
                            (u/seek #(= "finish" (:type %)) events))
                        "finish event carries accumulated and final-call context usage"))
                  (is (=? {:user_id (mt/user->id :rasta)}
                          conv))
                  ;; Native agent stores parts in the v2 at-rest format
                  (is (=? [{:total_tokens 0
                            :role         :user
                            :data         [{:type "text" :text (:content question)}]
                            :data_version 2}
                           {:total_tokens pos-int?
                            :role         :assistant
                            :data         [{:type "step-start"}
                                           {:type "text" :text "Hello from native agent!" :state "done"}]
                            :data_version 2}]
                          messages)))))))))))

(deftest emits-title-event-inline-when-ready-during-stream-test
  (testing "when the title becomes ready while streaming, the real title event is injected inline before the finish event"
    (let [conversation-id (str (random-uuid))
          title-future    (java.util.concurrent.CompletableFuture.)
          start-line      (self.core/format-sse-event {:type "start" :messageId "msg-1"})
          text-line       (self.core/format-sse-event {:type "text-delta" :id "txt-1" :delta "Hello"})
          finish-line     (self.core/format-sse-event {:type "finish"})
          title-line      (self.core/format-sse-event {:type "data-conversation-title" :data "Orders by Month"})
          lines           (reify clojure.lang.IReduceInit
                            (reduce [_ rf init]
                              (let [result (rf init start-line)]
                                (if (reduced? result)
                                  @result
                                  (do
                                    (.complete title-future "Orders by Month")
                                    (reduce rf result [text-line finish-line self.core/done-sse-line]))))))]
      (is (= [start-line text-line title-line finish-line self.core/done-sse-line]
             (into [] (#'api/inject-title-events-xf
                       {:status :pending :future title-future}
                       conversation-id)
                   lines))))))

(deftest stops-looking-up-the-title-once-the-job-settles-without-one-test
  (testing "a title job that finishes without a title is looked up once, not once per streamed line"
    (let [conversation-id (str (random-uuid))
          title-future    (doto (java.util.concurrent.CompletableFuture.) (.complete nil))
          lookups         (atom 0)
          lines           (mapv #(self.core/format-sse-event {:type "text-delta" :id "txt-1" :delta %})
                                ["a" "b" "c" "d"])]
      (mt/with-dynamic-fn-redefs [metabot.persistence/conversation-title (fn [_] (swap! lookups inc) nil)]
        (is (= lines
               (into [] (#'api/inject-title-events-xf
                         {:status :pending :future title-future}
                         conversation-id)
                     lines)))
        (is (= 1 @lookups))))))

(deftest conversation-title-generation-persists-title-test
  (mt/with-temp [:model/MetabotConversation {conversation-id :id} {:user_id (mt/user->id :rasta)}]
    (let [generate-title! #(#'conversation-title/generate! conversation-id "default" "Show orders by month")
          stored-title    #(t2/select-one-fn :title :model/MetabotConversation :id conversation-id)]
      (with-redefs [metabot.self/call-llm-structured (constantly {:title "\"Orders by Month!\""})]
        (is (= "Orders by Month" (generate-title!)))
        (is (= "Orders by Month" (stored-title))))
      (with-redefs [metabot.self/call-llm-structured (constantly {:title "Different title"})]
        (is (nil? (generate-title!)))
        (is (= "Orders by Month" (stored-title)))))))

(deftest conversation-title-generation-skips-existing-title-test
  (mt/with-temp [:model/MetabotConversation {conversation-id :id} {:user_id (mt/user->id :rasta)
                                                                   :title   "Existing Title"}]
    (with-redefs [metabot.self/call-llm-structured (fn [& _]
                                                     (throw (ex-info "should not generate" {})))]
      (is (= {:status :ready :title "Existing Title"}
             (conversation-title/ensure-title! conversation-id "default" "Show orders by month")))
      (is (= {:status "ready" :title "Existing Title"}
             (conversation-title/title-status conversation-id))))))

(deftest conversation-title-generation-tracks-one-in-flight-job-test
  (mt/with-temp [:model/MetabotConversation {conversation-id :id} {:user_id (mt/user->id :rasta)}]
    (let [gate       (promise)
          call-count (atom 0)]
      (with-redefs [metabot.self/call-llm-structured (fn [& _]
                                                       (swap! call-count inc)
                                                       @gate
                                                       {:title "Recovered Title"})]
        (let [future-1 (conversation-title/submit! conversation-id "default" "Show orders by month")
              future-2 (conversation-title/submit! conversation-id "default" "Use a different prompt")]
          (is (some? future-1))
          (is (identical? future-1 future-2))
          (is (= {:status "pending" :title nil}
                 (conversation-title/title-status conversation-id)))
          (deliver gate :continue)
          (is (= "Recovered Title"
                 (.get ^java.util.concurrent.Future future-1
                       5 java.util.concurrent.TimeUnit/SECONDS)))
          (is (= 1 @call-count))
          (is (= {:status "ready" :title "Recovered Title"}
                 (conversation-title/title-status conversation-id))))))))

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
    ;;   → lite-aisdk-xf → agent loop → parts->aisdk-sse-xf → streaming-writer-rf → client
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
            ;; the fake LLM server is on localhost, which the network policy refuses on a hosted instance
            (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
              (mt/with-temporary-setting-values [llm.settings/llm-providers [(llm.tu/connection "openrouter" {:base-url llm-url})]
                                                 metabot.settings/llm-metabot-provider test-provider]
                (let [real-llm-request self.core/request]
                  (with-redefs [scope/resolve-user-permissions               (constantly scope/all-yes-permissions)
                                conversation-title/ensure-title!             (constantly {:status :missing})
                                ;; The fake LLM server gzips whenever the caller accepts it, and clj-http
                                ;; wraps the body in a GZIPInputStream. Closing mid-stream causes ZLIB errors.
                                self.core/request                            (fn [auth req]
                                                                               (real-llm-request auth (assoc req :decompress-body false)))
                                metabot.context/create-context               (fn [ctx & _] ctx)
                                metabot.persistence/finalize-assistant-turn! (fn [_pk parts & kwargs]
                                                                               (reset! stored-parts parts)
                                                                               (reset! stored-kwargs (apply hash-map kwargs)))
                                sr/async-cancellation-poll-interval-ms       5]
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
                              "start-turn! inserted exactly user + placeholder; no extra row from finalize"))))))))))
        (finally
          (.stop llm-server))))))

(deftest thrown-during-agent-setup-persists-as-errored-test
  (testing "A throwable escaping the agent loop (e.g. permission/setup throw before
            the reducible is constructed) finalizes the placeholder with
            :finished? true + a structured :error payload — distinguishable from
            both a successful turn (error nil) and a client abort (finished false)."
    (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                       metabot.settings/llm-metabot-provider test-provider]
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
                        (fn [_pk parts & kwargs]
                          (reset! stored-parts parts)
                          (reset! stored-kwargs (apply hash-map kwargs)))]
            (mt/with-model-cleanup [:model/MetabotMessage
                                    [:model/MetabotConversation :created_at]]
              (let [response (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                   {:message         "go"
                                                    :context         {}
                                                    :conversation_id (str (random-uuid))
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
                (testing "the failure is streamed to the client as a well-formed AI SDK error tail rather than a silent close"
                  (is (some #(str/includes? % "\"type\":\"error\"")
                            (str/split-lines response)))
                  (is (re-find #"(?i)agent setup exploded" response))
                  (is (str/includes? response "\"finishReason\":\"error\"")
                      "the errored stream is closed with a finish event")
                  (is (str/includes? response "data: [DONE]")
                      "the stream terminates with [DONE]"))))))))))

(deftest metabot-provider-without-api-key-is-configured-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                       metabot.settings/llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"
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
                                  :data            [{:type "text" :text "hi"}]
                                  :data_version    2}))]
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
  (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                     metabot.settings/llm-metabot-provider test-provider]
    (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
      (let [base-request {:message         "Test"
                          :context         {}
                          :conversation_id (str (random-uuid))
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

(defn- streamed-start-event
  "Parse a raw agent-streaming SSE response body and return the `start` event."
  [response]
  (->> (str/split-lines response)
       (filter #(str/starts-with? % "data: "))
       (remove #(= "data: [DONE]" %))
       (map #(json/decode+kw (subs % 6)))
       (u/seek #(= "start" (:type %)))))

(defn- streamed-message-id
  [response]
  (:messageId (streamed-start-event response)))

(defn- streamed-user-message-id
  [response]
  (get-in (streamed-start-event response) [:messageMetadata :userMessageId]))

(def ^:private default-mock-parts
  [{:type :start :id "msg-1"}
   {:type :text :text "hi"}
   {:type  :usage :usage {:promptTokens 1 :completionTokens 1}
    :model "test-model" :id "msg-1"}])

(def ^:private error-mock-parts
  [{:type :start :id "msg-1"}
   {:type :error :error {:message "boom"}}])

(defn- with-mock-streaming-provider!
  "Runs `thunk` with the LLM provider mocked. Each provider call consumes the next
  parts vector from `responses`, falling back to `default-mock-parts` once exhausted."
  ([thunk] (with-mock-streaming-provider! [] thunk))
  ([responses thunk]
   (let [queue (atom (vec responses))]
     (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                        metabot.settings/llm-metabot-provider test-provider]
       (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
         (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                     (fn [_]
                                       (let [[[parts]] (swap-vals! queue (comp vec rest))]
                                         (mut/mock-llm-response (or parts default-mock-parts))))
                                     conversation-title/submit! (constantly nil)]
           (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
             (thunk)
             (is (empty? @queue) "unconsumed mock LLM responses"))))))))

(deftest agent-streaming-rejects-stale-parent-message-id-test
  (testing "agent-streaming accepts nil/matching parent_message_id, rejects one that no longer matches the leaf"
    (with-mock-streaming-provider!
      (fn []
        (let [conversation-id (str (random-uuid))
              first-response  (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                    {:message         "first"
                                                     :context         {}
                                                     :conversation_id conversation-id
                                                     :state           {}})
              stale-id        (streamed-message-id first-response)]
          (is (string? stale-id))
          (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                {:message            "second"
                                 :context            {}
                                 :conversation_id    conversation-id
                                 :state              {}
                                 :parent_message_id  stale-id})
          (mt/user-http-request :rasta :post 409 "metabot/agent-streaming"
                                {:message            "third"
                                 :context            {}
                                 :conversation_id    conversation-id
                                 :state              {}
                                 :parent_message_id  stale-id}))))))

(deftest agent-streaming-rejects-missing-parent-message-id-for-existing-conversation-test
  (testing "agent-streaming rejects an omitted parent_message_id once the conversation already has a leaf"
    (with-mock-streaming-provider!
      (fn []
        (let [conversation-id (str (random-uuid))]
          (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                {:message         "first"
                                 :context         {}
                                 :conversation_id conversation-id
                                 :state           {}})
          (mt/user-http-request :rasta :post 409 "metabot/agent-streaming"
                                {:message         "second"
                                 :context         {}
                                 :conversation_id conversation-id
                                 :state           {}}))))))

(defn- agent-request
  [conversation-id message & {:as extra}]
  (merge {:message         message
          :context         {}
          :conversation_id conversation-id
          :state           {}}
         extra))

(defn- conversation-rows
  [conversation-id]
  (t2/select [:model/MetabotMessage :id :external_id :role :deleted_at :deleted_by_user_id]
             :conversation_id conversation-id
             {:order-by [[:created_at :asc] [:id :asc]]}))

(deftest agent-streaming-start-event-carries-user-message-id-test
  (testing "the start event's messageMetadata.userMessageId is the persisted user row's external_id"
    (with-mock-streaming-provider!
      (fn []
        (let [conversation-id (str (random-uuid))
              response        (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                    (agent-request conversation-id "hello"))
              user-message-id (streamed-user-message-id response)]
          (is (string? user-message-id))
          (is (= user-message-id
                 (t2/select-one-fn :external_id :model/MetabotMessage
                                   :conversation_id conversation-id :role "user"))))))))

(deftest agent-streaming-honors-client-minted-message-ids-test
  (testing "rows persist under client-sent ids, the start event echoes them, and a retry honors its fresh assistant id"
    (with-mock-streaming-provider!
      (fn []
        (let [conversation-id (str (random-uuid))
              user-id         (str (random-uuid))
              assistant-id    (str (random-uuid))
              response        (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                    (agent-request conversation-id "first"
                                                                   :user_message_id user-id
                                                                   :assistant_message_id assistant-id))]
          (is (= assistant-id (streamed-message-id response)))
          (is (= user-id (streamed-user-message-id response)))
          (is (= {:user user-id :assistant assistant-id}
                 (t2/select-fn->fn :role :external_id :model/MetabotMessage
                                   :conversation_id conversation-id)))
          (let [retry-assistant-id (str (random-uuid))]
            (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                  (agent-request conversation-id "first"
                                                 :retry_message_id user-id
                                                 :assistant_message_id retry-assistant-id))
            (is (= retry-assistant-id
                   (metabot.persistence/leaf-external-id conversation-id)))))))))

(deftest agent-streaming-rejects-taken-client-minted-id-test
  (testing "a client-sent id colliding with an existing message 409s"
    (with-mock-streaming-provider!
      (fn []
        (let [conversation-id (str (random-uuid))
              first-response  (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                    (agent-request conversation-id "first"))
              parent-id       (streamed-message-id first-response)]
          (mt/user-http-request :rasta :post 409 "metabot/agent-streaming"
                                (agent-request conversation-id "second"
                                               :parent_message_id parent-id
                                               :assistant_message_id parent-id)))))))

(deftest agent-streaming-rejects-malformed-client-minted-id-test
  (testing "a non-uuid client-sent id fails request validation"
    (mt/user-http-request :rasta :post 400 "metabot/agent-streaming"
                          (agent-request (str (random-uuid)) "first"
                                         :assistant_message_id "not-a-uuid"))))

(deftest agent-streaming-replaces-trailing-failed-turn-test
  (testing "a resubmit whose parent points before a mid-stream-errored turn replaces the failed pair"
    (with-mock-streaming-provider!
      [default-mock-parts error-mock-parts default-mock-parts]
      (fn []
        (let [conversation-id (str (random-uuid))
              first-response  (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                    (agent-request conversation-id "first"))
              parent-1        (streamed-message-id first-response)]
          (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                (agent-request conversation-id "second (fails)"
                                               :parent_message_id parent-1))
          (let [third-response (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                     (agent-request conversation-id "third"
                                                                    :parent_message_id parent-1))
                rows           (conversation-rows conversation-id)
                deleted        (filter :deleted_at rows)
                live           (remove :deleted_at rows)]
            (is (= [:user :assistant] (map :role deleted))
                "the failed turn's user + assistant rows are soft-deleted")
            (is (= #{(mt/user->id :rasta)} (into #{} (map :deleted_by_user_id) deleted)))
            (is (= [:user :assistant :user :assistant] (map :role live)))
            (is (= (streamed-message-id third-response)
                   (metabot.persistence/leaf-external-id conversation-id)))))))))

(deftest agent-streaming-retry-test
  (testing "retry_message_id regenerates the response without inserting a new user row"
    (with-mock-streaming-provider!
      (fn []
        (let [conversation-id (str (random-uuid))
              first-response  (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                    (agent-request conversation-id "hello"))
              user-ext-id     (streamed-user-message-id first-response)
              retry-response  (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                    (agent-request conversation-id "hello"
                                                                   :retry_message_id user-ext-id))
              rows            (conversation-rows conversation-id)]
          (is (= 1 (count (remove :deleted_at (filter #(= :user (:role %)) rows))))
              "retry records no new user row")
          (is (= [:assistant] (map :role (filter :deleted_at rows)))
              "only the superseded response is soft-deleted")
          (is (= (streamed-message-id retry-response)
                 (metabot.persistence/leaf-external-id conversation-id)))
          (testing "the same prompt can be retried again"
            (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                  (agent-request conversation-id "hello"
                                                 :retry_message_id user-ext-id))
            (let [rows (conversation-rows conversation-id)]
              (is (= 1 (count (remove :deleted_at (filter #(= :user (:role %)) rows)))))
              (is (= 2 (count (filter :deleted_at rows)))))))))))

(deftest agent-streaming-rejects-non-user-retry-id-test
  (testing "retry_message_id pointing at an assistant (non-user) message 409s"
    (with-mock-streaming-provider!
      (fn []
        (let [conversation-id (str (random-uuid))
              first-response  (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                    (agent-request conversation-id "hello"))
              assistant-ext   (streamed-message-id first-response)]
          (mt/user-http-request :rasta :post 409 "metabot/agent-streaming"
                                (agent-request conversation-id "hello"
                                               :retry_message_id assistant-ext)))))))

(deftest agent-streaming-serializes-concurrent-retries-test
  (testing "two concurrent retries of the same prompt leave exactly one live reply"
    (with-mock-streaming-provider!
      (fn []
        (let [conversation-id (str (random-uuid))
              user-ext-id     (streamed-user-message-id
                               (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                     (agent-request conversation-id "hello")))
              start           (java.util.concurrent.CountDownLatch. 1)
              retry!          (fn []
                                (.await start)
                                (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                      (agent-request conversation-id "hello"
                                                                     :retry_message_id user-ext-id)))
              f1              (future (retry!))
              f2              (future (retry!))]
          (.countDown start)
          @f1
          @f2
          (is (= 1 (->> (conversation-rows conversation-id)
                        (filter #(and (= :assistant (:role %)) (nil? (:deleted_at %))))
                        count))
              "the conversation lock serializes the retries, so exactly one live reply survives"))))))

(defn- input-messages
  "The `[role text]` of each message-shaped part in an LLM request's `:input`,
  in order — skips tool and preload parts. Lets a test assert the exact
  reconstructed turn sequence (roles, order, content) rather than substrings."
  [request]
  (keep (fn [part]
          (cond
            (:role part)           [(:role part) (:content part)]
            (= :text (:type part)) [:assistant (:text part)]))
        (:input request)))

(defn- with-captured-llm-requests!
  "Runs `thunk` with the provider mocked, appending each provider-call opts map
  to `requests` and replying with `reply-text`."
  [requests reply-text thunk]
  (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                     metabot.settings/llm-metabot-provider test-provider]
    (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
      (mt/with-dynamic-fn-redefs [openrouter/openrouter
                                  (fn [opts]
                                    (swap! requests conj opts)
                                    (mut/mock-llm-response
                                     [{:type :start :id "msg-1"}
                                      {:type :text :text reply-text}
                                      {:type  :usage :usage {:promptTokens 1 :completionTokens 1}
                                       :model "test-model" :id "msg-1"}]))
                                  conversation-title/submit! (constantly nil)]
        (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
          (thunk))))))

(deftest agent-streaming-reconstructs-prior-turn-for-the-llm-test
  (testing "a follow-up turn reconstructs the prior prompt + reply from the DB and sends them to the LLM"
    (let [requests (atom [])]
      (with-captured-llm-requests!
        requests "prior-assistant-reply"
        (fn []
          (let [conversation-id (str (random-uuid))
                first-response  (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                      (agent-request conversation-id "prior-user-prompt"))
                parent-id       (streamed-message-id first-response)]
            (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                  (agent-request conversation-id "follow-up-prompt"
                                                 :parent_message_id parent-id))
            (let [msgs (input-messages (last @requests))]
              (is (= 2 (count @requests)))
              (is (= [[:user "prior-user-prompt"]
                      [:assistant "prior-assistant-reply"]]
                     (take 2 msgs))
                  "prior turn replayed with the right roles, order, and content")
              (is (= 3 (count msgs))
                  "exactly prior user + prior assistant + new prompt — no duplicated turns")
              (is (= :user (first (nth msgs 2))))
              (is (str/includes? (second (nth msgs 2)) "follow-up-prompt")
                  "the new prompt is the final user message"))))))))

(deftest agent-streaming-retries-missing-title-on-follow-up-test
  (testing "a follow-up turn still attempts title generation from the first stored user prompt when the DB title is missing"
    (let [title-requests (atom [])]
      (with-mock-streaming-provider!
        (fn []
          (with-redefs [conversation-title/ensure-title! (fn [& args]
                                                           (swap! title-requests conj args)
                                                           {:status :missing})]
            (let [conversation-id (str (random-uuid))
                  first-response  (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                        (agent-request conversation-id "first prompt"))
                  parent-id       (streamed-message-id first-response)]
              (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                    (agent-request conversation-id "follow-up prompt"
                                                   :parent_message_id parent-id))
              (is (= [[conversation-id "first prompt"]
                      [conversation-id "first prompt"]]
                     (mapv (fn [[conversation-id _profile-id message]]
                             [conversation-id message])
                           @title-requests))))))))))

(deftest agent-streaming-retry-excludes-superseded-reply-from-llm-test
  (testing "after a retry the regenerated call does not replay the superseded reply"
    (let [requests (atom [])]
      (with-captured-llm-requests!
        requests "superseded-reply"
        (fn []
          (let [conversation-id (str (random-uuid))
                first-response  (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                      (agent-request conversation-id "the-question"))
                user-ext-id     (streamed-user-message-id first-response)]
            (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                  (agent-request conversation-id "the-question"
                                                 :retry_message_id user-ext-id))
            (let [msgs (input-messages (last @requests))]
              (is (= 2 (count @requests)))
              (is (= 1 (count msgs))
                  "only the retried prompt is sent — the superseded reply is not replayed")
              (is (= :user (first (first msgs))))
              (is (str/includes? (second (first msgs)) "the-question")
                  "the retried prompt is still sent")
              (is (not-any? (fn [[_ text]] (str/includes? (str text) "superseded-reply")) msgs)
                  "the superseded reply is excluded from the reconstructed history"))))))))

(deftest agent-streaming-reconstructs-state-from-db-test
  (testing "the loop is seeded from DB-reconstructed state — no client echo — and a retry rewinds it"
    (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                       metabot.settings/llm-metabot-provider test-provider]
      (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
        (let [seeded-states (atom [])
              turn-states   (atom [{:queries {"q_1" {:database 1}} :todos [{:id "a" :status "pending"}]}
                                   {:queries {"q_1" {:database 1} "q_2" {:database 2}} :todos [{:id "b" :status "done"}]}
                                   nil])]
          (with-redefs [agent/run-agent-loop
                        (fn [{:keys [state memory-atom]}]
                          (swap! seeded-states conj state)
                          (let [[turn-state] @turn-states]
                            (swap! turn-states subvec 1)
                            ;; mirror the real loop: populate the caller's atom so
                            ;; finalize can persist this turn's state
                            (some-> memory-atom
                                    (reset! {:turn-state (or turn-state {})}))
                            (cond-> [{:type :start :id "msg-1"}
                                     {:type :text :text "ok"}]
                              turn-state (conj {:type :data :data-type "state" :data turn-state}))))]
            (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
              (let [conversation-id (str (random-uuid))
                    turn-1-state    {:queries {:q_1 {:database 1}} :todos [{:id "a" :status "pending"}]}
                    first-response  (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                          {:message         "make a query"
                                                           :context         {}
                                                           :conversation_id conversation-id})
                    parent-id       (streamed-message-id first-response)
                    user-ext-id     (streamed-user-message-id first-response)
                    second-response (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                          {:message           "another"
                                                           :context           {}
                                                           :conversation_id   conversation-id
                                                           :parent_message_id parent-id})
                    second-user-id  (streamed-user-message-id second-response)]
                (is (string? user-ext-id))
                (is (= {} (first @seeded-states))
                    "a new conversation seeds the loop with empty state")
                (is (= turn-1-state (second @seeded-states))
                    "the follow-up turn is seeded from the DB partial, keywordized — no client echo")
                (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                      {:message          "another"
                                       :context          {}
                                       :conversation_id  conversation-id
                                       :retry_message_id second-user-id})
                (is (= turn-1-state (nth @seeded-states 2))
                    "retrying the last prompt rewinds state to before its superseded reply")
                (is (= turn-1-state (metabot.persistence/conversation-state
                                     (metabot.persistence/live-messages conversation-id)))
                    "reconstruction excludes the soft-deleted turn's state")))))))))

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
        (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                           metabot.settings/llm-metabot-provider provider]
          (let [{:keys [assistant-msg-id]} (metabot.persistence/start-turn!
                                            conv-id "internal"
                                            {:role "user" :content "hi"})]
            (metabot.persistence/finalize-assistant-turn!
             assistant-msg-id
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
  (testing "persistable data parts land in MetabotMessage.data; the turn-state lands on the row and is excluded from data"
    (binding [mb.api/*current-user-id* (mt/user->id :crowberto)]
      (let [conv-id (str (random-uuid))]
        (try
          (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                             metabot.settings/llm-metabot-provider "anthropic/claude-sonnet-4-6"]
            (let [{:keys [assistant-msg-id]} (metabot.persistence/start-turn!
                                              conv-id "internal"
                                              {:role "user" :content "hi"})]
              (metabot.persistence/finalize-assistant-turn!
               assistant-msg-id
               [{:type :start :id "msg-1"}
                {:type :text :text "Hi"}
                {:type :data :data-type "generated_entity" :version 1 :data {:type "card" :id "c1" :title "Q" :query {:id "q1" :query {}}}}
                {:type :data :data-type "todo_list" :version 1 :data [{:id "1" :content "x" :status "pending" :priority "low"}]}
                {:type :data :data-type "code_edit" :version 1 :data {:buffer_id "b" :value "v"}}
                {:type :data :data-type "transform_suggestion" :version 1 :data {}}
                {:type :data :data-type "adhoc_viz" :version 1 :data {:query {} :link "/q"}}
                {:type :data :data-type "static_viz" :version 1 :data {:entity_id 1}}
                {:type :data :data-type "state" :data {:step 1}}
                {:type :usage :model "claude-sonnet-4-6" :usage {:promptTokens 1 :completionTokens 1}}
                {:type :finish}]
               :turn-state {:step 1})
              (let [msg        (t2/select-one :model/MetabotMessage assistant-msg-id)
                    part-types (into #{} (map :type) (:data msg))
                    data-types (into #{}
                                     (keep #(when (str/starts-with? % "data-") (subs % 5)))
                                     part-types)]
                (is (= #{"generated_entity" "todo_list" "code_edit" "transform_suggestion" "adhoc_viz" "static_viz"}
                       data-types)
                    "all persistable data parts (not state) should be in :data")
                (is (contains? part-types "text")
                    "text parts survive")
                (is (not-any? part-types #{"start" "usage" "finish"})
                    "stream metadata is dropped")
                (is (= {:step 1} (:state msg))
                    "the turn's partial state lands on the message row"))))
          (finally
            (t2/delete! :model/MetabotMessage :conversation_id conv-id)
            (t2/delete! :model/MetabotConversation :id conv-id)))))))

(deftest parts->storable-content-tool-output-trimming-test
  (testing "drops transient result keys and structured-output fields outside the persisted subset"
    (is (= [{:type         "tool-search"
             :toolCallId   "call-1"
             :state        "output-available"
             :input        {:q "x"}
             :output       {:output "<result>XML</result>"}}]
           (metabot.persistence/parts->storable-content
            [{:type :tool-input :id "call-1" :function "search" :arguments {:q "x"}}
             {:type   :tool-output
              :id     "call-1"
              :result {:output            "<result>XML</result>"
                       :resources         [{:id 1 :name "Orders" :columns [{:field_values [1 2 3]}]}]
                       :structured-output {:result-type :search :data [{:id 1}]}
                       :data-parts        [{:type :data :data-type "generated_entity"}]}}])))))

(deftest parts->storable-content-structured-output-subset-test
  (testing "keeps the query-related subset of structured output, canonicalized to :structured_output"
    (let [query-map {:database 1 :type :native :native {:query "SELECT 1"}}]
      (is (= [{:type         "tool-create_sql_query"
               :toolCallId   "call-sql"
               :state        "output-available"
               :input        {}
               :output       {:output            "<result>...</result>"
                              :structured_output {:query-id      "qid-1"
                                                  :query-content "SELECT 1"
                                                  :query         query-map
                                                  :database      1}}}]
             (metabot.persistence/parts->storable-content
              [{:type :tool-input :id "call-sql" :function "create_sql_query" :arguments {}}
               {:type   :tool-output
                :id     "call-sql"
                :result {:output            "<result>...</result>"
                         :structured-output {:query-id      "qid-1"
                                             :query-content "SELECT 1"
                                             :query         query-map
                                             :database      1
                                             :resources     [{:field_values [1 2 3]}]
                                             :reactions     [:noop]}
                         :data-parts        [{:type :data}]}}]))))))

(deftest parts->storable-content-snake-alias-test
  (testing "reads the snake-case :structured_output alias when present"
    (is (= [{:type         "tool-search"
             :toolCallId   "call-snake"
             :state        "output-available"
             :input        {}
             :output       {:output            "<result>...</result>"
                            :structured_output {:query-id "qid-2" :query-content "SELECT 2"}}}]
           (metabot.persistence/parts->storable-content
            [{:type :tool-input :id "call-snake" :function "search" :arguments {}}
             {:type   :tool-output
              :id     "call-snake"
              :result {:output            "<result>...</result>"
                       :structured_output {:query-id      "qid-2"
                                           :query-content "SELECT 2"
                                           :extra-bloat   [1 2 3]}}}])))))

(deftest parts->storable-content-empty-result-test
  (testing "result with no :output key and no query-related structured output stores an empty map"
    (is (= [{:type         "tool-search"
             :toolCallId   "call-2"
             :state        "output-available"
             :input        {}
             :output       {}}]
           (metabot.persistence/parts->storable-content
            [{:type :tool-input :id "call-2" :function "search" :arguments {}}
             {:type   :tool-output
              :id     "call-2"
              :result {:structured-output {:some "data"}}}])))))

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
      (mt/with-model-cleanup [:model/MetabotMessage
                              [:model/MetabotConversation :created_at]]
        (mt/with-dynamic-fn-redefs [metabot.config/check-metabot-enabled! (constantly nil)
                                    api/check-conversation-access!        (constantly nil)
                                    metabot.persistence/leaf-external-id  (constantly nil)
                                    metabot.persistence/live-messages     (constantly [])
                                    metabot.persistence/history           (constantly [])
                                    metabot.persistence/start-turn!       (fn [& _]
                                                                            {:assistant-msg-id 1
                                                                             :assistant-external-id "ext-id"})
                                    conversation-title/ensure-title!      (constantly {:status :missing})
                                    api/native-agent-streaming-request    (fn [args]
                                                                            (reset! captured-args args)
                                                                            ;; Return a minimal streaming response
                                                                            nil)]
          (api/streaming-request {:metabot_id      test-metabot-id
                                  :profile_id      nil
                                  :message         "test message"
                                  :context         {}
                                  :conversation_id (str (random-uuid))
                                  :state           {}
                                  :debug           false}
                                 {:origin nil :referer nil :user-agent nil :ip-address nil})
          (testing "metabot-id is included in the arguments"
            (is (some? (:metabot-id @captured-args))
                "metabot-id should not be nil")
            (is (= test-metabot-id (:metabot-id @captured-args))
                "metabot-id should match the input metabot_id")))))))

(deftest streaming-request-ip-address-test
  (mt/with-model-cleanup [:model/MetabotMessage
                          [:model/MetabotConversation :created_at]]
    (let [request-body (fn [conversation-id & [parent-message-id]]
                         (cond-> {:metabot_id      metabot.config/embedded-metabot-id
                                  :profile_id      nil
                                  :message         "hi"
                                  :context         {}
                                  :conversation_id conversation-id
                                  :state           {}
                                  :debug           false}
                           parent-message-id (assoc :parent_message_id parent-message-id)))
          ip-for       (fn [conversation-id]
                         (:ip_address (t2/select-one :model/MetabotConversation :id conversation-id)))
          info-with-ip (fn [ip] {:origin nil :referer nil :user-agent nil :ip-address ip})]
      (mt/with-dynamic-fn-redefs [metabot.config/check-metabot-enabled! (constantly nil)
                                  conversation-title/ensure-title!      (constantly {:status :missing})
                                  api/native-agent-streaming-request    (constantly nil)]
        (mt/with-premium-features #{:audit-app}
          (mt/with-test-user :rasta
            (mt/with-temporary-setting-values [analytics-pii-retention-enabled true]
              (testing "first writer wins: initial call captures the IP, later calls do not overwrite it"
                (let [conversation-id (str (random-uuid))]
                  (api/streaming-request (request-body conversation-id) (info-with-ip "1.2.3.4"))
                  (is (= "1.2.3.4" (ip-for conversation-id)))
                  (api/streaming-request (request-body conversation-id
                                                       (metabot.persistence/leaf-external-id conversation-id))
                                         (info-with-ip "5.6.7.8"))
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
    (let [request-body (fn [conversation-id & [parent-message-id]]
                         (cond-> {:metabot_id      metabot.config/embedded-metabot-id
                                  :profile_id      nil
                                  :message         "hi"
                                  :context         {}
                                  :conversation_id conversation-id
                                  :state           {}
                                  :debug           false}
                           parent-message-id (assoc :parent_message_id parent-message-id)))
          info-with    (fn [embed-referrer]
                         {:origin     embed-referrer
                          :referer    embed-referrer
                          :user-agent nil
                          :ip-address nil})
          convo-for    (fn [conversation-id]
                         (t2/select-one :model/MetabotConversation :id conversation-id))]
      (mt/with-dynamic-fn-redefs [metabot.config/check-metabot-enabled! (constantly nil)
                                  conversation-title/ensure-title!      (constantly {:status :missing})
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
                  (api/streaming-request (request-body conversation-id
                                                       (metabot.persistence/leaf-external-id conversation-id))
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
      (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                         metabot.settings/llm-metabot-provider test-provider]
        (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
          (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                              (mut/mock-llm-response
                                                               [{:type :start :id "msg-1"}
                                                                {:type :text :text "hi"}
                                                                {:type  :usage       :usage {:promptTokens 1 :completionTokens 1}
                                                                 :model "test-model" :id    "msg-1"}]))
                                      conversation-title/ensure-title! (constantly {:status :missing})]
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
                                           :state           {}})
                    (let [convo (t2/select-one :model/MetabotConversation :id conversation-id)]
                      (is (nil? (:user_agent           convo)))
                      (is (nil? (:sanitized_user_agent convo))))))))))))))

(deftest agent-streaming-returns-free-trial-limit-error-when-managed-provider-is-locked-test
  (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                     metabot.settings/llm-metabot-provider
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
                             :state           {}}))))
