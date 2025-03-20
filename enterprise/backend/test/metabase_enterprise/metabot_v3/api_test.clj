(ns metabase-enterprise.metabot-v3.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest agent-test
  (let [ai-requests (atom [])
        conversation-id (str (random-uuid))
        question "what can you do?"
        navigation-target "url"
        initial-history [{:role "user", :content "hello?"}]
        agent-message {:role :assistant, :navigate-to navigation-target}
        agent-state {:key "value"}]
    (mt/with-premium-features #{:metabot-v3}
      (testing "Trivial request"
        (with-redefs [metabot-v3.client/request (fn [e]
                                                  (swap! ai-requests conj e)
                                                  {:messages [agent-message]
                                                   :state agent-state})]
          (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-v3/v2/agent"
                                               {:message question
                                                :context {}
                                                :conversation_id conversation-id
                                                :history initial-history
                                                :state {}})]
            (is (=? [{:context {:current_user_time (every-pred string? java.time.Instant/parse)}
                      :messages (conj initial-history {:role :user, :content question})
                      :state {}
                      :conversation-id conversation-id
                      :session-id #(#'metabot-v3.tools.api/decode-ai-service-token %)}]
                    @ai-requests))
            (is (=? {:reactions [{:type "metabot.reaction/redirect", :url navigation-target}]
                     :history (conj initial-history
                                    {:role "user", :content question}
                                    (update agent-message :role name))
                     :state agent-state
                     :conversation_id conversation-id}
                    response))))))))
