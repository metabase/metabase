(ns metabase-enterprise.metabot.api-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.api.common :as mb.api]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.api :as api]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest feedback-endpoint-test
  (let [store-url  "http://hm.example"
        fake-token "test-fake-token-for-feedback"]
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
              expected-url (str store-url "/api/v2/metabot/feedback/" fake-token)]
          (mt/with-dynamic-fn-redefs
            [premium-features/premium-embedding-token (constantly fake-token)
             http/post (fn [url opts]
                         (reset! captured {:url  url
                                           :body (json/decode+kw (:body opts))}))]
            (let [_resp (mt/user-http-request :rasta :post 204 "metabot/feedback" feedback)]
              (is (= {:url expected-url :body feedback}
                     @captured)))))))

    (testing "Returns 500 when http post fails"
      (mt/with-temporary-setting-values [store-api-url store-url]
        (mt/with-dynamic-fn-redefs
          [premium-features/premium-embedding-token (constantly fake-token)
           http/post (fn [_url _opts]
                       (throw (ex-info "boom" {:status 404})))]
          (mt/user-http-request :rasta :post 500 "metabot/feedback" {:any "payload"}))))

    (testing "Throws when premium token is missing"
      (mt/with-dynamic-fn-redefs
        [premium-features/premium-embedding-token (constantly nil)]
        (mt/user-http-request :rasta :post 400 "metabot/feedback" {:foo "bar"})))))

(deftest usage-get-returns-token-status-usage-test
  (mt/with-premium-features #{:metabot-v3}
    (with-redefs [premium-features/token-status (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value      12345
                                                                                                           :meter-free-units 1337
                                                                                                           :meter-updated-at "2026-04-02T19:29:12Z"}}})]
      (is (= {:tokens       12345
              :free_tokens  1337
              :updated_at   "2026-04-02T19:29:12Z"
              :is_locked    nil}
             (-> (mt/user-http-request :crowberto :get 200 "ee/metabot/usage")
                 (update :updated_at str)))))))

(deftest usage-permissions-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/user-http-request :rasta :get 403 "ee/metabot/usage")))

;;; ---------------------------------------- Managed Provider Tests ----------------------------------------
;;; Tests that set llm-metabot-provider to a metabase/ prefixed value require the EE
;;; implementation of validate-metabot-provider! to be on the classpath.

(deftest settings-get-returns-metabase-models-without-api-key-test
  (mt/with-premium-features #{:metabase-ai-managed}
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
                                     :provider "metabase")))))))

(deftest settings-put-updates-metabase-provider-without-api-key-test
  (mt/with-premium-features #{:metabase-ai-managed}
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
               (metabot.settings/llm-metabot-provider)))))))

(deftest settings-put-defaults-empty-metabase-model-test
  (mt/with-premium-features #{:metabase-ai-managed}
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
               (metabot.settings/llm-metabot-provider)))))))

(deftest settings-put-api-key-switches-from-metabase-to-provider-default-model-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key nil]
      (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"
                                         llm.settings/llm-anthropic-api-key    nil]
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
                   (llm.settings/llm-anthropic-api-key)))))))))

(deftest metabot-provider-without-api-key-is-configured-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"
                                       llm.settings/llm-proxy-base-url      "https://proxy.example.com"
                                       llm.settings/llm-anthropic-api-key    nil
                                       llm.settings/llm-openai-api-key       nil
                                       llm.settings/llm-openrouter-api-key   nil]
      (is (true? (metabot.settings/llm-metabot-configured?))))))

(defn- store-and-check!
  "Helper: call store-native-parts! with the given provider setting, return the stored message."
  [provider]
  (binding [mb.api/*current-user-id* (mt/user->id :crowberto)]
    (let [conv-id (str (random-uuid))]
      (try
        (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider provider]
          (#'api/store-native-parts!
           conv-id "internal"
           [{:type :start :id "msg-1"}
            {:type :text :text "Hello"}
            {:type :usage :model "claude-sonnet-4-6" :usage {:promptTokens 100 :completionTokens 50}}
            {:type :data :data-type "state" :data {:step 1}}
            {:type :finish}])
          (t2/select-one :model/MetabotMessage :conversation_id conv-id))
        (finally
          (t2/delete! :model/MetabotMessage :conversation_id conv-id)
          (t2/delete! :model/MetabotConversation :id conv-id))))))

(deftest store-native-parts-ai-proxy-test
  (testing "metabase/ provider prefix sets ai_proxied true and stores bare model names"
    (mt/with-premium-features #{:metabase-ai-managed}
      (let [msg (store-and-check! "metabase/anthropic/claude-sonnet-4-6")]
        (is (true? (:ai_proxied msg)))
        (is (= {:claude-sonnet-4-6 {:prompt 100 :completion 50}}
               (:usage msg))
            "usage keys should be bare model names, not metabase/anthropic/..."))))

  (testing "BYOK provider (no metabase/ prefix) sets ai_proxied false"
    (let [msg (store-and-check! "anthropic/claude-sonnet-4-6")]
      (is (false? (:ai_proxied msg)))
      (is (= {:claude-sonnet-4-6 {:prompt 100 :completion 50}}
             (:usage msg))))))

(deftest agent-streaming-returns-free-trial-limit-error-when-managed-provider-is-locked-test
  (mt/with-premium-features #{:metabase-ai-managed}
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
                               :state           {}})))))
