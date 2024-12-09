(ns metabase-enterprise.metabot-v3.handle-envelope-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.envelope :as envelope]
   [metabase-enterprise.metabot-v3.handle-envelope :as metabot-v3.handle-envelope]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]))

(defn- create-env [& responses]
  (envelope/create {} (into [] responses) (random-uuid)))

(deftest ^:parallel single-reaction-test
  (let [response {:content    "Sorry I don't understand that."
                  :role       :assistant
                  :tool-calls []}
        e (create-env response)
        e* (#'metabot-v3.handle-envelope/handle-envelope e)]
    (testing "No reactions were created"
      (is (empty? (:reactions e*))))
    (testing "The history is unchanged"
      (is (= [response] (:history e*))))
    (testing "We can get a reaction from the last message in the history"
      (is (= {:type               :metabot.reaction/message
              :message            "Sorry I don't understand that."
              :repl/message-color :green
              :repl/message-emoji "🤖"}
             (envelope/last-assistant-message->reaction e*))))))

(deftest ^:parallel handle-tools-response-test
  (let [response {:content    nil
                  :role       :assistant
                  :tool-calls [{:id        "call_1drvrXfHb6q9Doxh8leujqKB"
                                :name      :say-hello
                                :arguments {:name "User"
                                            :greeting "Hello!"}}]}
        invocations (atom [])]
    (binding [metabot-v3.tools.interface/*tool-applicable?* (constantly true)
              metabot-v3.tools.interface/*invoke-tool*      (fn [tool-name args]
                                                              (swap! invocations conj [tool-name args])
                                                              (let [msg (format "Invoked tool %s" tool-name)]
                                                                {:output msg
                                                                 :reactions [{:type :metabot.reaction/message, :message msg}]}))
              metabot-v3.client/*request* (fn [& _] {:message "niiiice, you invoked the tool. thanks."})]
      (let [e (metabot-v3.handle-envelope/handle-envelope (create-env response))]
        (testing "response forwarded to FE"
          (is (=? {:reactions [{:type :metabot.reaction/message
                                :message "Invoked tool :say-hello"}]}
                  e)))
        (testing "invocations"
          (is (= [[:say-hello {:name "User", :greeting "Hello!"}]]
                 @invocations)))))))
