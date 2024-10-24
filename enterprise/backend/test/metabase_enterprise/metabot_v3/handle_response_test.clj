(ns metabase-enterprise.metabot-v3.handle-response-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.handle-response :as metabot-v3.handle-response]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]))

(let [response {:content    "Sorry I don't understand that."
                :role       :assistant
                :tool-calls []}]
  (is (= [{:type               :metabot.reaction/message
           :message            "Sorry I don't understand that."
           :repl/message-color :green
           :repl/message-emoji "🤖"}]
         (#'metabot-v3.handle-response/handle-response-message response))))

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
                                                              [{:type :metabot.reaction/message
                                                                :message (format "Invoked %s" tool-name)}])]
      (testing "response forwarded to FE"
        (is (=? [;; this is the response from the tool itself
                 {:type :metabot.reaction/message, :message "Invoked :say-hello"}]
                (#'metabot-v3.handle-response/handle-response-message response))))
      (testing "invocations"
        (is (= [[:say-hello {:name "User", :greeting "Hello!"}]]
               @invocations))))))
