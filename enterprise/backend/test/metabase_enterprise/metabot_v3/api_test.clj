(ns metabase-enterprise.metabot-v3.api-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase.test :as mt]))

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
          (doseq [metabot-id [nil (str (random-uuid))]]
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
                        :conversation-id conversation-id
                        :profile-id (if metabot-id
                                      "default"
                                      (metabot-v3.config/metabot-profile-id metabot-v3.config/internal-metabot-id))
                        :session-id (fn [session-id]
                                      (when-let [token (#'metabot-v3.tools.api/decode-ai-service-token session-id)]
                                        (and (= (:metabot-id token) (or metabot-id
                                                                        metabot-v3.config/internal-metabot-id))
                                             (= (:user token) (mt/user->id :rasta)))))}]
                      @ai-requests))
              (is (=? {:reactions [{:type "metabot.reaction/redirect", :url navigation-target}]
                       :history [historical-message
                                 {:role "user", :content question}
                                 (update agent-message :role name)]
                       :state agent-state
                       :conversation_id conversation-id}
                      response)))))))))
