(ns metabase-enterprise.metabot-v3.api-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest agent-test
  (let [ai-requests (atom [])
        conversation-id (str (random-uuid))
        question "what can you do?"
        navigation-target "url"
        historical-message {:role "user", :content "hello?"}
        agent-message {:role :assistant, :navigate-to navigation-target}
        agent-state {:key "value"}]
    (mt/with-premium-features #{:metabot-v3}
      (with-redefs [metabot-v3.client/request (fn [e]
                                                (swap! ai-requests conj e)
                                                {:messages [agent-message]
                                                 :state agent-state})]
        (testing "Trivial request"
          (doseq [metabot-id [nil 42]]
            (reset! ai-requests [])
            (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-v3/v2/agent"
                                                 (-> {:message question
                                                      :context {}
                                                      :conversation_id conversation-id
                                                      :history [historical-message]
                                                      :state {}}
                                                     (m/assoc-some :metabot_id metabot-id)))]
              (is (=? [{:context {:current_user_time (every-pred string? java.time.Instant/parse)}
                        :messages [(update historical-message :role keyword) {:role :user, :content question}]
                        :state {}
                        :metabot-id (or metabot-id 1)
                        :conversation-id conversation-id
                        :session-id #(#'metabot-v3.tools.api/decode-ai-service-token %)}]
                      @ai-requests))
              (is (=? {:reactions [{:type "metabot.reaction/redirect", :url navigation-target}]
                       :history [historical-message
                                 {:role "user", :content question}
                                 (update agent-message :role name)]
                       :state agent-state
                       :conversation_id conversation-id}
                      response)))))))))
