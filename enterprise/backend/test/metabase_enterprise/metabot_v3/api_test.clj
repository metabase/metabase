(ns metabase-enterprise.metabot-v3.api-test
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [compojure.response]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.api :as api]
   [metabase-enterprise.metabot-v3.client :as client]
   [metabase-enterprise.metabot-v3.client-test :as client-test]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase-enterprise.metabot-v3.util :as metabot.u]
   [metabase.search.test-util :as search.tu]
   [metabase.server.instance :as server.instance]
   [metabase.server.streaming-response :as sr]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; Native agent test helpers
;; These convert simple test parts to Claude raw SSE format that claude->aisdk-xf can process

(defn- parts->claude-raw
  "Convert simple test parts to Claude raw SSE format.
  Accepts parts like {:type :text :text \"Hello\"} and returns Claude raw chunks."
  [parts]
  (let [msg-id (str "msg-" (random-uuid))]
    (concat
     ;; message_start
     [{:type "message_start"
       :message {:id msg-id
                 :model "claude-sonnet-4-5-20250929"
                 :role "assistant"
                 :content []
                 :usage {:input_tokens 10 :output_tokens 0}}}]
     ;; content blocks for each part
     (mapcat
      (fn [idx {:keys [type text id function arguments]}]
        (case type
          :text
          [{:type "content_block_start"
            :index idx
            :content_block {:type "text" :text ""}}
           {:type "content_block_delta"
            :index idx
            :delta {:type "text_delta" :text text}}
           {:type "content_block_stop"
            :index idx}]

          :tool-input
          [{:type "content_block_start"
            :index idx
            :content_block {:type "tool_use" :id id :name function}}
           {:type "content_block_delta"
            :index idx
            :delta {:type "input_json_delta" :partial_json (json/encode arguments)}}
           {:type "content_block_stop"
            :index idx}]

          ;; Default: skip unknown types
          []))
      (range)
      parts)
     ;; message_delta with usage
     [{:type "message_delta"
       :delta {:stop_reason "end_turn"}
       :usage {:input_tokens 10 :output_tokens 50}}
      {:type "message_stop"}])))

(defn- mock-claude-response
  "Create a mock Claude response channel with given parts in Claude raw format."
  [parts]
  (let [ch (a/chan 100)
        claude-chunks (parts->claude-raw parts)]
    (a/go
      (doseq [chunk claude-chunks]
        (a/>! ch chunk))
      (a/close! ch))
    ch))

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
      (let [conversation-id    (str (random-uuid))
            question           {:role "user" :content "Test native streaming"}
            historical-message {:role "user" :content "previous message"}]
        (with-redefs [self/claude-raw (fn [_]
                                        (mock-claude-response
                                         [{:type :text :text "Hello from native agent!"}]))]
          (testing "Native agent streaming request"
            (mt/with-model-cleanup [:model/MetabotMessage
                                    [:model/MetabotConversation :created_at]]
              (let [response (mt/user-http-request :rasta :post 202 "ee/metabot-v3/agent-streaming"
                                                   {:message         (:content question)
                                                    :context         {}
                                                    :conversation_id conversation-id
                                                    :history         [historical-message]
                                                    :state           {}})
                    conv     (t2/select-one :model/MetabotConversation :id conversation-id)
                    messages (t2/select :model/MetabotMessage :conversation_id conversation-id)]
                ;; Native agent emits: TEXT, DATA (state), FINISH_MESSAGE
                (is (=? [{:_type   :TEXT
                          :role    "assistant"
                          :content "Hello from native agent!"}
                         {:_type :DATA
                          :type  "state"}
                         {:_type         :FINISH_MESSAGE
                          :finish_reason "stop"}]
                        (metabot.u/aisdk->messages "assistant" (str/split-lines response))))
                (is (=? {:user_id (mt/user->id :rasta)}
                        conv))
                (is (=? [{:total_tokens 0
                          :role         :user
                          :data         [{:role "user" :content (:content question)}]}
                         {:total_tokens pos-int?
                          :role         :assistant
                          :data         [{:role "assistant" :content "Hello from native agent!"}]}]
                        messages))))))))))

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
                            api/store-message!                     (fn [_conv-id _prof-id msgs]
                                                                     (reset! messages msgs))
                            sr/async-cancellation-poll-interval-ms 5]
                (testing "Closing body stream drops connection"
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
