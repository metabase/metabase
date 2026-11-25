(ns metabase-enterprise.metabot.call-records-test
  "The LLM call and tool call records of a turn: one test per way a call ends."
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.call-records :as call-records]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.test-util :as test-util]
   [metabase.premium-features.defenterprise :as defenterprise]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

(def ^:private model "openrouter/test-model")

(def ^:private usage-part
  {:type              :usage
   :usage             {:promptTokens 10 :completionTokens 5 :cacheCreationTokens 2 :cacheReadTokens 3}
   :finish-reason     "stop"
   :raw-finish-reason "end_turn"})

(def ^:private get-time-call
  {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "UTC"}})

(defn- do-with-turn!
  "Call `f` with the tracking opts of a turn of a new conversation: its assistant message, its conversation and a new
  request id. Deletes the conversation after, and with it the turn's records."
  [f]
  (let [conversation-id (str (random-uuid))
        request-id      (str (random-uuid))]
    (mt/with-temporary-setting-values [llm-openrouter-api-key "sk-or-v1-test-key"]
      (mt/with-test-user :rasta
        (try
          (let [{:keys [assistant-msg-id]} (metabot.persistence/start-turn!
                                            conversation-id "internal" {:role "user" :content "hi"})]
            (f {:tag        "agent"
                :source     "metabot_agent"
                :profile-id :internal
                :iteration  1
                :session-id conversation-id
                :message-id assistant-msg-id
                :request-id request-id}))
          (finally
            ;; the calls also log their usage, which the usage limit tests count
            (t2/delete! :model/AiUsageLog :request_id request-id)
            (t2/delete! :model/MetabotConversation :id conversation-id)))))))

(defn- llm-calls [{:keys [request-id]}]
  (t2/select :model/MetabotLlmCall :request_id request-id {:order-by [[:id :asc]]}))

(defn- tool-calls [{:keys [message-id]}]
  (t2/select :model/MetabotToolCall :message_id message-id {:order-by [[:id :asc]]}))

(defn- call-llm!
  "Run one streaming LLM call whose provider answers with `response`, a function of no arguments that returns the
  reducible of an attempt. Returns the call's parts."
  [response tools tracking-opts]
  (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_] (response))]
    (into [] (self/call-llm model nil [{:role :user :content "hi"}] tools tracking-opts))))

(deftest successful-turn-test
  (do-with-turn!
   (fn [{:keys [message-id session-id request-id] :as tracking-opts}]
     (call-llm! #(test-util/mock-llm-response [{:type :start :id "m1"}
                                               {:type :text :id "t1" :text "The time:"}
                                               get-time-call
                                               usage-part])
                (select-keys test-util/TOOLS ["get-time"])
                tracking-opts)
     (let [[llm-call :as all-llm-calls]   (llm-calls tracking-opts)
           [tool-call :as all-tool-calls] (tool-calls tracking-opts)]
       (testing "the attempt has one row, with its end, its tokens and the provider's finish reason"
         (is (= 1 (count all-llm-calls)))
         (is (=? {:message_id            message-id
                  :conversation_id       session-id
                  :user_id               (mt/user->id :rasta)
                  :request_id            request-id
                  :source                "metabot_agent"
                  :profile_id            "internal"
                  :provider              "openrouter"
                  :model                 model
                  :iteration             1
                  :attempt               1
                  :started_at            some?
                  :finished_at           some?
                  :status                "ok"
                  :error_class           nil
                  :retry_delay_ms        nil
                  :finish_reason         "end_turn"
                  :prompt_tokens         10
                  :completion_tokens     5
                  :cache_creation_tokens 2
                  :cache_read_tokens     3}
                 llm-call)))
       (testing "the tool call has one row, tied to the attempt, with its input and its output"
         (is (= 1 (count all-tool-calls)))
         (is (=? {:llm_call_id  (:id llm-call)
                  :message_id   message-id
                  :tool_call_id "call-1"
                  :tool_name    "get-time"
                  :created_at   some?
                  :started_at   some?
                  :finished_at  some?
                  :status       "ok"
                  :error_class  nil
                  :input        {:tz "UTC"}
                  :output       string?}
                 tool-call)))
       (testing "the end of the turn stamps the message and leaves the closed rows alone"
         (metabot.persistence/finalize-assistant-turn! message-id [])
         (is (some? (t2/select-one-fn :finished_at :model/MetabotMessage :id message-id)))
         (is (= ["ok"] (map :status (llm-calls tracking-opts))))
         (is (= ["ok"] (map :status (tool-calls tracking-opts)))))))))

(deftest retried-attempt-test
  (do-with-turn!
   (fn [tracking-opts]
     (let [attempts (atom 0)]
       (mt/with-dynamic-fn-redefs [self/retry-delay-ms (constantly 7)]
         (mt/with-log-level [metabase.metabot.self :fatal]
           (call-llm! #(if (= 1 (swap! attempts inc))
                         (throw (ex-info "rate limited" {:status 429}))
                         (test-util/mock-llm-response [{:type :text :id "t1" :text "Hello"} usage-part]))
                      {}
                      tracking-opts)))
       (is (=? [{:attempt 1 :status "error" :error_class "ExceptionInfo" :error_status 429 :retry_delay_ms 7
                 :finished_at some? :prompt_tokens nil}
                {:attempt 2 :status "ok" :error_class nil :error_status nil :retry_delay_ms nil
                 :finished_at some? :prompt_tokens 10}]
               (llm-calls tracking-opts)))))))

(deftest failed-attempt-test
  (do-with-turn!
   (fn [tracking-opts]
     (testing "an attempt that throws"
       (is (thrown-with-msg? clojure.lang.ExceptionInfo #"bad request"
                             (call-llm! #(throw (ex-info "bad request" {:status 400})) {} tracking-opts)))
       (is (=? [{:attempt 1 :status "error" :error_class "ExceptionInfo" :error_status 400 :retry_delay_ms nil
                 :finished_at some?}]
               (llm-calls tracking-opts))))))
  (do-with-turn!
   (fn [tracking-opts]
     (testing "an attempt whose stream holds an error"
       (mt/with-log-level [metabase.metabot.self :fatal]
         (call-llm! #(test-util/mock-llm-response [{:type :error :error {:message "overloaded" :code 529}}])
                    {}
                    tracking-opts))
       (is (=? [{:attempt 1 :status "error" :error_class "llm-sse-error" :error_status 529 :finished_at some?}]
               (llm-calls tracking-opts)))))))

(deftest tool-error-test
  (do-with-turn!
   (fn [tracking-opts]
     (let [failing (assoc (get test-util/TOOLS "get-time")
                          :fn (fn [_] {:output "No such timezone." :error {:class :recoverable :code :no-timezone}}))]
       (call-llm! #(test-util/mock-llm-response [get-time-call usage-part]) {"get-time" failing} tracking-opts)
       (is (=? [{:status "ok"}] (llm-calls tracking-opts)))
       (is (=? [{:status "error" :error_class "recoverable" :output nil :started_at some? :finished_at some?}]
               (tool-calls tracking-opts)))))))

(deftest skipped-tool-test
  (testing "a call that waits for the call before it when the stream errors does not run, and is recorded as skipped"
    (do-with-turn!
     (fn [tracking-opts]
       (let [release (promise)
             ran     (atom [])
             tool    (fn [tool-name]
                       (assoc (get test-util/TOOLS "get-time")
                              :tool-name   tool-name
                              :runs-alone? true
                              :fn          (fn [_]
                                             (deref release 5000 nil)
                                             (swap! ran conj tool-name)
                                             "12:00")))
             chunks  (test-util/parts->aisdk-chunks
                      [(assoc get-time-call :id "call-1" :function "first")
                       (assoc get-time-call :id "call-2" :function "second")
                       {:type :error :error {:message "stream broke"}}])]
         (mt/with-log-level [metabase.metabot.self :fatal]
           (call-llm! #(reify clojure.lang.IReduceInit
                         (reduce [_ rf init]
                           ;; The first call runs until the error is through, so the second starts after it.
                           (let [result (reduce rf init chunks)]
                             (deliver release true)
                             result)))
                      {"first" (tool "first") "second" (tool "second")}
                      tracking-opts))
         (is (= ["first"] @ran))
         (is (=? [{:tool_name "first" :status "ok" :started_at some? :finished_at some?}
                  {:tool_name "second" :status "skipped" :started_at nil :finished_at some? :output nil}]
                 (tool-calls tracking-opts))))))))

(deftest client-abort-test
  (testing "a consumer that stops reading ends the attempt as aborted"
    (do-with-turn!
     (fn [tracking-opts]
       (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                           (test-util/mock-llm-response
                                                            [{:type :text :id "t1" :text "Hello, world"}
                                                             {:type :text :id "t2" :text "More"}]))]
         (into [] (take 1) (self/call-llm model nil [{:role :user :content "hi"}] {} tracking-opts)))
       (is (=? [{:status "aborted" :finished_at some?}] (llm-calls tracking-opts))))))
  (testing "the end of the turn sets the rows that are still open to aborted"
    (do-with-turn!
     (fn [{:keys [message-id] :as tracking-opts}]
       (let [llm-call-id  (call-records/record-llm-call-start! (assoc tracking-opts :model model) 1)
             tool-call-id (call-records/record-tool-call-submit! {:llm-call-id  llm-call-id
                                                                  :message-id   message-id
                                                                  :tool-call-id "call-1"
                                                                  :tool-name    "get-time"
                                                                  :input        (delay {:tz "UTC"})})]
         (is (=? [{:status "running" :finished_at nil}] (llm-calls tracking-opts)))
         (is (=? [{:status "running" :finished_at nil}] (tool-calls tracking-opts)))
         (metabot.persistence/finalize-assistant-turn! message-id [] :finished? false)
         (let [finished-at (t2/select-one-fn :finished_at :model/MetabotMessage :id message-id)]
           (is (some? finished-at))
           (is (=? [{:status "aborted" :finished_at finished-at}] (llm-calls tracking-opts)))
           (is (=? [{:status "aborted" :finished_at finished-at}] (tool-calls tracking-opts))))
         (testing "a tool that ends after the turn writes its own end over aborted"
           (call-records/record-tool-call-end! tool-call-id {:result "12:00"})
           (is (=? [{:status "ok" :output "12:00"}] (tool-calls tracking-opts)))))))))

(deftest source-with-no-message-test
  (testing "a structured call outside a conversation gets a row with no message and no conversation"
    (let [request-id (str (random-uuid))]
      (mt/with-temporary-setting-values [llm-openrouter-api-key "sk-or-v1-test-key"]
        (mt/with-test-user :rasta
          (try
            (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                                (test-util/mock-llm-response
                                                                 [{:type :tool-input :id "c1" :function "json"
                                                                   :arguments {:title "A title"}}
                                                                  usage-part]))]
              (is (= {:title "A title"}
                     (self/call-llm-structured model
                                               [{:role "user" :content "Name it"}]
                                               {:type "object" :properties {:title {:type "string"}}}
                                               0.3 100
                                               {:tag                 "conversation_title"
                                                :request-id          request-id
                                                :required-permission :permission/metabot}))))
            (is (=? [{:message_id      nil
                      :conversation_id nil
                      :source          "conversation_title"
                      :iteration       nil
                      :attempt         1
                      :status          "ok"
                      :finished_at     some?
                      :prompt_tokens   10}]
                    (llm-calls {:request-id request-id})))
            (finally
              (t2/delete! :model/AiUsageLog :request_id request-id)
              (t2/delete! :model/MetabotLlmCall :request_id request-id))))))))

(def ^:private record-fns
  '[record-llm-call-start! record-llm-call-end! record-tool-call-submit! record-tool-call-end! abort-open-calls!])

(defn- do-with-oss-call-records
  "Call `f` with the OSS implementations of [[call-records]] in effect, as on an instance with no EE code."
  [f]
  (let [registry @#'defenterprise/registry
        ee-fns   (map #(symbol "metabase-enterprise.metabot.call-records" (name %)) record-fns)
        before   @registry]
    (try
      (swap! registry #(reduce (fn [m ee-fn] (update m ee-fn dissoc :ee)) % ee-fns))
      (f)
      (finally
        (reset! registry before)))))

(deftest oss-writes-no-rows-test
  (do-with-turn!
   (fn [{:keys [message-id] :as tracking-opts}]
     (do-with-oss-call-records
      (fn []
        (call-llm! #(test-util/mock-llm-response [get-time-call usage-part])
                   (select-keys test-util/TOOLS ["get-time"])
                   tracking-opts)
        (metabot.persistence/finalize-assistant-turn! message-id [])))
     (is (empty? (llm-calls tracking-opts)))
     (is (empty? (tool-calls tracking-opts)))
     (testing "the message still gets the time its turn ended"
       (is (some? (t2/select-one-fn :finished_at :model/MetabotMessage :id message-id)))))))
