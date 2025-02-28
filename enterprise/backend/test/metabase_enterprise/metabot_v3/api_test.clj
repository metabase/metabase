(ns metabase-enterprise.metabot-v3.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase.test :as mt]))

(deftest agent-test
  (let [ai-requests (atom [])
        conversation-id (str (random-uuid))
        question "what can you do?"]
    (with-redefs [metabot-v3.client/request-v2 (fn [e]
                                                 (swap! ai-requests conj e)
                                                 e)]
      (mt/with-premium-features #{:metabot-v3}
        (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-v3/v2/agent"
                                             {:message question
                                              :context {}
                                              :conversation_id conversation-id
                                              :history []
                                              :state {}})
              get-current-user-response (-> response :history (nth 2) :content)]
          (is (=? {:reactions []
                   :history
                   [{:role "user", :content "what can you do?"}
                    {:content nil
                     :role "assistant"
                     :tool-calls [{:id (=?/same :tool-call-id), :name "get-current-user", :arguments {}}]}
                    {:role "tool"
                     :tool-call-id (=?/same :tool-call-id)
                     :content string?}
                    {:role "user", :content question}]
                   :state {}
                   :conversation_id conversation-id}
                  response))
          (is (str/includes? get-current-user-response "rasta@metabase.com")))))))
