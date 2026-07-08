(ns metabase-enterprise.metabot.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.settings :as ee.metabot.settings]
   [metabase-enterprise.metabot.usage :as ee.metabot.usage]
   [metabase.config.core :as config]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.test-util :as mut]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private test-provider "openrouter/anthropic/claude-haiku-4-5")

(deftest agent-streaming-quota-exceeded-test
  (testing "POST /api/metabot/agent-streaming short-circuits with the quota message once an instance usage limit is exceeded"
    (mt/with-premium-features #{:ai-controls}
      (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider test-provider]
        (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
          (with-redefs [config/is-dev? true]
            (try
              (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 0}]
                (ee.metabot.usage/clear-limit-cache!)
                (let [llm-called? (atom false)]
                  (mt/with-dynamic-fn-redefs [openrouter/openrouter (fn [_]
                                                                      (reset! llm-called? true)
                                                                      (mut/mock-llm-response
                                                                       [{:type :text :text "should not be reached"}]))]
                    (mt/with-model-cleanup [:model/MetabotMessage
                                            [:model/MetabotConversation :created_at]]
                      (let [response   (mt/user-http-request :rasta :post 202 "metabot/agent-streaming"
                                                             {:message         "Hi"
                                                              :context         {}
                                                              :conversation_id (str (random-uuid))
                                                              :history         []
                                                              :state           {}})
                            lines      (str/split-lines response)
                            error-line (first (filter #(str/starts-with? % "3:") lines))]
                        (is (false? @llm-called?)
                            "the LLM must never be called once the instance limit is exceeded")
                        (is (some? error-line))
                        (is (str/includes? error-line "ai_usage_limit_reached"))
                        (is (str/includes? error-line (ee.metabot.settings/metabot-quota-reached-message))))))))
              ;; the limit check is TTL-memoized process-wide; bust it so the now-removed temp limit
              ;; doesn't leak a stale "exceeded" verdict into other tests
              (finally
                (ee.metabot.usage/clear-limit-cache!)))))))))

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
