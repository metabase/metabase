(ns metabase-enterprise.metabot-v3.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.api :as metabot-v3.api]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.tools :as metabot-v3.tools]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]))

(deftest ^:parallel encode-reactions-test
  (testing "FE should see snake_case keys in reactions"
    (is (= [{:type          :metabot.reaction/collection-updated
             :collection_id 1}]
           (#'metabot-v3.api/encode-reactions
            [{:type          :metabot.reaction/collection-updated
              :collection-id 1}])))))

(deftest ^:parallel e2e-test
  (let [calls (atom [])]
    (binding [metabot-v3.tools/*tools-metadata* (constantly
                                                 [{:name :invite-user
                                                   :description "Invite a user to Metabase. Requires a valid email address."
                                                   :parameters
                                                   {:type :object
                                                    :properties {"email" {:type :string, :description "A valid email address of the user to invite"}}
                                                    :required ["email"]
                                                    :additionalProperties false}}])
              metabot-v3.client/*request*
              (fn [context history]
                (swap! calls conj [:api-request {:context context, :history history}])
                (swap! calls conj [:ai-proxy-request (#'metabot-v3.client/build-request-body context history)])
                (let [response (cond
                                 (some-> history last :content (str/starts-with? "Send an email"))
                                 {:message {:content "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?"
                                            :role "assistant"
                                            :tool_calls []}}

                                 (some-> history last :content (str/starts-with? "Cam's email is"))
                                 {:message {:content nil
                                            :role "assistant"
                                            :tool_calls [{:id "call_1drvrXfHb6q9Doxh8leujqKB"
                                                          :name "invite-user"
                                                          :arguments "{\"email\": \"cam@metabase.com\"}"}]}}

                                 (= (:role (last history)) :tool)
                                 {:message {:content "Cool, I invited him"
                                            :role "assistant"
                                            :tool_calls []}}

                                 :else
                                 {:message {:content "Unknown!", :role "assistant"}})]
                  (swap! calls conj [:ai-proxy-response response])
                  (#'metabot-v3.client/decode-response-body response)))

              metabot-v3.tools.interface/*invoke-tool*
              (fn [tool-name arguments]
                [{:type :metabot.reaction/invoke-tool, :tool-name tool-name, :arguments arguments}])]
      (let [response-1 (#'metabot-v3.api/request "Send an email to Cam" {} [])]
        (swap! calls conj [:api-response response-1])
        (let [response-2 (#'metabot-v3.api/request "Cam's email is cam@metabase.com" {} (:history response-1))]
          (swap! calls conj [:api-response response-2])
          (is (=? [;; first FE => BE request
                   [:api-request
                    {:context {}, :history [{:role :user, :content "Send an email to Cam"}]}]
                   ;; first BE => AIP request
                   [:ai-proxy-request
                    {:messages [{:role :user, :content "Send an email to Cam"}]
                     :context {}
                     :tools [{:name "invite_user"
                              :description "Invite a user to Metabase. Requires a valid email address."
                              :parameters {:type :object
                                           :properties {"email" {:type :string, :description "A valid email address of the user to invite"}}
                                           :required ["email"]
                                           :additionalProperties false}}]
                     :instance_info {:token "c54f339509b1af2451342c188d59be5e5a112ceaa28f3bd560dc4aa946906fd53"}}]
                   ;; first BE <= AIP response
                   [:ai-proxy-response
                    {:message
                     {:content "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?"
                      :role "assistant"
                      :tool_calls []}}]
                   ;; first FE <= BE response
                   [:api-response
                    {:reactions [{:type :metabot.reaction/message
                                  :message "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?"}]
                     :history [{:role :user, :content "Send an email to Cam"}
                               {:content "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?"
                                :role :assistant
                                :tool-calls []}]}]
                   ;; follow-up FE => BE request
                   [:api-request
                    {:context {}
                     :history [{:role :user, :content "Send an email to Cam"}
                               {:content
                                "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?"
                                :role :assistant
                                :tool-calls []}
                               {:content "Cam's email is cam@metabase.com"
                                :role :user}]}]
                   ;; follow-up BE => AIP request
                   [:ai-proxy-request
                    {:messages [{:role :user, :content "Send an email to Cam"}
                                {:content
                                 "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?"
                                 :role :assistant
                                 :tool_calls []}
                                {:role :user, :content "Cam's email is cam@metabase.com"}]
                     :context {}
                     :tools [{:name "invite_user"
                              :description "Invite a user to Metabase. Requires a valid email address."
                              :parameters
                              {:type :object
                               :properties {"email" {:type :string, :description "A valid email address of the user to invite"}}
                               :required ["email"]
                               :additionalProperties false}}]
                     :instance_info {:token "c54f339509b1af2451342c188d59be5e5a112ceaa28f3bd560dc4aa946906fd53"}}]
                   ;; follow-up BE <= AIP request
                   [:ai-proxy-response
                    {:message
                     {:content nil
                      :role "assistant"
                      :tool_calls
                      [{:id "call_1drvrXfHb6q9Doxh8leujqKB", :name "invite-user", :arguments "{\"email\": \"cam@metabase.com\"}"}]}}]
                   [:api-request
                    {:context {},
                     :history
                     [{:role :user, :content "Send an email to Cam"}
                      {:content
                       "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?",
                       :role :assistant,
                       :tool-calls []}
                      {:role :user, :content "Cam's email is cam@metabase.com"}
                      {:content nil,
                       :role :assistant,
                       :tool-calls
                       [{:id "call_1drvrXfHb6q9Doxh8leujqKB", :name :metabot.tool/invite-user, :arguments {:email "cam@metabase.com"}}]}
                      {:role :tool, :tool-call-id "call_1drvrXfHb6q9Doxh8leujqKB", :content nil}]}]
                   [:ai-proxy-request {:messages
                                       [{:role :user, :content "Send an email to Cam"}
                                        {:content
                                         "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?",
                                         :role :assistant,
                                         :tool_calls []}
                                        {:role :user, :content "Cam's email is cam@metabase.com"}
                                        {:content nil,
                                         :role :assistant,
                                         :tool_calls
                                         [{:id "call_1drvrXfHb6q9Doxh8leujqKB", :name "invite_user", :arguments "{\"email\":\"cam@metabase.com\"}"}]}
                                        {:role :tool, :tool_call_id "call_1drvrXfHb6q9Doxh8leujqKB", :content nil}],
                                       :context {},
                                       :tools
                                       [{:name "invite_user",
                                         :description "Invite a user to Metabase. Requires a valid email address.",
                                         :parameters
                                         {:type :object,
                                          :properties {"email" {:type :string, :description "A valid email address of the user to invite"}},
                                          :required ["email"],
                                          :additionalProperties false}}],
                                       :instance_info {:token "c54f339509b1af2451342c188d59be5e5a112ceaa28f3bd560dc4aa946906fd53"}}]
                   [:ai-proxy-response {:message {:content "Cool, I invited him", :role "assistant", :tool_calls []}}]
                   ;; follow-up FE <= BE request
                   [:api-response
                    {:reactions [{:type :metabot.reaction/message
                                  :message  "Cool, I invited him"}]
                     :history   [{:role :user, :content "Send an email to Cam"}
                                 {:content "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?"
                                  :role :assistant
                                  :tool-calls []}
                                 {:role :user, :content "Cam's email is cam@metabase.com"}
                                 {:content nil,
                                  :role :assistant,
                                  :tool-calls
                                  [{:id "call_1drvrXfHb6q9Doxh8leujqKB", :name :metabot.tool/invite-user, :arguments {:email "cam@metabase.com"}}]}
                                 {:role :tool, :tool-call-id "call_1drvrXfHb6q9Doxh8leujqKB", :content nil}
                                 {:content "Cool, I invited him"
                                  :role :assistant}]}]]
                  @calls)))))))
