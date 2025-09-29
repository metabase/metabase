(ns metabase-enterprise.metabot-v3.api-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client-test :as client-test]
   [metabase-enterprise.metabot-v3.util :as metabot.u]
   [metabase.premium-features.token-check :as token-check]
   [metabase.premium-features.token-check-test :as token-check-test]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest agent-streaming-test
  (mt/with-premium-features #{:metabot-v3}
    (let [mock-response      (client-test/make-mock-stream-response
                              ["Hello", " from", " streaming!"]
                              {"some-model" {:prompt 12 :completion 3}})
          conversation-id    (str (random-uuid))
          question           {:role "user" :content "Test streaming question"}
          historical-message {:role "user" :content "previous message"}
          ai-requests        (atom [])]
      (mt/with-dynamic-fn-redefs [http/post (fn [url opts]
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
                        messages))))))))))

(deftest feedback-endpoint-test
  (mt/with-premium-features #{:metabot-v3}
    (with-redefs [token-check/fetch-token-status (fn [_x]
                                                   {:valid    true
                                                    :status   "fake"
                                                    :features ["test" "fixture"]
                                                    :trial    false})]
      (let [premium-token (token-check-test/random-token)
            store-url     "http://hm.example"]
        (testing "Submits feedback to Harbormaster with token and base URL"
          (mt/with-temporary-setting-values [premium-embedding-token premium-token
                                             store-api-url           store-url]
            (let [captured (atom nil)
                  feedback {:metabot_id 1
                            :feedback {:positive true
                                       :message_id "m-1"
                                       :freeform_feedback "ok"}
                            :conversation_data {}
                            :version "v0.0.0"
                            :submission_time "2025-01-01T00:00:00Z"
                            :is_admin false}
                  expected-url (str store-url "/api/v2/metabot/feedback/" premium-token)]
              (mt/with-dynamic-fn-redefs
                [http/post (fn [url opts]
                             (reset! captured {:url url
                                               :body (json/decode+kw (String. ^bytes (:body opts) "UTF-8"))})
                             {:status 204})]
                (let [_resp (mt/user-http-request :rasta :post 204 "ee/metabot-v3/feedback" feedback)]
                  (is (= {:url expected-url :body feedback}
                         @captured)))))))

        (testing "Returns 500 when http post fails"
          (mt/with-temporary-setting-values [premium-embedding-token premium-token
                                             store-api-url           store-url]
            (mt/with-dynamic-fn-redefs
              [http/post (fn [_url _opts]
                           (throw (ex-info "boom" {})))]
              (mt/user-http-request :rasta :post 500 "ee/metabot-v3/feedback" {:any "payload"}))))

        (testing "Throws when premium token is missing"
          (mt/with-temporary-setting-values [premium-embedding-token nil
                                             store-api-url           store-url]
            (mt/user-http-request :rasta :post 500 "ee/metabot-v3/feedback" {:foo "bar"})))

        (testing "Throws when `store-api-url` is missing"
          (mt/with-temporary-setting-values [premium-embedding-token premium-token
                                             store-api-url           nil]
            (mt/user-http-request :rasta :post 500 "ee/metabot-v3/feedback" {:foo "bar"})))))))
