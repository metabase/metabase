(ns metabase-enterprise.metabot-v3.client-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.tools :as metabot-v3.tools]))

(deftest ^:parallel build-request-body-test
  (binding [metabot-v3.client/*instance-info* (constantly {})
            metabot-v3.tools/*tools-metadata* (constantly
                                               [{:name "invite_user"
                                                 :description "Invite a user to Metabase. Requires a valid email address."
                                                 :parameters {:type                  :object
                                                              :properties            {:email {:type        :string
                                                                                              :description "A valid email address of the user to invite"}}
                                                              :required              [:email]
                                                              :additional-properties false}}])]
    (let [session-id (random-uuid)]
      (is (=? {:messages      [{:role :user, :content "Hello"}]
               :context       {}
               :tools         [{:name        "invite_user"
                                :description "Invite a user to Metabase. Requires a valid email address."
                                :parameters  {:type       :object
                                              :properties {"email" {:type :string
                                                                    :description "A valid email address of the user to invite"}}
                                              :required   ["email"]
                                              :additionalProperties false}}]
               :instance_info {}
               :session_id    session-id}
              (#'metabot-v3.client/build-request-body {} [{:role :user :content "Hello"}] session-id))))))

(deftest ^:parallel encode-request-body-test
  (is (= {:messages [{:content    nil
                      :role       :assistant
                      :tool_calls [{:id "call_xsI6ygzaTnANYVxcmoAiRLRL"
                                    :name "say_hello"
                                    :arguments "{\"name\":\"User\",\"greeting\":\"Hello!\"}"}]}]
          :context    {}}
         (#'metabot-v3.client/encode-request-body
          {:messages [{:content     nil
                       :role        :assistant
                       :tool-calls [{:id "call_xsI6ygzaTnANYVxcmoAiRLRL"
                                     :name :say-hello
                                     :arguments {:name "User", :greeting "Hello!"}}]}]}))))

(deftest ^:parallel decode-response-body-test
  (is (= {:message {:content    nil
                    :role       :assistant
                    :tool-calls [{:id        "call_1drvrXfHb6q9Doxh8leujqKB"
                                  :name      :metabot.tool/say-hello
                                  :arguments {:name "User"
                                              :greeting "Hello!"}}]}}
         (#'metabot-v3.client/decode-response-body
          {:message {:content nil
                     :role "assistant"
                     :tool_calls [{:id "call_1drvrXfHb6q9Doxh8leujqKB"
                                   :name "say-hello"
                                   :arguments "{\"name\":\"User\",\"greeting\":\"Hello!\"}"}]}}))))
